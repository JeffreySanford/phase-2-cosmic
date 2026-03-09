package com.cosmic.governance.api.messaging;

import com.cosmic.governance.api.service.GovernanceIngestMetricsService;
import com.cosmic.governance.api.service.GovernanceIngestProcessingService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Component
public class KafkaIngestListener {
    private static final Logger log = LoggerFactory.getLogger(KafkaIngestListener.class);
    private static final String BROKER = "kafka";
    private static final String TOPIC = "phase2-events";
    private final GovernanceIngestMetricsService ingestMetrics;
    private final GovernanceIngestProcessingService ingestProcessor;

    public KafkaIngestListener(
            GovernanceIngestMetricsService ingestMetrics,
            GovernanceIngestProcessingService ingestProcessor
    ) {
        this.ingestMetrics = ingestMetrics;
        this.ingestProcessor = ingestProcessor;
    }

    @KafkaListener(
        topics = "phase2-events",
        groupId = "${governance.kafka.ingest-group-id:governance-group}"
    )
    public void onMessage(String payload) {
        try {
            var result = ingestProcessor.process(BROKER, TOPIC, payload);
            if (result.duplicate()) {
                log.info("Ignored duplicate Kafka ingest event for workflow={} datasetId={}", result.workflow(), result.datasetId());
            } else if (result.accepted()) {
                log.info("Received Kafka event for workflow={} datasetId={}", result.workflow(), result.datasetId());
            }
        } catch (Exception ex) {
            ingestMetrics.recordDlqForward(BROKER, TOPIC, "ingest");
            log.warn("Failed to process Kafka message: {}", ex.toString());
            throw new RuntimeException(ex);
        }
    }
}
