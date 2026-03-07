package com.cosmic.governance.api.service;

import org.springframework.stereotype.Service;

import java.util.Map;

@Service
public class TopologyMetricsService {
    private final TopologyMetricsRegistry registry;

    public TopologyMetricsService(TopologyMetricsRegistry registry) {
        this.registry = registry;
    }

    public Map<String, Object> getTopologyMetrics() {
        return registry.snapshot();
    }

    public void updateRuntimeProfile(int profilePct, int workers, String note) {
        registry.updateRuntimeProfile(profilePct, workers, note);
    }
}
