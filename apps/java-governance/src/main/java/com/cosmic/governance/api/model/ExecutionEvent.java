package com.cosmic.governance.api.model;

import java.util.Map;

/**
 * Canonical execution event envelope.
 *
 * <p>Every event flowing through the broker fabric (Kafka audit/replay,
 * RabbitMQ control commands, Pulsar federated delivery) MUST be wrapped in
 * this envelope. Consumers extract {@code correlationId} to reconstruct
 * distributed traces across broker boundaries.
 *
 * @param correlationId  Trace identifier that propagates unchanged across all brokers.
 * @param eventType      Domain event type descriptor (e.g. "JOB_SUBMITTED", "ALERT_ISSUED").
 * @param originBroker   Originating broker role: "kafka", "rabbitmq", or "pulsar".
 * @param schemaVersion  Semver string for the payload schema (e.g. "1.0.0").
 * @param timestamp      ISO-8601 UTC timestamp set by the publisher.
 * @param payload        Domain-specific payload; structure governed by {@code schemaVersion}.
 */
public record ExecutionEvent(
        String correlationId,
        String eventType,
        String originBroker,
        String schemaVersion,
        String timestamp,
        Map<String, Object> payload) {}
