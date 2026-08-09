package org.phase2.ingest;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.DistributionSummary;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.concurrent.TimeUnit;

@Service
public class IngestMetricsService {
    private final MeterRegistry meterRegistry;

    public IngestMetricsService(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
    }

    public void recordReceived(String topic, String payload) {
        counter("java_ingest_received_total", topic, "success", "none").increment();
        payloadSummary(topic).record(sizeOf(payload));
    }

    public void recordProcessed(String topic, String payload, Duration duration) {
        counter("java_ingest_processed_total", topic, "success", "none").increment();
        payloadSummary(topic).record(sizeOf(payload));
        durationTimer(topic, "success", "none").record(duration.toNanos(), TimeUnit.NANOSECONDS);
    }

    public void recordValidationFailure(String topic, String reason, String payload, Duration duration) {
        counter("java_ingest_validation_failures_total", topic, "failure", reason).increment();
        payloadSummary(topic).record(sizeOf(payload));
        durationTimer(topic, "validation_failure", reason).record(duration.toNanos(), TimeUnit.NANOSECONDS);
    }

    public void recordFailure(String topic, String reason, String payload, Duration duration) {
        counter("java_ingest_failures_total", topic, "failure", reason).increment();
        payloadSummary(topic).record(sizeOf(payload));
        durationTimer(topic, "failure", reason).record(duration.toNanos(), TimeUnit.NANOSECONDS);
    }

    public void recordForwarded(String topic) {
        counter("java_ingest_forwarded_total", topic, "success", "none").increment();
    }

    public void recordForwardFailure(String broker, String topic, String reason) {
        counter("java_ingest_forward_failures_total", topic, "failure", reason).increment();
    }

    private Counter counter(String metric, String topic, String result, String reason) {
        return Counter.builder(metric)
                .description("Java ingest consumer telemetry")
                .tag("topic", safe(topic))
                .tag("result", safe(result))
                .tag("reason", safe(reason))
                .register(meterRegistry);
    }

    private DistributionSummary payloadSummary(String topic) {
        return DistributionSummary.builder("java_ingest_payload_bytes")
                .description("Java ingest consumed payload sizes")
                .baseUnit("bytes")
                .publishPercentileHistogram()
                .tag("topic", safe(topic))
                .register(meterRegistry);
    }

    private Timer durationTimer(String topic, String result, String reason) {
        return Timer.builder("java_ingest_processing_duration_seconds")
                .description("Java ingest processing duration")
                .publishPercentileHistogram()
                .tag("topic", safe(topic))
                .tag("result", safe(result))
                .tag("reason", safe(reason))
                .register(meterRegistry);
    }

    private double sizeOf(String payload) {
        return payload == null ? 0.0d : payload.getBytes(java.nio.charset.StandardCharsets.UTF_8).length;
    }

    private String safe(String value) {
        return value == null || value.isBlank() ? "unknown" : value;
    }
}
