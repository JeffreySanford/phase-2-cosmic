package com.cosmic.governance.api.messaging;

import com.cosmic.governance.api.service.JobService;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.ConsumerRecords;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;
import org.awaitility.Awaitility;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.KafkaContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.ExecutionException;

import org.apache.kafka.clients.admin.AdminClient;
import org.apache.kafka.clients.admin.AdminClientConfig;
import org.apache.kafka.clients.admin.NewTopic;
import org.apache.kafka.common.errors.TopicExistsException;

@SpringBootTest(properties = {"spring.main.allow-bean-definition-overriding=true"})
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
            String hostBootstrap = System.getenv().getOrDefault("HOST_KAFKA_BOOTSTRAP", "localhost:9092");
            registry.add("spring.kafka.bootstrap-servers", () -> hostBootstrap);
        } else {
            registry.add("spring.kafka.bootstrap-servers", kafka::getBootstrapServers);
        }
    }

    @Autowired
    private KafkaTemplate<String, String> kafkaTemplate;

    @Autowired
    private JobService jobService;

    @Test
    public void testIdempotentIngestAndDlqForwarding() throws Exception {
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

        // Ensure topics exist when brokers do not auto-create them (CI / Testcontainers fallbacks)
        String bootstrapForAdmin = (kafka != null) ? kafka.getBootstrapServers() : System.getenv().getOrDefault("HOST_KAFKA_BOOTSTRAP", "localhost:9092");
        Map<String, Object> adminProps = new HashMap<>();
        adminProps.put(AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapForAdmin);
        try (AdminClient admin = AdminClient.create(adminProps)) {
            try {
                var t1 = new NewTopic("phase2-events", 1, (short) 1);
                var t2 = new NewTopic("phase2-events-dlq", 1, (short) 1);
                admin.createTopics(List.of(t1, t2)).all().get(10, TimeUnit.SECONDS);
            } catch (ExecutionException e) {
                if (e.getCause() instanceof TopicExistsException) {
                    // ok - topic already present
                } else {
                    throw e;
                }
            }
        }

        // send first time and wait for listener to process (allow a slightly longer timeout)
        kafkaTemplate.send("phase2-events", payload).get();
        Awaitility.await().atMost(java.time.Duration.ofSeconds(30)).untilAsserted(() -> {
            var list = jobService.listAll();
            Assertions.assertTrue(list.stream().anyMatch(j -> datasetId.equals(j.datasetId()) && "ingest".equalsIgnoreCase(j.workflow())),
                "Job for dataset " + datasetId + " should be created for first ingest message");
        });

        // send duplicate and ensure original still present
        kafkaTemplate.send("phase2-events", payload).get();
        Awaitility.await().atMost(java.time.Duration.ofSeconds(15)).untilAsserted(() -> {
            var list2 = jobService.listAll();
                Assertions.assertTrue(list2.stream().anyMatch(j -> datasetId.equals(j.datasetId()) && "ingest".equalsIgnoreCase(j.workflow())),
                    "Duplicate ingest should be ignored but original remains");
        });

        // send invalid payload (non-json) to trigger DLQ forwarding
        String bad = "not-a-json";
        kafkaTemplate.send("phase2-events", bad).get();

        // consume DLQ topic to verify message forwarded
        Properties props = new Properties();
        String dlqBootstrap = (kafka != null) ? kafka.getBootstrapServers() : System.getenv().getOrDefault("HOST_KAFKA_BOOTSTRAP", "localhost:9092");
        props.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, dlqBootstrap);
        props.put(ConsumerConfig.GROUP_ID_CONFIG, "test-dlq-consumer");
        props.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        props.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class.getName());
        props.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class.getName());

        try (KafkaConsumer<String, String> consumer = new KafkaConsumer<>(props)) {
            consumer.subscribe(List.of("phase2-events-dlq"));
            ConsumerRecords<String, String> recs = consumer.poll(Duration.ofSeconds(10));
            boolean foundBad = false;
            for (var r : recs.records("phase2-events-dlq")) {
                if (bad.equals(r.value())) { foundBad = true; break; }
            }
            Assertions.assertTrue(foundBad, "Invalid messages should be forwarded to DLQ topic");
        }
    }
}
