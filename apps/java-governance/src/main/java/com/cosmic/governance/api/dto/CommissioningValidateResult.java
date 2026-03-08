package com.cosmic.governance.api.dto;

import java.util.List;

public record CommissioningValidateResult(
        String scenarioId,
        String scenarioName,
        boolean pass,
        List<String> failures,
        String validatedAt) {}
