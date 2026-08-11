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
import java.util.concurrent.atomic.AtomicReference;

import java.time.Instant;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.Set;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.cosmic.governance.api.util.JobRecordMutator;
import com.cosmic.governance.api.util.RedisMarshaller;
import jakarta.annotation.PostConstruct;
import java.util.concurrent.Executors;

@Service
public class JobService {
    private static final String KEY_PREFIX = "job:";
    private static final Logger log = LoggerFactory.getLogger(JobService.class);

    // Redis SCAN batch hint. Large enough to keep round-trips down, small enough
    // that a single reply never dominates the heap.
    private static final int SCAN_BATCH_SIZE = 1000;

    // How many index entries are read per round trip while walking newest-first.
    private static final int INDEX_WINDOW = 500;

    // How deep into job history a listing will walk. Beyond this, jobs age out of
    // the UI; the records still exist and remain available to a cold lookup.
    private static final int MAX_INDEX_WALK = 20_000;

    // Ceiling on job records retained to satisfy one list request. Each record
    // costs far more on the heap than its Redis representation, so this is the
    // bound that actually protects the service.
    private static final int MAX_LISTED_RECORDS = 5_000;

    // simple in-memory audit log for provenance/E2E tests
    private static final int AUDIT_LOG_MAX = 2_000;
    private final java.util.Deque<String> auditLog = new java.util.ArrayDeque<>();

    /**
     * Expose a copy of the audit log for testing.
     */
    public java.util.List<String> getAuditLog() {
        synchronized (auditLog) {
            return new java.util.ArrayList<>(auditLog);
        }
    }

    private void recordAudit(String msg) {
        // Ring buffer: this log exists for provenance assertions in tests, not as
        // durable storage. Unbounded growth here leaked the heap of any instance
        // left running for days.
        synchronized (auditLog) {
            if (auditLog.size() >= AUDIT_LOG_MAX) {
                auditLog.removeFirst();
            }
            auditLog.addLast(msg);
        }
        log.info("Audit: {}", msg);
    }

    private final RedisTemplate<String, Object> redisTemplate;
    private final ObjectMapper objectMapper;
    private final RedisMarshaller marshaller;
    private final JobRecordMutator jobRecordMutator;
    private final AuditService auditService;
    private final GovernanceRuntimeMetricsService governanceRuntimeMetricsService;
    // in-memory fallback store used when RedisTemplate is not available
    private final ConcurrentHashMap<String, Object> inMemoryStore = new ConcurrentHashMap<>();

    private final Map<String, JobExecutor> executorMap = new HashMap<>();
    private final ScheduledExecutorService scanner = Executors.newScheduledThreadPool(1, task -> {
        Thread thread = new Thread(task, "job-dispatch-scanner");
        thread.setDaemon(true);
        return thread;
    });
    private final ExecutorService recoveryExecutor = Executors.newSingleThreadExecutor(task -> {
        Thread thread = new Thread(task, "job-recovery");
        thread.setDaemon(true);
        return thread;
    });
    private volatile ScheduledFuture<?> scannerFuture;
    private volatile int scannerIntervalSeconds = 10;
    private final AtomicLong scannedCount = new AtomicLong(0);
    private final AtomicLong dispatchedCount = new AtomicLong(0);

    public JobService(RedisTemplate<String, Object> redisTemplate, ObjectMapper objectMapper, @Autowired List<JobExecutor> executors, RedisMarshaller marshaller, AuditService auditService) {
        this(redisTemplate, objectMapper, executors, marshaller, auditService, null);
    }

    @Autowired
    public JobService(RedisTemplate<String, Object> redisTemplate, ObjectMapper objectMapper, List<JobExecutor> executors, RedisMarshaller marshaller, AuditService auditService, GovernanceRuntimeMetricsService governanceRuntimeMetricsService) {
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
        this.marshaller = marshaller;
        this.auditService = auditService;
        this.governanceRuntimeMetricsService = governanceRuntimeMetricsService;
        this.jobRecordMutator = new JobRecordMutator(marshaller);
        if (executors != null) {
            for (JobExecutor e : executors) executorMap.put(e.name(), e);
        }
    }

    // Helper methods to abstract Redis vs in-memory store access
    //
    // Key access is deliberately split in two. A long-lived dev stack accumulates
    // hundreds of thousands of job keys, so anything that materialises the whole
    // key space at once exhausts the heap:
    //
    // every caller goes through forEachKey, which streams a cursor and never
    // retains the key space. There is deliberately no helper that collects all
    // keys into a Set: that is what exhausted the heap.

    /**
     * Visit every key matching {@code pattern}, stopping early when {@code visitor}
     * returns false. Uses Redis SCAN rather than KEYS: SCAN is cursor-based, so it
     * neither blocks the server for the duration of the sweep nor allocates the
     * entire key space in one response.
     */
    private void forEachKey(String pattern, java.util.function.Predicate<String> visitor) {
        try {
            if (redisTemplate != null) {
                org.springframework.data.redis.core.ScanOptions options =
                        org.springframework.data.redis.core.ScanOptions.scanOptions()
                                .match(pattern)
                                .count(SCAN_BATCH_SIZE)
                                .build();
                try (org.springframework.data.redis.core.Cursor<String> cursor = redisTemplate.scan(options)) {
                    while (cursor.hasNext()) {
                        if (!visitor.test(cursor.next())) return;
                    }
                }
                return;
            }
        } catch (Throwable ignored) {}
        for (String key : inMemoryKeys(pattern)) {
            if (!visitor.test(key)) return;
        }
    }

    // Idempotency index.
    //
    // Duplicate detection asks exactly one question -- "has this requestId been
    // submitted before?" -- and used to answer it by listing every job, on every
    // ingested message. That made the ingest hot path O(total jobs) per message,
    // which is what actually exhausted the heap. A set membership test answers the
    // same question in O(1) and never grows the working set of a single request.
    private static final String REQUEST_ID_INDEX_KEY = "job:index:requestIds";
    private final Set<String> inMemoryRequestIds = ConcurrentHashMap.newKeySet();

