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

    // start a Redis container alongside Kafka so the full pipeline writes to storage
    @Container
    static org.testcontainers.containers.GenericContainer<?> redis =
            new org.testcontainers.containers.GenericContainer<>("redis:7-alpine")
                    .withExposedPorts(6379);

    @DynamicPropertySource
    static void dynamicProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.kafka.bootstrap-servers", kafka::getBootstrapServers);
        registry.add("spring.data.redis.host", redis::getHost);
        registry.add("spring.data.redis.port", () -> redis.getFirstMappedPort().toString());
    }

    @Autowired
    private KafkaTemplate<String, String> kafkaTemplate;

    @Autowired
    private org.springframework.data.redis.core.RedisTemplate<String, Object> redisTemplate;

    @Test
    public void testKafkaMessageResultsInRedisEntry() throws Exception {
        String payload = "{\"workflow\":\"ingest\",\"datasetId\":\"ds1\",\"parameters\":{},\"requestedBy\":\"tester\"}";

        kafkaTemplate.send("phase2-events", payload).get(10, TimeUnit.SECONDS);

        // allow some time for the listener to process and store
        Thread.sleep(2000);

        // verify at least one job key exists in Redis
        var keys = redisTemplate.keys("job:*");
        assertThat(keys).isNotEmpty();
    }
}
