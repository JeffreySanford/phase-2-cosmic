package com.cosmic.governance.api.model;

import java.util.List;

public record TransientAlert(
        String id,
        String eventType,
        String severity,
        String sourceSystem,
        String correlationId,
        String message,
        String issuedAt,
        boolean replayed,
        List<String> tags) {}
