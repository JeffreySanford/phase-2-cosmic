package com.cosmic.governance.api.messaging;

import com.cosmic.governance.api.service.JobService;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.ConsumerRecords;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.awaitility.Awaitility;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.kafka.config.KafkaListenerEndpointRegistry;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.KafkaContainer;
import org.testcontainers.utility.DockerImageName;

import java.time.Duration;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.concurrent.TimeUnit;

@SpringBootTest(properties = {
    "spring.main.allow-bean-definition-overriding=true",
    "spring.kafka.consumer.auto-offset-reset=earliest",
    "governance.kafka.ingest-group-id=governance-group-it",
    "governance.kafka.audit-group-id=audit-mirror-it",
    // This suite asserts the broker-to-job path, which is off by default.
    "governance.ingest.create-jobs=true"
})
public class KafkaIngestListenerIntegrationTest {

    // If USE_HOST_KAFKA=true, tests will use host Kafka (e.g., localhost:9092).
    // Otherwise, start a Testcontainers Kafka container.
    static KafkaContainer kafka;

    static {
        if (!"true".equalsIgnoreCase(System.getenv("USE_HOST_KAFKA"))) {
            kafka = new KafkaContainer(DockerImageName.parse("confluentinc/cp-kafka:7.5.0"));
            try {
                kafka.start();
            } catch (Exception e) {
                // If Testcontainers cannot start (no Docker), leave kafka null and
                // tests will fall back to host Kafka via DynamicPropertySource below.
                kafka = null;
            }
        }
    }

    @DynamicPropertySource
    static void registerKafkaProps(DynamicPropertyRegistry registry) {
        if ("true".equalsIgnoreCase(System.getenv("USE_HOST_KAFKA")) || kafka == null) {
            String hostBootstrap = System.getenv().getOrDefault(
                    "SPRING_KAFKA_BOOTSTRAP_SERVERS",
                    System.getenv().getOrDefault(
                            "KAFKA_BOOTSTRAP_SERVERS",
                            System.getenv().getOrDefault("HOST_KAFKA_BOOTSTRAP", "localhost:9092")
                    )
            );
            registry.add("spring.kafka.bootstrap-servers", () -> hostBootstrap);
        } else {
            registry.add("spring.kafka.bootstrap-servers", kafka::getBootstrapServers);
        }
    }

    @Autowired
    private KafkaTemplate<String, String> kafkaTemplate;

    @Autowired
    private JobService jobService;

    @Autowired
    private KafkaListenerEndpointRegistry kafkaListenerEndpointRegistry;

    private static String resolveBootstrapServers() {
        return (kafka != null)
                ? kafka.getBootstrapServers()
                : System.getenv().getOrDefault(
                        "SPRING_KAFKA_BOOTSTRAP_SERVERS",
                        System.getenv().getOrDefault(
                                "KAFKA_BOOTSTRAP_SERVERS",
                                System.getenv().getOrDefault("HOST_KAFKA_BOOTSTRAP", "localhost:9092")
                        )
                );
    }

    private static boolean isKafkaReachable(String bootstrapServers) {
        String candidate = bootstrapServers.split(",")[0].trim();
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

    @Test
    public void testIdempotentIngestAndDlqForwarding() throws Exception {
        Assumptions.assumeTrue(
            kafka != null || "true".equalsIgnoreCase(System.getenv("USE_HOST_KAFKA")),
            "Kafka integration test requires either Testcontainers Kafka or USE_HOST_KAFKA=true"
        );

        String bootstrapServers = resolveBootstrapServers();
        Assumptions.assumeTrue(isKafkaReachable(bootstrapServers), "Kafka broker not available for integration test");

        // valid payload with a unique requestId to avoid collisions with other tests
        String requestId = java.util.UUID.randomUUID().toString();
        String datasetId = "ds-" + java.util.UUID.randomUUID().toString().substring(0,8);
        Map<String,Object> payloadObj = new HashMap<>();
        payloadObj.put("workflow", "ingest");
        payloadObj.put("datasetId", datasetId);
        Map<String,Object> params = new HashMap<>();
        params.put("requestId", requestId);
        payloadObj.put("parameters", params);
        payloadObj.put("requestedBy", "test-suite");

        String payload = new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(payloadObj);

        Awaitility.await().atMost(Duration.ofSeconds(30)).untilAsserted(() ->
            Assertions.assertTrue(
                kafkaListenerEndpointRegistry.getListenerContainers().stream()
                    .anyMatch(container -> container.isRunning()
                        && container.getAssignedPartitions() != null
                        && !container.getAssignedPartitions().isEmpty()),
                "At least one Kafka listener container should be assigned before producing test messages"
            )
        );

        // send first time and wait for listener to process (allow a slightly longer timeout)
        kafkaTemplate.send("phase2-events", payload).get(10, TimeUnit.SECONDS);
        Awaitility.await().atMost(java.time.Duration.ofSeconds(30)).untilAsserted(() -> {
            var list = jobService.listAll();
            Assertions.assertTrue(list.stream().anyMatch(j -> datasetId.equals(j.datasetId()) && "ingest".equalsIgnoreCase(j.workflow())),
                "Job for dataset " + datasetId + " should be created for first ingest message");
        });

        // send duplicate and ensure original still present
        kafkaTemplate.send("phase2-events", payload).get(10, TimeUnit.SECONDS);
        Awaitility.await().atMost(java.time.Duration.ofSeconds(15)).untilAsserted(() -> {
            var list2 = jobService.listAll();
                Assertions.assertTrue(list2.stream().anyMatch(j -> datasetId.equals(j.datasetId()) && "ingest".equalsIgnoreCase(j.workflow())),
                    "Duplicate ingest should be ignored but original remains");
        });

        // send invalid payload (non-json) to trigger DLQ forwarding
        String bad = "not-a-json";
        kafkaTemplate.send("phase2-events", bad).get(10, TimeUnit.SECONDS);

        // consume DLQ topic to verify message forwarded
        Properties props = new Properties();
        props.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        props.put(ConsumerConfig.GROUP_ID_CONFIG, "test-dlq-consumer");
        props.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        props.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class.getName());
        props.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class.getName());

        try (KafkaConsumer<String, String> consumer = new KafkaConsumer<>(props)) {
            consumer.subscribe(List.of("phase2-events-dlq"));
            Awaitility.await().atMost(Duration.ofSeconds(20)).untilAsserted(() -> {
                ConsumerRecords<String, String> recs = consumer.poll(Duration.ofSeconds(2));
                boolean foundBad = false;
                for (var r : recs.records("phase2-events-dlq")) {
                    if (bad.equals(r.value())) {
                        foundBad = true;
                        break;
                    }
                }
                Assertions.assertTrue(foundBad, "Invalid messages should be forwarded to DLQ topic");
            });
        }
    }
}
