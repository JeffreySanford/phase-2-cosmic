package com.cosmic.governance.api.service;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

import java.util.Map;

public class TopologyMetricsServiceTest {
    @Test
    void fallbackMetricsIncludeNewFields() {
        TopologyMetricsService svc = new TopologyMetricsService();
        Map<String,Object> m = svc.getTopologyMetrics();
        assertNotNull(m, "metrics map should not be null");
        assertTrue(m.containsKey("links"), "should contain links payload");
        assertTrue(m.containsKey("timing_drift_ns"), "should include timing drift metric");
        assertTrue(m.containsKey("rfi_event_rate"), "should include RFI event rate metric");
        // values should be numeric (0 in fallback)
        Object drift = m.get("timing_drift_ns");
        assertTrue(drift instanceof Number, "timing_drift_ns should be numeric");
        Object rate = m.get("rfi_event_rate");
        assertTrue(rate instanceof Number, "rfi_event_rate should be numeric");
    }
}
