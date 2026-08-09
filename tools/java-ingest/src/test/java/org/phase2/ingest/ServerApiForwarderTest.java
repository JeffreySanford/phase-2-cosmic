package org.phase2.ingest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import org.junit.jupiter.api.Test;


class ServerApiForwarderTest {

    private ServerApiForwarder forwarder(String url, boolean enabled, IngestMetricsService metrics) {
        return new ServerApiForwarder(metrics, url, enabled, 2000L);
    }

    @Test
    void isNotConfiguredWhenUrlIsMissing() {
        var metrics = mock(IngestMetricsService.class);

        var forwarder = forwarder("", true, metrics);

        assertThat(forwarder.isConfigured()).isFalse();
    }

    @Test
    void isNotConfiguredWhenExplicitlyDisabled() {
        var metrics = mock(IngestMetricsService.class);

        var forwarder = forwarder("http://localhost:4000/api/ingest/events", false, metrics);

        assertThat(forwarder.isConfigured()).isFalse();
    }

    @Test
    void isConfiguredWhenEnabledWithUrl() {
        var metrics = mock(IngestMetricsService.class);

        var forwarder = forwarder("http://localhost:4000/api/ingest/events", true, metrics);

        assertThat(forwarder.isConfigured()).isTrue();
    }

    @Test
    void forwardIsSkippedAndSilentWhenNotConfigured() {
        var metrics = mock(IngestMetricsService.class);
        var forwarder = forwarder("", true, metrics);

        boolean forwarded = forwarder.forward("kafka", "phase2-events", "{\"source\":\"main\"}");

        assertThat(forwarded).isFalse();
        // An unconfigured forwarder is a deliberate no-op, not a failure.
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
        // Kafka still holds the record, so the failure is counted and ingest continues.
        verify(metrics).recordForwardFailure(anyString(), anyString(), anyString());
    }
}
