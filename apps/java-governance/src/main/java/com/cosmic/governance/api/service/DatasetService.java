package com.cosmic.governance.api.service;

import com.cosmic.governance.api.dto.DatasetRequest;
import com.cosmic.governance.api.dto.DatasetResponse;
import com.cosmic.governance.api.model.DatasetRecord;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;
import java.util.Set;

import java.time.Instant;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class DatasetService {
    private static final String KEY_PREFIX = "dataset:";

    private final RedisTemplate<String, Object> redisTemplate;
    private final GovernanceRuntimeMetricsService governanceRuntimeMetricsService;
    private final GovernanceObjectStoreService governanceObjectStoreService;
    private final java.util.concurrent.ConcurrentHashMap<String,Object> inMemoryStore = new java.util.concurrent.ConcurrentHashMap<>();

    public DatasetService(RedisTemplate<String, Object> redisTemplate) {
        this(redisTemplate, null, null);
    }

    @Autowired
    public DatasetService(
            RedisTemplate<String, Object> redisTemplate,
            GovernanceRuntimeMetricsService governanceRuntimeMetricsService,
            GovernanceObjectStoreService governanceObjectStoreService
    ) {
        this.redisTemplate = redisTemplate;
        this.governanceRuntimeMetricsService = governanceRuntimeMetricsService;
        this.governanceObjectStoreService = governanceObjectStoreService;
    }

    public DatasetResponse create(DatasetRequest req) {
        String id = req.id() != null && !req.id().isBlank() ? req.id() : UUID.randomUUID().toString();
        String now = Instant.now().toString();
        Map<String, Object> meta = req.metadata() == null ? Map.of() : Map.copyOf(req.metadata());
        Map<String, Object> manifest = req.manifest() == null ? null : Map.copyOf(req.manifest());
        // if manifest is provided, also inject it into metadata for backward compatibility
        if (manifest != null) {
            var mm = new java.util.HashMap<>(meta);
            mm.put("manifest", manifest);
            meta = mm;
        }
        DatasetRecord rec = new DatasetRecord(id, req.name(), req.description(), now, meta, manifest);
        Instant startedAt = Instant.now();
        try {
            if (redisTemplate != null) {
                redisTemplate.opsForValue().set(KEY_PREFIX + id, rec);
                recordRedisWrite("redis", rec, true, Duration.between(startedAt, Instant.now()));
            } else {
                throw new RuntimeException("no redis");
            }
        } catch (Exception ex) {
            recordRedisWrite("redis", rec, false, Duration.between(startedAt, Instant.now()));
            // fallback to in-memory store for tests or missing redis
            inMemoryStore.put(KEY_PREFIX + id, rec);
            recordRedisWrite("memory", rec, true, Duration.between(startedAt, Instant.now()));
        }
        if (governanceRuntimeMetricsService != null) {
            governanceRuntimeMetricsService.recordDatasetMutation("create", rec);
            governanceRuntimeMetricsService.recordBusinessAction("dataset", "publish", rec);
            if (manifest != null) {
                governanceRuntimeMetricsService.recordJobMetadataMutation("dataset_manifest", manifest);
                governanceRuntimeMetricsService.recordBusinessAction("manifest", "publish", manifest);
            }
        }
        if (governanceObjectStoreService != null) {
            governanceObjectStoreService.persistDatasetRecord(rec);
        }
        return toResponse(rec);
    }

    public Optional<DatasetResponse> get(String id) {
        Instant startedAt = Instant.now();
        Object o = null;
        if (redisTemplate != null) {
            try {
                o = redisTemplate.opsForValue().get(KEY_PREFIX + id);
                recordRedisRead("redis", o, true, Duration.between(startedAt, Instant.now()));
            } catch (Exception ignored) {
                recordRedisRead("redis", Map.of("datasetId", id), false, Duration.between(startedAt, Instant.now()));
                o = inMemoryStore.get(KEY_PREFIX + id);
                recordRedisRead("memory", o, true, Duration.between(startedAt, Instant.now()));
            }
        } else {
            o = inMemoryStore.get(KEY_PREFIX + id);
            recordRedisRead("memory", o, true, Duration.between(startedAt, Instant.now()));
        }
        if (o instanceof DatasetRecord) {
            if (governanceRuntimeMetricsService != null) {
                governanceRuntimeMetricsService.recordOperatorRead("dataset_get", o);
                governanceRuntimeMetricsService.recordBusinessAction("dataset", "read", o);
            }
            return Optional.of(toResponse((DatasetRecord) o));
        }
        return Optional.empty();
    }

    public List<DatasetResponse> listAll() {
        var keys = Set.<String>of();
        if (redisTemplate != null) {
            try {
                keys = redisTemplate.keys(KEY_PREFIX + "*");
            } catch (Exception ignored) {}
        }
        java.util.stream.Stream<Object> stream;
        if (keys == null || keys.isEmpty()) {
            stream = inMemoryStore.values().stream();
        } else {
            stream = keys.stream().map(k -> {
                Instant startedAt = Instant.now();
                try {
                    Object value = redisTemplate.opsForValue().get(k);
                    recordRedisRead("redis", value, true, Duration.between(startedAt, Instant.now()));
                    return value;
                } catch (Exception ex) {
                    recordRedisRead("redis", Map.of("key", k), false, Duration.between(startedAt, Instant.now()));
                    Object value = inMemoryStore.get(k);
                    recordRedisRead("memory", value, true, Duration.between(startedAt, Instant.now()));
                    return value;
                }
            });
        }
        var datasets = stream
                .filter(DatasetRecord.class::isInstance)
                .map(DatasetRecord.class::cast)
                .map(this::toResponse)
                .collect(Collectors.toList());
        if (governanceRuntimeMetricsService != null) {
            governanceRuntimeMetricsService.recordOperatorRead("dataset_list", datasets);
            governanceRuntimeMetricsService.recordBusinessAction("dataset", "read", datasets);
        }
        return datasets;
    }

    private DatasetResponse toResponse(DatasetRecord r) {
        return new DatasetResponse(r.getId(), r.getName(), r.getDescription(), r.getCreatedAt(), r.getMetadata(), r.getManifest());
    }

    private void recordRedisRead(String store, Object payload, boolean success, Duration duration) {
        if (governanceRuntimeMetricsService != null) {
            governanceRuntimeMetricsService.recordRedisRead(store, "dataset", payload, success, duration);
        }
    }

    private void recordRedisWrite(String store, Object payload, boolean success, Duration duration) {
        if (governanceRuntimeMetricsService != null) {
            governanceRuntimeMetricsService.recordRedisWrite(store, "dataset", payload, success, duration);
        }
    }
}
