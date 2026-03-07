package com.cosmic.governance.integration;

import com.cosmic.governance.api.service.JobService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Assumptions;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.KafkaContainer;
import org.testcontainers.DockerClientFactory;

import java.util.concurrent.TimeUnit;
import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
public class KafkaIngestIntegrationTest {

    static KafkaContainer kafka = null;

    // start a Redis container alongside Kafka so the full pipeline writes to storage
    static org.testcontainers.containers.GenericContainer<?> redis = null;

    static {
        boolean dockerAvailable = false;
        try {
            dockerAvailable = DockerClientFactory.instance().isDockerAvailable();
        } catch (Throwable t) {
            dockerAvailable = false;
        }
        if (dockerAvailable) {
            try {
                kafka = new KafkaContainer("confluentinc/cp-kafka:7.4.1");
                kafka.start();
                redis = new org.testcontainers.containers.GenericContainer<>("redis:7-alpine")
                        .withExposedPorts(6379);
                redis.start();
            } catch (Throwable t) {
                kafka = null;
                redis = null;
            }
        }
    }

    @BeforeAll
    static void ensureDockerAvailableOrSkip() {
        Assumptions.assumeTrue(kafka != null && redis != null, "Docker/Testcontainers not available or failed to start - skipping Kafka integration test");
    }

    @DynamicPropertySource
    static void dynamicProperties(DynamicPropertyRegistry registry) {
        if (kafka != null && redis != null) {
            registry.add("spring.kafka.bootstrap-servers", kafka::getBootstrapServers);
            registry.add("spring.data.redis.host", redis::getHost);
            registry.add("spring.data.redis.port", () -> Integer.toString(redis.getFirstMappedPort()));
        }
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
