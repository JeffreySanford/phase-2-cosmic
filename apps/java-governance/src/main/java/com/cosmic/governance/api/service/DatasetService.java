package com.cosmic.governance.api.service;

import com.cosmic.governance.api.dto.DatasetRequest;
import com.cosmic.governance.api.dto.DatasetResponse;
import com.cosmic.governance.api.model.DatasetRecord;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

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

    public DatasetService(RedisTemplate<String, Object> redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    public DatasetResponse create(DatasetRequest req) {
        String id = req.id() != null && !req.id().isBlank() ? req.id() : UUID.randomUUID().toString();
        String now = Instant.now().toString();
        Map<String, Object> meta = req.metadata() == null ? Map.of() : Map.copyOf(req.metadata());
        DatasetRecord rec = new DatasetRecord(id, req.name(), req.description(), now, meta);
        redisTemplate.opsForValue().set(KEY_PREFIX + id, rec);
        return toResponse(rec);
    }

    public Optional<DatasetResponse> get(String id) {
        Object o = redisTemplate.opsForValue().get(KEY_PREFIX + id);
        if (o instanceof DatasetRecord) return Optional.of(toResponse((DatasetRecord) o));
        return Optional.empty();
    }

    public List<DatasetResponse> listAll() {
        var keys = redisTemplate.keys(KEY_PREFIX + "*");
        if (keys == null || keys.isEmpty()) return List.of();
        return keys.stream()
                .map(k -> redisTemplate.opsForValue().get(k))
                .filter(DatasetRecord.class::isInstance)
                .map(DatasetRecord.class::cast)
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    private DatasetResponse toResponse(DatasetRecord r) {
        return new DatasetResponse(r.getId(), r.getName(), r.getDescription(), r.getCreatedAt(), r.getMetadata());
    }
}
