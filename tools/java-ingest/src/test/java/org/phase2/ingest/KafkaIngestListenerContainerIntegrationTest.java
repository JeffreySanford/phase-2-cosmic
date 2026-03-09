package org.phase2.ingest;

import io.micrometer.core.instrument.MeterRegistry;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.common.serialization.StringSerializer;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.kafka.core.DefaultKafkaProducerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.KafkaContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

/**
 * Container-backed integration test for {@link KafkaIngestListener}.
 * <p>
 * Starts a real Kafka broker via Testcontainers, sends a message, and asserts
 * that the listener records the expected Micrometer metrics.
 * <p>
 * Excluded from the default Surefire run; activated with {@code -Pwith-containers}.
 */
@Testcontainers
@SpringBootTest(properties = {
        "spring.kafka.consumer.auto-offset-reset=earliest",
        "spring.main.allow-bean-definition-overriding=true"
})
class KafkaIngestListenerContainerIntegrationTest {

    @Container
    static final KafkaContainer kafka =
            new KafkaContainer(DockerImageName.parse("confluentinc/cp-kafka:7.5.0"));

    @DynamicPropertySource
    static void overrideKafkaProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.kafka.bootstrap-servers", kafka::getBootstrapServers);
    }

    @Autowired
    private MeterRegistry meterRegistry;

    // ── helpers ─────────────────────────────────────────────────────────────

    private KafkaTemplate<String, String> producerTemplate() {
        Map<String, Object> props = new HashMap<>();
        props.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, kafka.getBootstrapServers());
        props.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        props.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        return new KafkaTemplate<>(new DefaultKafkaProducerFactory<>(props));
    }

    // ── tests ────────────────────────────────────────────────────────────────

    @Test
    void listenerConsumesMessageAndRecordsProcessedMetric() {
        producerTemplate().send("phase2-events", "k1", "{\"source\":\"integration-test\"}");

        await().atMost(15, TimeUnit.SECONDS).untilAsserted(() -> {
            var counter = meterRegistry.find("java_ingest_processed_total").counter();
            assertThat(counter).as("processed counter must be registered").isNotNull();
            assertThat(counter.count()).isGreaterThanOrEqualTo(1.0);
        });
    }

    @Test
    void listenerRecordsValidationFailureMetricForBlankPayload() {
        producerTemplate().send("phase2-events", "k2", "   "); // blank payload

        await().atMost(15, TimeUnit.SECONDS).untilAsserted(() -> {
            var counter = meterRegistry.find("java_ingest_validation_failures_total").counter();
            assertThat(counter).as("validation_failures counter must be registered").isNotNull();
            assertThat(counter.count()).isGreaterThanOrEqualTo(1.0);
        });
    }

    @Test
    void listenerRecordsReceivedMetricForEveryMessage() {
        producerTemplate().send("phase2-events", "k3", "{\"received\":true}");

        await().atMost(15, TimeUnit.SECONDS).untilAsserted(() -> {
            var counter = meterRegistry.find("java_ingest_received_total").counter();
            assertThat(counter).as("received counter must be registered").isNotNull();
            assertThat(counter.count()).isGreaterThanOrEqualTo(1.0);
        });
    }
}
