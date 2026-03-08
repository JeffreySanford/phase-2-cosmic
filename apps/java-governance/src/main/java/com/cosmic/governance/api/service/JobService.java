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
import java.util.concurrent.ConcurrentHashMap;
import java.util.Set;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.cosmic.governance.api.util.RedisMarshaller;
import jakarta.annotation.PostConstruct;
import java.util.concurrent.Executors;

@Service
public class JobService {
    private static final String KEY_PREFIX = "job:";
    private static final Logger log = LoggerFactory.getLogger(JobService.class);

    // simple in-memory audit log for provenance/E2E tests
    private final java.util.List<String> auditLog = java.util.Collections.synchronizedList(new java.util.ArrayList<>());

    /**
     * Expose a copy of the audit log for testing.
     */
    public java.util.List<String> getAuditLog() {
        return new java.util.ArrayList<>(auditLog);
    }

    private void recordAudit(String msg) {
        auditLog.add(msg);
        log.info("Audit: {}", msg);
    }

    private final RedisTemplate<String, Object> redisTemplate;
    private final ObjectMapper objectMapper;
    private final RedisMarshaller marshaller;
    private final AuditService auditService;
    // in-memory fallback store used when RedisTemplate is not available
    private final ConcurrentHashMap<String, Object> inMemoryStore = new ConcurrentHashMap<>();

    private final Map<String, JobExecutor> executorMap = new HashMap<>();
    private final ScheduledExecutorService scanner = Executors.newScheduledThreadPool(1);
    private volatile ScheduledFuture<?> scannerFuture;
    private volatile int scannerIntervalSeconds = 10;
    private final AtomicLong scannedCount = new AtomicLong(0);
    private final AtomicLong dispatchedCount = new AtomicLong(0);

    public JobService(RedisTemplate<String, Object> redisTemplate, ObjectMapper objectMapper, @Autowired List<JobExecutor> executors, RedisMarshaller marshaller, AuditService auditService) {
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
        this.marshaller = marshaller;
        this.auditService = auditService;
        if (executors != null) {
            for (JobExecutor e : executors) executorMap.put(e.name(), e);
        }
    }

    // Helper methods to abstract Redis vs in-memory store access
    private Set<String> keys(String pattern) {
        try {
            if (redisTemplate != null) {
                Set<String> ks = redisTemplate.keys(pattern);
                return ks == null ? java.util.Set.of() : ks;
            }
        } catch (Throwable ignored) {}
        // emulate simple glob behavior where pattern like "job:*" matches keys starting with prefix
        if (pattern != null && pattern.endsWith("*")) {
            String prefix = pattern.substring(0, pattern.length()-1);
            return inMemoryStore.keySet().stream().filter(k -> k.startsWith(prefix)).collect(Collectors.toSet());
        }
        return inMemoryStore.keySet();
    }

    private Object getValue(String key) {
        try {
            if (redisTemplate != null) return redisTemplate.opsForValue().get(key);
        } catch (Throwable ignored) {}
        return inMemoryStore.get(key);
    }

    private void setValue(String key, Object value) {
        try {
            if (redisTemplate != null) {
                redisTemplate.opsForValue().set(key, value);
                return;
            }
        } catch (Throwable ignored) {}
        if (value == null) inMemoryStore.remove(key); else inMemoryStore.put(key, value);
    }

    private java.util.List<Object> listRange(String key, long start, long end) {
        try {
            if (redisTemplate != null) {
                java.util.List<Object> list = redisTemplate.opsForList().range(key, start, end);
                return list == null ? List.of() : list;
            }
        } catch (Throwable ignored) {}
        Object o = inMemoryStore.get(key);
        if (o instanceof java.util.List) return (java.util.List<Object>) o;
        return List.of();
    }

    // Package-private helpers for tests to directly manipulate the backing store
    void putRaw(String key, Object value) {
        setValue(key, value);
    }

    Object getRaw(String key) {
        return getValue(key);
    }

