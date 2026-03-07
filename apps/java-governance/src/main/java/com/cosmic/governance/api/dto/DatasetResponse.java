package com.cosmic.governance.api.dto;

import java.util.Map;

public record DatasetResponse(
        String id,
        String name,
        String description,
        String createdAt,
        Map<String, Object> metadata,
        Map<String, Object> manifest
) {}
