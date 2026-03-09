package org.phase2.ingest;

import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.time.Duration;

@Component
public class KafkaIngestListener {
    private final IngestMetricsService metricsService;

    public KafkaIngestListener(IngestMetricsService metricsService) {
        this.metricsService = metricsService;
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
            System.out.println("[java-ingest] received: " + payload);
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
