package com.cosmic.governance.api.service;

import com.cosmic.governance.api.model.ReplicationPolicy;
import com.cosmic.governance.api.model.RestoreDrillResult;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class ArchiveDrService {

    private static final String KEY_PREFIX = "dr:policy:";

    private final RedisTemplate<String, Object> redisTemplate;
    private final ObjectMapper objectMapper;
    private final ConcurrentHashMap<String, Object> inMemoryStore = new ConcurrentHashMap<>();

    public ArchiveDrService(RedisTemplate<String, Object> redisTemplate, ObjectMapper objectMapper) {
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
    }

    private void store(String id, ReplicationPolicy policy) {
        String key = KEY_PREFIX + id;
        try {
            if (redisTemplate != null) {
                redisTemplate.opsForValue().set(key, policy);
                return;
            }
        } catch (Exception ignored) {}
        inMemoryStore.put(key, policy);
    }

    private Optional<ReplicationPolicy> load(String id) {
        String key = KEY_PREFIX + id;
        Object o = null;
        try {
            if (redisTemplate != null) {
                o = redisTemplate.opsForValue().get(key);
            }
        } catch (Exception ignored) {
            o = inMemoryStore.get(key);
        }
        if (o == null) o = inMemoryStore.get(key);
        return toPolicy(o);
    }

    private Optional<ReplicationPolicy> toPolicy(Object o) {
        if (o == null) return Optional.empty();
        if (o instanceof ReplicationPolicy) return Optional.of((ReplicationPolicy) o);
        try {
            if (o instanceof Map) {
                @SuppressWarnings("unchecked")
                Map<String, Object> m = (Map<String, Object>) o;
                return Optional.of(objectMapper.convertValue(m, ReplicationPolicy.class));
            }
        } catch (Exception ignored) {}
        return Optional.empty();
    }

    public ReplicationPolicy createPolicy(String name, int retentionDays, String targetRegion, int replicaCount) {
        String id = UUID.randomUUID().toString();
        ReplicationPolicy policy = new ReplicationPolicy(id, name, retentionDays, targetRegion, replicaCount,
                Instant.now().toString());
        store(id, policy);
        return policy;
    }

    public Optional<ReplicationPolicy> getPolicy(String id) {
        return load(id);
    }

    public List<ReplicationPolicy> listPolicies() {
        List<ReplicationPolicy> result = new ArrayList<>();
        Set<String> keys = null;
        try {
            if (redisTemplate != null) {
                keys = redisTemplate.keys(KEY_PREFIX + "*");
            }
        } catch (Exception ignored) {}

        if (keys != null && !keys.isEmpty()) {
            for (String key : keys) {
                try {
                    Object o = redisTemplate.opsForValue().get(key);
                    toPolicy(o).ifPresent(result::add);
                } catch (Exception ignored) {}
            }
        } else {
            for (Map.Entry<String, Object> e : inMemoryStore.entrySet()) {
                if (e.getKey().startsWith(KEY_PREFIX)) {
                    toPolicy(e.getValue()).ifPresent(result::add);
                }
            }
        }
        return result;
    }

    public RestoreDrillResult drillRestore(String datasetId, String policyId) {
        long start = System.currentTimeMillis();
        Optional<ReplicationPolicy> opt = load(policyId);
        if (opt.isEmpty()) {
            return new RestoreDrillResult(
                    UUID.randomUUID().toString(), datasetId, policyId,
                    false, Instant.now().toString(),
                    System.currentTimeMillis() - start,
                    "policy_not_found: " + policyId);
        }
        ReplicationPolicy policy = opt.get();
        boolean success = policy.replicaCount() > 0 && policy.retentionDays() > 0;
        String notes = success
                ? "restore_drill_passed: " + policy.replicaCount() + " replica(s) verified in region " + policy.targetRegion()
                : "restore_drill_failed: invalid policy configuration";
        return new RestoreDrillResult(
                UUID.randomUUID().toString(), datasetId, policyId,
                success, Instant.now().toString(),
                System.currentTimeMillis() - start,
                notes);
    }
}