    /**
     * True when a job carrying this requestId has already been recorded.
     *
     * Covers jobs submitted after this index was introduced. The index is
     * maintained on write and is deliberately not backfilled from pre-existing
     * keys, so historical jobs do not participate in deduplication.
     */
    public boolean hasRequestId(String requestId) {
        if (requestId == null || requestId.isBlank()) {
            return false;
        }
        try {
            if (redisTemplate != null) {
                return Boolean.TRUE.equals(
                        redisTemplate.opsForSet().isMember(REQUEST_ID_INDEX_KEY, requestId));
            }
        } catch (Throwable ex) {
            log.debug("requestId index lookup failed for {}: {}", requestId, ex.toString());
        }
        return inMemoryRequestIds.contains(requestId);
    }

    // Listing index: job id -> createdAt epoch millis, newest last.
    //
    // Listing sorts by createdAt, so without an ordered index a page cannot be
    // chosen without reading every job first -- which is why page/size never
    // bounded the work. ZREVRANGE over this set reads only the requested window,
    // so a listing costs O(log N + page) rather than O(total jobs).
    //
    // Jobs older than the window simply stop appearing in the UI. The records
    // themselves are untouched, so a cold lookup (Postgres) can retrieve them.
    private static final String CREATED_INDEX_KEY = "job:index:createdAt";
    // Completion marker, written only after a sweep finishes. A marker written at
    // claim time would survive a process that died mid-sweep and permanently skip
    // the backfill, leaving an index that silently omits jobs.
    private static final String INDEX_BACKFILL_DONE = "job:index:createdAt:backfilled";
    // In-progress lock so concurrent instances do not duplicate the sweep. It
    // carries a TTL so a crashed sweep is retried rather than blocking forever.
    private static final String INDEX_BACKFILL_LOCK = "job:index:createdAt:backfilling";
    private static final Duration INDEX_BACKFILL_LOCK_TTL = Duration.ofMinutes(30);

    /**
     * Job ids for one page, newest first, or empty when the index is unavailable
     * (in which case callers fall back to scanning).
     */
    private List<String> pagedJobIdsNewestFirst(long start, long end) {
        try {
            if (redisTemplate != null) {
                Set<Object> ids = redisTemplate.opsForZSet().reverseRange(CREATED_INDEX_KEY, start, end);
                if (ids == null) {
                    return List.of();
                }
                return ids.stream().map(String::valueOf).collect(Collectors.toList());
            }
        } catch (Throwable ex) {
            log.debug("createdAt index read failed: {}", ex.toString());
        }
        return List.of();
    }

    /**
     * One-time population of the listing index for jobs written before it existed.
     *
     * This costs a single full sweep, which is exactly the work the index exists to
     * avoid, so it must not repeat on every boot. A marker key claimed atomically
     * makes it run once per store and keeps concurrent instances from duplicating
     * the sweep.
     */
    void backfillCreatedAtIndex() {
        if (redisTemplate == null) {
            return;
        }
        try {
            if (Boolean.TRUE.equals(redisTemplate.hasKey(INDEX_BACKFILL_DONE))) {
                return;
            }
            Boolean claimed = redisTemplate.opsForValue().setIfAbsent(
                    INDEX_BACKFILL_LOCK, Instant.now().toString(), INDEX_BACKFILL_LOCK_TTL);
            if (!Boolean.TRUE.equals(claimed)) {
                log.info("Job listing index backfill already in progress elsewhere");
                return;
            }
        } catch (Throwable ex) {
            log.debug("createdAt index backfill claim failed: {}", ex.toString());
            return;
        }

        log.info("Backfilling job listing index; this runs once per store");
        AtomicLong indexed = new AtomicLong();
        try {
            forEachKey(KEY_PREFIX + "*", key -> {
                if (key == null || key.chars().filter(ch -> ch == ':').count() != 1) return true;
                JobRecord rec = marshaller.toJobRecord(getValue(key));
                if (rec != null) {
                    indexCreatedAt(rec);
                    indexed.incrementAndGet();
                }
                return true;
            });
            // Only a completed sweep records completion; anything else leaves the
            // lock to expire so the next start retries.
            redisTemplate.opsForValue().set(INDEX_BACKFILL_DONE, Instant.now().toString());
            log.info("Backfilled {} jobs into the listing index", indexed.get());
        } catch (Exception ex) {
            log.error("Job listing index backfill failed after {} jobs; will retry", indexed.get(), ex);
        } finally {
            try {
                redisTemplate.delete(INDEX_BACKFILL_LOCK);
            } catch (Throwable ignored) {}
        }
    }

    private void indexCreatedAt(JobRecord record) {
        if (record == null || record.getJobId() == null) {
            return;
        }
        try {
            if (redisTemplate != null) {
                double score = epochMillisOf(record.getCreatedAt());
                redisTemplate.opsForZSet().add(CREATED_INDEX_KEY, record.getJobId(), score);
            }
        } catch (Throwable ex) {
            log.debug("createdAt index write failed for {}: {}", record.getJobId(), ex.toString());
        }
    }

    /**
     * Give a job a bounded lifetime, covering its record and the log and
     * artifact keys that hang off it.
     *
     * <p>Used for jobs the platform generates rather than an operator: a
     * running dev stack was measured growing Redis by 15 keys/sec with no
     * expiry anywhere, reaching two million keys and 765 MB, because every
     * job wrote three unexpiring keys and nothing ever removed them.
     *
     * <p>The createdAt index entry is deliberately left alone. Redis expiry
     * cannot remove a sorted-set member, so it is dropped lazily when a
     * listing walks past an id whose record has already gone. Removing it here
     * would be wrong anyway: the record outlives this call by the retention
     * window.
     */
    public void expireJob(String jobId, Duration retention) {
        if (jobId == null || retention == null || retention.isZero() || retention.isNegative()) {
            return;
        }
        if (redisTemplate == null) {
            return;
        }
        String key = KEY_PREFIX + jobId;
        for (String target : List.of(key, key + ":logs", key + ":artifacts")) {
            try {
                redisTemplate.expire(target, retention);
            } catch (Throwable ex) {
                log.debug("Retention set failed for {}: {}", target, ex.toString());
            }
        }
    }

    private void unindexCreatedAt(String jobId) {
        try {
            if (redisTemplate != null) {
                redisTemplate.opsForZSet().remove(CREATED_INDEX_KEY, jobId);
            }
        } catch (Throwable ex) {
            log.debug("createdAt index removal failed for {}: {}", jobId, ex.toString());
        }
    }

