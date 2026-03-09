package com.cosmic.governance.api.service;

import com.cosmic.governance.api.model.DatasetRecord;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.minio.BucketExistsArgs;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;

@Service
public class GovernanceObjectStoreService {
    private static final Logger log = LoggerFactory.getLogger(GovernanceObjectStoreService.class);

    private final GovernanceRuntimeMetricsService governanceRuntimeMetricsService;
    private final ObjectMapper objectMapper;

    @Value("${governance.minio.enabled:true}")
    private boolean minioEnabled;

    @Value("${governance.minio.endpoint:http://localhost:9000}")
    private String minioEndpoint;

    @Value("${governance.minio.access-key:minio}")
    private String minioAccessKey;

    @Value("${governance.minio.secret-key:minio123}")
    private String minioSecretKey;

    @Value("${governance.minio.bucket:governance}")
    private String minioBucket;

    public GovernanceObjectStoreService(
            GovernanceRuntimeMetricsService governanceRuntimeMetricsService,
            ObjectMapper objectMapper
    ) {
        this.governanceRuntimeMetricsService = governanceRuntimeMetricsService;
        this.objectMapper = objectMapper;
    }

    public void persistDatasetRecord(DatasetRecord record) {
        String payload = serialize(record);
        if (payload == null) {
            return;
        }

        if (writeToMinio(record.getId(), payload)) {
            return;
        }

        writeToLocalSpool(record.getId(), payload);
    }

    private boolean writeToMinio(String datasetId, String payload) {
        Instant startedAt = Instant.now();
        if (!minioEnabled) {
            recordObjectWrite("minio", "dataset-record", payload, false, Duration.between(startedAt, Instant.now()));
            return false;
        }
        try {
            MinioClient client = MinioClient.builder()
                    .endpoint(minioEndpoint)
                    .credentials(minioAccessKey, minioSecretKey)
                    .build();
            ensureBucket(client);
            byte[] bytes = payload.getBytes(StandardCharsets.UTF_8);
            client.putObject(
                    PutObjectArgs.builder()
                            .bucket(minioBucket)
                            .object("datasets/" + datasetId + "/record.json")
                            .stream(new ByteArrayInputStream(bytes), bytes.length, -1)
                            .contentType("application/json")
                            .build()
            );
            recordObjectWrite("minio", "dataset-record", payload, true, Duration.between(startedAt, Instant.now()));
            return true;
        } catch (Exception ex) {
            recordObjectWrite("minio", "dataset-record", payload, false, Duration.between(startedAt, Instant.now()));
            log.debug("MinIO dataset persistence unavailable for dataset {}: {}", datasetId, ex.toString());
            return false;
        }
    }

    private void ensureBucket(MinioClient client) throws Exception {
        boolean exists = client.bucketExists(BucketExistsArgs.builder().bucket(minioBucket).build());
        if (!exists) {
            client.makeBucket(MakeBucketArgs.builder().bucket(minioBucket).build());
        }
    }

    private boolean writeToLocalSpool(String datasetId, String payload) {
        Instant startedAt = Instant.now();
        try {
            Path base = Path.of(System.getProperty("java.io.tmpdir"), "governance-object-store", "datasets", datasetId);
            Files.createDirectories(base);
            Files.writeString(base.resolve("record.json"), payload, StandardCharsets.UTF_8);
            recordObjectWrite("local-object-store", "dataset-record", payload, true, Duration.between(startedAt, Instant.now()));
            return true;
        } catch (Exception ex) {
            recordObjectWrite("local-object-store", "dataset-record", payload, false, Duration.between(startedAt, Instant.now()));
            log.warn("Local object-store persistence failed for dataset {}: {}", datasetId, ex.toString());
            return false;
        }
    }

    private String serialize(DatasetRecord record) {
        try {
            return objectMapper.writeValueAsString(record);
        } catch (JsonProcessingException ex) {
            log.warn("Failed to serialize dataset {} for object-store persistence: {}", record.getId(), ex.toString());
            return null;
        }
    }

    private void recordObjectWrite(String storage, String objectKind, Object payload, boolean success, Duration duration) {
        if (governanceRuntimeMetricsService != null) {
            governanceRuntimeMetricsService.recordObjectWrite(
                    storage,
                    objectKind,
                    "governance",
                    payload,
                    success,
                    duration
            );
        }
    }
}
