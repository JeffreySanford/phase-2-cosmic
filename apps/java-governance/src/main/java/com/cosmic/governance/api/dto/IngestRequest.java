package com.cosmic.governance.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;

public record IngestRequest(
        @NotBlank String source,
        @NotBlank String eventType,
        @PositiveOrZero long payloadBytes,
        String traceId
) {}
