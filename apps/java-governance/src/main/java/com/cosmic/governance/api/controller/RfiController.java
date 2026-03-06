package com.cosmic.governance.api.controller;

import com.cosmic.governance.api.service.RfiService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/rfi")
public class RfiController {
    private final RfiService rfiService;

    public RfiController(RfiService rfiService) {
        this.rfiService = rfiService;
    }

    @PostMapping
    public ResponseEntity<?> ingestRfi(@RequestBody Map<String, Object> payload) {
        try {
            rfiService.recordEvent(payload);
            return ResponseEntity.accepted().body(Map.of("status","accepted"));
        } catch (IllegalArgumentException iae) {
            return ResponseEntity.badRequest().body(Map.of("error","invalid_payload","message", iae.getMessage()));
        } catch (Exception ex) {
            return ResponseEntity.status(500).body(Map.of("error","internal", "message", ex.getMessage()));
        }
    }
}
