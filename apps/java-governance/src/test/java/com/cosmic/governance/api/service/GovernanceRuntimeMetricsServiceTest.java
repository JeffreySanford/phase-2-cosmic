package com.cosmic.governance.api.service;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;

class GovernanceRuntimeMetricsServiceTest {

    @Test
    void recordsKafkaPublishMetrics() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        GovernanceRuntimeMetricsService service = new GovernanceRuntimeMetricsService(registry);

        service.recordKafkaPublish("cosmic-audit", "job.submitted", "{\"jobId\":\"abc\"}", true, Duration.ofMillis(12));
        service.recordKafkaPublish("cosmic-audit", "job.failed", "{\"jobId\":\"def\"}", false, Duration.ofMillis(25));

        assertThat(registry.get("governance_kafka_publish_total").counters())
                .extracting(counter -> counter.count())
                .containsExactlyInAnyOrder(1.0d, 1.0d);
        assertThat(registry.get("governance_kafka_publish_payload_bytes").summary().count()).isEqualTo(1L);
        long durationSeriesCount = registry.find("governance_kafka_publish_duration_seconds")
                .timers()
                .stream()
                .mapToLong(timer -> timer.count())
                .sum();
        assertThat(durationSeriesCount).isEqualTo(2L);
    }
}
