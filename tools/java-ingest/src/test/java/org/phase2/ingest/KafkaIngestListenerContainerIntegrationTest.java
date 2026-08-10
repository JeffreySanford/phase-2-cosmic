package org.phase2.ingest;

import io.micrometer.core.instrument.MeterRegistry;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.common.header.Header;
import org.apache.kafka.common.serialization.StringDeserializer;
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

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

/**
 * Container-backed integration coverage for normal ingest and poison quarantine.
 *
 * <p>Forwarding is intentionally disabled in this class; the separate
 * KafkaRetryDltContainerIntegrationTest proves the transient HTTP retry/DLT path.
 * Excluded from the default Surefire run; activated with -Pwith-containers.
 */
@Testcontainers
@SpringBootTest(properties = {
        "spring.kafka.consumer.auto-offset-reset=earliest",
        "spring.main.allow-bean-definition-overriding=true",
        "ingest.forward.enabled=false"
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

    private KafkaTemplate<String, String> producerTemplate() {
        Map<String, Object> props = new HashMap<>();
        props.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, kafka.getBootstrapServers());
        props.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        props.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        return new KafkaTemplate<>(new DefaultKafkaProducerFactory<>(props));
    }

    private void send(String key, String payload, String eventId) {
        ProducerRecord<String, String> record = new ProducerRecord<>("phase2-events", key, payload);
        if (eventId != null) {
            record.headers().add("event-id", eventId.getBytes(StandardCharsets.UTF_8));
        }
        record.headers().add("collector-region", "integration".getBytes(StandardCharsets.UTF_8));
        record.headers().add("collector-kafka-topic", "phase2-events".getBytes(StandardCharsets.UTF_8));
        producerTemplate().send(record);
    }

    @Test
    void listenerConsumesIdentifiedMessageAndRecordsProcessedMetric() {
        send("k1", "{\"source\":\"integration-test\"}", "event-valid-1");

        await().atMost(15, TimeUnit.SECONDS).untilAsserted(() -> {
            var counter = meterRegistry.find("java_ingest_processed_total").counter();
            assertThat(counter).as("processed counter must be registered").isNotNull();
            assertThat(counter.count()).isGreaterThanOrEqualTo(1.0);
        });
    }

    @Test
    void blankPayloadIsWrittenToValidationDlt() {
        String eventId = "event-invalid-" + UUID.randomUUID();
        send("k2", "   ", eventId);

        await().atMost(15, TimeUnit.SECONDS).untilAsserted(() -> {
            var counter = meterRegistry.find("java_ingest_validation_dlt_total").counter();
            assertThat(counter).as("validation DLT counter must be registered").isNotNull();
            assertThat(counter.count()).isGreaterThanOrEqualTo(1.0);
        });

        Map<String, Object> consumerProps = new HashMap<>();
        consumerProps.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, kafka.getBootstrapServers());
        consumerProps.put(ConsumerConfig.GROUP_ID_CONFIG, "validation-dlt-test-" + UUID.randomUUID());
        consumerProps.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        consumerProps.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        consumerProps.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);

        try (KafkaConsumer<String, String> consumer = new KafkaConsumer<>(consumerProps)) {
            consumer.subscribe(List.of("phase2-events.validation-dlt"));

            await().atMost(15, TimeUnit.SECONDS).untilAsserted(() -> {
                var records = consumer.poll(Duration.ofSeconds(1));
                assertThat(records.isEmpty()).isFalse();
                var quarantined = records.iterator().next();
                assertThat(quarantined.value()).isEqualTo("   ");
                assertThat(header(quarantined.headers().lastHeader("event-id"))).isEqualTo(eventId);
                assertThat(header(quarantined.headers().lastHeader("validation-reason")))
                        .isEqualTo("missing_payload");
            });
        }
    }

    @Test
    void listenerRecordsReceivedMetricForEveryMessage() {
        send("k3", "{\"received\":true}", "event-valid-3");

        await().atMost(15, TimeUnit.SECONDS).untilAsserted(() -> {
            var counter = meterRegistry.find("java_ingest_received_total").counter();
            assertThat(counter).as("received counter must be registered").isNotNull();
            assertThat(counter.count()).isGreaterThanOrEqualTo(1.0);
        });
    }

    private String header(Header header) {
        return header == null || header.value() == null
                ? null
                : new String(header.value(), StandardCharsets.UTF_8);
    }
}
