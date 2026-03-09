package org.phase2.ingest;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;

class IngestMetricsServiceTest {

    @Test
    void recordsReceiveProcessValidationAndFailureMetrics() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        IngestMetricsService service = new IngestMetricsService(registry);

        service.recordReceived("phase2-events", "{\"ok\":true}");
        service.recordProcessed("phase2-events", "{\"ok\":true}", Duration.ofMillis(12));
        service.recordValidationFailure("phase2-events", "payload", "", Duration.ofMillis(4));
        service.recordFailure("phase2-events", "RuntimeException", "{\"ok\":false}", Duration.ofMillis(9));

        assertThat(registry.get("java_ingest_received_total").counter().count()).isEqualTo(1.0d);
        assertThat(registry.get("java_ingest_processed_total").counter().count()).isEqualTo(1.0d);
        assertThat(registry.get("java_ingest_validation_failures_total").counter().count()).isEqualTo(1.0d);
        assertThat(registry.get("java_ingest_failures_total").counter().count()).isEqualTo(1.0d);
        assertThat(registry.get("java_ingest_payload_bytes").summary().count()).isEqualTo(4L);
        long durationSeriesCount = registry.find("java_ingest_processing_duration_seconds")
                .timers()
                .stream()
                .mapToLong(timer -> timer.count())
                .sum();
        assertThat(durationSeriesCount).isEqualTo(3L);
    }
}
