package com.cosmic.governance.api.service;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.DistributionSummary;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.time.Duration;

@Service
public class GovernanceIngestMetricsService {
    private final MeterRegistry meterRegistry;

    public GovernanceIngestMetricsService(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
    }

    public void recordReceive(String broker, String topic, String workflow, Object payload) {
        counter(
                "governance_ingest_received_total",
                "broker", safe(broker),
                "topic", safe(topic),
                "workflow", safe(workflow)
        ).increment();
        payloadSummary("governance_ingest_payload_bytes", broker, topic, workflow)
                .record(approxPayloadBytes(payload));
    }

    public void recordSuccess(String broker, String topic, String workflow) {
        counter(
                "governance_ingest_processed_total",
                "broker", safe(broker),
                "topic", safe(topic),
                "workflow", safe(workflow)
        ).increment();
    }

    public void recordValidationFailure(String broker, String topic, String workflow) {
        recordValidationFailure(broker, topic, workflow, "unknown");
    }

    public void recordValidationFailure(String broker, String topic, String workflow, String reason) {
        counter(
                "governance_ingest_validation_failures_total",
                "broker", safe(broker),
                "topic", safe(topic),
                "workflow", safe(workflow),
                "reason", safe(reason)
        ).increment();
    }

    public void recordDuplicate(String broker, String topic, String workflow) {
        recordDuplicate(broker, topic, workflow, "unknown");
    }

    public void recordDuplicate(String broker, String topic, String workflow, String reason) {
        counter(
                "governance_ingest_duplicates_total",
                "broker", safe(broker),
                "topic", safe(topic),
                "workflow", safe(workflow),
                "reason", safe(reason)
        ).increment();
    }

    public void recordDlqForward(String broker, String topic, String workflow) {
        counter(
                "governance_ingest_dlq_total",
                "broker", safe(broker),
                "topic", safe(topic),
                "workflow", safe(workflow)
        ).increment();
    }

    public void recordFailure(String broker, String topic, String workflow, String errorType) {
        counter(
                "governance_ingest_failures_total",
                "broker", safe(broker),
                "topic", safe(topic),
                "workflow", safe(workflow),
                "error_type", safe(errorType)
        ).increment();
    }

    public void recordProcessingDuration(
            String broker,
            String topic,
            String workflow,
            String result,
            Duration duration
    ) {
        if (duration == null || duration.isNegative()) {
            return;
        }
        Timer.builder("governance_ingest_processing_duration_seconds")
                .publishPercentileHistogram()
                .tag("broker", safe(broker))
                .tag("topic", safe(topic))
                .tag("workflow", safe(workflow))
                .tag("result", safe(result))
                .register(meterRegistry)
                .record(duration);
    }

    private Counter counter(String name, String... tags) {
        return Counter.builder(name)
                .tags(tags)
                .register(meterRegistry);
    }

    private DistributionSummary payloadSummary(String name, String broker, String topic, String workflow) {
        return DistributionSummary.builder(name)
                .baseUnit("bytes")
                .tag("broker", safe(broker))
                .tag("topic", safe(topic))
                .tag("workflow", safe(workflow))
                .register(meterRegistry);
    }

    private double approxPayloadBytes(Object payload) {
        if (payload == null) {
            return 0.0d;
        }
        return String.valueOf(payload).getBytes(StandardCharsets.UTF_8).length;
    }

    private String safe(String value) {
        return value == null || value.isBlank() ? "unknown" : value;
    }
}
