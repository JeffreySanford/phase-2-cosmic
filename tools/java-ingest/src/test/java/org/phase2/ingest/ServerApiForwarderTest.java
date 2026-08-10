package org.phase2.ingest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import java.util.Map;

import org.junit.jupiter.api.Test;

class ServerApiForwarderTest {

    private ServerApiForwarder forwarder(String url, boolean enabled, IngestMetricsService metrics) {
        return new ServerApiForwarder(metrics, url, enabled, 2000L);
    }

    @Test
    void failsClosedWhenForwardingIsEnabledButUrlIsMissing() {
        var metrics = mock(IngestMetricsService.class);

        assertThatThrownBy(() -> forwarder("", true, metrics))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("ingest.forward.url");
    }

    @Test
    void isNotConfiguredWhenExplicitlyDisabled() {
        var metrics = mock(IngestMetricsService.class);

        var forwarder = forwarder("", false, metrics);

        assertThat(forwarder.isConfigured()).isFalse();
    }

    @Test
    void isConfiguredWhenEnabledWithUrl() {
        var metrics = mock(IngestMetricsService.class);

        var forwarder = forwarder("http://localhost:4000/api/ingest/events", true, metrics);

        assertThat(forwarder.isConfigured()).isTrue();
    }

    @Test
    void forwardIsSkippedAndSilentWhenExplicitlyDisabled() {
        var metrics = mock(IngestMetricsService.class);
        var forwarder = forwarder("", false, metrics);

        boolean forwarded = forwarder.forward("kafka", "phase2-events", "{\"source\":\"main\"}");

        assertThat(forwarded).isFalse();
        verifyNoInteractions(metrics);
    }

    @Test
    void forwardRecordsFailureWhenServerIsUnreachable() {
        var metrics = mock(IngestMetricsService.class);
        // Port 1 is reserved and refuses connections, so this exercises the real
        // failure path without a live server.
        var forwarder = forwarder("http://127.0.0.1:1/api/ingest/events", true, metrics);

        boolean forwarded = forwarder.forward("kafka", "phase2-events", "{\"source\":\"main\"}");

        assertThat(forwarded).isFalse();
        verify(metrics).recordForwardFailure(anyString(), anyString(), anyString());
    }

    @Test
    void buildBodyPreservesEventIdentityRegionAndSource() {
        var metrics = mock(IngestMetricsService.class);
        var forwarder = forwarder("http://localhost:4000/api/ingest/events", true, metrics);

        var body = forwarder.buildBody(
                "kafka",
                "phase2-events",
                "{\"source\":\"main\",\"eventType\":\"telemetry.batch\",\"traceId\":\"trace-001\"}",
                Map.of(
                        "eventId", "event-001",
                        "collectorRegion", "us-west",
                        "pulsarMessageId", "pulsar-123"
                )
        );

        assertThat(body.get("eventId")).isEqualTo("event-001");
        assertThat(body.get("collectorRegion")).isEqualTo("us-west");
        assertThat(body.get("pulsarMessageId")).isEqualTo("pulsar-123");
        assertThat(body.get("broker")).isEqualTo("kafka");
        assertThat(body.get("topic")).isEqualTo("phase2-events");

        @SuppressWarnings("unchecked")
        var payload = (Map<String, Object>) body.get("payload");
        assertThat(payload.get("eventId")).isEqualTo("event-001");
        assertThat(payload.get("source")).isEqualTo("main");
        assertThat(payload.get("traceId")).isEqualTo("trace-001");
    }
}
