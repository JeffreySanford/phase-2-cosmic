package com.cosmic.governance.api.dto;

import jakarta.validation.constraints.NotNull;

/**
 * Request body for explicit cancel endpoint.  Includes optional optimistic
 * locking token to prevent stale-cancel operations.
 */
public record JobCancelRequest(
        @NotNull Long expectedVersion
) {}
