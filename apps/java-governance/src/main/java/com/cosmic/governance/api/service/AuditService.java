package com.cosmic.governance.api.service;

import com.cosmic.governance.api.config.RabbitMQConfig;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.TimeUnit;

@Service
public class AuditService {

    private static final Logger log = LoggerFactory.getLogger(AuditService.class);
    private static final String AUDIT_TOPIC = "cosmic-audit";

    private final RabbitTemplate rabbitTemplate;
    private final KafkaTemplate<String, String> kafkaTemplate;
    private final GovernanceRuntimeMetricsService governanceRuntimeMetricsService;
    private final ObjectMapper objectMapper;

    public AuditService(
            RabbitTemplate rabbitTemplate,
            KafkaTemplate<String, String> kafkaTemplate,
            GovernanceRuntimeMetricsService governanceRuntimeMetricsService,
            ObjectMapper objectMapper
    ) {
        this.rabbitTemplate = rabbitTemplate;
        this.kafkaTemplate = kafkaTemplate;
        this.governanceRuntimeMetricsService = governanceRuntimeMetricsService;
        this.objectMapper = objectMapper;
    }

    /**
     * Mirrors Kafka audit events to RabbitMQ for broader control-plane integration
     */
    @KafkaListener(
        topics = "cosmic-audit",
        groupId = "${governance.kafka.audit-group-id:audit-mirror}"
    )
    public void mirrorAuditEvent(String message) {
        Instant startedAt = Instant.now();
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
            if (governanceRuntimeMetricsService != null) {
                governanceRuntimeMetricsService.recordRabbitPublish(
                        RabbitMQConfig.AUDIT_EXCHANGE,
                        "audit.mirrored",
                        auditEvent,
                        true,
                        Duration.between(startedAt, Instant.now())
                );
            }

            log.debug("Successfully mirrored audit event to RabbitMQ");
        } catch (Exception e) {
            if (governanceRuntimeMetricsService != null) {
                governanceRuntimeMetricsService.recordRabbitPublish(
                        RabbitMQConfig.AUDIT_EXCHANGE,
                        "audit.mirrored",
                        message,
                        false,
                        Duration.between(startedAt, Instant.now())
                );
            }
            log.error("Failed to mirror audit event to RabbitMQ", e);
        }
    }

    /**
     * Publishes control-plane events to RabbitMQ
     */
    public void publishControlEvent(String eventType, Map<String, Object> payload) {
        Instant startedAt = Instant.now();
        Map<String, Object> controlEvent = Map.of(
            "source", "governance-api",
            "timestamp", Instant.now().toString(),
            "eventType", eventType,
            "payload", payload
        );
        try {
            String kafkaPayload = objectMapper.writeValueAsString(controlEvent);
            kafkaTemplate.send(AUDIT_TOPIC, kafkaPayload).get(5, TimeUnit.SECONDS);
            if (governanceRuntimeMetricsService != null) {
                governanceRuntimeMetricsService.recordKafkaPublish(
                        AUDIT_TOPIC,
                        eventType,
                        controlEvent,
                        true,
                        Duration.between(startedAt, Instant.now())
                );
            }
            log.debug("Published Kafka audit event: {}", eventType);
        } catch (Exception e) {
            if (governanceRuntimeMetricsService != null) {
                governanceRuntimeMetricsService.recordKafkaPublish(
                        AUDIT_TOPIC,
                        eventType,
                        controlEvent,
                        false,
                        Duration.between(startedAt, Instant.now())
                );
            }
            log.error("Failed to publish Kafka audit event", e);
        }

        Instant rabbitStartedAt = Instant.now();
        try {
            rabbitTemplate.convertAndSend(
                RabbitMQConfig.CONTROL_EXCHANGE,
                "control." + eventType,
                controlEvent
            );
            if (governanceRuntimeMetricsService != null) {
                governanceRuntimeMetricsService.recordRabbitPublish(
                        RabbitMQConfig.CONTROL_EXCHANGE,
                        "control." + eventType,
                        controlEvent,
                        true,
                        Duration.between(rabbitStartedAt, Instant.now())
                );
            }

            log.debug("Published control event: {}", eventType);
        } catch (Exception e) {
            if (governanceRuntimeMetricsService != null) {
                governanceRuntimeMetricsService.recordRabbitPublish(
                        RabbitMQConfig.CONTROL_EXCHANGE,
                        "control." + eventType,
                        controlEvent,
                        false,
                        Duration.between(rabbitStartedAt, Instant.now())
                );
            }
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
