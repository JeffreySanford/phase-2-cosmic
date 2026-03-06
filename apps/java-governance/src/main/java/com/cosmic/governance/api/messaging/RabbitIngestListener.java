package com.cosmic.governance.api.messaging;

import com.cosmic.governance.api.service.JobService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Validator;
import java.util.Map;
import java.util.Set;

/**
 * Placeholder listener for RabbitMQ-based ingest events.  At present the
 * implementation is TODO; Phase 2 work will flesh out parity with the
 * KafkaIngestListener.
 */
@Component
public class RabbitIngestListener {
    private static final Logger log = LoggerFactory.getLogger(RabbitIngestListener.class);
    private final JobService jobService;
    private final ObjectMapper mapper;
    private final Validator validator;
    private final org.springframework.amqp.rabbit.core.RabbitTemplate rabbitTemplate;

    public RabbitIngestListener(JobService jobService, ObjectMapper mapper, Validator validator,
                                 org.springframework.amqp.rabbit.core.RabbitTemplate rabbitTemplate) {
        this.jobService = jobService;
        this.mapper = mapper;
        this.validator = validator;
        this.rabbitTemplate = rabbitTemplate;
    }

    @org.springframework.amqp.rabbit.annotation.RabbitListener(queues = "phase2-events")
    public void onMessage(String payload) {
        try {
            Map<String,Object> obj = mapper.readValue(payload, Map.class);
            String workflow = obj.containsKey("workflow") ? String.valueOf(obj.get("workflow")) : "ingest";
            String datasetId = obj.containsKey("datasetId") ? String.valueOf(obj.get("datasetId")) : "unknown";
            Map<String,Object> params = obj.containsKey("parameters") && obj.get("parameters") instanceof Map ? (Map<String,Object>) obj.get("parameters") : Map.of();
            String requestedBy = obj.containsKey("requestedBy") ? String.valueOf(obj.get("requestedBy")) : "rabbitmq-ingest";
            Map<String,Object> manifest = obj.containsKey("manifest") && obj.get("manifest") instanceof Map ? (Map<String,Object>) obj.get("manifest") : null;
            Map<String,Object> lineage = obj.containsKey("lineage") && obj.get("lineage") instanceof Map ? (Map<String,Object>) obj.get("lineage") : null;

            com.cosmic.governance.api.dto.JobSubmitRequest req = new com.cosmic.governance.api.dto.JobSubmitRequest(workflow, datasetId, params, lineage, manifest, requestedBy);
            Set<jakarta.validation.ConstraintViolation<com.cosmic.governance.api.dto.JobSubmitRequest>> violations = validator.validate(req);
            if (!violations.isEmpty()) {
                log.warn("RabbitMQ message failed validation: {}", violations);
                throw new IllegalArgumentException("RabbitMQ message validation failed: " + violations);
            }

            log.info("Received RabbitMQ event for workflow={} datasetId={}", workflow, datasetId);
            jobService.submit(req);
        } catch (Exception ex) {
            log.warn("Failed to process RabbitMQ message: {}", ex.toString());
            // forward invalid or processing-failed payload to DLQ queue for operator review
            try {
                rabbitTemplate.convertAndSend("phase2-events-dlq", payload);
            } catch (Exception inner) {
                log.error("Unable to publish to RabbitMQ DLQ", inner);
            }
            // swallow exception so message isn't redelivered infinitely
        }
    }
}
