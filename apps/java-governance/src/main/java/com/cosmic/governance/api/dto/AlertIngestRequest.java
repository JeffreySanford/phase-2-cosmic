package com.cosmic.governance.api.dto;

import java.util.List;

public record AlertIngestRequest(
        String eventType,
        String severity,
        String sourceSystem,
        String correlationId,
        String message,
        List<String> tags,
        double latencyMs) {}
