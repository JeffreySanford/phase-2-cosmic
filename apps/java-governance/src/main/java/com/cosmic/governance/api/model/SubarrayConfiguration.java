package com.cosmic.governance.api.model;

import java.util.List;
import java.util.Map;

public record SubarrayConfiguration(
        String id,
        List<String> antennas,
        String mode,
        Map<String, Object> parameters
) {}
