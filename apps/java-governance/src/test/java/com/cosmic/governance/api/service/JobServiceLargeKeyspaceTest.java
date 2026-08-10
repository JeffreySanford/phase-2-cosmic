package com.cosmic.governance.api.service;

import com.cosmic.governance.api.dto.JobStatusResponse;
import com.cosmic.governance.api.dto.JobSubmitRequest;
import com.cosmic.governance.api.model.JobRecord;
import com.cosmic.governance.api.model.JobState;
import com.cosmic.governance.api.util.RedisMarshaller;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Guards the job listing path against a large key space.
 *
 * A long-lived stack accumulates hundreds of thousands of job keys. Listing used
 * to read every one of them into the heap to answer a single request, which
 * exhausted the governance JVM and made every endpoint fail. These tests pin the
 * two properties that fix has to preserve simultaneously.
 */
class JobServiceLargeKeyspaceTest {

    private static final int BULK_JOBS = 20_000;

    private JobService service;

    @BeforeEach
    void setup() {
        RedisMarshaller marshaller = new RedisMarshaller(new ObjectMapper());
        AuditService auditService = Mockito.mock(AuditService.class);
        service = new JobService(null, new ObjectMapper(), null, marshaller, auditService);
    }

    private void store(String jobId, String workflow) {
        String now = Instant.now().toString();
        service.putRaw("job:" + jobId, new JobRecord(
                jobId, workflow, "ds", JobState.COMPLETED, now, now, Map.of(), null, "tester"));
    }

    /**
     * The bound has to sit on retained matches, not on candidate keys.
     *
     * Capping candidates looks equivalent and is not: keys come back from Redis
     * SCAN in arbitrary order, so a matching job can sit anywhere in the key
     * space. A candidate cap silently drops it and the caller sees an empty list
     * rather than a truncated one.
     */
    @Test
    void filteredListFindsMatchesAnywhereInALargeKeyspace() {
        for (int i = 0; i < BULK_JOBS; i++) {
            store("bulk-" + i, "bulk-workflow");
        }
        store("needle-a", "rare-workflow");
        store("needle-b", "rare-workflow");
        store("needle-c", "rare-workflow");

        List<JobStatusResponse> found = service.list("rare-workflow", null, 0, 50);

        assertThat(found)
                .as("every job matching the filter must be returned regardless of key space size")
                .hasSize(3)
                .extracting(JobStatusResponse::jobId)
                .containsExactlyInAnyOrder("needle-a", "needle-b", "needle-c");
    }

    /**
     * The complementary property: an unfiltered list over a huge key space must
     * refuse to materialise the whole thing, however many jobs exist.
     */
    @Test
    void unfilteredListStopsRetainingRecordsAtTheCap() {
        for (int i = 0; i < BULK_JOBS; i++) {
            store("bulk-" + i, "bulk-workflow");
        }

        List<JobStatusResponse> all = service.list(null, null, 0, Integer.MAX_VALUE);

        assertThat(all)
                .as("listing must be bounded so one request cannot exhaust the heap")
                .isNotEmpty()
                .hasSizeLessThan(BULK_JOBS);
    }

    /**
     * Listing is newest-first, which is what lets old jobs age out of the UI
     * rather than crowding out recent ones.
     */
    @Test
    void listReturnsNewestFirst() {
        Instant base = Instant.parse("2026-01-01T00:00:00Z");
        for (int i = 0; i < 5; i++) {
            String stamp = base.plusSeconds(i * 60L).toString();
            service.putRaw("job:aged-" + i, new JobRecord(
                    "aged-" + i, "aged-workflow", "ds", JobState.COMPLETED,
                    stamp, stamp, Map.of(), null, "tester"));
        }

        List<JobStatusResponse> page = service.list("aged-workflow", null, 0, 2);

        assertThat(page).extracting(JobStatusResponse::jobId)
                .as("most recent jobs come first")
                .containsExactly("aged-4", "aged-3");
    }

    /**
     * Deduplication must answer from the index rather than by listing every job.
     * A truncated listing silently reported "not a duplicate" and let repeat
     * submissions through.
     */
    @Test
    void requestIdIndexSurvivesALargeKeyspace() {
        for (int i = 0; i < BULK_JOBS; i++) {
            store("bulk-" + i, "bulk-workflow");
        }
        service.submit(new JobSubmitRequest(
                "wf", "ds", Map.of("requestId", "req-42"), null, null, "tester"));

        assertThat(service.hasRequestId("req-42"))
                .as("a submitted requestId stays findable however large the store grows")
                .isTrue();
        assertThat(service.hasRequestId("never-submitted")).isFalse();
    }
}
