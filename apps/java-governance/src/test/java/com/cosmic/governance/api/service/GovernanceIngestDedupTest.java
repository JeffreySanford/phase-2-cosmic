package com.cosmic.governance.api.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

/**
 * Deduplication used to depend on job submission populating the requestId
 * index. With broker-derived job creation off by default, nothing populated it,
 * so the ingest duplicate metric read zero -- not because there were no
 * duplicates, but because there was nothing to compare against.
 *
 * <p>These pin that ids are claimed at ingest regardless of whether a job is
 * created, and that a claim is only spent on a message that was actually
 * accepted.
 */
class GovernanceIngestDedupTest {

    private static final Duration RETENTION = Duration.ofHours(6);
    private static final Duration DEDUP_WINDOW = Duration.ofHours(24);

    private static final String WITH_REQUEST_ID =
            "{\"workflow\":\"ingest\",\"datasetId\":\"ds-dedup\",\"requestedBy\":\"generator\","
                    + "\"parameters\":{\"requestId\":\"req-1\"}}";

    // datasetId is @NotBlank, and a blank value survives the envelope defaults,
    // so this reaches the validator and fails there.
    private static final String INVALID_WITH_REQUEST_ID =
            "{\"workflow\":\"ingest\",\"datasetId\":\"\",\"requestedBy\":\"generator\","
                    + "\"parameters\":{\"requestId\":\"req-invalid\"}}";

    private static Validator validator() {
        try (ValidatorFactory factory = Validation.buildDefaultValidatorFactory()) {
            return factory.getValidator();
        }
    }

    private GovernanceIngestProcessingService serviceWith(
            JobService jobService, GovernanceIngestMetricsService metrics, boolean createJobs) {
        return new GovernanceIngestProcessingService(
                jobService, metrics, new ObjectMapper(), validator(), createJobs, RETENTION, DEDUP_WINDOW);
    }

    /** The actual regression: claims must not depend on job creation. */
    @Test
    void requestIdIsClaimedEvenWhenNoJobIsCreated() throws Exception {
        JobService jobService = Mockito.mock(JobService.class);
        GovernanceIngestMetricsService metrics = Mockito.mock(GovernanceIngestMetricsService.class);
        Mockito.when(jobService.claimRequestId(eq("req-1"), any())).thenReturn(true);

        var result = serviceWith(jobService, metrics, false)
                .process("kafka", "phase2-events", WITH_REQUEST_ID);

        verify(jobService, times(1)).claimRequestId("req-1", DEDUP_WINDOW);
        verify(jobService, never()).submit(any());
        assertThat(result.accepted()).isTrue();
    }

    @Test
    void aRefusedClaimIsReportedAsDuplicate() throws Exception {
        JobService jobService = Mockito.mock(JobService.class);
        GovernanceIngestMetricsService metrics = Mockito.mock(GovernanceIngestMetricsService.class);
        Mockito.when(jobService.claimRequestId(eq("req-1"), any())).thenReturn(false);

        var result = serviceWith(jobService, metrics, true)
                .process("kafka", "phase2-events", WITH_REQUEST_ID);

        assertThat(result.duplicate()).isTrue();
        assertThat(result.accepted()).isFalse();
        verify(metrics, times(1)).recordDuplicate("kafka", "phase2-events", "ingest", "request_id");
        verify(jobService, never()).submit(any());
    }

    /**
     * A rejected message must not spend its requestId. Claiming before
     * validation would swallow a corrected retry carrying the same id.
     */
    @Test
    void aMessageThatFailsValidationDoesNotSpendItsRequestId() {
        JobService jobService = Mockito.mock(JobService.class);
        GovernanceIngestMetricsService metrics = Mockito.mock(GovernanceIngestMetricsService.class);

        assertThatThrownBy(() -> serviceWith(jobService, metrics, true)
                .process("kafka", "phase2-events", INVALID_WITH_REQUEST_ID))
                .isInstanceOf(IllegalArgumentException.class);

        verify(jobService, never()).claimRequestId(any(), any());
    }

    @Test
    void aMessageWithoutARequestIdIsNeverTreatedAsDuplicate() throws Exception {
        JobService jobService = Mockito.mock(JobService.class);
        GovernanceIngestMetricsService metrics = Mockito.mock(GovernanceIngestMetricsService.class);

        var result = serviceWith(jobService, metrics, false).process(
                "kafka", "phase2-events",
                "{\"workflow\":\"ingest\",\"datasetId\":\"ds-none\",\"requestedBy\":\"generator\"}");

        assertThat(result.accepted()).isTrue();
        verify(jobService, never()).claimRequestId(any(), any());
    }
}
