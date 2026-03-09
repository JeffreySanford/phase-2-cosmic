package com.cosmic.governance.service;

import java.util.HashMap;
import java.util.Map;

public class ModeRouter {
    public enum JobMode {VLBI, PULSAR_TIMING, PULSAR_SEARCH, CORRELATION}

    private final Map<JobMode, String> templates = new HashMap<>();

    public ModeRouter() {
        templates.put(JobMode.VLBI, "vlbi-template");
        templates.put(JobMode.PULSAR_TIMING, "pulsar-timing-template");
        templates.put(JobMode.PULSAR_SEARCH, "pulsar-search-template");
        templates.put(JobMode.CORRELATION, "correlation-template");
    }

    public String selectTemplate(JobMode mode) {
        if (!templates.containsKey(mode)) {
            throw new IllegalArgumentException("unsupported mode: " + mode);
        }
        return templates.get(mode);
    }
}
