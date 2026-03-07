package com.cosmic.governance.api.dto;

import java.util.Map;

public record DatasetRequest(
        String id,
        String name,
        String description,
        Map<String, Object> metadata,
        Map<String, Object> manifest
) {}
