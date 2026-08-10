package org.phase2.ingest;

import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;

import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.common.header.Header;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

/**
 * Publishes poison/contract-invalid records to a dedicated validation DLT.
 *
 * <p>This path is intentionally separate from the non-blocking retry topics used
 * for transient Java-to-frontend delivery failures. Invalid data should be
 * quarantined once, not retried against an HTTP endpoint that can never make the
 * payload valid.
 */
@Component
public class ValidationDeadLetterPublisher {

    private final KafkaTemplate<Object, Object> kafkaTemplate;
    private final String validationDltTopic;

    public ValidationDeadLetterPublisher(
            KafkaTemplate<Object, Object> kafkaTemplate,
            @Value("${ingest.validation.dlt-topic:phase2-events.validation-dlt}") String validationDltTopic) {
        this.kafkaTemplate = kafkaTemplate;
        this.validationDltTopic = validationDltTopic;
    }

    public void publish(ConsumerRecord<String, String> source, String reason) {
        ProducerRecord<Object, Object> deadLetter = new ProducerRecord<>(
                validationDltTopic,
                source.key(),
                source.value()
        );

        for (Header header : source.headers()) {
            deadLetter.headers().add(header.key(), header.value());
        }
        deadLetter.headers().add(
                "validation-reason",
                reason.getBytes(StandardCharsets.UTF_8)
        );
        deadLetter.headers().add(
                "validation-original-topic",
                source.topic().getBytes(StandardCharsets.UTF_8)
        );

        try {
            // Do not acknowledge an invalid source record until Kafka has accepted
            // its quarantine copy. If this write fails, throwing lets the normal
            // retry/DLT safety net retain the original record instead of losing it.
            kafkaTemplate.send(deadLetter).get(5, TimeUnit.SECONDS);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("interrupted while publishing validation DLT record", ex);
        } catch (Exception ex) {
            throw new IllegalStateException("could not publish validation DLT record", ex);
        }
    }

    String topicForTest() {
        return validationDltTopic;
    }
}
