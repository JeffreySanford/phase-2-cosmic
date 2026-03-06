package com.cosmic.governance.api.messaging;

import com.cosmic.governance.api.service.JobService;
import com.cosmic.governance.test.AbstractRedisTest;
import org.apache.pulsar.client.api.*;
import org.awaitility.Awaitility;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;

@SpringBootTest(properties = {"spring.main.allow-bean-definition-overriding=true"})
@Testcontainers
public class PulsarIngestListenerIntegrationTest extends AbstractRedisTest {

    @Container
    static GenericContainer<?> pulsar = new GenericContainer<>("apachepulsar/pulsar:3.2.4")
            .withExposedPorts(6650, 8080)
            .withCommand("bin/pulsar", "standalone");

    @DynamicPropertySource
    static void registerProps(DynamicPropertyRegistry registry) {
        if (pulsar != null) {
            String host = pulsar.getHost();
            Integer port = pulsar.getMappedPort(6650);
            registry.add("pulsar.serviceUrl", () -> "pulsar://" + host + ":" + port);
        }
    }

    @Autowired
    private JobService jobService;

    @Test
    public void testIdempotentIngestAndDlqForwarding() throws Exception {
        // create a client to produce messages and to consume DLQ
        String serviceUrl = "pulsar://" + pulsar.getHost() + ":" + pulsar.getMappedPort(6650);
        try (PulsarClient client = PulsarClient.builder().serviceUrl(serviceUrl).build()) {
            Producer<String> producer = client.newProducer(Schema.STRING).topic("phase2-events").create();
            Consumer<String> dlqConsumer = client.newConsumer(Schema.STRING)
                    .topic("phase2-events-dlq")
                    .subscriptionName("test-dlq-sub")
                    .subscriptionType(SubscriptionType.Shared)
                    .subscribe();

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

            producer.send(payload);
            Awaitility.await().atMost(Duration.ofSeconds(30)).untilAsserted(() -> {
                var list = jobService.listAll();
                org.junit.jupiter.api.Assertions.assertTrue(list.stream().anyMatch(j -> datasetId.equals(j.datasetId()) && "ingest".equalsIgnoreCase(j.workflow())),
                        "Job for dataset " + datasetId + " should be created for first ingest message");
            });

            // duplicate
            producer.send(payload);
            Awaitility.await().atMost(Duration.ofSeconds(15)).untilAsserted(() -> {
                var list2 = jobService.listAll();
                org.junit.jupiter.api.Assertions.assertTrue(list2.stream().anyMatch(j -> datasetId.equals(j.datasetId()) && "ingest".equalsIgnoreCase(j.workflow())),
                        "Duplicate ingest should be ignored but original remains");
            });

            // invalid message
            producer.send("not-a-json");

            Message<String> dlqMsg = dlqConsumer.receive(10000, TimeUnit.MILLISECONDS);
            org.junit.jupiter.api.Assertions.assertNotNull(dlqMsg, "Should receive a message on DLQ");
            org.junit.jupiter.api.Assertions.assertEquals("not-a-json", dlqMsg.getValue(), "Invalid message forwarded to DLQ");
        }
    }
}
