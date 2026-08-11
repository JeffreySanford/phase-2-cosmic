package com.cosmic.governance.api.messaging;

import com.cosmic.governance.test.AbstractRedisTest;
import io.micrometer.core.instrument.MeterRegistry;
import org.awaitility.Awaitility;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.time.Duration;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

// This suite asserts the broker-to-job path, which is off by default.
@SpringBootTest(properties = "governance.ingest.create-jobs=true")
class RabbitIngestListenerIntegrationTest extends AbstractRedisTest {

    @Autowired
    private RabbitIngestListener rabbitIngestListener;

    @Autowired
    private MeterRegistry meterRegistry;

    @Test
    void validRabbitMessageCreatesJobAndDuplicateIsTracked() {
        double processedBefore = processedCounterValue();
        String requestId = UUID.randomUUID().toString();
        String datasetId = "rabbit-ds-" + UUID.randomUUID().toString().substring(0, 8);
        String payload = """
                {
                  "workflow": "ingest",
                  "datasetId": "%s",
                  "parameters": { "requestId": "%s" },
                  "requestedBy": "rabbit-test"
                }
                """.formatted(datasetId, requestId);

        rabbitIngestListener.onMessage(payload);

        Awaitility.await().atMost(Duration.ofSeconds(10)).untilAsserted(() ->
                assertThat(processedCounterValue()).isGreaterThan(processedBefore));

        rabbitIngestListener.onMessage(payload);

        double duplicates = meterRegistry.get("governance_ingest_duplicates_total")
                .tag("broker", "rabbitmq")
                .tag("topic", "cosmic.ingest.queue")
                .counter()
                .count();
        assertThat(duplicates).isGreaterThanOrEqualTo(1.0d);
    }

    @Test
    void invalidRabbitMessageTriggersDlqMetric() {
        double before = counterValue("governance_ingest_dlq_total");

        assertThrows(RuntimeException.class, () -> rabbitIngestListener.onMessage("not-a-json"));

        double after = counterValue("governance_ingest_dlq_total");
        assertThat(after).isGreaterThan(before);
    }

    private double counterValue(String name) {
        var counter = meterRegistry.find(name)
                .tag("broker", "rabbitmq")
                .tag("topic", "cosmic.ingest.queue")
                .counter();
        return counter == null ? 0.0d : counter.count();
    }

    private double processedCounterValue() {
        var counter = meterRegistry.find("governance_ingest_processed_total")
                .tag("broker", "rabbitmq")
                .tag("topic", "cosmic.ingest.queue")
                .tag("workflow", "ingest")
                .counter();
        return counter == null ? 0.0d : counter.count();
    }
}
