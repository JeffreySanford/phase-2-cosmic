package com.cosmic.governance.api.model;

public record ReplicationPolicy(
        String id,
        String name,
        int retentionDays,
        String targetRegion,
        int replicaCount,
        String createdAt) {}
