package com.cosmic.governance.api.controller;

import com.cosmic.governance.api.service.TopologyMetricsService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/v1")
public class MetricsController {
    private final TopologyMetricsService service;

    public MetricsController(TopologyMetricsService service) {
        this.service = service;
    }

    @GetMapping("/metrics/topology")
    public ResponseEntity<Map<String, Object>> topologyMetrics() {
        Map<String, Object> data = service.getTopologyMetrics();
        return ResponseEntity.ok(data);
    }
}
