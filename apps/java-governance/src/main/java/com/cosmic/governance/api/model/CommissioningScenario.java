package com.cosmic.governance.api.model;

import java.util.List;

public record CommissioningScenario(
        String id,
        String name,
        String type,
        String description,
        List<String> requiredParameters) {}
