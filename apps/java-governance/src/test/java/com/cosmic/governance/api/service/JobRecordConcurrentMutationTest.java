package com.cosmic.governance.api.service;

import com.cosmic.governance.api.dto.JobStatusResponse;
import com.cosmic.governance.api.dto.JobSubmitRequest;
import com.cosmic.governance.api.model.JobRecord;
import com.cosmic.governance.api.util.JobRecordMutator;
import com.cosmic.governance.api.util.RedisMarshaller;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Guards against the lost update that made
 * {@code JobLifecycleEdgeCaseTest.lineageUpdateAndRetrieveRoundTrip} fail
 * intermittently: a lineage write returned {@code 200}, then a concurrent
 * executor transition wrote back its pre-lineage copy of the record and the
 * subsequent read answered 404.
 *
 * <p>These drive contention directly rather than waiting for the scheduler to
 * produce it, so a regression fails every run instead of one in a handful.
 */
class JobRecordConcurrentMutationTest {

    private RedisMarshaller marshaller;
    private JobService service;

    @BeforeEach
    void setup() {
        marshaller = new RedisMarshaller(new ObjectMapper());
        AuditService auditService = Mockito.mock(AuditService.class);
        service = new JobService(null, new ObjectMapper(), null, marshaller, auditService);
    }

    /**
     * Concurrent read-modify-write cycles must all land. A plain
     * read-then-write loses whichever writer is overtaken, so the tally comes up
     * short; going through the mutator it cannot.
     */
    @Test
    void concurrentMutationsAreNotLost() throws Exception {
        JobRecordMutator mutator = new JobRecordMutator(marshaller);
        Map<String, Object> store = new ConcurrentHashMap<>();
        String key = "job:concurrent-tally";

        JobRecord seed = new JobRecord();
        seed.setJobId("concurrent-tally");
        seed.setParameters(new HashMap<>(Map.of("tally", 0)));
        store.put(key, seed);

        JobRecordMutator.RecordAccess access = new JobRecordMutator.RecordAccess() {
            @Override
            public Object read(String k) {
                return store.get(k);
            }

            @Override
            public void write(String k, JobRecord record) {
                store.put(k, record);
            }
        };

        int threads = 8;
        int perThread = 50;
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CountDownLatch startTogether = new CountDownLatch(1);
        try {
            for (int t = 0; t < threads; t++) {
                pool.submit(() -> {
                    startTogether.await();
                    for (int i = 0; i < perThread; i++) {
                        mutator.mutate(null, key, access, rec -> {
                            Map<String, Object> params = new HashMap<>(rec.getParameters());
                            params.put("tally", ((Number) params.get("tally")).intValue() + 1);
                            rec.setParameters(params);
                            return true;
                        });
                    }
                    return null;
                });
            }
            startTogether.countDown();
            pool.shutdown();
            assertThat(pool.awaitTermination(30, TimeUnit.SECONDS)).isTrue();
        } finally {
            pool.shutdownNow();
        }

        JobRecord finalRecord = marshaller.toJobRecord(store.get(key));
        assertThat(((Number) finalRecord.getParameters().get("tally")).intValue())
                .isEqualTo(threads * perThread);
    }

    /**
     * The original failure, in miniature: a lineage write racing repeated state
     * writes on the same record. The lineage must never disappear once
     * {@code updateLineage} has reported success.
     */
    @Test
    void lineageSurvivesConcurrentRecordWrites() throws Exception {
        for (int round = 0; round < 25; round++) {
            JobSubmitRequest request = new JobSubmitRequest(
                    "test-workflow", "ds-race", null, null, null, "test-user");
            String jobId = service.submit(request).jobId();

            CountDownLatch startTogether = new CountDownLatch(1);
            ExecutorService pool = Executors.newFixedThreadPool(2);
            try {
                pool.submit(() -> {
                    startTogether.await();
                    return service.updateLineage(jobId, Map.of("parentJobId", "parent-abc", "ancestorCount", 2));
                });
                pool.submit(() -> {
                    startTogether.await();
                    // Stands in for the executor's scheduled transition: another
                    // writer touching the same record at the same moment.
                    return service.attachManifest(jobId, Map.of("attempt", "concurrent"));
                });
                startTogether.countDown();
                pool.shutdown();
                assertThat(pool.awaitTermination(30, TimeUnit.SECONDS)).isTrue();
            } finally {
                pool.shutdownNow();
            }

            Optional<Map<String, Object>> lineage = service.getLineage(jobId);
            assertThat(lineage)
                    .as("lineage lost to a concurrent write in round %d", round)
                    .isPresent();
            assertThat(lineage.get().get("parentJobId")).isEqualTo("parent-abc");

            Optional<JobStatusResponse> status = service.get(jobId);
            assertThat(status).isPresent();
            assertThat(status.get().manifest())
                    .as("manifest lost to a concurrent write in round %d", round)
                    .isNotNull();
        }
    }
}
