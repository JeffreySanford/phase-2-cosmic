package com.cosmic.governance.api.controller;

import com.cosmic.governance.api.service.TopologyMetricsService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
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

    @PostMapping("/metrics/topology/runtime-profile")
    public ResponseEntity<Map<String, Object>> updateRuntimeProfile(@RequestBody(required = false) Map<String, Object> body) {
        int profilePct = parseInt(body == null ? null : body.get("profilePct"), 10);
        int workers = parseInt(body == null ? null : body.get("workers"), 0);
        String note = body == null || body.get("note") == null ? "" : String.valueOf(body.get("note"));
        service.updateRuntimeProfile(profilePct, workers, note);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("profilePct", profilePct);
        out.put("workers", workers);
        out.put("note", note);
        return ResponseEntity.ok(out);
    }

    private int parseInt(Object value, int fallback) {
        try {
            return value == null ? fallback : Integer.parseInt(String.valueOf(value));
        } catch (Exception ex) {
            return fallback;
        }
    }
}
