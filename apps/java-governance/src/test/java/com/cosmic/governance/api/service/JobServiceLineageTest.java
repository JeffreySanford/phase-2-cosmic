package com.cosmic.governance.api.service;

import com.cosmic.governance.api.dto.JobSubmitRequest;
import com.cosmic.governance.api.dto.JobStatusResponse;
import com.cosmic.governance.api.model.JobRecord;
import com.cosmic.governance.api.model.JobState;
import com.cosmic.governance.api.util.RedisMarshaller;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.time.Instant;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

class JobServiceLineageTest {

    RedisMarshaller marshaller;
    JobService service;

    @BeforeEach
    void setup() {
        marshaller = new RedisMarshaller(new ObjectMapper());
        AuditService auditService = Mockito.mock(AuditService.class);
        service = new JobService(null, new ObjectMapper(), null, marshaller, auditService);
    }

    @Test
    void updateLineage_updatesJobParametersAndVersion() {
        // Create a job
        JobSubmitRequest request = new JobSubmitRequest(
            "test-workflow",
            "test-dataset",
            Map.of("param1", "value1"),
            Map.of("parentJobId", "parent-123"),
            null,
            "test-user"
        );

        JobStatusResponse created = service.submit(request);
        String jobId = created.jobId();

        // Verify initial lineage
        Optional<Map<String, Object>> initialLineage = service.getLineage(jobId);
        assertThat(initialLineage).isPresent();
        assertThat(initialLineage.get().get("parentJobId")).isEqualTo("parent-123");

        // Update lineage
        Map<String, Object> newLineage = Map.of(
            "parentJobId", "parent-456",
            "grandparentJobId", "grandparent-789"
        );

        boolean updated = service.updateLineage(jobId, newLineage);
        assertThat(updated).isTrue();

        // Verify updated lineage
        Optional<Map<String, Object>> updatedLineage = service.getLineage(jobId);
        assertThat(updatedLineage).isPresent();
        assertThat(updatedLineage.get().get("parentJobId")).isEqualTo("parent-456");
        assertThat(updatedLineage.get().get("grandparentJobId")).isEqualTo("grandparent-789");

        // Verify version was incremented
        Optional<JobStatusResponse> status = service.get(jobId);
        assertThat(status).isPresent();
        assertThat(status.get().version()).isEqualTo(2); // Submit persists at version 1, lineage update increments to 2
    }

    @Test
    void updateLineage_returnsFalseForNonexistentJob() {
        Map<String, Object> lineage = Map.of("parentJobId", "parent-123");

        boolean updated = service.updateLineage("nonexistent-job", lineage);
        assertThat(updated).isFalse();
    }

    @Test
    void updateLineage_handlesEmptyLineage() {
        // Create a job
        JobSubmitRequest request = new JobSubmitRequest(
            "test-workflow",
            "test-dataset",
            null,
            Map.of(),
            null,
            "test-user"
        );

        JobStatusResponse created = service.submit(request);
        String jobId = created.jobId();

        // Update with empty lineage
        Map<String, Object> emptyLineage = Map.of();

        boolean updated = service.updateLineage(jobId, emptyLineage);
        assertThat(updated).isTrue();

        // Verify lineage is empty
        Optional<Map<String, Object>> updatedLineage = service.getLineage(jobId);
        assertThat(updatedLineage).isPresent();
        assertThat(updatedLineage.get()).isEmpty();
    }
}
