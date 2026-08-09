package com.cosmic.governance.api.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class TopologyMetricsService {
    private static final Logger log = LoggerFactory.getLogger(TopologyMetricsService.class);

    private final TopologyMetricsRegistry registry;
    private volatile Map<String, Object> cachedSnapshot = warmingSnapshot();

    public TopologyMetricsService(TopologyMetricsRegistry registry) {
        this.registry = registry;
    }

    /**
     * HTTP reads must stay cheap. The registry performs a large Prometheus/admin
     * collection, so callers receive the most recently completed snapshot rather
     * than triggering that collection synchronously on the request thread.
     */
    public Map<String, Object> getTopologyMetrics() {
        return cachedSnapshot;
    }

    @Scheduled(
            fixedDelayString = "${governance.topology.http-cache.refresh-ms:15000}",
            initialDelayString = "${governance.topology.http-cache.initial-delay-ms:1000}"
    )
    public void refreshCache() {
        try {
            Map<String, Object> fresh = registry.snapshot();
            Map<String, Object> next = new LinkedHashMap<>(fresh);
            next.put("cache", Map.of(
                    "state", "ready",
                    "refreshedAt", Instant.now().toString()
            ));
            cachedSnapshot = Map.copyOf(next);
        } catch (Exception ex) {
            Map<String, Object> stale = new LinkedHashMap<>(cachedSnapshot);
            stale.put("cache", Map.of(
                    "state", "stale",
                    "failedAt", Instant.now().toString(),
                    "lastError", ex.getClass().getSimpleName()
            ));
            cachedSnapshot = Map.copyOf(stale);
            log.warn("Topology metrics background refresh failed; serving the last completed snapshot", ex);
        }
    }

    public void updateRuntimeProfile(int profilePct, int workers, String note) {
        registry.updateRuntimeProfile(profilePct, workers, note);
    }

    private static Map<String, Object> warmingSnapshot() {
        return Map.of(
                "source", "warming",
                "runtimeProfile", Map.of(
                        "profilePct", 10,
                        "workers", 0,
                        "note", "waiting for first topology metrics refresh"
                ),
                "observedIngestMBps", 0.0d,
                "diagnostics", Map.of(),
                "links", Map.of(),
                "nodeActivity", Map.of(),
                "cache", Map.of("state", "warming")
        );
    }
}
