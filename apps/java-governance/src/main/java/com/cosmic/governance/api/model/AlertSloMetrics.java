package com.cosmic.governance.api.model;

public record AlertSloMetrics(
        long alertIngestedTotal,
        double alertLatencyMsP50,
        double alertLatencyMsP95,
        double alertLatencyMsP99,
        long dlqDepth,
        long replaysTotal,
        String measuredAt) {}
