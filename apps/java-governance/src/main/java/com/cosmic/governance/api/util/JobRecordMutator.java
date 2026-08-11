package com.cosmic.governance.api.util;

import com.cosmic.governance.api.model.JobRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.RedisOperations;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.SessionCallback;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.Lock;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Predicate;

/**
 * Applies a mutation to a stored {@link JobRecord} without losing a concurrent
 * writer's changes.
 *
 * <p>Job records are mutated from several directions at once: the HTTP API
 * (lineage, manifest, transition, retry), the dispatch scanner, and the
 * executors' scheduled state transitions. Each of those used to run its own
 * read, mutate and write as three separate steps, so two writers that
 * interleaved would silently drop one set of changes — the API had already
 * answered {@code 200} for a write that a concurrent executor then overwrote.
 *
 * <p>On Redis the mutation runs inside {@code WATCH}/{@code MULTI}: the write
 * only commits if the key has not changed since it was read, and a losing
 * attempt is retried against the fresh record. Without a Redis template
 * (in-memory fallback) the same guarantee is provided by a per-key lock, which
 * holds because that store is process-local by construction.
 *
 * <p>The mutator function may be invoked more than once for a single call, so
 * it must only touch the record it is handed. Audit entries, metrics and events
 * belong after a successful mutation, not inside it.
 *
 * <p>Constructed directly by its callers rather than injected, so that the
 * existing {@code JobService} and executor constructors — which several tests
 * call by hand — keep their signatures. The lock map is therefore static: two
 * instances must still exclude each other on the same key.
 */
public class JobRecordMutator {

    private static final Logger log = LoggerFactory.getLogger(JobRecordMutator.class);

    /** Bounded so a permanently hot key fails loudly instead of spinning. */
    private static final int MAX_ATTEMPTS = 8;

    private static final Map<String, Lock> KEY_LOCKS = new ConcurrentHashMap<>();

    private final RedisMarshaller marshaller;

    public JobRecordMutator(RedisMarshaller marshaller) {
        this.marshaller = marshaller;
    }

    /** How a caller reads and writes a record when Redis is not in play. */
    public interface RecordAccess {
        Object read(String key);

        void write(String key, JobRecord record);
    }

    /**
     * Read the record at {@code key}, apply {@code mutator}, and store the result
     * atomically with respect to other writers going through this class.
     *
     * @param mutator returns {@code false} to abandon the mutation, leaving the
     *                stored record untouched
     * @return the committed record, or empty if it was missing or the mutator
     *         declined
     */
    public Optional<JobRecord> mutate(
            RedisTemplate<String, Object> redisTemplate,
            String key,
            RecordAccess access,
            Predicate<JobRecord> mutator) {
        if (redisTemplate != null) {
            Attempt attempt = mutateWithWatch(redisTemplate, key, mutator);
            // "Missing" and "declined" are real answers about the stored record,
            // so they are returned as-is. Only an unusable Redis falls through to
            // the local store, matching how the rest of the service degrades.
            if (!attempt.redisUnavailable) return Optional.ofNullable(attempt.record);
        }
        if (access == null) return Optional.empty();
        return mutateUnderLock(key, access, mutator);
    }

    private Attempt mutateWithWatch(
            RedisTemplate<String, Object> redisTemplate, String key, Predicate<JobRecord> mutator) {
        for (int attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            Outcome outcome = new Outcome();
            try {
                @SuppressWarnings({"unchecked", "rawtypes"})
                List<Object> execResult = redisTemplate.execute(new SessionCallback<List<Object>>() {
                    @Override
                    public List<Object> execute(RedisOperations operations) {
                        operations.watch(key);
                        JobRecord record = marshaller.toJobRecord(operations.opsForValue().get(key));
                        if (record == null) {
                            operations.unwatch();
                            outcome.missing = true;
                            return null;
                        }
                        if (!mutator.test(record)) {
                            operations.unwatch();
                            outcome.declined = true;
                            return null;
                        }
                        outcome.record = record;
                        operations.multi();
                        operations.opsForValue().set(key, record);
                        return operations.exec();
                    }
                });
                if (outcome.missing || outcome.declined) return Attempt.answered(null);
                // exec() yields null or an empty list when WATCH saw a competing
                // write; both mean "retry against the record as it now stands".
                if (execResult != null && !execResult.isEmpty()) {
                    return Attempt.answered(outcome.record);
                }
                log.debug("Contended write on {}, retrying (attempt {}/{})", key, attempt, MAX_ATTEMPTS);
            } catch (RuntimeException ex) {
                log.debug("Compare-and-set on {} could not use Redis: {}", key, ex.toString());
                return Attempt.unavailable();
            }
        }
        log.warn("Gave up mutating {} after {} contended attempts", key, MAX_ATTEMPTS);
        return Attempt.answered(null);
    }

    private Optional<JobRecord> mutateUnderLock(String key, RecordAccess access, Predicate<JobRecord> mutator) {
        Lock lock = KEY_LOCKS.computeIfAbsent(key, k -> new ReentrantLock());
        lock.lock();
        try {
            JobRecord record = marshaller.toJobRecord(access.read(key));
            if (record == null) return Optional.empty();
            if (!mutator.test(record)) return Optional.empty();
            access.write(key, record);
            return Optional.of(record);
        } finally {
            lock.unlock();
        }
    }

    /** Carries the in-session result out of the callback. */
    private static final class Outcome {
        private JobRecord record;
        private boolean missing;
        private boolean declined;
    }

    /**
     * Separates "Redis answered, and this is the answer" from "Redis could not
     * answer", so only the latter falls back to the local store.
     */
    private static final class Attempt {
        private final JobRecord record;
        private final boolean redisUnavailable;

        private Attempt(JobRecord record, boolean redisUnavailable) {
            this.record = record;
            this.redisUnavailable = redisUnavailable;
        }

        private static Attempt answered(JobRecord record) {
            return new Attempt(record, false);
        }

        private static Attempt unavailable() {
            return new Attempt(null, true);
        }
    }
}
