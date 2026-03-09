package com.cosmic.governance.api.controller;

import com.cosmic.governance.api.service.InfrastructureTelemetryService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/telemetry")
public class InfrastructureTelemetryController {
    private final InfrastructureTelemetryService infrastructureTelemetryService;

    public InfrastructureTelemetryController(InfrastructureTelemetryService infrastructureTelemetryService) {
        this.infrastructureTelemetryService = infrastructureTelemetryService;
    }

    @GetMapping("/infrastructure")
    public ResponseEntity<Map<String, Object>> infrastructureSnapshot() {
        return ResponseEntity.ok(infrastructureTelemetryService.snapshot());
    }
}
