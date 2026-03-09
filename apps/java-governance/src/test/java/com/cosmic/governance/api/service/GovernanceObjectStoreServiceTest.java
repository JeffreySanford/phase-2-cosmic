package com.cosmic.governance.api.service;

import com.cosmic.governance.api.model.DatasetRecord;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class GovernanceObjectStoreServiceTest {

    @AfterEach
    void cleanup() throws Exception {
        Path base = Path.of(System.getProperty("java.io.tmpdir"), "governance-object-store");
        if (Files.exists(base)) {
            try (var paths = Files.walk(base)) {
                paths.sorted((a, b) -> b.getNameCount() - a.getNameCount())
                        .forEach(path -> {
                            try {
                                Files.deleteIfExists(path);
                            } catch (Exception ignored) {
                            }
                        });
            }
        }
    }

    @Test
    void persistsDatasetRecordToMinioWhenAvailable() {
        Assumptions.assumeTrue(isReachable("localhost", 9000), "MinIO is not reachable on localhost:9000");

        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        GovernanceRuntimeMetricsService runtimeMetrics = new GovernanceRuntimeMetricsService(registry);
        GovernanceObjectStoreService service = new GovernanceObjectStoreService(runtimeMetrics, new ObjectMapper());

        ReflectionTestUtils.setField(service, "minioEnabled", true);
        ReflectionTestUtils.setField(service, "minioEndpoint", "http://localhost:9000");
        ReflectionTestUtils.setField(service, "minioAccessKey", "minio");
        ReflectionTestUtils.setField(service, "minioSecretKey", "minio123");
        ReflectionTestUtils.setField(service, "minioBucket", "governance-test-" + UUID.randomUUID().toString().substring(0, 8));

        DatasetRecord record = new DatasetRecord(
                UUID.randomUUID().toString(),
                "minio-dataset",
                "minio test",
                Instant.now().toString(),
                Map.of("source", "test"),
                Map.of("manifestVersion", 1)
        );

        service.persistDatasetRecord(record);

        double writes = registry.get("governance_object_writes_total")
                .tag("storage", "minio")
                .tag("object_kind", "dataset-record")
                .tag("executor", "governance")
                .counter()
                .count();
        assertThat(writes).isGreaterThanOrEqualTo(1.0d);
    }

    @Test
    void fallsBackToLocalObjectStoreWhenMinioUnavailable() throws Exception {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        GovernanceRuntimeMetricsService runtimeMetrics = new GovernanceRuntimeMetricsService(registry);
        GovernanceObjectStoreService service = new GovernanceObjectStoreService(runtimeMetrics, new ObjectMapper());

        ReflectionTestUtils.setField(service, "minioEnabled", true);
        ReflectionTestUtils.setField(service, "minioEndpoint", "http://localhost:1");
        ReflectionTestUtils.setField(service, "minioAccessKey", "minio");
        ReflectionTestUtils.setField(service, "minioSecretKey", "minio123");
        ReflectionTestUtils.setField(service, "minioBucket", "governance-test-fallback");

        String datasetId = UUID.randomUUID().toString();
        DatasetRecord record = new DatasetRecord(
                datasetId,
                "fallback-dataset",
                "fallback test",
                Instant.now().toString(),
                Map.of("source", "test"),
                Map.of("manifestVersion", 1)
        );

        service.persistDatasetRecord(record);

        Path spooled = Path.of(System.getProperty("java.io.tmpdir"), "governance-object-store", "datasets", datasetId, "record.json");
        assertThat(Files.exists(spooled)).isTrue();

        double writes = registry.get("governance_object_writes_total")
                .tag("storage", "local-object-store")
                .tag("object_kind", "dataset-record")
                .tag("executor", "governance")
                .counter()
                .count();
        assertThat(writes).isGreaterThanOrEqualTo(1.0d);
    }

    private boolean isReachable(String host, int port) {
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress(host, port), 1500);
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }
}
