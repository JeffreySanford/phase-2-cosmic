package com.cosmic.governance.api.dto;

public record JobSubmitResponse(
        String jobId,
        String status,
        String queuedAt
) {}
