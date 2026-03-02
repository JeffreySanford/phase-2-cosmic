package com.cosmic.governance.api.dto;

import jakarta.validation.constraints.Min;

/**
 * Optional payload for action endpoints such as cancel, retry, etc.
 * 
 * - version: expected current job version for optimistic locking.
 */
public class CancelRequest {
    @Min(1)
    private Long version;

    public CancelRequest() {}
    public CancelRequest(Long version) { this.version = version; }

    public Long getVersion() { return version; }
    public void setVersion(Long version) { this.version = version; }
}
