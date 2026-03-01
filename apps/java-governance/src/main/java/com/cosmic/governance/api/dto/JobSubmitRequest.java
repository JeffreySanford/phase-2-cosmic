package com.cosmic.governance.api.dto;

import jakarta.validation.constraints.NotBlank;
import java.util.Map;

public record JobSubmitRequest(
        @NotBlank String workflow,
        @NotBlank String datasetId,
        Map<String, Object> parameters,
        String requestedBy
) {}
