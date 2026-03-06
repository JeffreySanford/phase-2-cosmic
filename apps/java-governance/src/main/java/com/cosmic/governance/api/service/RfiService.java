package com.cosmic.governance.api.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Service
public class RfiService {
    private static final Logger log = LoggerFactory.getLogger(RfiService.class);

    // simple in-memory store of recent RFI events for tests/runbook
    private final List<Map<String,Object>> recent = new ArrayList<>();

    public void recordEvent(Map<String,Object> event) {
        if (event == null || !event.containsKey("startTime") || !event.containsKey("endTime")) {
            throw new IllegalArgumentException("missing startTime or endTime");
        }
        if (!event.containsKey("band")) {
            event.put("band","unknown");
        }
        event.put("receivedAt", Instant.now().toString());
        synchronized (recent) {
            recent.add(event);
            if (recent.size() > 500) recent.remove(0);
        }
        // publish audit or metric via AuditService if available (best-effort)
        log.info("RFI event recorded: band={} start={} end={}", event.get("band"), event.get("startTime"), event.get("endTime"));
    }

    public List<Map<String,Object>> recentEvents() {
        synchronized (recent) { return new ArrayList<>(recent); }
    }
}
