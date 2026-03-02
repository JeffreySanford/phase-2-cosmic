package com.cosmic.governance.api.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.Map;

public record JobStatusResponse(
        String jobId,
        String workflow,
        String datasetId,
        String status,
        String createdAt,
        String updatedAt,
        Map<String, Object> parameters,
        String requestedBy,
        long version
) {
}
