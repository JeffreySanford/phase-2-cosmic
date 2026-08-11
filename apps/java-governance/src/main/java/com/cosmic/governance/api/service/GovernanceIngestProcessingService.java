package com.cosmic.governance.api.service;

import com.cosmic.governance.api.dto.JobSubmitRequest;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validator;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Set;

@Service
public class GovernanceIngestProcessingService {
    private final JobService jobService;
    private final GovernanceIngestMetricsService ingestMetrics;
    private final ObjectMapper mapper;
    private final Validator validator;

    /**
     * Whether an accepted broker message also becomes a governance job.
     *
     * <p>Off by default. The dev data generator publishes to
     * {@code phase2-events} for as long as the stack is up, and with this on
     * every accepted message became a job. Measured on a running stack: 242
     * accepted events in 60s, Redis growing 15 keys/sec, two million keys and
     * 765 MB resident with no memory ceiling — the Jobs view fills faster than
     * it can be read, and the key count reaches the order that exhausted the
     * governance heap.
     *
     * <p>Ingest itself is unaffected: messages are still received, validated,
     * measured and reported, so the streaming path and its topology metrics
     * stay fully instrumented. Only the job record is not created. Turn it on
     * deliberately to demonstrate or load-test the broker-to-job path.
     */
    private final boolean createJobsFromIngest;

    /**
     * How long a broker-derived job survives. Zero disables expiry.
     *
     * <p>These jobs are generated, not requested, and arrive continuously for
     * as long as the stack is up, so they are given a lifetime rather than
     * accumulating. Operator-submitted jobs are untouched and keep no expiry:
     * governance remains their system of record.
     */
    private final Duration ingestJobRetention;

    public GovernanceIngestProcessingService(
            JobService jobService,
            GovernanceIngestMetricsService ingestMetrics,
            ObjectMapper mapper,
            Validator validator,
            @Value("${governance.ingest.create-jobs:false}") boolean createJobsFromIngest,
            @Value("${governance.ingest.job-retention:PT6H}") Duration ingestJobRetention
    ) {
        this.jobService = jobService;
        this.ingestMetrics = ingestMetrics;
        this.mapper = mapper;
        this.validator = validator;
        this.createJobsFromIngest = createJobsFromIngest;
        this.ingestJobRetention = ingestJobRetention;
    }

    @SuppressWarnings("unchecked")
    public ProcessingResult process(String broker, String channel, String payload) throws Exception {
        String workflow = "ingest";
        Instant startedAt = Instant.now();
        String result = "failure";
        try {
            Map<String, Object> obj = mapper.readValue(payload, Map.class);
            Map<String, Object> domain = extractDomainPayload(obj);
            workflow = stringValue(domain, "workflow", "ingest");
            ingestMetrics.recordReceive(broker, channel, workflow, payload);

            String datasetId = stringValue(domain, "datasetId", "unknown");
            Map<String, Object> params = domain.containsKey("parameters") && domain.get("parameters") instanceof Map
                    ? (Map<String, Object>) domain.get("parameters")
                    : Map.of();
            String requestedBy = stringValue(domain, "requestedBy", broker + "-ingest");
            Map<String, Object> manifest = domain.containsKey("manifest") && domain.get("manifest") instanceof Map
                    ? (Map<String, Object>) domain.get("manifest")
                    : null;
            Map<String, Object> lineage = domain.containsKey("lineage") && domain.get("lineage") instanceof Map
                    ? (Map<String, Object>) domain.get("lineage")
                    : null;

            if (isDuplicateRequestId(params)) {
                ingestMetrics.recordDuplicate(broker, channel, workflow, "request_id");
                result = "duplicate";
                return ProcessingResult.duplicate(workflow, datasetId);
            }

            JobSubmitRequest req = new JobSubmitRequest(workflow, datasetId, params, lineage, manifest, requestedBy);
            Set<ConstraintViolation<JobSubmitRequest>> violations = validator.validate(req);
            if (!violations.isEmpty()) {
                ingestMetrics.recordValidationFailure(broker, channel, workflow, validationReason(violations));
                throw new IllegalArgumentException("Message validation failed: " + violations);
            }

            if (createJobsFromIngest) {
                var created = jobService.submit(req);
                // Broker-derived jobs are disposable: they exist to show the
                // path working, not as the record of an operator's request.
                // Without a bound they are what filled Redis, so they get one
                // and operator-submitted jobs keep none.
                if (created != null) {
                    jobService.expireJob(created.jobId(), ingestJobRetention);
                }
            }
            ingestMetrics.recordSuccess(broker, channel, workflow);
            result = "success";
            return ProcessingResult.accepted(workflow, datasetId);
        } catch (Exception ex) {
            ingestMetrics.recordFailure(broker, channel, workflow, ex instanceof IllegalArgumentException ? "validation" : ex.getClass().getSimpleName());
            result = ex instanceof IllegalArgumentException ? "validation" : "failure";
            throw ex;
        } finally {
            ingestMetrics.recordProcessingDuration(
                    broker,
                    channel,
                    workflow,
                    result,
                    Duration.between(startedAt, Instant.now())
            );
        }
    }

    private Map<String, Object> extractDomainPayload(Map<String, Object> obj) {
        Object payload = obj.get("payload");
        if (payload instanceof Map<?, ?> payloadMap) {
            boolean looksLikeEnvelope = obj.containsKey("eventType")
                    || obj.containsKey("originBroker")
                    || obj.containsKey("schemaVersion")
                    || obj.containsKey("correlationId");
            if (looksLikeEnvelope) {
                @SuppressWarnings("unchecked")
                Map<String, Object> cast = (Map<String, Object>) payloadMap;
                return cast;
            }
        }
        return obj;
    }

    private boolean isDuplicateRequestId(Map<String, Object> params) {
        Object requestId = params == null ? null : params.get("requestId");
        if (requestId == null) {
            return false;
        }
        String normalized = String.valueOf(requestId);
        if (normalized.isBlank()) {
            return false;
        }
        // Indexed membership test rather than a scan of every job. This runs once
        // per ingested message, so listing the whole store here made ingest cost
        // grow with total job history and is what exhausted the heap under load.
        return jobService.hasRequestId(normalized);
    }

    private String stringValue(Map<String, Object> src, String key, String fallback) {
        return src.containsKey(key) && src.get(key) != null ? String.valueOf(src.get(key)) : fallback;
    }

    private String validationReason(Set<ConstraintViolation<JobSubmitRequest>> violations) {
        if (violations == null || violations.isEmpty()) {
            return "unknown";
        }
        ConstraintViolation<JobSubmitRequest> first = violations.iterator().next();
        String path = first.getPropertyPath() == null ? "" : first.getPropertyPath().toString();
        if (path == null || path.isBlank()) {
            return "payload";
        }
        int dot = path.indexOf('.');
        return dot > 0 ? path.substring(0, dot) : path;
    }

    public record ProcessingResult(String workflow, String datasetId, boolean accepted, boolean duplicate) {
        public static ProcessingResult accepted(String workflow, String datasetId) {
            return new ProcessingResult(workflow, datasetId, true, false);
        }

        public static ProcessingResult duplicate(String workflow, String datasetId) {
            return new ProcessingResult(workflow, datasetId, false, true);
        }
    }
}
