package com.cosmic.governance.test;

import org.testcontainers.containers.KafkaContainer;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.utility.DockerImageName;
import org.testcontainers.containers.Network;

/**
 * Base configuration class that starts Kafka and Redis containers for integration tests.
 *
 * Concrete test classes can extend this to inherit the running containers and
 * helper methods to obtain connection info.
 */
public abstract class TestcontainersConfig {
    protected static final Network TEST_NETWORK = Network.newNetwork();
    private static final String FALLBACK_MESSAGE =
            "[test] Testcontainers unavailable; using localhost Kafka/Redis defaults";

    protected static final KafkaContainer KAFKA;
    protected static final GenericContainer<?> REDIS;

    static {
        KAFKA = new KafkaContainer(DockerImageName.parse("confluentinc/cp-kafka:7.4.1"))
                    .withNetwork(TEST_NETWORK)
                    .withNetworkAliases("kafka");
        REDIS = new GenericContainer<>(DockerImageName.parse("redis:7-alpine"))
                    .withExposedPorts(6379)
                    .withNetwork(TEST_NETWORK)
                    .withNetworkAliases("redis");
        try {
            KAFKA.start();
            REDIS.start();
        } catch (Throwable t) {
            System.out.println(FALLBACK_MESSAGE);
            // containers left null if start failed
        }
    }

    protected static String getKafkaBootstrap() {
        if (KAFKA != null && KAFKA.isRunning()) {
            return KAFKA.getBootstrapServers();
        }
        return System.getenv().getOrDefault(
                "SPRING_KAFKA_BOOTSTRAP_SERVERS",
                System.getenv().getOrDefault(
                        "KAFKA_BOOTSTRAP_SERVERS",
                        System.getenv().getOrDefault("HOST_KAFKA_BOOTSTRAP", "localhost:9092")
                )
        );
    }

    protected static String getRedisHost() {
        if (REDIS != null && REDIS.isRunning()) {
            return REDIS.getHost();
        }
        return System.getenv().getOrDefault("SPRING_REDIS_HOST", "localhost");
    }

    protected static int getRedisPort() {
        if (REDIS != null && REDIS.isRunning()) {
            return REDIS.getFirstMappedPort();
        }
        return Integer.parseInt(System.getenv().getOrDefault("SPRING_REDIS_PORT", "6379"));
    }
}
