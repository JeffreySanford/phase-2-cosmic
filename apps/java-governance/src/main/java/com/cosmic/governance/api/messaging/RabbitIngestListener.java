package com.cosmic.governance.api.messaging;

import com.cosmic.governance.api.config.RabbitMQConfig;
import com.cosmic.governance.api.service.GovernanceIngestMetricsService;
import com.cosmic.governance.api.service.GovernanceIngestProcessingService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

@Component
public class RabbitIngestListener {
    private static final Logger log = LoggerFactory.getLogger(RabbitIngestListener.class);
    private static final String BROKER = "rabbitmq";

    private final GovernanceIngestMetricsService ingestMetrics;
    private final GovernanceIngestProcessingService ingestProcessor;

    public RabbitIngestListener(
            GovernanceIngestMetricsService ingestMetrics,
            GovernanceIngestProcessingService ingestProcessor
    ) {
        this.ingestMetrics = ingestMetrics;
        this.ingestProcessor = ingestProcessor;
    }

    @RabbitListener(queues = RabbitMQConfig.INGEST_QUEUE)
    public void onMessage(String payload) {
        try {
            var result = ingestProcessor.process(BROKER, RabbitMQConfig.INGEST_QUEUE, payload);
            if (result.duplicate()) {
                log.info("Ignored duplicate RabbitMQ ingest event for workflow={} datasetId={}", result.workflow(), result.datasetId());
            } else if (result.accepted()) {
                log.info("Received RabbitMQ event for workflow={} datasetId={}", result.workflow(), result.datasetId());
            }
        } catch (Exception ex) {
            ingestMetrics.recordDlqForward(BROKER, RabbitMQConfig.INGEST_QUEUE, "ingest");
            log.warn("Failed to process RabbitMQ message: {}", ex.toString());
            throw new RuntimeException(ex);
        }
    }
}
