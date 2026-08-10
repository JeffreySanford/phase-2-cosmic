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
import org.springframework.kafka.config.KafkaListenerEndpointRegistry;
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
import java.util.stream.StreamSupport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

/**
 * Runtime proof that Spring Kafka non-blocking retry infrastructure is active.
 *
 * <p>The configured frontend endpoint is deliberately unreachable. A valid event
 * must therefore leave the main consumer, traverse the retry-topic machinery,
 * and arrive on the dedicated .forward-dlt topic. This test proves the topology
 * rather than merely testing the listener method/annotations in isolation.
 */
@Testcontainers
@SpringBootTest(properties = {
        "spring.kafka.consumer.auto-offset-reset=earliest",
        "ingest.forward.enabled=true",
        "ingest.forward.url=http://127.0.0.1:1/api/ingest/events",
        "ingest.forward.timeout-ms=100",
        "ingest.forward.retry-attempts=2"
})
class KafkaRetryDltContainerIntegrationTest {

    @Container
    static final KafkaContainer kafka =
            new KafkaContainer(DockerImageName.parse("confluentinc/cp-kafka:7.5.0"));

    @DynamicPropertySource
    static void overrideKafkaProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.kafka.bootstrap-servers", kafka::getBootstrapServers);
    }

    @Autowired
    private MeterRegistry meterRegistry;

    @Autowired
    private KafkaListenerEndpointRegistry listenerRegistry;

    @Test
    void unreachableFrontendTraversesRetryInfrastructureAndEndsInForwardDlt() {
        assertThat(listenerRegistry.getListenerContainers())
                .as("main plus retry/DLT listener containers should be bootstrapped")
                .hasSizeGreaterThan(1);

        String eventId = "retry-e2e-" + UUID.randomUUID();
        ProducerRecord<String, String> source = new ProducerRecord<>(
                "phase2-events",
                eventId,
                "{\"source\":\"integration-test\",\"eventType\":\"telemetry.batch\"}"
        );
        source.headers().add("event-id", eventId.getBytes(StandardCharsets.UTF_8));
        source.headers().add("collector-region", "integration".getBytes(StandardCharsets.UTF_8));
        source.headers().add("collector-kafka-topic", "phase2-events".getBytes(StandardCharsets.UTF_8));
        producerTemplate().send(source);

        Map<String, Object> consumerProps = new HashMap<>();
        consumerProps.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, kafka.getBootstrapServers());
        consumerProps.put(ConsumerConfig.GROUP_ID_CONFIG, "forward-dlt-test-" + UUID.randomUUID());
        consumerProps.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        consumerProps.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        consumerProps.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);

        try (KafkaConsumer<String, String> consumer = new KafkaConsumer<>(consumerProps)) {
            consumer.subscribe(List.of("phase2-events.forward-dlt"));

            await().atMost(30, TimeUnit.SECONDS).untilAsserted(() -> {
                var records = consumer.poll(Duration.ofSeconds(1));
                var matching = StreamSupport.stream(
                                records.records("phase2-events.forward-dlt").spliterator(),
                                false
                        )
                        .filter(record -> eventId.equals(header(record.headers().lastHeader("event-id"))))
                        .findFirst();
                assertThat(matching).as("original event should reach forward DLT").isPresent();
            });
        }

        await().atMost(10, TimeUnit.SECONDS).untilAsserted(() -> {
            var failureCounter = meterRegistry.find("java_ingest_forward_failures_total").counter();
            var dltCounter = meterRegistry.find("java_ingest_forward_dlt_total").counter();
            assertThat(failureCounter).isNotNull();
            assertThat(failureCounter.count()).isGreaterThanOrEqualTo(1.0);
            assertThat(dltCounter).isNotNull();
            assertThat(dltCounter.count()).isGreaterThanOrEqualTo(1.0);
        });
    }

    private KafkaTemplate<String, String> producerTemplate() {
        Map<String, Object> props = new HashMap<>();
        props.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, kafka.getBootstrapServers());
        props.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        props.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        return new KafkaTemplate<>(new DefaultKafkaProducerFactory<>(props));
    }

    private String header(Header header) {
        return header == null || header.value() == null
                ? null
                : new String(header.value(), StandardCharsets.UTF_8);
    }
}
