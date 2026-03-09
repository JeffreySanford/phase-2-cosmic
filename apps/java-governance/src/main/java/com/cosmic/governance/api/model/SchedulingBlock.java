package com.cosmic.governance.api.model;

import java.util.Map;

public record SchedulingBlock(
        String id,
        String startTime,
        String endTime,
        String subarray,
        Map<String, Object> metadata
) {}
