package com.cosmic.governance.api.dto;

import java.util.Map;

public record CommissioningValidateRequest(
        String scenarioId,
        Map<String, Object> parameters) {}
