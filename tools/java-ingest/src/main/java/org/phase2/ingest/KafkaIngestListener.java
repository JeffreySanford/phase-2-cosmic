package org.phase2.ingest;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.common.header.Header;
import org.springframework.kafka.annotation.DltHandler;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.annotation.RetryableTopic;
import org.springframework.retry.annotation.Backoff;
import org.springframework.stereotype.Component;

@Component
public class KafkaIngestListener {
    private static final String BROKER = "kafka";

    private final IngestMetricsService metricsService;
    private final ServerApiForwarder forwarder;
    private final EventDeduplicationService deduplicationService;
    private final ValidationDeadLetterPublisher validationDeadLetterPublisher;

    public KafkaIngestListener(
            IngestMetricsService metricsService,
            ServerApiForwarder forwarder,
            EventDeduplicationService deduplicationService,
            ValidationDeadLetterPublisher validationDeadLetterPublisher) {
        this.metricsService = metricsService;
        this.forwarder = forwarder;
        this.deduplicationService = deduplicationService;
        this.validationDeadLetterPublisher = validationDeadLetterPublisher;
    }

    /**
     * Transient forwarding failures use non-blocking Kafka retry topics and
     * terminate in a dedicated forward DLT after the configured attempts.
     * Contract-invalid records bypass that retry path and are written once to
     * the validation DLT instead.
     */
    @RetryableTopic(
            kafkaTemplate = "kafkaTemplate",
            attempts = "${ingest.forward.retry-attempts:4}",
            backoff = @Backoff(delay = 1000, multiplier = 2.0, maxDelay = 10000),
            retryTopicSuffix = ".forward-retry",
            dltTopicSuffix = ".forward-dlt"
    )
    @KafkaListener(
            topics = "${ingest.kafka.topic:phase2-events}",
            groupId = "${ingest.kafka.group-id:java-ingest-group}"
    )
    public void onMessage(ConsumerRecord<String, String> record) {
        long startedAt = System.nanoTime();
        String topic = canonicalTopic(record);
        String payload = record.value();
        String eventId = headerValue(record, "event-id");
        metricsService.recordReceived(topic, payload);

        try {
            String validationReason = validationReason(payload, eventId);
            if (validationReason != null) {
                metricsService.recordValidationFailure(
                        topic,
                        validationReason,
                        payload,
                        Duration.ofNanos(System.nanoTime() - startedAt)
                );
                validationDeadLetterPublisher.publish(record, validationReason);
                metricsService.recordValidationDeadLetter(topic, validationReason);
                return;
            }

            if (deduplicationService.wasDelivered(eventId)) {
                metricsService.recordDuplicate(topic);
                return;
            }

            if (forwarder.isConfigured()) {
                Map<String, String> attribution = attribution(record, eventId);
                if (!forwarder.forward(BROKER, topic, payload, attribution)) {
                    throw new ServerApiForwardingException(
                            "server API did not accept event " + safeEventId(eventId)
                    );
                }
                deduplicationService.markDelivered(eventId);
                metricsService.recordForwarded(topic);
            }

            metricsService.recordProcessed(
                    topic,
                    payload,
                    Duration.ofNanos(System.nanoTime() - startedAt)
            );
        } catch (RuntimeException ex) {
            metricsService.recordFailure(
                    topic,
                    ex.getClass().getSimpleName(),
                    payload,
                    Duration.ofNanos(System.nanoTime() - startedAt)
            );
            throw ex;
        }
    }

    @DltHandler
    public void onDeadLetter(ConsumerRecord<String, String> record) {
        metricsService.recordForwardDeadLetter(
                canonicalTopic(record),
                safeEventId(headerValue(record, "event-id"))
        );
    }

    private String validationReason(String payload, String eventId) {
        if (payload == null || payload.isBlank()) {
            return "missing_payload";
        }
        if (eventId == null || eventId.isBlank()) {
            return "missing_event_id";
        }
        return null;
    }

    private Map<String, String> attribution(ConsumerRecord<String, String> record, String eventId) {
        Map<String, String> metadata = new LinkedHashMap<>();
        putIfPresent(metadata, "eventId", eventId);
        putIfPresent(metadata, "collectorRegion", headerValue(record, "collector-region"));
        putIfPresent(metadata, "pulsarMessageId", headerValue(record, "collector-pulsar-message-id"));
        putIfPresent(metadata, "collectorForwardedAt", headerValue(record, "collector-forwarded-at"));
        return metadata;
    }

    private String canonicalTopic(ConsumerRecord<String, String> record) {
        String collectorTopic = headerValue(record, "collector-kafka-topic");
        return collectorTopic == null || collectorTopic.isBlank() ? record.topic() : collectorTopic;
    }

    private String headerValue(ConsumerRecord<String, String> record, String name) {
        Header header = record.headers().lastHeader(name);
        return header == null || header.value() == null
                ? null
                : new String(header.value(), StandardCharsets.UTF_8);
    }

    private void putIfPresent(Map<String, String> target, String key, String value) {
        if (value != null && !value.isBlank()) {
            target.put(key, value);
        }
    }

    private String safeEventId(String eventId) {
        return eventId == null || eventId.isBlank() ? "unknown" : eventId;
    }

    static final class ServerApiForwardingException extends RuntimeException {
        ServerApiForwardingException(String message) {
            super(message);
        }
    }
}
