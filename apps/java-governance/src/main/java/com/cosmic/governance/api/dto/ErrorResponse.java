package com.cosmic.governance.api.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Standard error envelope used by governance API responses.
 * Any additional fields ("allowed", "message", etc.) may be populated
 * and are permitted by the OpenAPI schema via additionalProperties=true.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ErrorResponse(
        String error,
        String jobId,
        Long currentVersion
) {
}