    private static double epochMillisOf(String isoTimestamp) {
        try {
            return Instant.parse(isoTimestamp).toEpochMilli();
        } catch (Exception ex) {
            // An unparsable timestamp sorts oldest rather than failing the write.
            return 0.0d;
        }
    }

    private void indexRequestId(JobRecord record) {
        Map<String, Object> params = record == null ? null : record.getParameters();
        Object requestId = params == null ? null : params.get("requestId");
        if (requestId == null) {
            return;
        }
        String normalized = String.valueOf(requestId);
        if (normalized.isBlank()) {
            return;
        }
        try {
            if (redisTemplate != null) {
                redisTemplate.opsForSet().add(REQUEST_ID_INDEX_KEY, normalized);
                return;
            }
        } catch (Throwable ex) {
            log.debug("requestId index write failed for {}: {}", normalized, ex.toString());
        }
        inMemoryRequestIds.add(normalized);
    }

    private Set<String> inMemoryKeys(String pattern) {
        // emulate simple glob behavior where pattern like "job:*" matches keys starting with prefix
        if (pattern != null && pattern.endsWith("*")) {
            String prefix = pattern.substring(0, pattern.length()-1);
            return inMemoryStore.keySet().stream().filter(k -> k.startsWith(prefix)).collect(Collectors.toSet());
        }
        return inMemoryStore.keySet();
    }

    private Object getValue(String key) {
        Instant startedAt = Instant.now();
        try {
            if (redisTemplate != null) {
                Object value = redisTemplate.opsForValue().get(key);
                if (governanceRuntimeMetricsService != null) {
                    governanceRuntimeMetricsService.recordRedisRead(
                            "redis",
                            keyspaceOf(key),
                            value,
                            true,
                            Duration.between(startedAt, Instant.now())
                    );
                }
                return value;
            }
        } catch (Throwable ignored) {
            if (governanceRuntimeMetricsService != null) {
                governanceRuntimeMetricsService.recordRedisRead(
                        "redis",
                        keyspaceOf(key),
                        Map.of("key", key),
                        false,
                        Duration.between(startedAt, Instant.now())
                );
            }
        }
        Object value = inMemoryStore.get(key);
        if (governanceRuntimeMetricsService != null) {
            governanceRuntimeMetricsService.recordRedisRead(
                    "memory",
                    keyspaceOf(key),
                    value,
                    true,
                    Duration.between(startedAt, Instant.now())
            );
        }
        return value;
    }

    /**
     * Read-modify-write a job record so that a concurrent writer — the dispatch
     * scanner, an executor's scheduled transition, or another API call — cannot
     * silently discard the change. See {@link JobRecordMutator}; the mutator may
     * run more than once, so it must not carry side effects.
     */
    private Optional<JobRecord> mutateJobRecord(String key, java.util.function.Predicate<JobRecord> mutator) {
        return jobRecordMutator.mutate(redisTemplate, key, new JobRecordMutator.RecordAccess() {
            @Override
            public Object read(String k) {
                return getValue(k);
            }

            @Override
            public void write(String k, JobRecord record) {
                setValue(k, record);
            }
        }, mutator);
    }

    private void setValue(String key, Object value) {
        Instant startedAt = Instant.now();
        try {
            if (redisTemplate != null) {
                redisTemplate.opsForValue().set(key, value);
                if (governanceRuntimeMetricsService != null) {
                    governanceRuntimeMetricsService.recordRedisWrite(
                            "redis",
                            keyspaceOf(key),
                            value,
                            true,
                            Duration.between(startedAt, Instant.now())
                    );
                }
                return;
            }
        } catch (Throwable ignored) {
            if (governanceRuntimeMetricsService != null) {
                governanceRuntimeMetricsService.recordRedisWrite(
                        "redis",
                        keyspaceOf(key),
                        value,
                        false,
                        Duration.between(startedAt, Instant.now())
                );
            }
        }
        if (value == null) inMemoryStore.remove(key); else inMemoryStore.put(key, value);
        if (governanceRuntimeMetricsService != null) {
            governanceRuntimeMetricsService.recordRedisWrite(
                    "memory",
                    keyspaceOf(key),
                    value,
                    true,
                    Duration.between(startedAt, Instant.now())
            );
        }
    }

    private java.util.List<Object> listRange(String key, long start, long end) {
        Instant startedAt = Instant.now();
        try {
            if (redisTemplate != null) {
                java.util.List<Object> list = redisTemplate.opsForList().range(key, start, end);
                if (governanceRuntimeMetricsService != null) {
                    governanceRuntimeMetricsService.recordRedisRead(
                            "redis",
                            keyspaceOf(key),
                            list,
                            true,
                            Duration.between(startedAt, Instant.now())
                    );
                }
                return list == null ? List.of() : list;
            }
        } catch (Throwable ignored) {
            if (governanceRuntimeMetricsService != null) {
                governanceRuntimeMetricsService.recordRedisRead(
                        "redis",
                        keyspaceOf(key),
                        Map.of("key", key, "range", start + ":" + end),
                        false,
                        Duration.between(startedAt, Instant.now())
                );
            }
        }
        Object o = inMemoryStore.get(key);
        if (o instanceof List<?>) {
            if (governanceRuntimeMetricsService != null) {
                governanceRuntimeMetricsService.recordRedisRead(
                        "memory",
                        keyspaceOf(key),
                        o,
                        true,
                        Duration.between(startedAt, Instant.now())
                );
            }
            return objectList(o);
        }
        return List.of();
    }

