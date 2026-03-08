package com.cosmic.governance.api.controller;

import com.cosmic.governance.api.dto.AlertIngestRequest;
import com.cosmic.governance.api.model.AlertSloMetrics;
import com.cosmic.governance.api.model.TransientAlert;
import com.cosmic.governance.api.service.TransientAlertService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/alerts")
public class AlertController {

    private final TransientAlertService alertService;

    public AlertController(TransientAlertService alertService) {
        this.alertService = alertService;
    }

    /**
     * Ingest a transient alert. Returns 201 with the stored alert.
     */
    @PostMapping("/ingest")
    public ResponseEntity<TransientAlert> ingest(@RequestBody AlertIngestRequest request) {
        TransientAlert alert = alertService.ingest(
                request.eventType(),
                request.severity(),
                request.sourceSystem(),
                request.correlationId(),
                request.message(),
                request.tags(),
                request.latencyMs());
        return ResponseEntity.status(201).body(alert);
    }

    /**
     * Returns current alert SLO metrics snapshot.
     */
    @GetMapping("/slo")
    public ResponseEntity<AlertSloMetrics> getSlo() {
        return ResponseEntity.ok(alertService.getMetrics());
    }

    /**
     * Returns all alerts currently in the DLQ.
     */
    @GetMapping("/dlq")
    public ResponseEntity<List<TransientAlert>> getDlq() {
        return ResponseEntity.ok(alertService.getDlq());
    }

    /**
     * Replay a single alert from the DLQ by its ID. Returns 404 if not found.
     */
    @PostMapping("/dlq/replay/{alertId}")
    public ResponseEntity<TransientAlert> replayFromDlq(@PathVariable String alertId) {
        return alertService.replayFromDlq(alertId)
                .map(a -> ResponseEntity.ok(a))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    /**
     * Replay all alerts currently in the DLQ. Returns the count replayed.
     */
    @PostMapping("/dlq/replay-all")
    public ResponseEntity<Integer> replayAll() {
        return ResponseEntity.ok(alertService.replayAllFromDlq());
    }

    /**
     * Push an alert to the DLQ (for testing/simulation).
     */
    @PostMapping("/dlq")
    public ResponseEntity<Void> sendToDlq(@RequestBody AlertIngestRequest request) {
        TransientAlert alert = alertService.ingest(
                request.eventType(),
                request.severity(),
                request.sourceSystem(),
                request.correlationId(),
                request.message(),
                request.tags(),
                request.latencyMs());
        alertService.sendToDlq(alert);
        return ResponseEntity.status(201).build();
    }
}
