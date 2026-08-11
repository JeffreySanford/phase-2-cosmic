package com.cosmic.governance.api.service;

import com.cosmic.governance.api.dto.JobSubmitRequest;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

/**
 * The dev data generator emits into {@code phase2-events} continuously, and
 * every accepted message used to become a job — filling the Jobs view faster
 * than it could be read and growing the job store without bound.
 *
 * <p>These pin both halves of the switch: a message is still received,
 * validated and measured whichever way the flag is set, but only creates a job
 * when the broker-to-job path is deliberately enabled.
 */
class GovernanceIngestJobCreationFlagTest {

    private static final String PAYLOAD =
            "{\"workflow\":\"ingest\",\"datasetId\":\"ds-flag\",\"requestedBy\":\"generator\"}";

    private static Validator validator() {
        try (ValidatorFactory factory = Validation.buildDefaultValidatorFactory()) {
            return factory.getValidator();
        }
    }

    private GovernanceIngestProcessingService serviceWith(
            JobService jobService, GovernanceIngestMetricsService metrics, boolean createJobs) {
        return new GovernanceIngestProcessingService(
                jobService, metrics, new ObjectMapper(), validator(), createJobs);
    }

    @Test
    void ingestDoesNotCreateJobsByDefault() throws Exception {
        JobService jobService = Mockito.mock(JobService.class);
        GovernanceIngestMetricsService metrics = Mockito.mock(GovernanceIngestMetricsService.class);

        var result = serviceWith(jobService, metrics, false).process("kafka", "phase2-events", PAYLOAD);

        verify(jobService, never()).submit(any(JobSubmitRequest.class));
        // Still a fully processed message: the streaming path and its metrics
        // must stay instrumented even when no job is written.
        assertThat(result.accepted()).isTrue();
        assertThat(result.workflow()).isEqualTo("ingest");
        assertThat(result.datasetId()).isEqualTo("ds-flag");
        verify(metrics, times(1)).recordReceive(any(), any(), any(), any());
        verify(metrics, times(1)).recordSuccess("kafka", "phase2-events", "ingest");
    }

    @Test
    void ingestCreatesJobsWhenExplicitlyEnabled() throws Exception {
        JobService jobService = Mockito.mock(JobService.class);
        GovernanceIngestMetricsService metrics = Mockito.mock(GovernanceIngestMetricsService.class);

        var result = serviceWith(jobService, metrics, true).process("kafka", "phase2-events", PAYLOAD);

        verify(jobService, times(1)).submit(any(JobSubmitRequest.class));
        assertThat(result.accepted()).isTrue();
    }
}
