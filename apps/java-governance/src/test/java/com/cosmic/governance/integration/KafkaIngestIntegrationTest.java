package com.cosmic.governance.integration;

import com.cosmic.governance.api.service.JobService;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.KafkaContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.concurrent.TimeUnit;

@SpringBootTest
@Testcontainers
public class KafkaIngestIntegrationTest {

    @Container
    static KafkaContainer kafka = new KafkaContainer("confluentinc/cp-kafka:7.4.1");

    @DynamicPropertySource
    static void kafkaProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.kafka.bootstrap-servers", kafka::getBootstrapServers);
    }

    @MockBean
    private JobService jobService;

    @Autowired
    private KafkaTemplate<String, String> kafkaTemplate;

    @Test
    public void testKafkaMessageTriggersJobSubmit() throws Exception {
        String payload = "{\"workflow\":\"ingest\",\"datasetId\":\"ds1\",\"parameters\":{},\"requestedBy\":\"tester\"}";

        kafkaTemplate.send("phase2-events", payload).get(10, TimeUnit.SECONDS);

        // verify JobService.submit was called within time
        Mockito.verify(jobService, Mockito.timeout(5000)).submit(Mockito.any());
    }
}
