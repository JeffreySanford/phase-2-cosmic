package com.cosmic.governance.api.model;

import java.util.List;
import java.util.Map;

public record FspAllocationPlan(
        String planId,
        String subarray,
        List<Map<String, Object>> allocations
) {}
