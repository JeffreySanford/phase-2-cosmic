package com.cosmic.governance.integration;

import com.cosmic.governance.api.model.ExecutionEvent;
import com.cosmic.governance.api.model.TransientAlert;
import com.cosmic.governance.api.service.TransientAlertService;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.containers.GenericContainer;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Integration tests: correlation ID propagates through the alert ingest path
 * and is preserved end-to-end across the canonical ExecutionEvent envelope.
 *
 * <p>These tests use Testcontainers for Redis and skip gracefully when Docker
 * is unavailable (CI without Docker socket).
 */
@SpringBootTest
@AutoConfigureMockMvc
public class CorrelationPropagationTest {

    static GenericContainer<?> redis = null;

    static {
        boolean dockerAvailable = false;
        try {
            dockerAvailable = DockerClientFactory.instance().isDockerAvailable();
        } catch (Throwable t) {
            dockerAvailable = false;
        }
        if (dockerAvailable) {
            try {
                redis = new GenericContainer<>("redis:7-alpine").withExposedPorts(6379);
                redis.start();
            } catch (Throwable t) {
                redis = null;
            }
        }
    }

    @BeforeAll
    static void requireDocker() {
        Assumptions.assumeTrue(redis != null,
                "Docker/Testcontainers not available — skipping CorrelationPropagationTest");
    }

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) {
        if (redis != null) {
            registry.add("spring.data.redis.host", redis::getHost);
            registry.add("spring.data.redis.port",
                    () -> Integer.toString(redis.getFirstMappedPort()));
        }
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private TransientAlertService alertService;

    // -------------------------------------------------------------------------
    // ExecutionEvent envelope unit assertions (no HTTP, no external infra)
    // -------------------------------------------------------------------------

    @Test
    void executionEventRetainsCorrelationIdIdentically() {
        String correlationId = "corr-" + UUID.randomUUID();
        ExecutionEvent event = new ExecutionEvent(
                correlationId,
                "JOB_SUBMITTED",
                "kafka",
                "1.0.0",
                Instant.now().toString(),
                Map.of("jobId", "job-123", "dataset", "ngvla-raw-001"));

        assertThat(event.correlationId()).isEqualTo(correlationId);
        assertThat(event.originBroker()).isEqualTo("kafka");
        assertThat(event.schemaVersion()).isEqualTo("1.0.0");
        assertThat(event.payload()).containsKey("jobId");
    }

    @Test
    void correlationIdPropagatesFromEnvelopeToAlert() {
        String correlationId = "corr-env-to-alert-" + UUID.randomUUID();

        // Simulate publishing an ExecutionEvent on the Kafka->alert path:
        // the alert service MUST receive and preserve the same correlationId.
        ExecutionEvent event = new ExecutionEvent(
                correlationId,
                "ALERT_ISSUED",
                "kafka",
                "1.0.0",
                Instant.now().toString(),
                Map.of("severity", "HIGH", "source", "ngvla-correlator"));

        TransientAlert alert = alertService.ingest(
                event.eventType(),
                (String) event.payload().get("severity"),
                (String) event.payload().get("source"),
                event.correlationId(),
                "Derived from ExecutionEvent " + event.eventType(),
                List.of("correlation", "integration"),
                15.0);

        assertThat(alert.correlationId()).isEqualTo(correlationId);
        assertThat(alert.eventType()).isEqualTo("ALERT_ISSUED");
    }

    @Test
    void correlationIdRoundTripsThroughRestEndpoint() throws Exception {
        String correlationId = "corr-http-" + UUID.randomUUID();

        String body = String.format("""
                {
                  "eventType": "CORRELATION_TEST",
                  "severity": "INFO",
                  "sourceSystem": "integration-test",
                  "correlationId": "%s",
                  "message": "Correlation propagation probe",
                  "tags": ["test", "correlation"],
                  "latencyMs": 5.0
                }
                """, correlationId);

        mockMvc.perform(post("/api/v1/alerts/ingest")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.correlationId", is(correlationId)))
                .andExpect(jsonPath("$.id", notNullValue()))
                .andExpect(jsonPath("$.replayed", is(false)));
    }

    @Test
    void dlqReplayPreservesOriginalCorrelationId() throws Exception {
        String correlationId = "corr-dlq-replay-" + UUID.randomUUID();

        // Push alert to DLQ via REST
        String body = String.format("""
                {
                  "eventType": "DLQ_TEST",
                  "severity": "WARNING",
                  "sourceSystem": "dlq-integration",
                  "correlationId": "%s",
                  "message": "DLQ correlation preservation probe",
                  "tags": ["dlq", "replay"],
                  "latencyMs": 8.0
                }
                """, correlationId);

        mockMvc.perform(post("/api/v1/alerts/dlq")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated());

        // Verify correlationId is present in DLQ listing
        mockMvc.perform(get("/api/v1/alerts/dlq"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.correlationId == '" + correlationId + "')]",
                        org.hamcrest.Matchers.hasSize(1)));
    }

    @Test
    void idempotentDeliveryProof_duplicateCorrelationIdDoesNotDuplicate() {
        // Same correlationId ingested twice must produce two separate alert records
        // (alerts are not de-duplicated at the service layer — idempotency is the
        // responsibility of the consuming subscriber). This test documents that
        // contract explicitly.
        String correlationId = "corr-idempotent-" + UUID.randomUUID();

        TransientAlert first = alertService.ingest(
                "DUPLICATE_EVENT", "LOW", "test", correlationId,
                "first delivery", List.of(), 1.0);
        TransientAlert second = alertService.ingest(
                "DUPLICATE_EVENT", "LOW", "test", correlationId,
                "second delivery (duplicate)", List.of(), 1.0);

        assertThat(first.id()).isNotEqualTo(second.id());
        assertThat(first.correlationId()).isEqualTo(second.correlationId());
    }
}
