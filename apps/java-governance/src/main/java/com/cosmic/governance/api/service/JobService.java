package com.cosmic.governance.api.service;

import com.cosmic.governance.api.dto.JobStatusResponse;
import com.cosmic.governance.api.dto.JobSubmitRequest;
import com.cosmic.governance.api.executor.JobExecutor;
import com.cosmic.governance.api.model.JobRecord;
import com.cosmic.governance.api.model.JobState;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import jakarta.annotation.PreDestroy;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.atomic.AtomicLong;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.cosmic.governance.api.util.RedisMarshaller;
import jakarta.annotation.PostConstruct;
import java.util.concurrent.Executors;

@Service
public class JobService {
    private static final String KEY_PREFIX = "job:";
    private static final Logger log = LoggerFactory.getLogger(JobService.class);

    private final RedisTemplate<String, Object> redisTemplate;
    private final ObjectMapper objectMapper;
    private final RedisMarshaller marshaller;

    private final Map<String, JobExecutor> executorMap = new HashMap<>();
    private final ScheduledExecutorService scanner = Executors.newScheduledThreadPool(1);
    private volatile ScheduledFuture<?> scannerFuture;
    private volatile int scannerIntervalSeconds = 10;
    private final AtomicLong scannedCount = new AtomicLong(0);
    private final AtomicLong dispatchedCount = new AtomicLong(0);

    public JobService(RedisTemplate<String, Object> redisTemplate, ObjectMapper objectMapper, @Autowired List<JobExecutor> executors, RedisMarshaller marshaller) {
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
        this.marshaller = marshaller;
        if (executors != null) {
            for (JobExecutor e : executors) executorMap.put(e.name(), e);
        }
    }

    @PostConstruct
    public void recoverQueuedJobs() {
        // run an immediate recovery scan and schedule periodic scans for late arrivals
        Executors.newSingleThreadExecutor().submit(this::dispatchQueuedJobs);
        scannerFuture = scanner.scheduleAtFixedRate(this::dispatchQueuedJobs, scannerIntervalSeconds, scannerIntervalSeconds, TimeUnit.SECONDS);
    }

    private void dispatchQueuedJobs() {
        try {
            var keys = redisTemplate.keys(KEY_PREFIX + "*");
            if (keys == null) return;
            scannedCount.addAndGet(keys.size());
            for (String k : keys) {
                if (k == null || k.chars().filter(ch -> ch == ':').count() != 1) continue;
                try {
                    Object o = redisTemplate.opsForValue().get(k);
                    JobRecord rec = marshaller.toJobRecord(o);
                    if (rec == null) continue;
                    if (rec.getState() == JobState.QUEUED) {
                        String executorName = "simulator";
                        var paramsObj = rec.getParameters() == null ? Map.<String, Object>of() : rec.getParameters();
                        if (paramsObj.containsKey("executor")) executorName = String.valueOf(paramsObj.get("executor"));
                        else if (rec.getWorkflow() != null && rec.getWorkflow().equalsIgnoreCase("ingest")) executorName = "tacc";
                        JobExecutor exec = executorMap.getOrDefault(executorName, executorMap.get("simulator"));
                        if (exec != null) {
                            log.info("Dispatching queued job {} to executor {}", rec.getJobId(), executorName);
                            dispatchedCount.incrementAndGet();
                            exec.execute(rec, redisTemplate);
                        } else {
                            log.warn("No executor available for '{}' when dispatching job {}", executorName, rec.getJobId());
                        }
                    }
                } catch (Exception e) {
                    log.debug("Ignoring job key {} during dispatch scan: {}", k, e.toString());
                }
            }
        } catch (Exception ex) {
            log.error("Queued job dispatch scan failed", ex);
        }
    }

    @PreDestroy
    public void shutdownScanner() {
        try {
            scanner.shutdownNow();
        } catch (Exception ignored) {}
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
        JobRecord rec = marshaller.toJobRecord(o);
        if (rec != null) return Optional.of(toResponse(rec));
        return Optional.empty();
    }

    public List<String> getLogs(String jobId) {
        String key = KEY_PREFIX + jobId + ":logs";
        try {
            var list = redisTemplate.opsForList().range(key, 0, -1);
            if (list == null) return List.of();
            return list.stream().map(Object::toString).collect(Collectors.toList());
        } catch (org.springframework.data.redis.serializer.SerializationException ex) {
            // fallback: read raw bytes from Redis connection and decode as UTF-8 strings
            try {
                var raw = redisTemplate.execute((org.springframework.data.redis.core.RedisCallback<java.util.List<byte[]>>) conn -> conn.lRange(key.getBytes(), 0, -1));
                if (raw == null) return List.of();
                return raw.stream().map(b -> new String(b, java.nio.charset.StandardCharsets.UTF_8)).collect(Collectors.toList());
            } catch (Exception ex2) {
                return List.of();
            }
        }
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
        if (o instanceof String) {
            try {
                @SuppressWarnings("unchecked")
                Map<String, String> m = objectMapper.readValue((String) o, Map.class);
                return List.of(m);
            } catch (Exception ignored) {
                return List.of();
            }
        }
        return List.of();
    }

    public List<JobStatusResponse> listAll() {
        // Note: For small dev usage we use keys scan; in production use a proper index or sorted set.
        var keys = redisTemplate.keys(KEY_PREFIX + "*");
        if (keys == null || keys.isEmpty()) return List.of();
        return keys.stream()
                // skip auxiliary keys (logs, artifacts, etc.) which use suffixes like ":logs" or ":artifacts"
                .filter(k -> k != null && k.chars().filter(ch -> ch == ':').count() == 1)
                .map(k -> redisTemplate.opsForValue().get(k))
                .map(v -> {
                    return marshaller.toJobRecord(v);
                })
                .filter(java.util.Objects::nonNull)
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    // runtime config & metrics for the scanner
    public int getScannerIntervalSeconds() { return scannerIntervalSeconds; }

    public long getScannedCount() { return scannedCount.get(); }

    public long getDispatchedCount() { return dispatchedCount.get(); }

    public synchronized void setScannerIntervalSeconds(int seconds) {
        if (seconds <= 0) return;
        scannerIntervalSeconds = seconds;
        if (scannerFuture != null) {
            try { scannerFuture.cancel(false); } catch (Exception ignored) {}
        }
        scannerFuture = scanner.scheduleAtFixedRate(this::dispatchQueuedJobs, scannerIntervalSeconds, scannerIntervalSeconds, TimeUnit.SECONDS);
        log.info("Scanner interval updated to {} seconds", scannerIntervalSeconds);
    }

    public Optional<JobStatusResponse> transition(String jobId, JobState newState) {
        String key = KEY_PREFIX + jobId;
        Object o = redisTemplate.opsForValue().get(key);
        if (o == null) return Optional.empty();
        JobRecord rec = marshaller.toJobRecord(o);
        if (rec == null) return Optional.empty();
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
