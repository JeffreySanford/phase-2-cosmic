package com.cosmic.governance.api.service;

import java.lang.reflect.Field;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;

class VisualizationMetricsServiceTest {

    @Test
    void returnsFallbackPayloadWhenPrometheusIsNotConfigured() throws Exception {
        VisualizationMetricsService service = new VisualizationMetricsService();
        Field baseUrlField = VisualizationMetricsService.class.getDeclaredField("prometheusBaseUrl");
        baseUrlField.setAccessible(true);
        baseUrlField.set(service, "");

        Map<String, Object> result = service.getVisualizationMetrics();

        assertEquals("fallback", result.get("source"));
        @SuppressWarnings("unchecked")
        Map<String, Object> data = (Map<String, Object>) result.get("data");
        assertEquals(240.7, data.get("throughput"));
        assertEquals(1.14, data.get("errorRate"));
        assertEquals(45, data.get("queueDepth"));

        assertInstanceOf(List.class, data.get("sparkline"));
        assertInstanceOf(List.class, data.get("histogram"));
        assertInstanceOf(List.class, data.get("scatter"));
        assertEquals(40, ((List<?>) data.get("sparkline")).size());
        assertEquals(10, ((List<?>) data.get("histogram")).size());
        assertEquals(60, ((List<?>) data.get("scatter")).size());
        assertTrue(((List<?>) data.get("sparkline")).stream().allMatch(Map.class::isInstance));
    }
}
