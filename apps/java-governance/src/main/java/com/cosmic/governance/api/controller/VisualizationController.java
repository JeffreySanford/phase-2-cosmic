package com.cosmic.governance.api.controller;

import com.cosmic.governance.api.service.VisualizationMetricsService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/visualization")
public class VisualizationController {
    private final VisualizationMetricsService service;

    public VisualizationController(VisualizationMetricsService service) {
        this.service = service;
    }

    @GetMapping("/metrics")
    public ResponseEntity<Map<String, Object>> metrics() {
        Map<String, Object> data = service.getVisualizationMetrics();
        return ResponseEntity.ok(data);
    }
}
