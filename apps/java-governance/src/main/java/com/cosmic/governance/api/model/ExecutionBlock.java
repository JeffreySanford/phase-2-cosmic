package com.cosmic.governance.api.model;

import java.util.Map;

public record ExecutionBlock(
        String id,
        String schedulingBlockId,
        String status,
        String startedAt,
        String finishedAt,
        Map<String, Object> result
) {}
