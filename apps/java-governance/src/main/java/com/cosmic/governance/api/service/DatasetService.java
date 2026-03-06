package com.cosmic.governance.api.service;

import com.cosmic.governance.api.dto.DatasetRequest;
import com.cosmic.governance.api.dto.DatasetResponse;
import com.cosmic.governance.api.model.DatasetRecord;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;
import java.util.Set;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class DatasetService {
    private static final String KEY_PREFIX = "dataset:";

    private final RedisTemplate<String, Object> redisTemplate;
    private final java.util.concurrent.ConcurrentHashMap<String,Object> inMemoryStore = new java.util.concurrent.ConcurrentHashMap<>();

    public DatasetService(RedisTemplate<String, Object> redisTemplate) {
        this.redisTemplate = redisTemplate;
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
        try {
            if (redisTemplate != null) {
                redisTemplate.opsForValue().set(KEY_PREFIX + id, rec);
            } else {
                throw new RuntimeException("no redis");
            }
        } catch (Exception ex) {
            // fallback to in-memory store for tests or missing redis
            inMemoryStore.put(KEY_PREFIX + id, rec);
        }
        return toResponse(rec);
    }

    public Optional<DatasetResponse> get(String id) {
        Object o = null;
        if (redisTemplate != null) {
            try {
                o = redisTemplate.opsForValue().get(KEY_PREFIX + id);
            } catch (Exception ignored) {
                o = inMemoryStore.get(KEY_PREFIX + id);
            }
            if (o == null) {
                o = inMemoryStore.get(KEY_PREFIX + id);
            }
        } else {
            o = inMemoryStore.get(KEY_PREFIX + id);
        }
        return toResponseObject(o);
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
                try {
                    return redisTemplate.opsForValue().get(k);
                } catch (Exception ex) {
                    return inMemoryStore.get(k);
                }
            });
        }
        return stream
                .map(this::toResponseObject)
                .flatMap(Optional::stream)
                .collect(Collectors.toList());
    }

    private DatasetResponse toResponse(DatasetRecord r) {
        return new DatasetResponse(r.getId(), r.getName(), r.getDescription(), r.getCreatedAt(), r.getMetadata(), r.getManifest());
    }

    private Optional<DatasetResponse> toResponseObject(Object o) {
        if (o instanceof DatasetRecord r) {
            return Optional.of(toResponse(r));
        }
        if (o instanceof Map<?, ?> m) {
            @SuppressWarnings("unchecked")
            Map<String, Object> metadata = m.get("metadata") instanceof Map<?, ?> mm
                    ? (Map<String, Object>) mm
                    : Map.of();
            @SuppressWarnings("unchecked")
            Map<String, Object> manifest = m.get("manifest") instanceof Map<?, ?> mm
                    ? (Map<String, Object>) mm
                    : null;
            return Optional.of(new DatasetResponse(
                    (String) m.get("id"),
                    (String) m.get("name"),
                    (String) m.get("description"),
                    (String) m.get("createdAt"),
                    metadata,
                    manifest
            ));
        }
        return Optional.empty();
    }
}