    @PostConstruct
    public void recoverQueuedJobs() {
        // run an immediate recovery scan and schedule periodic scans for late arrivals
        Executors.newSingleThreadExecutor().submit(() -> {
            // dispatch any queued jobs first
            dispatchQueuedJobs();
            // convert any previously-running simulator jobs to completed so they don't hang
            completeStaleRunningJobs();
        });
        scannerFuture = scanner.scheduleAtFixedRate(this::dispatchQueuedJobs, scannerIntervalSeconds, scannerIntervalSeconds, TimeUnit.SECONDS);
    }

    /**
     * If a job was in RUNNING state when the service restarted we have no
     * guarantee the simulator completion task ran.  For the simple demo
     * executor we just mark those jobs completed so they won't sit in RUNNING
     * forever.
     */
    // package-private so tests can call it
    void completeStaleRunningJobs() {
        try {
            var keys = keys(KEY_PREFIX + "*");
            if (keys == null) return;
            for (String k : keys) {
                Object o = getValue(k);
                JobRecord rec = marshaller.toJobRecord(o);
                if (rec == null) continue;
                if (rec.getState() == JobState.RUNNING) {
                    // only apply to simulator jobs (other executors may have proper persistence)
                    Map<String, Object> params = rec.getParameters();
                    String execName = params != null && params.containsKey("executor") ? String.valueOf(params.get("executor")) : "simulator";
                    if ("simulator".equals(execName)) {
                        log.warn("Completing stale running job {} after restart", rec.getJobId());
                        rec.setState(JobState.COMPLETED);
                        rec.setUpdatedAt(Instant.now().toString());
                        rec.setVersion(rec.getVersion() + 1);
                        setValue(k, rec);
                    }
                }
            }
        } catch (Exception e) {
            log.error("Failed to complete stale running jobs", e);
        }
    }

