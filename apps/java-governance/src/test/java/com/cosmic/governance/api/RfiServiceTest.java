package com.cosmic.governance.api;

import com.cosmic.governance.api.service.RfiService;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

public class RfiServiceTest {
    @Test
    void recordAndRetrieveRecentEvents() {
        RfiService rfiService = new RfiService();
        java.util.Map<String, Object> ev = new java.util.HashMap<>(Map.of(
            "band", "L",
            "intensity", "high",
            "startTime", "2026-03-06T00:00:00Z",
            "endTime", "2026-03-06T00:01:00Z"
        ));
        rfiService.recordEvent(ev);
        var list = rfiService.recentEvents();
        assertFalse(list.isEmpty());
        assertEquals("L", list.get(list.size() - 1).get("band"));
    }
}
