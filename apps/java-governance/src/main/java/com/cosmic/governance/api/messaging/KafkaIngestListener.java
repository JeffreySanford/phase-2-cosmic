package com.cosmic.governance.api.messaging;

import com.cosmic.governance.api.dto.JobSubmitRequest;
import com.cosmic.governance.api.service.JobService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;

@Component
public class KafkaIngestListener {
    private static final Logger log = LoggerFactory.getLogger(KafkaIngestListener.class);
    private final JobService jobService;
    private final ObjectMapper mapper;

    public KafkaIngestListener(JobService jobService, ObjectMapper mapper) {
        this.jobService = jobService;
        this.mapper = mapper;
    }

    @KafkaListener(topics = "phase2-events", groupId = "governance-group")
    public void onMessage(String payload) {
        try {
            // Expect payload to be a JSON object with fields for a job submit
            Map<String,Object> obj = mapper.readValue(payload, Map.class);
            String workflow = obj.containsKey("workflow") ? String.valueOf(obj.get("workflow")) : "ingest";
            String datasetId = obj.containsKey("datasetId") ? String.valueOf(obj.get("datasetId")) : "unknown";
            Map<String,Object> params = obj.containsKey("parameters") && obj.get("parameters") instanceof Map ? (Map<String,Object>) obj.get("parameters") : Map.of();
            String requestedBy = obj.containsKey("requestedBy") ? String.valueOf(obj.get("requestedBy")) : "kafka-ingest";

            JobSubmitRequest req = new JobSubmitRequest(workflow, datasetId, params, requestedBy);
            log.info("Received Kafka event for workflow={} datasetId={}", workflow, datasetId);
            jobService.submit(req);
        } catch (Exception ex) {
            log.warn("Failed to process Kafka message: {}", ex.toString());
        }
    }
}
