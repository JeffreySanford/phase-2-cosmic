package com.cosmic.governance.api.model;

public record RestoreDrillResult(
        String drillId,
        String datasetId,
        String policyId,
        boolean success,
        String restoredAt,
        long durationMs,
        String notes) {}
