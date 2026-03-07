package com.cosmic.governance.api.dto;

public record IngestResponse(
        String ingestId,
        String status,
        String acceptedAt
) {}
