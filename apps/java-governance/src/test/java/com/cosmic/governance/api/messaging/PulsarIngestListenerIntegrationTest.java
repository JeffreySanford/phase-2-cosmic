package com.cosmic.governance.api.messaging;

import com.cosmic.governance.test.AbstractRedisTest;
import io.micrometer.core.instrument.MeterRegistry;
import org.apache.pulsar.client.api.PulsarClient;
import org.apache.pulsar.client.api.Schema;
import org.awaitility.Awaitility;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.annotation.DirtiesContext;

import java.net.InetSocketAddress;
import java.net.Socket;
import java.time.Duration;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

// This suite asserts the broker-to-job path, which is off by default.
@SpringBootTest(properties = "governance.ingest.create-jobs=true")
@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_CLASS)
class PulsarIngestListenerIntegrationTest extends AbstractRedisTest {
    private static final String TOPIC_NAME = "phase2-events-test-" + UUID.randomUUID();
    private static final String SUBSCRIPTION_NAME = "governance-ingest-test-" + UUID.randomUUID();
    private static final String DLQ_TOPIC_NAME = TOPIC_NAME + "-dlq";

    @Value("${pulsar.service.url:pulsar://pulsar:6650}")
    private String pulsarServiceUrl;

    @Value("${governance.pulsar.ingest.topic:phase2-events}")
    private String ingestTopic;

    @Autowired
    private MeterRegistry meterRegistry;

    @DynamicPropertySource
    static void pulsarProperties(DynamicPropertyRegistry registry) {
        registry.add("governance.pulsar.ingest.topic", () -> TOPIC_NAME);
        registry.add("governance.pulsar.ingest.subscription", () -> SUBSCRIPTION_NAME);
        registry.add("governance.pulsar.ingest.dlq-topic", () -> DLQ_TOPIC_NAME);
    }

    @Test
    void validPulsarMessageCreatesJob() throws Exception {
        Assumptions.assumeTrue(isPulsarReachable(pulsarServiceUrl), "Pulsar broker not available for integration test");

        String requestId = UUID.randomUUID().toString();
        String datasetId = "pulsar-ds-" + UUID.randomUUID().toString().substring(0, 8);
        String payload = """
                {
                  "workflow": "ingest",
                  "datasetId": "%s",
                  "parameters": { "requestId": "%s" },
                  "requestedBy": "pulsar-test"
                }
                """.formatted(datasetId, requestId);

        double before = counterValue("governance_ingest_processed_total");

        try (PulsarClient client = PulsarClient.builder().serviceUrl(pulsarServiceUrl).build();
             var producer = client.newProducer(Schema.STRING).topic(ingestTopic).create()) {
            producer.send(payload);

            Awaitility.await().atMost(Duration.ofSeconds(75)).untilAsserted(() ->
                    assertThat(counterValue("governance_ingest_processed_total")).isGreaterThan(before)
            );
        }
    }

    private double counterValue(String name) {
        var counter = meterRegistry.find(name)
                .tag("broker", "pulsar")
                .tag("topic", ingestTopic)
                .tag("workflow", "ingest")
                .counter();
        return counter == null ? 0.0d : counter.count();
    }

    private boolean isPulsarReachable(String serviceUrl) {
        String candidate = serviceUrl;
        if (candidate.contains("://")) {
            candidate = candidate.substring(candidate.indexOf("://") + 3);
        }
        String[] hostPort = candidate.split(":");
        if (hostPort.length != 2) {
            return false;
        }
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress(hostPort[0], Integer.parseInt(hostPort[1])), 1500);
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }
}