    private String keyspaceOf(String key) {
        if (key == null || key.isBlank()) {
            return "unknown";
        }
        int idx = key.indexOf(':');
        return idx > 0 ? key.substring(0, idx) : key;
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
        recoveryExecutor.submit(() -> {
            // populate the listing index for jobs written before it existed
            backfillCreatedAtIndex();
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
            forEachKey(KEY_PREFIX + "*", k -> {
                Object o = getValue(k);
                JobRecord rec = marshaller.toJobRecord(o);
                if (rec == null) return true;
                if (rec.getState() == JobState.RUNNING) {
                    // only apply to simulator jobs (other executors may have proper persistence)
                    Map<String, Object> params = rec.getParameters();
                    String execName = params != null && params.containsKey("executor") ? String.valueOf(params.get("executor")) : "simulator";
                    if ("simulator".equals(execName)) {
                        log.warn("Completing stale running job {} after restart", rec.getJobId());
                        JobState previousState = rec.getState();
                        rec.setState(JobState.COMPLETED);
                        rec.setUpdatedAt(Instant.now().toString());
                        rec.setVersion(rec.getVersion() + 1);
                        setValue(k, rec);
                        recordTerminalMetrics(rec, previousState, JobState.COMPLETED);
                    }
                }
                return true;
            });
        } catch (Exception e) {
            log.error("Failed to complete stale running jobs", e);
        }
    }

    /* package-private for testing */
    void dispatchQueuedJobs() {
        try {
            // Streamed rather than collected: this runs every scannerIntervalSeconds
            // and must stay correct across the whole key space, so it cannot use the
            // capped keys() helper — but it also must not hold that key space in memory.
            forEachKey(KEY_PREFIX + "*", k -> {
                if (k == null || k.chars().filter(ch -> ch == ':').count() != 1) return true;
                scannedCount.incrementAndGet();
                try {
                    Object o = getValue(k);
                    JobRecord rec = marshaller.toJobRecord(o);
                    if (rec == null) return true;
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
                            return true;
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
                            if (governanceRuntimeMetricsService != null) {
                                governanceRuntimeMetricsService.recordJobDispatch(rec.getWorkflow(), executorName);
                                governanceRuntimeMetricsService.recordJobDispatchWait(
                                        rec.getWorkflow(),
                                        executorName,
                                        durationBetween(rec.getCreatedAt(), Instant.now())
                                );
                            }
                            exec.execute(rec, redisTemplate);
                        } else {
                            log.warn("No executor available for '{}' when dispatching job {}", executorName, rec.getJobId());
                        }
                    }
                } catch (Exception e) {
                    log.debug("Ignoring job key {} during dispatch scan: {}", k, e.toString());
                }
                return true;
            });
        } catch (Exception ex) {
            log.error("Queued job dispatch scan failed", ex);
        }
    }

    /**
     * Release queued sample jobs that were marked deferred by removing the deferred flag.
     * Returns number of jobs released.
     */
    /**
     * Report the size and shape of the job store.
     *
     * <p>Exists so operators can see accumulation without reaching for
     * {@code redis-cli}. Every number here had to be gathered by hand while
     * diagnosing a store that had grown to two million keys, which is the
     * argument for it being available through the platform instead.
     */
    public Map<String, Object> storeStats() {
        Map<String, Object> stats = new HashMap<>();
        long records = 0;
        long logs = 0;
        long artifacts = 0;
        long expiring = 0;
        // Streamed, never collected: the whole point is that this key space can
        // be large enough to exhaust the heap if materialised.
        for (String key : new String[]{"job:*"}) {
            var recordCount = new AtomicLong();
            var logCount = new AtomicLong();
            var artifactCount = new AtomicLong();
            var withTtl = new AtomicLong();
            forEachKey(key, k -> {
                if (k == null || k.startsWith(CREATED_INDEX_KEY) || k.startsWith(REQUEST_ID_INDEX_KEY)) return true;
                if (k.endsWith(":logs")) logCount.incrementAndGet();
                else if (k.endsWith(":artifacts")) artifactCount.incrementAndGet();
                else recordCount.incrementAndGet();
                try {
                    if (redisTemplate != null) {
                        Long ttl = redisTemplate.getExpire(k);
                        if (ttl != null && ttl > 0) withTtl.incrementAndGet();
                    }
                } catch (Throwable ignored) {}
                return true;
            });
            records = recordCount.get();
            logs = logCount.get();
            artifacts = artifactCount.get();
            expiring = withTtl.get();
        }
        stats.put("jobRecords", records);
        stats.put("logKeys", logs);
        stats.put("artifactKeys", artifacts);
        stats.put("keysWithRetention", expiring);
        stats.put("indexedJobs", indexedJobCount());
        return stats;
    }

    private long indexedJobCount() {
        try {
            if (redisTemplate != null) {
                Long size = redisTemplate.opsForZSet().zCard(CREATED_INDEX_KEY);
                return size == null ? 0L : size;
            }
        } catch (Throwable ignored) {}
        return 0L;
    }

    /**
     * Remove accumulated job records, keeping the {@code keepRecent} newest.
     *
     * <p>Server-side rather than a shell script against {@code redis-cli}: the
     * store holds job, provenance and audit records, so a destructive sweep
     * over it belongs behind the same API and audit trail as every other
     * mutation.
     *
     * <p>Uses the streaming key walk rather than collecting the key space, and
     * unlinks in batches so large deletes are freed off the event loop. The
     * createdAt index is trimmed alongside the records: an index entry pointing
     * at a missing record consumes a slot in every listing window and returns
     * nothing for it, so pruning records without it degrades listings rather
     * than repairing them.
     *
     * @param dryRun when true, count what would be removed and delete nothing
     */
    public Map<String, Object> purgeJobs(int keepRecent, boolean dryRun) {
        int keep = Math.max(0, keepRecent);
        Set<Object> keepIds = keep > 0 ? retainedIds(keep) : Set.of();

        var scanned = new AtomicLong();
        var removable = new AtomicLong();
        List<String> batch = new ArrayList<>();
        var removed = new AtomicLong();

        forEachKey(KEY_PREFIX + "*", k -> {
            if (k == null) return true;
            // The indexes are handled explicitly below; never sweep them here.
            if (k.startsWith(CREATED_INDEX_KEY) || k.startsWith(REQUEST_ID_INDEX_KEY)) return true;
            scanned.incrementAndGet();
            String jobId = jobIdOf(k);
            if (jobId != null && keepIds.contains(jobId)) return true;
            removable.incrementAndGet();
            if (dryRun) return true;
            batch.add(k);
            if (batch.size() >= 500) {
                removed.addAndGet(unlinkAll(batch));
                batch.clear();
            }
            return true;
        });
        if (!dryRun && !batch.isEmpty()) {
            removed.addAndGet(unlinkAll(batch));
            batch.clear();
        }

        if (!dryRun) {
            trimCreatedIndex(keep);
            recordAudit("job store purged: removed " + removed.get() + " keys, kept newest " + keep);
        }

        Map<String, Object> result = new HashMap<>();
        result.put("dryRun", dryRun);
        result.put("keepRecent", keep);
        result.put("scannedKeys", scanned.get());
        result.put("removableKeys", removable.get());
        result.put("removedKeys", removed.get());
        return result;
    }

    private Set<Object> retainedIds(int keep) {
        try {
            if (redisTemplate != null) {
                Set<Object> ids = redisTemplate.opsForZSet().reverseRange(CREATED_INDEX_KEY, 0, keep - 1L);
                return ids == null ? Set.of() : ids;
            }
        } catch (Throwable ex) {
            log.debug("Could not read retained ids: {}", ex.toString());
        }
        return Set.of();
    }

    /** Job id for {@code job:<id>}, {@code job:<id>:logs} and {@code job:<id>:artifacts}. */
    private static String jobIdOf(String key) {
        if (key == null || !key.startsWith(KEY_PREFIX)) return null;
        String rest = key.substring(KEY_PREFIX.length());
        int colon = rest.indexOf(':');
        return colon > 0 ? rest.substring(0, colon) : rest;
    }

    private long unlinkAll(List<String> keys) {
        if (keys.isEmpty()) return 0L;
        try {
            if (redisTemplate != null) {
                Long n = redisTemplate.unlink(keys);
                return n == null ? 0L : n;
            }
            long n = 0;
            for (String k : keys) {
                if (inMemoryStore.remove(k) != null) n++;
            }
            return n;
        } catch (Throwable ex) {
            log.warn("Batch unlink failed: {}", ex.toString());
            return 0L;
        }
    }

    private void trimCreatedIndex(int keep) {
        try {
            if (redisTemplate == null) return;
            if (keep <= 0) {
                redisTemplate.unlink(CREATED_INDEX_KEY);
                // Leaving the backfill marker set would tell a restarted service
                // the index is already built, so a rebuilt index would stay empty.
                redisTemplate.unlink(INDEX_BACKFILL_DONE);
                return;
            }
            redisTemplate.opsForZSet().removeRange(CREATED_INDEX_KEY, 0, -keep - 1L);
        } catch (Throwable ex) {
            log.warn("createdAt index trim failed: {}", ex.toString());
        }
    }

    public int releaseDeferredJobs() {
        var releasedCount = new java.util.concurrent.atomic.AtomicInteger();
        try {
            forEachKey(KEY_PREFIX + "*", k -> {
                if (k == null || k.chars().filter(ch -> ch == ':').count() != 1) return true;
                try {
                    Object o = getValue(k);
                    JobRecord rec = marshaller.toJobRecord(o);
                    if (rec == null) return true;
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
                                releasedCount.incrementAndGet();
                            }
                        }
                    }
                } catch (Exception ignored) {}
                return true;
            });
        } catch (Exception ex) {
            log.error("Failed to release deferred jobs", ex);
        }
        int released = releasedCount.get();
        if (governanceRuntimeMetricsService != null) {
            governanceRuntimeMetricsService.recordDeferredRelease(released);
        }
        return released;
    }

    @PreDestroy
    public void shutdownScanner() {
        try {
            recoveryExecutor.shutdownNow();
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
        indexCreatedAt(record);
        indexRequestId(record);
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
        if (governanceRuntimeMetricsService != null) {
            governanceRuntimeMetricsService.recordJobSubmitted(request.workflow());
            if (manifest != null) {
                governanceRuntimeMetricsService.recordJobMetadataMutation("submit_manifest", manifest);
            }
            if (request.lineage() != null) {
                governanceRuntimeMetricsService.recordJobMetadataMutation("submit_lineage", request.lineage());
            }
        }

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
            if (governanceRuntimeMetricsService != null) {
                governanceRuntimeMetricsService.recordJobDispatch(record.getWorkflow(), executorName);
                governanceRuntimeMetricsService.recordJobDispatchWait(
                        record.getWorkflow(),
                        executorName,
                        durationBetween(record.getCreatedAt(), Instant.now())
                );
            }
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
        if (rec != null) {
            if (governanceRuntimeMetricsService != null) {
                governanceRuntimeMetricsService.recordOperatorRead("job_status", rec);
            }
            return Optional.of(toResponse(rec));
        }
        return Optional.empty();
    }

    public List<String> getLogs(String jobId) {
        String key = KEY_PREFIX + jobId + ":logs";
        try {
            var list = listRange(key, 0, -1);
            if (list == null) return List.of();
            var logs = list.stream().map(Object::toString).collect(Collectors.toList());
            if (governanceRuntimeMetricsService != null) {
                governanceRuntimeMetricsService.recordOperatorRead("job_logs", logs);
            }
            return logs;
        } catch (org.springframework.data.redis.serializer.SerializationException ex) {
            // fallback: read raw bytes from Redis connection and decode as UTF-8 strings
            try {
                Object o = getValue(key);
                if (o instanceof List) {
                    var logs = ((List<?>) o).stream().map(Object::toString).collect(Collectors.toList());
                    if (governanceRuntimeMetricsService != null) {
                        governanceRuntimeMetricsService.recordOperatorRead("job_logs", logs);
                    }
                    return logs;
                }
            } catch (Exception ignored) {}
        }
        return List.of();
    }

    // manifest helpers ---------------------------------------------
    public Optional<Map<String, Object>> getManifest(String jobId) {
        Optional<JobStatusResponse> status = get(jobId);
        Optional<Map<String, Object>> result = status.map(JobStatusResponse::manifest);
        result.ifPresent(manifest -> {
            if (governanceRuntimeMetricsService != null) {
                governanceRuntimeMetricsService.recordOperatorRead("job_manifest", manifest);
                governanceRuntimeMetricsService.recordBusinessAction("manifest", "read", manifest);
            }
        });
        return result;
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
        if (params != null && params.get("lineage") instanceof Map<?, ?> lineageMap) {
            Map<String, Object> lineage = objectMap(lineageMap);
            if (governanceRuntimeMetricsService != null) {
                governanceRuntimeMetricsService.recordOperatorRead("job_lineage", lineage);
            }
            return Optional.of(lineage);
        }
        return Optional.empty();
    }

    /**
     * Update lineage metadata for a job. This updates the lineage field in the
     * job parameters and increments the version.
     */
    public boolean updateLineage(String jobId, Map<String, Object> lineage) {
        // Compare-and-set: an executor transition running concurrently would
        // otherwise write back its pre-lineage copy of the record, dropping this
        // update after the caller had already been told it succeeded.
        boolean updated = mutateJobRecord(KEY_PREFIX + jobId, rec -> {
            Map<String, Object> params = rec.getParameters() == null
                    ? new HashMap<>()
                    : new HashMap<>(rec.getParameters());
            params.put("lineage", new HashMap<>(lineage == null ? Map.of() : lineage));
            rec.setParameters(params);
            rec.setUpdatedAt(Instant.now().toString());
            rec.setVersion(rec.getVersion() + 1);
            return true;
        }).isPresent();
        if (!updated) return false;
        // Record audit entry for lineage update
        recordAudit("job:" + jobId + " lineage updated to " + String.valueOf(lineage));
        if (governanceRuntimeMetricsService != null) {
            governanceRuntimeMetricsService.recordJobMetadataMutation("lineage_update", lineage);
        }
        return true;
    }

    public boolean attachManifest(String jobId, Map<String, Object> manifest) {
        boolean attached = mutateJobRecord(KEY_PREFIX + jobId, rec -> {
            rec.setManifest(manifest);
            rec.setUpdatedAt(Instant.now().toString());
            rec.setVersion(rec.getVersion() + 1);
            return true;
        }).isPresent();
        if (!attached) return false;
        recordAudit("manifest attached " + jobId + " " + manifest.toString());
        if (governanceRuntimeMetricsService != null) {
            governanceRuntimeMetricsService.recordJobMetadataMutation("manifest_attach", manifest);
            governanceRuntimeMetricsService.recordBusinessAction("manifest", "publish", manifest);
        }
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
                List<Object> list;
                if (o instanceof List<?>) {
                    list = new ArrayList<>(objectList(o));
                } else {
                    list = new ArrayList<>();
                }
                list.add(artifact);
                inMemoryStore.put(key, list);
            }
            recordAudit("artifact attached " + jobId + " " + artifact.toString());
            if (governanceRuntimeMetricsService != null) {
                String workflow = get(jobId).map(JobStatusResponse::workflow).orElse("unknown");
                String artifactName = artifact == null ? "unknown" : String.valueOf(artifact.getOrDefault("name", artifact.getOrDefault("type", "unknown")));
                governanceRuntimeMetricsService.recordArtifactAttached(workflow, artifactName, artifact);
            }
            return true;
        } catch (Exception ex) {
            log.error("Failed to attach artifact for job {}: {}", jobId, ex.toString());
            return false;
        }
    }

    public List<Map<String, String>> getArtifacts(String jobId) {
        String key = KEY_PREFIX + jobId + ":artifacts";
        Instant startedAt = Instant.now();
        try {
            if (redisTemplate != null) {
                java.util.List<Object> items = redisTemplate.opsForList().range(key, 0, -1);
                if (items == null || items.isEmpty()) {
                    recordArtifactRead("metadata_list", List.of(), true, Duration.between(startedAt, Instant.now()));
                    return List.of();
                }
                var artifacts = items.stream().map(it -> {
                    try {
                        return stringMap(it);
                    } catch (Exception ex) {
                        return java.util.Collections.<String, String>emptyMap();
                    }
                }).collect(Collectors.toList());
                if (governanceRuntimeMetricsService != null) {
                    governanceRuntimeMetricsService.recordOperatorRead("job_artifacts", artifacts);
                }
                recordArtifactRead("metadata_list", artifacts, true, Duration.between(startedAt, Instant.now()));
                return artifacts;
            } else {
                Object o = inMemoryStore.get(key);
                if (o instanceof List<?>) {
                    var artifacts = objectList(o).stream()
                            .map(this::stringMap)
                            .collect(Collectors.toList());
                    if (governanceRuntimeMetricsService != null) {
                        governanceRuntimeMetricsService.recordOperatorRead("job_artifacts", artifacts);
                    }
                    recordArtifactRead("metadata_list", artifacts, true, Duration.between(startedAt, Instant.now()));
                    return artifacts;
                }
                recordArtifactRead("metadata_list", List.of(), true, Duration.between(startedAt, Instant.now()));
                return List.of();
            }
        } catch (Exception ex) {
            log.debug("Failed to read artifacts for {}: {}", jobId, ex.toString());
            recordArtifactRead("metadata_list", Map.of("jobId", jobId), false, Duration.between(startedAt, Instant.now()));
            return List.of();
        }
    }

    public List<JobStatusResponse> listAll() {
        return list(null, null, 0, Integer.MAX_VALUE);
    }

    public void recordArtifactDelivery(String artifactKind, Object payload, boolean success, Duration duration) {
        recordArtifactRead(artifactKind, payload, success, duration);
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
        Optional<JobRecord> retried = mutateJobRecord(key, rec -> {
            if (expectedVersion != null && rec.getVersion() != expectedVersion) {
                return false;
            }
            if (rec.getState() != JobState.FAILED && rec.getState() != JobState.CANCELED && rec.getState() != JobState.TIMED_OUT) {
                log.warn("Cannot retry job {} from state {}", jobId, rec.getState());
                return false;
            }
            rec.setState(JobState.QUEUED);
            rec.setUpdatedAt(Instant.now().toString());
            rec.setVersion(rec.getVersion() + 1);
            return true;
        });
        if (retried.isEmpty()) return Optional.empty();
        log.info("Audit: job {} retried (version now {})", jobId, retried.get().getVersion());
        return Optional.of(toResponse(retried.get()));
    }
    public List<JobStatusResponse> list(String workflowFilter, JobState stateFilter, int page, int size) {
        // Prefer the createdAt index: it yields newest-first ids a window at a time,
        // so a listing reads only the rows it returns. Jobs older than the walk
        // limit age out of the UI; their records remain in the store for cold
        // retrieval. When the index is unavailable or not yet backfilled we fall
        // back to scanning, which stays correct but costs a full sweep.
        List<JobRecord> matches = listFromIndex(workflowFilter, stateFilter);
        if (matches == null) {
            matches = listByScan(workflowFilter, stateFilter);
        }
        if (matches.isEmpty()) return List.of();
        if (matches.size() >= MAX_LISTED_RECORDS) {
            log.warn("Job list truncated at {} matches; narrow the filter or prune job history", MAX_LISTED_RECORDS);
        }
        var jobs = matches.stream()
                // newest first: the index is walked in that order, and it is what the
                // UI wants when history is far longer than any page.
                .sorted((a, b) -> b.getCreatedAt().compareTo(a.getCreatedAt()))
                .skip((long) page * size)
                .limit(size <= 0 ? Integer.MAX_VALUE : size)
                .map(this::toResponse)
                .collect(Collectors.toList());
        if (governanceRuntimeMetricsService != null) {
            governanceRuntimeMetricsService.recordOperatorRead("job_list", jobs);
        }
        return jobs;
    }

    private boolean matchesFilters(JobRecord rec, String workflowFilter, JobState stateFilter) {
        if (rec == null) return false;
        if (workflowFilter != null && !workflowFilter.isBlank()) {
            if (rec.getWorkflow() == null || !rec.getWorkflow().equalsIgnoreCase(workflowFilter)) return false;
        }
        return stateFilter == null || rec.getState() == stateFilter;
    }

    /**
     * Walk the createdAt index newest-first, gathering matching records.
     *
     * Returns null when the index yields nothing on its first window, which means
     * it is unavailable or has not been backfilled; the caller then scans instead.
     * That distinction matters -- an empty index and a genuinely empty result look
     * identical otherwise, and confusing them would silently report zero jobs.
     */
    private List<JobRecord> listFromIndex(String workflowFilter, JobState stateFilter) {
        List<JobRecord> matches = new ArrayList<>();
        long cursor = 0;
        boolean sawAnyId = false;

        while (cursor < MAX_INDEX_WALK && matches.size() < MAX_LISTED_RECORDS) {
            List<String> ids = pagedJobIdsNewestFirst(cursor, cursor + INDEX_WINDOW - 1);
            if (ids.isEmpty()) break;
            sawAnyId = true;
            for (String jobId : ids) {
                JobRecord rec = marshaller.toJobRecord(getValue(KEY_PREFIX + jobId));
                if (matchesFilters(rec, workflowFilter, stateFilter)) {
                    matches.add(rec);
                    if (matches.size() >= MAX_LISTED_RECORDS) break;
                }
            }
            cursor += INDEX_WINDOW;
        }

        return sawAnyId ? matches : null;
    }

    /**
     * Fallback listing for stores without a populated index.
     *
     * Records are streamed and filtered one at a time, and only matches are
     * retained. Capping candidates instead would silently break filtered queries,
     * because SCAN returns keys in arbitrary order and a matching job may sit
     * anywhere in the key space.
     */
    private List<JobRecord> listByScan(String workflowFilter, JobState stateFilter) {
        List<JobRecord> matches = new ArrayList<>();
        forEachKey(KEY_PREFIX + "*", key -> {
            // skip auxiliary keys (logs, artifacts, etc.) which use suffixes like ":logs" or ":artifacts"
            if (key == null || key.chars().filter(ch -> ch == ':').count() != 1) return true;
            JobRecord rec = marshaller.toJobRecord(getValue(key));
            if (!matchesFilters(rec, workflowFilter, stateFilter)) return true;
            matches.add(rec);
            return matches.size() < MAX_LISTED_RECORDS;
        });
        return matches;
    }

    public List<String> getAuditEntriesForJob(String jobId) {
        var logs = getAuditLog().stream()
                .filter(e -> e.contains(jobId))
                .toList();
        if (governanceRuntimeMetricsService != null) {
            governanceRuntimeMetricsService.recordOperatorRead("job_audit", logs);
        }
        return logs;
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

    SchedulerSnapshot schedulerSnapshot() {
        // Counters live in arrays so the streaming visitor can mutate them; a lambda
        // cannot assign to captured locals.
        final int QUEUED = 0, RUNNING = 1, DEFERRED = 2, BLOCKED = 3, SAMPLES = 4;
        int[] counts = new int[5];
        double[] queueAge = new double[2]; // [0] total, [1] max

        Instant now = Instant.now();
        forEachKey(KEY_PREFIX + "*", key -> {
            if (key == null || key.chars().filter(ch -> ch == ':').count() != 1) {
                return true;
            }
            try {
                Object value = getValue(key);
                JobRecord rec = marshaller.toJobRecord(value);
                if (rec == null) {
                    return true;
                }
                Map<String, Object> params = rec.getParameters() == null ? Map.of() : rec.getParameters();
                boolean isDeferred = isDeferred(params);

                if (rec.getState() == JobState.RUNNING) {
                    counts[RUNNING]++;
                    return true;
                }
                if (rec.getState() != JobState.QUEUED) {
                    return true;
                }

                counts[QUEUED]++;
                double queueAgeMs = durationBetween(rec.getCreatedAt(), now).toMillis();
                queueAge[0] += queueAgeMs;
                queueAge[1] = Math.max(queueAge[1], queueAgeMs);
                counts[SAMPLES]++;

                if (isDeferred) {
                    counts[DEFERRED]++;
                    return true;
                }

                String executorName = executorNameFor(rec);
                if (!executorMap.containsKey(executorName) || executorMap.get(executorName) == null) {
                    counts[BLOCKED]++;
                }
            } catch (Exception ex) {
                log.debug("Ignoring job {} during scheduler snapshot: {}", key, ex.toString());
            }
            return true;
        });

        double avgQueueAgeMs = counts[SAMPLES] == 0 ? 0.0d : queueAge[0] / counts[SAMPLES];
        return new SchedulerSnapshot(counts[QUEUED], counts[RUNNING], counts[DEFERRED], counts[BLOCKED],
                avgQueueAgeMs, queueAge[1], scannerIntervalSeconds);
    }

    public Optional<JobStatusResponse> transition(String jobId, JobState newState, Long expectedVersion) {
        String key = KEY_PREFIX + jobId;
        // The observed "from" state has to come back out of the mutation: on a
        // contended key the mutator re-runs against a fresher record, so a state
        // read before the call could describe a record that never got written.
        AtomicReference<JobState> observedFrom = new AtomicReference<>();
        AtomicLong mismatchedVersion = new AtomicLong(-1);
        Optional<JobRecord> transitioned = mutateJobRecord(key, rec -> {
            if (expectedVersion != null && rec.getVersion() != expectedVersion) {
                mismatchedVersion.set(rec.getVersion());
                return false;
            }
            JobState from = rec.getState();
            if (!isValidTransition(from, newState)) {
                log.warn("Invalid state transition attempted for {}: {} -> {}", jobId, from, newState);
                return false;
            }
            observedFrom.set(from);
            rec.setState(newState);
            rec.setUpdatedAt(Instant.now().toString());
            rec.setVersion(rec.getVersion() + 1);
            return true;
        });
        if (mismatchedVersion.get() >= 0) {
            throw new IllegalStateException("version_mismatch:" + mismatchedVersion.get());
        }
        if (transitioned.isEmpty()) return Optional.empty();
        JobRecord rec = transitioned.get();
        JobState current = observedFrom.get();
        recordAudit("job " + jobId + " transitioning " + current + " -> " + newState);
        if (governanceRuntimeMetricsService != null) {
            governanceRuntimeMetricsService.recordJobTransition(rec.getWorkflow(), current.toString(), newState.toString());
        }
        recordTerminalMetrics(rec, current, newState);

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
        // Drop the index entry first: an index pointing at a missing record would
        // consume slots in every listing window and return nothing for them.
        unindexCreatedAt(jobId);
        try {
            if (redisTemplate != null) {
                Boolean removed = redisTemplate.delete(key);
                if (governanceRuntimeMetricsService != null && Boolean.TRUE.equals(removed)) {
                    governanceRuntimeMetricsService.recordRedisWrite("redis", keyspaceOf(key), Map.of("deleted", key));
                }
                return removed != null && removed;
            }
        } catch (Throwable ignored) {}
        Object removed = inMemoryStore.remove(key);
        if (governanceRuntimeMetricsService != null && removed != null) {
            governanceRuntimeMetricsService.recordRedisWrite("memory", keyspaceOf(key), Map.of("deleted", key));
        }
        return removed != null;
    }

    private boolean isValidTransition(JobState from, JobState to) {
        if (from == to) return true;
        return switch (from) {
            case QUEUED -> to == JobState.RUNNING || to == JobState.CANCELED || to == JobState.TIMED_OUT || to == JobState.FAILED;
            case RUNNING -> to == JobState.COMPLETED || to == JobState.FAILED || to == JobState.CANCELED || to == JobState.TIMED_OUT;
            case COMPLETED, FAILED, CANCELED, TIMED_OUT -> false;
        };
    }

    private void recordTerminalMetrics(JobRecord rec, JobState fromState, JobState toState) {
        if (governanceRuntimeMetricsService == null || rec == null || fromState == toState || !isTerminalState(toState)) {
            return;
        }
        try {
            Instant createdAt = Instant.parse(rec.getCreatedAt());
            Instant finishedAt = Instant.parse(rec.getUpdatedAt());
            governanceRuntimeMetricsService.recordJobTerminalState(
                    rec.getWorkflow(),
                    executorOf(rec),
                    toState.name(),
                    Duration.between(createdAt, finishedAt)
            );
        } catch (Exception ex) {
            log.debug("Unable to record terminal runtime for job {}: {}", rec.getJobId(), ex.toString());
        }
    }

    private Duration durationBetween(String startedAt, Instant finishedAt) {
        try {
            return Duration.between(Instant.parse(startedAt), finishedAt);
        } catch (Exception ex) {
            return Duration.ZERO;
        }
    }

    private boolean isDeferred(Map<String, Object> params) {
        if (params == null || !params.containsKey("deferred")) {
            return false;
        }
        Object deferred = params.get("deferred");
        if (deferred instanceof Boolean value) {
            return value;
        }
        return "true".equalsIgnoreCase(String.valueOf(deferred));
    }

    private String executorNameFor(JobRecord rec) {
        if (rec == null) {
            return "simulator";
        }
        Map<String, Object> params = rec.getParameters() == null ? Map.of() : rec.getParameters();
        if (params.containsKey("executor")) {
            return String.valueOf(params.get("executor"));
        }
        if (rec.getWorkflow() != null && rec.getWorkflow().equalsIgnoreCase("ingest")) {
            return "tacc";
        }
        if (rec.getWorkflow() != null && rec.getWorkflow().startsWith("vo.")) {
            return "vo";
        }
        return "simulator";
    }

    private boolean isTerminalState(JobState state) {
        return state == JobState.COMPLETED
                || state == JobState.FAILED
                || state == JobState.CANCELED
                || state == JobState.TIMED_OUT;
    }

    private String executorOf(JobRecord rec) {
        if (rec == null || rec.getParameters() == null) {
            return "unknown";
        }
        Object executor = rec.getParameters().get("executor");
        return executor == null ? "unknown" : String.valueOf(executor);
    }

    private void recordArtifactRead(String artifactKind, Object payload, boolean success, Duration duration) {
        if (governanceRuntimeMetricsService != null) {
            governanceRuntimeMetricsService.recordArtifactRead(artifactKind, payload, success, duration);
        }
    }

    private JobStatusResponse toResponse(JobRecord record) {
        // extract any lineage object from parameters
        Map<String,Object> lineage = null;
        if (record.getParameters() != null && record.getParameters().get("lineage") instanceof Map<?, ?> lineageMap) {
            lineage = objectMap(lineageMap);
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

    private List<Object> objectList(Object value) {
        if (value instanceof List<?> list) {
            return new ArrayList<>(list);
        }
        return List.of();
    }

    private Map<String, Object> objectMap(Map<?, ?> value) {
        Map<String, Object> out = new HashMap<>();
        value.forEach((key, item) -> {
            if (key != null) {
                out.put(String.valueOf(key), item);
            }
        });
        return out;
    }

    private Map<String, String> stringMap(Object value) {
        if (value instanceof Map<?, ?> map) {
            Map<String, String> out = new HashMap<>();
            map.forEach((key, item) -> {
                if (key != null && item != null) {
                    out.put(String.valueOf(key), String.valueOf(item));
                }
            });
            return out;
        }
        return objectMapper.convertValue(value, new TypeReference<Map<String, String>>() {});
    }

    record SchedulerSnapshot(
            int queuedJobs,
            int runningJobs,
            int deferredJobs,
            int blockedJobs,
            double avgQueueAgeMs,
            double maxQueueAgeMs,
            int scannerIntervalSeconds
    ) {}
}
