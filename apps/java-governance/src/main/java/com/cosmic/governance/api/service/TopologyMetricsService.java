package com.cosmic.governance.api.service;

import java.util.Map;
import java.util.HashMap;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

@Service
public class TopologyMetricsService {
    private final RestTemplate rest = new RestTemplate();

    @Value("${prometheus.baseUrl:}")
    private String prometheusBaseUrl;

    public Map<String, Object> getTopologyMetrics() {
        // Determine Prometheus base URL from config or environment, then attempt a lightweight query
        String base = prometheusBaseUrl;
        if (base == null || base.isBlank()) {
            base = System.getenv("PROMETHEUS_BASE_URL");
            if (base == null || base.isBlank()) base = System.getenv("PROMETHEUS_BASEURL");
            if (base == null || base.isBlank()) base = System.getenv("PROMETHEUS_ENDPOINT");
        }
        if (base != null && !base.isBlank()) {
            try {
                // Example Prometheus instant query to get network throughput per link label
                String q = "sum by (link) (rate(application_network_bytes_total[1m]))";
                String url = base + "/api/v1/query?query=" + java.net.URLEncoder.encode(q, java.nio.charset.StandardCharsets.UTF_8);
                ResponseEntity<Map> resp = rest.getForEntity(url, Map.class);
                if (resp.getStatusCode().is2xxSuccessful() && resp.getBody() != null) {
                    // Return raw payload under key `prometheus` for the frontend to interpret
                    Map<String,Object> out = new HashMap<>();
                    out.put("source", "prometheus");
                    out.put("payload", resp.getBody());
                    return out;
                }
            } catch (Exception e) {
                // fallthrough to fallback
                voidPrint(e);
            }
        }

        // Fallback: return a simple in-memory example payload keyed by "source->target"
        Map<String, Object> fallback = new HashMap<>();
        Map<String, Object> l1 = Map.of("currentMBps", 420, "maxMBps", 1250);
        Map<String, Object> l2 = Map.of("currentMBps", 980, "maxMBps", 1250);
        fallback.put("generator->kafka", l1);
        fallback.put("kafka->governance", l2);
        Map<String,Object> out = new HashMap<>();
        out.put("source", "fallback");
        out.put("links", fallback);
        // include mission‑closure metric placeholders
        out.put("timing_drift_ns", 0);
        out.put("rfi_event_rate", 0);
        return out;
    }

    // tiny helper to avoid unused warning while logging could be added
    private void voidPrint(Exception e) {
        // no-op: keep stacktrace available in debug---can be replaced with logger
        e.printStackTrace();
    }
}

