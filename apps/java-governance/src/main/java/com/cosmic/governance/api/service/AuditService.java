package com.cosmic.governance.api.service;

import com.cosmic.governance.api.config.RabbitMQConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Map;

@Service
@ConditionalOnProperty(name = "governance.messaging.enabled", havingValue = "true", matchIfMissing = true)
public class AuditService {

    private static final Logger log = LoggerFactory.getLogger(AuditService.class);

    private final RabbitTemplate rabbitTemplate;
    private final boolean rabbitPublishingEnabled;

    @Autowired
    public AuditService(ObjectProvider<RabbitTemplate> rabbitTemplateProvider,
                        @Value("${governance.audit.rabbit.enabled:true}") boolean rabbitPublishingEnabled) {
        this.rabbitTemplate = rabbitTemplateProvider.getIfAvailable();
        this.rabbitPublishingEnabled = rabbitPublishingEnabled;
    }

    // No-arg constructor to support frameworks or serializers that require it.
    // Sets publishing disabled by default to avoid accidental calls during early init.
    protected AuditService() {
        this.rabbitTemplate = null;
        this.rabbitPublishingEnabled = false;
    }

    // Backwards-compatible constructor for tests and legacy wiring
    public AuditService(RabbitTemplate rabbitTemplate,
                        @Value("${governance.audit.rabbit.enabled:true}") boolean rabbitPublishingEnabled) {
        this.rabbitTemplate = rabbitTemplate;
        this.rabbitPublishingEnabled = rabbitPublishingEnabled;
    }

    /**
     * Mirrors Kafka audit events to RabbitMQ for broader control-plane integration
     */
    @KafkaListener(topics = "cosmic-audit", groupId = "audit-mirror")
    public void mirrorAuditEvent(String message) {
        if (!rabbitPublishingEnabled || rabbitTemplate == null) {
            log.debug("Skipping RabbitMQ audit mirror because publishing disabled or RabbitTemplate missing");
            return;
        }
        try {
            log.debug("Mirroring audit event to RabbitMQ: {}", message);

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
        if (!rabbitPublishingEnabled || rabbitTemplate == null) {
            log.debug("Skipping RabbitMQ control event {} because publishing disabled or RabbitTemplate missing", eventType);
            return;
        }
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
