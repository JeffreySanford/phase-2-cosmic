package com.cosmic.governance.api.service;

import com.cosmic.governance.api.dto.JobStatusResponse;
import com.cosmic.governance.api.dto.JobSubmitRequest;
import com.cosmic.governance.api.executor.JobExecutor;
import com.cosmic.governance.api.model.JobRecord;
import com.cosmic.governance.api.model.JobState;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class JobService {
    private static final String KEY_PREFIX = "job:";

    private final RedisTemplate<String, Object> redisTemplate;
    private final ObjectMapper objectMapper;

    private final Map<String, JobExecutor> executorMap = new HashMap<>();

    public JobService(RedisTemplate<String, Object> redisTemplate, ObjectMapper objectMapper, @Autowired List<JobExecutor> executors) {
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
        if (executors != null) {
            for (JobExecutor e : executors) executorMap.put(e.name(), e);
        }
    }

    public JobStatusResponse submit(JobSubmitRequest request) {
        String now = Instant.now().toString();
        String jobId = UUID.randomUUID().toString();
        Map<String, Object> params = request.parameters() == null ? Map.<String, Object>of() : Map.copyOf(request.parameters());
        JobRecord record = new JobRecord(
                jobId,
                request.workflow(),
                request.datasetId(),
                JobState.QUEUED,
                now,
                now,
                params,
                request.requestedBy()
        );
        redisTemplate.opsForValue().set(KEY_PREFIX + jobId, record);

        // pick executor (explicit param 'executor' overrides; default to 'tacc' for ingest workflow)
        String executorName = "simulator";
        Map<String, Object> paramsObj = request.parameters() == null ? Map.<String, Object>of() : Map.copyOf(request.parameters());
        if (paramsObj.containsKey("executor")) executorName = String.valueOf(paramsObj.get("executor"));
        else if (request.workflow() != null && request.workflow().equalsIgnoreCase("ingest")) executorName = "tacc";

        JobExecutor exec = executorMap.getOrDefault(executorName, executorMap.get("simulator"));
        if (exec != null) {
            exec.execute(record, redisTemplate);
        }
        return toResponse(record);
    }

    public List<String> types() {
        // canonical types exposed to the frontend
        return List.of("import", "export", "reindex", "cleanup", "diagnostics", "ingest", "transform", "validate", "archive", "snapshot", "analyze", "train", "notify", "backup", "restore", "publish", "fetch", "scheduler", "custom");
    }

    public Optional<JobStatusResponse> get(String jobId) {
        Object o = redisTemplate.opsForValue().get(KEY_PREFIX + jobId);
        if (o == null) return Optional.empty();
        JobRecord rec = null;
        if (o instanceof JobRecord) {
            rec = (JobRecord) o;
        } else if (o instanceof Map) {
            @SuppressWarnings("unchecked")
            Map<String, Object> m = (Map<String, Object>) o;
            rec = objectMapper.convertValue(m, JobRecord.class);
            if (rec.getState() == null && m.get("state") instanceof String) {
                try {
                    rec.setState(JobState.valueOf(((String) m.get("state")).toUpperCase()));
                } catch (Exception ignored) {}
            }
        }
        if (rec != null) return Optional.of(toResponse(rec));
        return Optional.empty();
    }

    public List<String> getLogs(String jobId) {
        String key = KEY_PREFIX + jobId + ":logs";
        var list = redisTemplate.opsForList().range(key, 0, -1);
        if (list == null) return List.of();
        // convert objects to strings
        return list.stream().map(Object::toString).collect(Collectors.toList());
    }

    public List<Map<String, String>> getArtifacts(String jobId) {
        String key = KEY_PREFIX + jobId + ":artifacts";
        Object o = redisTemplate.opsForValue().get(key);
        if (o instanceof Map) {
            // single artifact stored as map
            @SuppressWarnings("unchecked")
            Map<String, String> m = (Map<String, String>) o;
            return List.of(m);
        }
        return List.of();
    }

    public List<JobStatusResponse> listAll() {
        // Note: For small dev usage we use keys scan; in production use a proper index or sorted set.
        var keys = redisTemplate.keys(KEY_PREFIX + "*");
        if (keys == null || keys.isEmpty()) return List.of();
        return keys.stream()
                .map(k -> redisTemplate.opsForValue().get(k))
                .map(v -> {
                    if (v instanceof JobRecord) return (JobRecord) v;
                    if (v instanceof Map) return objectMapper.convertValue(v, JobRecord.class);
                    return null;
                })
                .filter(java.util.Objects::nonNull)
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    public Optional<JobStatusResponse> transition(String jobId, JobState newState) {
        String key = KEY_PREFIX + jobId;
        Object o = redisTemplate.opsForValue().get(key);
        if (o == null) return Optional.empty();
        JobRecord rec;
        if (o instanceof JobRecord) rec = (JobRecord) o;
        else if (o instanceof Map) rec = objectMapper.convertValue(o, JobRecord.class);
        else return Optional.empty();
        rec.setState(newState);
        rec.setUpdatedAt(Instant.now().toString());
        redisTemplate.opsForValue().set(key, rec);
        return Optional.of(toResponse(rec));
    }

    private JobStatusResponse toResponse(JobRecord record) {
        return new JobStatusResponse(
                record.getJobId(),
                record.getWorkflow(),
                record.getDatasetId(),
                record.getState().name(),
                record.getCreatedAt(),
                record.getUpdatedAt(),
                record.getParameters(),
                record.getRequestedBy()
        );
    }
}