    /* package-private for testing */
    void dispatchQueuedJobs() {
        try {
            var keys = keys(KEY_PREFIX + "*");
            if (keys == null) return;
            scannedCount.addAndGet(keys.size());
            for (String k : keys) {
                if (k == null || k.chars().filter(ch -> ch == ':').count() != 1) continue;
                try {
                    Object o = getValue(k);
                    JobRecord rec = marshaller.toJobRecord(o);
                    if (rec == null) continue;
                    if (rec.getState() == JobState.QUEUED) {
                        // skip jobs explicitly marked as deferred (pre-seeded samples)
                        Map<String, Object> paramsObjCheck = rec.getParameters() == null ? Map.<String, Object>of() : rec.getParameters();
                        boolean deferred = false;
                        if (paramsObjCheck.containsKey("deferred")) {
                            Object dv = paramsObjCheck.get("deferred");
                            if (dv instanceof Boolean) deferred = (Boolean) dv;
                            else deferred = "true".equalsIgnoreCase(String.valueOf(dv));
                        }
                        if (deferred) {
                            log.info("Skipping deferred queued job {} (awaiting release)", rec.getJobId());
                            continue;
                        }
                        String executorName = "simulator";
                        var paramsObj = rec.getParameters() == null ? Map.<String, Object>of() : rec.getParameters();
                        if (paramsObj.containsKey("executor")) executorName = String.valueOf(paramsObj.get("executor"));
                        else if (rec.getWorkflow() != null && rec.getWorkflow().equalsIgnoreCase("ingest")) executorName = "tacc";
                        else if (rec.getWorkflow() != null && rec.getWorkflow().startsWith("vo.")) executorName = "vo";
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

    /**
     * Release queued sample jobs that were marked deferred by removing the deferred flag.
     * Returns number of jobs released.
     */
    public int releaseDeferredJobs() {
        int released = 0;
        try {
            var keys = keys(KEY_PREFIX + "*");
            if (keys == null) return 0;
            for (String k : keys) {
                if (k == null || k.chars().filter(ch -> ch == ':').count() != 1) continue;
                try {
                    Object o = getValue(k);
                    JobRecord rec = marshaller.toJobRecord(o);
                    if (rec == null) continue;
                    if (rec.getState() == JobState.QUEUED) {
                        Map<String, Object> params = rec.getParameters() == null ? Map.of() : rec.getParameters();
                        if (params.containsKey("deferred")) {
                            boolean deferred = false;
                            Object dv = params.get("deferred");
                            if (dv instanceof Boolean) deferred = (Boolean) dv;
                            else deferred = "true".equalsIgnoreCase(String.valueOf(dv));
                            if (deferred) {
                                var newParams = new HashMap<String, Object>(params);
                                newParams.remove("deferred");
                                rec.setParameters(newParams);
                                rec.setUpdatedAt(Instant.now().toString());
                                rec.setVersion(rec.getVersion() + 1);
                                setValue(k, rec);
                                released++;
                            }
                        }
                    }
                } catch (Exception ignored) {}
            }
        } catch (Exception ex) {
            log.error("Failed to release deferred jobs", ex);
        }
        return released;
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
        Map<String, Object> params = request.parameters() == null ? new HashMap<>() : new HashMap<>(request.parameters());
        // if the request included a dedicated lineage object, stash it under parameters for storage
        if (request.lineage() != null) {
            params.put("lineage", Map.copyOf(request.lineage()));
        }
        Map<String, Object> manifest = request.manifest() == null ? null : Map.copyOf(request.manifest());
        JobRecord record = new JobRecord(
                jobId,
                request.workflow(),
                request.datasetId(),
                JobState.QUEUED,
                now,
                now,
                params,
                manifest,
                request.requestedBy()
        );
        // start version at 1 now that the record is persisted
        record.setVersion(1);
        // preserve requestId/traceId if available
        String rid = org.slf4j.MDC.get("requestId");
        String tid = org.slf4j.MDC.get("traceId");
        if ((rid != null && !rid.isBlank()) || (tid != null && !tid.isBlank())) {
            var p = new java.util.HashMap<>(record.getParameters() == null ? Map.of() : record.getParameters());
            if (rid != null && !rid.isBlank()) p.put("requestId", rid);
            if (tid != null && !tid.isBlank()) p.put("traceId", tid);
            record.setParameters(p);
        }
        setValue(KEY_PREFIX + jobId, record);
        StringBuilder auditSb = new StringBuilder();
        auditSb.append("job submitted ").append(jobId)
               .append(" workflow=").append(request.workflow())
               .append(" dataset=").append(request.datasetId());
        if (manifest != null) {
            auditSb.append(" manifest=").append(manifest.toString());
        } else if (params != null && params.containsKey("manifest")) {
            // backwards compatibility: manifest inside parameters
            auditSb.append(" manifest=").append(params.get("manifest").toString());
        }
        if (request.lineage() != null) {
            auditSb.append(" lineage=").append(request.lineage().toString());
        } else if (params != null && params.containsKey("lineage")) {
            auditSb.append(" lineage=").append(params.get("lineage").toString());
        }
        recordAudit(auditSb.toString());

        // pick executor (explicit param 'executor' overrides; default to 'tacc' for ingest workflow)
        String executorName = "simulator";
        boolean deferred = false;
        if (params.containsKey("deferred")) {
            Object dv = params.get("deferred");
            if (dv instanceof Boolean) deferred = (Boolean) dv;
            else deferred = "true".equalsIgnoreCase(String.valueOf(dv));
        }

        // Publish job submitted event to control plane (avoid Map.of which rejects nulls)
        Map<String, Object> eventDetails = new HashMap<>();
        if (request.workflow() != null) eventDetails.put("workflow", request.workflow());
        if (request.datasetId() != null) eventDetails.put("datasetId", request.datasetId());
        if (request.requestedBy() != null) eventDetails.put("requestedBy", request.requestedBy());
        eventDetails.put("executor", executorName);
        if (auditService != null) {
            auditService.publishJobEvent(jobId, "submitted", eventDetails);
        }
        Map<String, Object> paramsObj = request.parameters() == null ? Map.<String, Object>of() : Map.copyOf(request.parameters());
        if (paramsObj.containsKey("executor")) executorName = String.valueOf(paramsObj.get("executor"));
        else if (request.workflow() != null && request.workflow().equalsIgnoreCase("ingest")) executorName = "tacc";
        else if (request.workflow() != null && request.workflow().startsWith("vo.")) executorName = "vo";

        JobExecutor exec = executorMap.getOrDefault(executorName, executorMap.get("simulator"));
        if (!deferred && exec != null) {
            exec.execute(record, redisTemplate);
        }
        return toResponse(record);
    }

    public List<String> types() {
        // canonical types exposed to the frontend
        return List.of(
                "ingest", "export", "reindex", "cleanup", "diagnostics",
                "vo.cone-search", "vo.adql.query", "vo.obscore.search", "vo.votable.fetch",
                "vo.datalink.resolve", "vo.product.fetch", "vo.soda.cutout", "vo.preview.fetch");
    }

    public Optional<JobStatusResponse> get(String jobId) {
        Object o = getValue(KEY_PREFIX + jobId);
        if (o == null) return Optional.empty();
        JobRecord rec = marshaller.toJobRecord(o);
        if (rec != null) return Optional.of(toResponse(rec));
        return Optional.empty();
    }

    public List<String> getLogs(String jobId) {
        String key = KEY_PREFIX + jobId + ":logs";
        try {
            var list = listRange(key, 0, -1);
            if (list == null) return List.of();
            return list.stream().map(Object::toString).collect(Collectors.toList());
        } catch (org.springframework.data.redis.serializer.SerializationException ex) {
            // fallback: read raw bytes from Redis connection and decode as UTF-8 strings
            try {
                Object o = getValue(key);
                if (o instanceof List) return ((List<?>) o).stream().map(Object::toString).collect(Collectors.toList());
            } catch (Exception ignored) {}
        }
        return List.of();
    }

    // manifest helpers ---------------------------------------------
    public Optional<Map<String, Object>> getManifest(String jobId) {
        Optional<JobStatusResponse> status = get(jobId);
        return status.map(JobStatusResponse::manifest);
    }

    /**
     * Retrieve lineage metadata stored in the job parameters under key "lineage".
     * This is a simple implementation for medium-priority backlog; clients may
     * populate this field when submitting jobs to record parent/ancestor IDs.
     */
    public Optional<Map<String, Object>> getLineage(String jobId) {
        Optional<JobStatusResponse> status = get(jobId);
        if (status.isEmpty()) return Optional.empty();
        Map<String, Object> params = status.get().parameters();
        if (params != null && params.get("lineage") instanceof Map) {
            @SuppressWarnings("unchecked")
            Map<String, Object> lineage = (Map<String, Object>) params.get("lineage");
            return Optional.of(lineage);
        }
        return Optional.empty();
    }

    /**
     * Update lineage metadata for a job. This updates the lineage field in the
     * job parameters and increments the version.
     */
    public boolean updateLineage(String jobId, Map<String, Object> lineage) {
        Object o = getValue(KEY_PREFIX + jobId);
        JobRecord rec = marshaller.toJobRecord(o);
        if (rec == null) return false;
        Map<String, Object> params = rec.getParameters();
        if (params == null) {
            params = new HashMap<>();
            rec.setParameters(params);
        }
        params.put("lineage", new HashMap<>(lineage == null ? Map.of() : lineage));
        rec.setUpdatedAt(Instant.now().toString());
        rec.setVersion(rec.getVersion() + 1);
        setValue(KEY_PREFIX + jobId, rec);
        // Record audit entry for lineage update
        recordAudit("job:" + jobId + " lineage updated to " + String.valueOf(lineage));
        return true;
    }

    public boolean attachManifest(String jobId, Map<String, Object> manifest) {
        Object o = getValue(KEY_PREFIX + jobId);
        if (!(o instanceof JobRecord)) return false;
        JobRecord rec = (JobRecord) o;
        rec.setManifest(manifest);
        rec.setUpdatedAt(Instant.now().toString());
        rec.setVersion(rec.getVersion() + 1);
        setValue(KEY_PREFIX + jobId, rec);
        recordAudit("manifest attached " + jobId + " " + manifest.toString());
        return true;
    }

    public boolean attachArtifact(String jobId, Map<String, Object> artifact) {
        String key = KEY_PREFIX + jobId + ":artifacts";
        try {
            if (redisTemplate != null) {
                // push onto a list so multiple artifacts can be attached
                redisTemplate.opsForList().rightPush(key, artifact);
            } else {
                // in-memory fallback: maintain a List<Object>
                Object o = inMemoryStore.get(key);
                java.util.List<Object> list;
                if (o instanceof java.util.List) {
                    list = (java.util.List<Object>) o;
                } else {
                    list = new java.util.ArrayList<>();
                }
                list.add(artifact);
                inMemoryStore.put(key, list);
            }
            recordAudit("artifact attached " + jobId + " " + artifact.toString());
            return true;
        } catch (Exception ex) {
            log.error("Failed to attach artifact for job {}: {}", jobId, ex.toString());
            return false;
        }
    }

    public List<Map<String, String>> getArtifacts(String jobId) {
        String key = KEY_PREFIX + jobId + ":artifacts";
        try {
            if (redisTemplate != null) {
                java.util.List<Object> items = redisTemplate.opsForList().range(key, 0, -1);
                if (items == null || items.isEmpty()) return List.of();
                return items.stream().map(it -> {
                    if (it instanceof Map) {
                        @SuppressWarnings("unchecked")
                        Map<String, String> m = (Map<String, String>) it;
                        return m;
                    }
                    try {
                        @SuppressWarnings("unchecked")
                        Map<String, String> m = objectMapper.convertValue(it, Map.class);
                        return m;
                    } catch (Exception ex) {
                        return java.util.Collections.<String, String>emptyMap();
                    }
                }).collect(Collectors.toList());
            } else {
                Object o = inMemoryStore.get(key);
                if (o instanceof java.util.List) {
                    @SuppressWarnings("unchecked")
                    java.util.List<Object> items = (java.util.List<Object>) o;
                    return items.stream().map(it -> {
                        if (it instanceof Map) {
                            @SuppressWarnings("unchecked")
                            Map<String, String> m = (Map<String, String>) it;
                            return m;
                        }
                        return java.util.Collections.<String, String>emptyMap();
                    }).collect(Collectors.toList());
                }
                return List.of();
            }
        } catch (Exception ex) {
            log.debug("Failed to read artifacts for {}: {}", jobId, ex.toString());
            return List.of();
        }
    }

    public List<JobStatusResponse> listAll() {
        return list(null, null, 0, Integer.MAX_VALUE);
    }
    /**
     * Cancel a job if it is in a state that can still be aborted.
     */
    public Optional<JobStatusResponse> cancel(String jobId, Long expectedVersion) {
        // explicit cancel wrapper to handle allowed-from states if needed
        return transition(jobId, JobState.CANCELED, expectedVersion);
    }

    /**
     * Retry a job by resetting its state to QUEUED.  Only FAILED, CANCELED or
     * TIMED_OUT jobs may be retried.
     */
    public Optional<JobStatusResponse> retry(String jobId, Long expectedVersion) {
        String key = KEY_PREFIX + jobId;
        Object o = getValue(key);
        if (o == null) return Optional.empty();
        JobRecord rec = marshaller.toJobRecord(o);
        if (rec == null) return Optional.empty();
        if (expectedVersion != null && rec.getVersion() != expectedVersion) {
            return Optional.empty();
        }
        if (rec.getState() != JobState.FAILED && rec.getState() != JobState.CANCELED && rec.getState() != JobState.TIMED_OUT) {
            log.warn("Cannot retry job {} from state {}", jobId, rec.getState());
            return Optional.empty();
        }
        rec.setState(JobState.QUEUED);
        rec.setUpdatedAt(Instant.now().toString());
        rec.setVersion(rec.getVersion() + 1);
        setValue(key, rec);
        log.info("Audit: job {} retried (version now {})", jobId, rec.getVersion());
        return Optional.of(toResponse(rec));
    }
    public List<JobStatusResponse> list(String workflowFilter, JobState stateFilter, int page, int size) {
        // Note: For small dev usage we use keys scan; in production use a proper index or sorted set.
        var keys = keys(KEY_PREFIX + "*");
        if (keys == null || keys.isEmpty()) return List.of();
        return keys.stream()
                // skip auxiliary keys (logs, artifacts, etc.) which use suffixes like ":logs" or ":artifacts"
                .filter(k -> k != null && k.chars().filter(ch -> ch == ':').count() == 1)
            .map(k -> getValue(k))
                .map(v -> marshaller.toJobRecord(v))
                .filter(java.util.Objects::nonNull)
                .filter(rec -> {
                    if (workflowFilter != null && !workflowFilter.isBlank()) {
                        if (rec.getWorkflow() == null || !rec.getWorkflow().equalsIgnoreCase(workflowFilter)) return false;
                    }
                    if (stateFilter != null) {
                        if (rec.getState() != stateFilter) return false;
                    }
                    return true;
                })
                .sorted((a, b) -> a.getCreatedAt().compareTo(b.getCreatedAt()))
                .skip((long) page * size)
                .limit(size <= 0 ? Integer.MAX_VALUE : size)
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

    public Optional<JobStatusResponse> transition(String jobId, JobState newState, Long expectedVersion) {
        String key = KEY_PREFIX + jobId;
        Object o = getValue(key);
        if (o == null) return Optional.empty();
        JobRecord rec = marshaller.toJobRecord(o);
        if (rec == null) return Optional.empty();
        if (expectedVersion != null && rec.getVersion() != expectedVersion) {
            throw new IllegalStateException("version_mismatch:" + rec.getVersion());
        }
        JobState current = rec.getState();
        if (!isValidTransition(current, newState)) {
            log.warn("Invalid state transition attempted for {}: {} -> {}", jobId, current, newState);
            return Optional.empty();
        }
        recordAudit("job " + jobId + " transitioning " + current + " -> " + newState);
        rec.setState(newState);
        rec.setUpdatedAt(Instant.now().toString());
        rec.setVersion(rec.getVersion() + 1);
        setValue(key, rec);

        // Publish job transition event to control plane
        Map<String, Object> eventDetails = Map.of(
            "fromState", current.toString(),
            "toState", newState.toString(),
            "expectedVersion", expectedVersion != null ? expectedVersion : "none"
        );
        if (auditService != null) {
            auditService.publishJobEvent(jobId, "transitioned", eventDetails);
        }

        return Optional.of(toResponse(rec));
    }

    /**
     * Delete a job record from the backing store. Returns true if the job existed and was removed.
     */
    public boolean deleteJob(String jobId) {
        String key = KEY_PREFIX + jobId;
        try {
            if (redisTemplate != null) {
                Boolean removed = redisTemplate.delete(key);
                return removed != null && removed;
            }
        } catch (Throwable ignored) {}
        return inMemoryStore.remove(key) != null;
    }

    private boolean isValidTransition(JobState from, JobState to) {
        if (from == to) return true;
        return switch (from) {
            case QUEUED -> to == JobState.RUNNING || to == JobState.CANCELED || to == JobState.TIMED_OUT || to == JobState.FAILED;
            case RUNNING -> to == JobState.COMPLETED || to == JobState.FAILED || to == JobState.CANCELED || to == JobState.TIMED_OUT;
            case COMPLETED, FAILED, CANCELED, TIMED_OUT -> false;
        };
    }

    private JobStatusResponse toResponse(JobRecord record) {
        // extract any lineage object from parameters
        Map<String,Object> lineage = null;
        if (record.getParameters() != null && record.getParameters().get("lineage") instanceof Map) {
            @SuppressWarnings("unchecked")
            Map<String,Object> tmp = (Map<String,Object>) record.getParameters().get("lineage");
            lineage = tmp;
        }
        return new JobStatusResponse(
                record.getJobId(),
                record.getWorkflow(),
                record.getDatasetId(),
                record.getState().name(),
                record.getCreatedAt(),
                record.getUpdatedAt(),
                record.getParameters(),
                lineage,
                record.getManifest(),
                record.getRequestedBy(),
                record.getVersion()
        );
    }
}
