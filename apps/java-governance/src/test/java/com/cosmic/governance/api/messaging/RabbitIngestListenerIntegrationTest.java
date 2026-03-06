package com.cosmic.governance.api.messaging;

import com.cosmic.governance.api.service.JobService;
import com.cosmic.governance.test.AbstractRedisTest;
import org.awaitility.Awaitility;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.rabbit.core.RabbitAdmin;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.RabbitMQContainer;
import org.springframework.amqp.rabbit.connection.CachingConnectionFactory;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

@SpringBootTest(properties = {
    "spring.main.allow-bean-definition-overriding=true",
    "governance.audit.rabbit.enabled=true"
})
@Testcontainers
public class RabbitIngestListenerIntegrationTest extends AbstractRedisTest {

    @Container
    static RabbitMQContainer rabbit = new RabbitMQContainer("rabbitmq:3-management");

    @DynamicPropertySource
    static void registerRabbitProps(DynamicPropertyRegistry registry) {
        if (rabbit != null) {
            registry.add("spring.rabbitmq.host", rabbit::getHost);
            registry.add("spring.rabbitmq.port", rabbit::getAmqpPort);
            registry.add("spring.rabbitmq.username", rabbit::getAdminUsername);
            registry.add("spring.rabbitmq.password", rabbit::getAdminPassword);
        }
    }

    @Autowired
    private RabbitTemplate rabbitTemplate;

    @Autowired
    private JobService jobService;

    @Test
    public void testIdempotentIngestAndDlqForwarding() throws Exception {
        // ensure queues exist
        RabbitAdmin admin = new RabbitAdmin(rabbitTemplate.getConnectionFactory());
        admin.declareQueue(new Queue("phase2-events", false));
        admin.declareQueue(new Queue("phase2-events-dlq", false));

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

        // send first time
        rabbitTemplate.convertAndSend("phase2-events", payload);
        Awaitility.await().atMost(Duration.ofSeconds(30)).untilAsserted(() -> {
            var list = jobService.listAll();
            org.junit.jupiter.api.Assertions.assertTrue(list.stream().anyMatch(j -> datasetId.equals(j.datasetId()) && "ingest".equalsIgnoreCase(j.workflow())),
                    "Job for dataset " + datasetId + " should be created for first ingest message");
        });

        // duplicate
        rabbitTemplate.convertAndSend("phase2-events", payload);
        Awaitility.await().atMost(Duration.ofSeconds(15)).untilAsserted(() -> {
            var list2 = jobService.listAll();
            org.junit.jupiter.api.Assertions.assertTrue(list2.stream().anyMatch(j -> datasetId.equals(j.datasetId()) && "ingest".equalsIgnoreCase(j.workflow())),
                    "Duplicate ingest should be ignored but original remains");
        });

        // send invalid
        rabbitTemplate.convertAndSend("phase2-events", "not-a-json");

        // receive from DLQ
        org.springframework.amqp.core.Message received = rabbitTemplate.receive("phase2-events-dlq");
        String dlqMsg = received != null ? new String(received.getBody()) : null;
        org.junit.jupiter.api.Assertions.assertEquals("not-a-json", dlqMsg, "Invalid messages should be forwarded to DLQ queue");
    }
}
