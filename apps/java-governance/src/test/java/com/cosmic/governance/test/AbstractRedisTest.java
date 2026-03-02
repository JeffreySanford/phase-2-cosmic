package com.cosmic.governance.test;

import org.testcontainers.containers.GenericContainer;
import org.testcontainers.utility.DockerImageName;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

public abstract class AbstractRedisTest {
    private static GenericContainer<?> redisContainer;
    private static boolean containerStarted = false;

    private static synchronized GenericContainer<?> startContainerIfNeeded() {
        if (!containerStarted) {
            try {
                redisContainer = new GenericContainer<>(DockerImageName.parse("redis:7-alpine")).withExposedPorts(6379);
                redisContainer.start();
                containerStarted = true;
            } catch (Throwable t) {
                containerStarted = false;
                redisContainer = null;
                throw t;
            }
        }
        return redisContainer;
    }

    @DynamicPropertySource
    static void redisProperties(DynamicPropertyRegistry registry) {
        try {
            GenericContainer<?> c = startContainerIfNeeded();
            registry.add("spring.data.redis.host", c::getHost);
            registry.add("spring.data.redis.port", () -> c.getMappedPort(6379));
            System.out.println("[test] Testcontainers Redis started: " + c.getHost() + ":" + c.getMappedPort(6379));
        } catch (Throwable t) {
            String host = System.getenv().getOrDefault("SPRING_REDIS_HOST", System.getenv().getOrDefault("REDIS_HOST", "localhost"));
            String port = System.getenv().getOrDefault("SPRING_REDIS_PORT", System.getenv().getOrDefault("REDIS_PORT", "6379"));
            registry.add("spring.data.redis.host", () -> host);
            registry.add("spring.data.redis.port", () -> Integer.parseInt(port));
            System.out.println("[test] Testcontainers unavailable, falling back to redis host=" + host + " port=" + port + ". Cause: " + t.toString());
        }
    }
}
