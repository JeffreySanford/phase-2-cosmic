package com.cosmic.governance.api.service;

import com.cosmic.governance.api.config.RabbitMQConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Map;

@Service
public class AuditService {

    private static final Logger log = LoggerFactory.getLogger(AuditService.class);

    private final RabbitTemplate rabbitTemplate;

    public AuditService(RabbitTemplate rabbitTemplate) {
        this.rabbitTemplate = rabbitTemplate;
    }

    /**
     * Mirrors Kafka audit events to RabbitMQ for broader control-plane integration
     */
    @KafkaListener(topics = "cosmic-audit", groupId = "audit-mirror")
    public void mirrorAuditEvent(String message) {
        try {
            log.debug("Mirroring audit event to RabbitMQ: {}", message);

            // Create audit event with additional metadata
            Map<String, Object> auditEvent = Map.of(
                "source", "kafka",
                "timestamp", Instant.now().toString(),
                "eventType", "audit",
                "payload", message
            );

            rabbitTemplate.convertAndSend(
                RabbitMQConfig.AUDIT_EXCHANGE,
                "audit.mirrored",
                auditEvent
            );

            log.debug("Successfully mirrored audit event to RabbitMQ");
        } catch (Exception e) {
            log.error("Failed to mirror audit event to RabbitMQ", e);
        }
    }

    /**
     * Publishes control-plane events to RabbitMQ
     */
    public void publishControlEvent(String eventType, Map<String, Object> payload) {
        try {
            Map<String, Object> controlEvent = Map.of(
                "source", "governance-api",
                "timestamp", Instant.now().toString(),
                "eventType", eventType,
                "payload", payload
            );

            rabbitTemplate.convertAndSend(
                RabbitMQConfig.CONTROL_EXCHANGE,
                "control." + eventType,
                controlEvent
            );

            log.debug("Published control event: {}", eventType);
        } catch (Exception e) {
            log.error("Failed to publish control event", e);
        }
    }

    /**
     * Publishes job lifecycle events to control plane
     */
    public void publishJobEvent(String jobId, String eventType, Map<String, Object> details) {
        Map<String, Object> payload = Map.of(
            "jobId", jobId,
            "eventType", eventType,
            "details", details
        );
        publishControlEvent("job." + eventType, payload);
    }
}