package com.cosmic.governance.api.service;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class TopologyMetricsRegistry {
    private final MeterRegistry meterRegistry;
    private final JobService jobService;
    private final RestTemplate restTemplate = new RestTemplate();
    private final Map<String, LinkTelemetry> links = new LinkedHashMap<>();
    private volatile RuntimeProfile runtimeProfile = new RuntimeProfile(10, 0, "baseline");
    private volatile double observedIngestMBps = 0.0d;

    @Value("${prometheus.baseUrl:}")
    private String prometheusBaseUrl;

    public TopologyMetricsRegistry(MeterRegistry meterRegistry, JobService jobService) {
        this.meterRegistry = meterRegistry;
        this.jobService = jobService;
        registerCanonicalLinks();
        refresh();
    }

    public synchronized void updateRuntimeProfile(int profilePct, int workers, String note) {
        this.runtimeProfile = new RuntimeProfile(profilePct, workers, note == null ? "" : note);
        refresh();
    }

    @Scheduled(fixedDelayString = "${governance.topology.metrics.refresh-ms:5000}")
    public synchronized void refresh() {
        JobCounts counts = collectJobCounts();
        double promIngest = fetchPrometheusIngestMBps();
        observedIngestMBps = promIngest > 0 ? promIngest : syntheticIngestMBps(counts);

        double loadScale = Math.max(0.10d, runtimeProfile.profilePct / 100.0d);
        double queueDepth = counts.queued + (counts.deferred * 0.75d);
        double queuePressure = Math.min(1.0d, queueDepth / 20.0d);
        double runningPressure = Math.min(1.0d, counts.running / 10.0d);
        double failurePressure = Math.min(1.0d, counts.failed / 8.0d);
        double governancePressure = Math.min(1.0d, (counts.running + counts.queued) / 16.0d);

        setLink("frontend->backend", 40, 5 + loadScale * 8, 14 + loadScale * 8, failurePressure * 0.10d);
        setLink("frontend->nginx", 40, 4 + loadScale * 7, 10 + loadScale * 4, 0.01d);
        setLink("backend->java-governance", 220, 18 + governancePressure * 120, 18 + governancePressure * 22, failurePressure * 0.24d);
        setLink("backend->prom", 60, 4 + loadScale * 8, 12 + loadScale * 5, 0.01d);

        setLink("data-generator->pulsar", 2800, observedIngestMBps * 0.52d, 16 + loadScale * 12, failurePressure * 0.04d);
        setLink("data-generator->kafka", 3200, observedIngestMBps, 18 + loadScale * 16, failurePressure * 0.03d);
        setLink("data-generator->array-main", 2200, observedIngestMBps * 0.46d, 20 + loadScale * 10, 0.02d);
        setLink("data-generator->array-lbl", 1200, observedIngestMBps * 0.22d, 18 + loadScale * 8, 0.02d);
        setLink("data-generator->array-sba", 1200, observedIngestMBps * 0.20d, 18 + loadScale * 8, 0.02d);

        setLink("pulsar->kafka", 2400, observedIngestMBps * 0.44d, 22 + loadScale * 12, 0.03d);
        setLink("zookeeper->kafka", 100, 3 + runtimeProfile.workers * 1.2d, 8 + queuePressure * 4, 0.01d);
        setLink("rabbitmq->java-governance", 260, 10 + queueDepth * 7 + counts.failed * 4, 18 + queuePressure * 18, 0.10d + failurePressure * 0.30d);
        setLink("java-governance->kafka", 720, 30 + counts.running * 28 + loadScale * 90, 20 + runningPressure * 16, 0.03d + failurePressure * 0.20d);
        setLink("java-governance->minio", 2800, observedIngestMBps * (0.55d + runningPressure * 0.20d), 26 + runningPressure * 18, 0.02d + failurePressure * 0.12d);
        setLink("java-governance->redis", 320, 12 + queueDepth * 9 + counts.running * 6, 12 + queuePressure * 12, 0.02d);
        setLink("kafka->java-ingest", 2800, observedIngestMBps * 0.82d, 24 + loadScale * 16, 0.03d + failurePressure * 0.10d);

        setLink("prom->grafana", 120, 8 + loadScale * 6, 10 + loadScale * 4, 0.01d);
        setLink("prom->alertmanager", 80, 3 + failurePressure * 10, 12 + failurePressure * 9, 0.01d);
        setLink("loki->grafana", 100, 5 + runningPressure * 10, 11 + runningPressure * 6, 0.01d);

        setLink("array-main->minio", 2600, observedIngestMBps * 0.48d, 28 + loadScale * 16, 0.02d);
        setLink("array-lbl->minio", 1400, observedIngestMBps * 0.24d, 26 + loadScale * 12, 0.02d);
        setLink("array-sba->minio", 1400, observedIngestMBps * 0.21d, 26 + loadScale * 12, 0.02d);
    }

    public synchronized Map<String, Object> snapshot() {
        refresh();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("source", "governance-registry");
        out.put("runtimeProfile", Map.of(
                "profilePct", runtimeProfile.profilePct,
                "workers", runtimeProfile.workers,
                "note", runtimeProfile.note
        ));
        out.put("observedIngestMBps", observedIngestMBps);
        out.put("links", linkMap());
        return out;
    }

    private void registerCanonicalLinks() {
        registerLink("frontend", "backend", "http");
        registerLink("frontend", "nginx", "http");
        registerLink("backend", "java-governance", "http");
        registerLink("backend", "prom", "http");
        registerLink("data-generator", "pulsar", "stream");
        registerLink("data-generator", "kafka", "stream");
        registerLink("data-generator", "array-main", "array");
        registerLink("data-generator", "array-lbl", "array");
        registerLink("data-generator", "array-sba", "array");
        registerLink("pulsar", "kafka", "stream");
        registerLink("zookeeper", "kafka", "control");
        registerLink("rabbitmq", "java-governance", "broker");
        registerLink("java-governance", "kafka", "stream");
        registerLink("java-governance", "minio", "object");
        registerLink("java-governance", "redis", "cache");
        registerLink("kafka", "java-ingest", "stream");
        registerLink("prom", "grafana", "metrics");
        registerLink("prom", "alertmanager", "metrics");
        registerLink("loki", "grafana", "logs");
        registerLink("array-main", "minio", "science");
        registerLink("array-lbl", "minio", "science");
        registerLink("array-sba", "minio", "science");
    }

    private void registerLink(String source, String target, String transport) {
        LinkTelemetry telemetry = new LinkTelemetry(source, target, transport);
        links.put(telemetry.key(), telemetry);

        Gauge.builder("cosmic_topology_link_current_mbps", telemetry, LinkTelemetry::currentMBps)
                .tag("link", telemetry.key())
                .tag("source", source)
                .tag("target", target)
                .tag("transport", transport)
                .register(meterRegistry);
        Gauge.builder("cosmic_topology_link_max_mbps", telemetry, LinkTelemetry::maxMBps)
                .tag("link", telemetry.key())
                .tag("source", source)
                .tag("target", target)
                .tag("transport", transport)
                .register(meterRegistry);
        Gauge.builder("cosmic_topology_link_utilization_pct", telemetry, LinkTelemetry::utilizationPct)
                .tag("link", telemetry.key())
                .tag("source", source)
                .tag("target", target)
                .tag("transport", transport)
                .register(meterRegistry);
        Gauge.builder("cosmic_topology_link_latency_ms", telemetry, LinkTelemetry::latencyMs)
                .tag("link", telemetry.key())
                .tag("source", source)
                .tag("target", target)
                .tag("transport", transport)
                .register(meterRegistry);
        Gauge.builder("cosmic_topology_link_error_rate_pct", telemetry, LinkTelemetry::errorRatePct)
                .tag("link", telemetry.key())
                .tag("source", source)
                .tag("target", target)
                .tag("transport", transport)
                .register(meterRegistry);
    }

    private void setLink(String key, double maxMBps, double currentMBps, double latencyMs, double errorRatePct) {
        LinkTelemetry telemetry = links.get(key);
        if (telemetry == null) {
            return;
        }
        telemetry.maxMBps = Math.max(1.0d, maxMBps);
        telemetry.currentMBps = Math.max(0.0d, Math.min(telemetry.maxMBps, currentMBps));
        telemetry.latencyMs = Math.max(1.0d, latencyMs);
        telemetry.errorRatePct = Math.max(0.0d, errorRatePct);
    }

    private Map<String, Object> linkMap() {
        Map<String, Object> out = new LinkedHashMap<>();
        for (LinkTelemetry telemetry : links.values()) {
            out.put(telemetry.key(), Map.of(
                    "currentMBps", round2(telemetry.currentMBps),
                    "maxMBps", round2(telemetry.maxMBps),
                    "latencyMs", round2(telemetry.latencyMs),
                    "errorRatePct", round2(telemetry.errorRatePct),
                    "transport", telemetry.transport
            ));
        }
        return out;
    }

    private JobCounts collectJobCounts() {
        List<?> jobs = jobService.listAll();
        int queued = 0;
        int running = 0;
        int failed = 0;
        int completed = 0;
        int deferred = 0;

        for (Object item : jobs) {
            if (!(item instanceof com.cosmic.governance.api.dto.JobStatusResponse response)) {
                continue;
            }
            String state = String.valueOf(response.status());
            if ("QUEUED".equalsIgnoreCase(state)) queued++;
            if ("RUNNING".equalsIgnoreCase(state)) running++;
            if ("FAILED".equalsIgnoreCase(state) || "TIMED_OUT".equalsIgnoreCase(state)) failed++;
            if ("COMPLETED".equalsIgnoreCase(state)) completed++;
            Map<String, Object> params = response.parameters();
            Object dv = params == null ? null : params.get("deferred");
            if (Boolean.TRUE.equals(dv) || "true".equalsIgnoreCase(String.valueOf(dv))) deferred++;
        }
        return new JobCounts(queued, running, failed, completed, deferred);
    }

    private double syntheticIngestMBps(JobCounts counts) {
        double loadScale = Math.max(0.10d, runtimeProfile.profilePct / 100.0d);
        double workerContribution = runtimeProfile.workers * 180.0d;
        double queuedContribution = counts.queued * 32.0d;
        double runningContribution = counts.running * 110.0d;
        return Math.max(120.0d, 220.0d * loadScale + workerContribution + queuedContribution + runningContribution);
    }

    @SuppressWarnings("unchecked")
    private double fetchPrometheusIngestMBps() {
        String base = prometheusBaseUrl;
        if (base == null || base.isBlank()) {
            base = System.getenv("PROMETHEUS_BASE_URL");
        }
        if (base == null || base.isBlank()) {
            base = System.getenv("PROMETHEUS_BASEURL");
        }
        if (base == null || base.isBlank()) {
            return 0.0d;
        }

        try {
            String query = "sum(rate(application_network_bytes_total[1m]))";
            String url = base + "/api/v1/query?query=" + URLEncoder.encode(query, StandardCharsets.UTF_8);
            ResponseEntity<Map> response = restTemplate.getForEntity(url, Map.class);
            if (!response.getStatusCode().is2xxSuccessful() || response.getBody() == null) {
                return 0.0d;
            }
            Object dataObj = response.getBody().get("data");
            if (!(dataObj instanceof Map<?, ?> dataMap)) {
                return 0.0d;
            }
            Object resultObj = dataMap.get("result");
            if (!(resultObj instanceof List<?> resultList) || resultList.isEmpty()) {
                return 0.0d;
            }
            Object first = resultList.get(0);
            if (!(first instanceof Map<?, ?> firstMap)) {
                return 0.0d;
            }
            Object valueObj = firstMap.get("value");
            if (!(valueObj instanceof List<?> valueList) || valueList.size() < 2) {
                return 0.0d;
            }
            double bytesPerSecond = Double.parseDouble(String.valueOf(valueList.get(1)));
            return bytesPerSecond / (1024.0d * 1024.0d);
        } catch (Exception ignored) {
            return 0.0d;
        }
    }

    private double round2(double value) {
        return Math.round(value * 100.0d) / 100.0d;
    }

    private record RuntimeProfile(int profilePct, int workers, String note) {}

    private record JobCounts(int queued, int running, int failed, int completed, int deferred) {}

    private static final class LinkTelemetry {
        private final String source;
        private final String target;
        private final String transport;
        private volatile double currentMBps;
        private volatile double maxMBps;
        private volatile double latencyMs;
        private volatile double errorRatePct;

        private LinkTelemetry(String source, String target, String transport) {
            this.source = source;
            this.target = target;
            this.transport = transport;
            this.maxMBps = 1.0d;
        }

        private String key() {
            return source + "->" + target;
        }

        private double currentMBps() {
            return currentMBps;
        }

        private double maxMBps() {
            return maxMBps;
        }

        private double latencyMs() {
            return latencyMs;
        }

        private double errorRatePct() {
            return errorRatePct;
        }

        private double utilizationPct() {
            return maxMBps <= 0.0d ? 0.0d : (currentMBps / maxMBps) * 100.0d;
        }
    }
}
