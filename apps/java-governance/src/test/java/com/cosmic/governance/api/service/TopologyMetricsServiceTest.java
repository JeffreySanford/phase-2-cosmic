package com.cosmic.governance.api.service;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TopologyMetricsServiceTest {

    @Test
    void httpReadReturnsWarmingSnapshotWithoutTriggeringRegistryRefresh() {
        TopologyMetricsRegistry registry = mock(TopologyMetricsRegistry.class);
        TopologyMetricsService service = new TopologyMetricsService(registry);

        Map<String, Object> snapshot = service.getTopologyMetrics();

        assertThat(snapshot).containsEntry("source", "warming");
        assertThat(snapshot.get("cache")).isEqualTo(Map.of("state", "warming"));
        verify(registry, never()).snapshot();
    }

    @Test
    void backgroundRefreshPublishesLastCompletedRegistrySnapshot() {
        TopologyMetricsRegistry registry = mock(TopologyMetricsRegistry.class);
        when(registry.snapshot()).thenReturn(Map.of(
                "source", "governance-registry",
                "links", Map.of("generator->kafka", Map.of("currentMBps", 1.25d)),
                "diagnostics", Map.of("canonicalLinkCount", 1)
        ));
        TopologyMetricsService service = new TopologyMetricsService(registry);

        service.refreshCache();
        Map<String, Object> snapshot = service.getTopologyMetrics();

        assertThat(snapshot).containsEntry("source", "governance-registry");
        assertThat(snapshot.get("links")).isEqualTo(
                Map.of("generator->kafka", Map.of("currentMBps", 1.25d))
        );
        @SuppressWarnings("unchecked")
        Map<String, Object> cache = (Map<String, Object>) snapshot.get("cache");
        assertThat(cache).containsEntry("state", "ready");
        assertThat(cache).containsKey("refreshedAt");
        verify(registry).snapshot();
    }
}
