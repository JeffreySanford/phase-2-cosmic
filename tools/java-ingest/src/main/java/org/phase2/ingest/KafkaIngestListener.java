package org.phase2.ingest;

import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.time.Duration;

@Component
public class KafkaIngestListener {
    private static final String BROKER = "kafka";

    private final IngestMetricsService metricsService;
    private final ServerApiForwarder forwarder;

    public KafkaIngestListener(IngestMetricsService metricsService, ServerApiForwarder forwarder) {
        this.metricsService = metricsService;
        this.forwarder = forwarder;
    }

    @KafkaListener(
            topics = "${ingest.kafka.topic:phase2-events}",
            groupId = "${ingest.kafka.group-id:java-ingest-group}"
    )
    public void onMessage(ConsumerRecord<String, String> record) {
        long startedAt = System.nanoTime();
        String topic = record.topic();
        String payload = record.value();
        metricsService.recordReceived(topic, payload);

        try {
            if (payload == null || payload.isBlank()) {
                metricsService.recordValidationFailure(
                        topic,
                        "payload",
                        payload,
                        Duration.ofNanos(System.nanoTime() - startedAt)
                );
                return;
            }

            metricsService.recordProcessed(
                    topic,
                    payload,
                    Duration.ofNanos(System.nanoTime() - startedAt)
            );

            // Forward to the server API so the event reaches the SSE channel and
            // the frontend. Kafka remains the durable record, so a forwarding
            // failure is counted rather than failing the consumer.
            if (forwarder.forward(BROKER, topic, payload)) {
                metricsService.recordForwarded(topic);
            }
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
}
