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
    private final InfrastructureTelemetryService infrastructureTelemetryService;
    private final RestTemplate restTemplate = new RestTemplate();
    private final Map<String, LinkTelemetry> links = new LinkedHashMap<>();
    private volatile RuntimeProfile runtimeProfile = new RuntimeProfile(10, 0, "baseline");
    private volatile double observedIngestMBps = 0.0d;

    @Value("${prometheus.baseUrl:}")
    private String prometheusBaseUrl;

    public TopologyMetricsRegistry(
            MeterRegistry meterRegistry,
            JobService jobService,
            InfrastructureTelemetryService infrastructureTelemetryService
    ) {
        this.meterRegistry = meterRegistry;
        this.jobService = jobService;
        this.infrastructureTelemetryService = infrastructureTelemetryService;
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
        InfrastructureMetrics infrastructure = collectInfrastructureMetrics();
        double promIngest = fetchPrometheusIngestMBps();
        observedIngestMBps = promIngest > 0 ? promIngest : syntheticIngestMBps(counts);
        double generatorToKafkaMBps = queryPrometheusMBps(
                "sum(rate(generator_bytes_produced_total[1m]))"
        );
        double generatorArrayMainMBps = queryPrometheusMBps(
                "sum(rate(generator_bytes_produced_by_segment_total{array_segment=\"main\"}[1m]))"
        );
        double generatorArrayLblMBps = queryPrometheusMBps(
                "sum(rate(generator_bytes_produced_by_segment_total{array_segment=\"lbl\"}[1m]))"
        );
        double generatorArraySbaMBps = queryPrometheusMBps(
                "sum(rate(generator_bytes_produced_by_segment_total{array_segment=\"sba\"}[1m]))"
        );
        double governanceToKafkaMBps = queryPrometheusMBps(
                "sum(rate(kafka_producer_outgoing_byte_total{job=\"java-governance\"}[1m]))"
                        + " or sum(rate(kafka_producer_producer_metrics_outgoing_byte_total{job=\"java-governance\"}[1m]))"
        );
        double kafkaIngestLatencyMs = queryPrometheusMs(
                "(sum(rate(governance_ingest_processing_duration_seconds_sum{broker=\"kafka\"}[5m]))"
                        + " / clamp_min(sum(rate(governance_ingest_processing_duration_seconds_count{broker=\"kafka\"}[5m])), 0.0001)) * 1000"
        );
        double kafkaIngestErrorPct = queryPrometheusPercent(
                "((sum(rate(governance_ingest_failures_total{broker=\"kafka\"}[5m]))"
                        + " + sum(rate(governance_ingest_validation_failures_total{broker=\"kafka\"}[5m]))"
                        + " + sum(rate(governance_ingest_dlq_total{broker=\"kafka\"}[5m])))"
                        + " / clamp_min(sum(rate(governance_ingest_received_total{broker=\"kafka\"}[5m])), 0.0001)) * 100"
        );
        double rabbitIngestLatencyMs = queryPrometheusMs(
                "(sum(rate(governance_ingest_processing_duration_seconds_sum{broker=\"rabbitmq\"}[5m]))"
                        + " / clamp_min(sum(rate(governance_ingest_processing_duration_seconds_count{broker=\"rabbitmq\"}[5m])), 0.0001)) * 1000"
        );
        double rabbitIngestErrorPct = queryPrometheusPercent(
                "((sum(rate(governance_ingest_failures_total{broker=\"rabbitmq\"}[5m]))"
                        + " + sum(rate(governance_ingest_validation_failures_total{broker=\"rabbitmq\"}[5m]))"
                        + " + sum(rate(governance_ingest_dlq_total{broker=\"rabbitmq\"}[5m])))"
                        + " / clamp_min(sum(rate(governance_ingest_received_total{broker=\"rabbitmq\"}[5m])), 0.0001)) * 100"
        );
        double pulsarIngestLatencyMs = queryPrometheusMs(
                "(sum(rate(governance_ingest_processing_duration_seconds_sum{broker=\"pulsar\"}[5m]))"
                        + " / clamp_min(sum(rate(governance_ingest_processing_duration_seconds_count{broker=\"pulsar\"}[5m])), 0.0001)) * 1000"
        );
        double pulsarIngestErrorPct = queryPrometheusPercent(
                "((sum(rate(governance_ingest_failures_total{broker=\"pulsar\"}[5m]))"
                        + " + sum(rate(governance_ingest_validation_failures_total{broker=\"pulsar\"}[5m]))"
                        + " + sum(rate(governance_ingest_dlq_total{broker=\"pulsar\"}[5m])))"
                        + " / clamp_min(sum(rate(governance_ingest_received_total{broker=\"pulsar\"}[5m])), 0.0001)) * 100"
        );
        double ingestFromKafkaMBps = queryPrometheusMBps(
                "sum(rate(java_ingest_payload_bytes_sum[1m]))"
                        + " or sum(rate(kafka_consumer_fetch_manager_bytes_consumed_total{job=\"java-ingest\"}[1m]))"
                        + " or sum(rate(kafka_consumer_consumer_fetch_manager_metrics_bytes_consumed_total{job=\"java-ingest\"}[1m]))"
        );
        double javaIngestLatencyMs = queryPrometheusMs(
                "(sum(rate(java_ingest_processing_duration_seconds_sum[5m]))"
                        + " / clamp_min(sum(rate(java_ingest_processing_duration_seconds_count[5m])), 0.0001)) * 1000"
        );
        double javaIngestErrorPct = queryPrometheusPercent(
                "((sum(rate(java_ingest_failures_total[5m]))"
                        + " + sum(rate(java_ingest_validation_failures_total[5m]))"
                        + " + sum(rate(java_ingest_dlq_total[5m])))"
                        + " / clamp_min(sum(rate(java_ingest_received_total[5m])), 0.0001)) * 100"
        );
        double nestRedisCurrentMBps = queryPrometheusMBps(
                "sum(rate(frontend_ssr_redis_cache_bytes_served_total{result=\"hit\"}[1m]))"
                        + " + sum(rate(frontend_ssr_redis_cache_bytes_written_total[1m]))"
        );
        double nestRedisLatencyMs = queryPrometheusMs(
                "(sum(rate(frontend_ssr_redis_cache_request_duration_seconds_sum[5m]))"
                        + " / clamp_min(sum(rate(frontend_ssr_redis_cache_request_duration_seconds_count[5m])), 0.0001)) * 1000"
        );
        double nestRedisErrorPct = queryPrometheusPercent(
                "(sum(rate(frontend_ssr_redis_cache_errors_total[5m]))"
                        + " / clamp_min(sum(rate(frontend_ssr_redis_cache_requests_total[5m])), 0.0001)) * 100"
        );
        double governanceHttpLatencyMs = queryPrometheusMs(
                "histogram_quantile(0.95, sum(rate(http_server_requests_seconds_bucket{job=\"java-governance\"}[5m])) by (le)) * 1000"
        );
        double governanceHttpErrorPct = queryPrometheusPercent(
                "(sum(rate(http_server_requests_seconds_count{job=\"java-governance\",status=~\"5..\"}[5m]))"
                        + " / clamp_min(sum(rate(http_server_requests_seconds_count{job=\"java-governance\"}[5m])), 0.0001)) * 100"
        );
        double rabbitPublishLatencyMs = queryPrometheusMs(
                "(sum(rate(governance_rabbitmq_publish_duration_seconds_sum[5m]))"
                        + " / clamp_min(sum(rate(governance_rabbitmq_publish_duration_seconds_count[5m])), 0.0001)) * 1000"
        );
        double rabbitPublishErrorPct = queryPrometheusPercent(
                "(sum(rate(governance_rabbitmq_publish_total{result=\"failure\"}[5m]))"
                        + " / clamp_min(sum(rate(governance_rabbitmq_publish_total[5m])), 0.0001)) * 100"
        );
        double nestGovernanceCurrentMBps = queryPrometheusMBps(
                "sum(rate(frontend_ssr_governance_proxy_response_bytes_total{route=~\"governance_api|telemetry_infrastructure|topology_metrics\"}[1m]))"
        );
        double nestGovernanceLatencyMs = queryPrometheusMs(
                "(sum(rate(frontend_ssr_governance_proxy_request_duration_seconds_sum{route=~\"governance_api|telemetry_infrastructure|topology_metrics\"}[5m]))"
                        + " / clamp_min(sum(rate(frontend_ssr_governance_proxy_request_duration_seconds_count{route=~\"governance_api|telemetry_infrastructure|topology_metrics\"}[5m])), 0.0001)) * 1000"
        );
        double nestGovernanceErrorPct = queryPrometheusPercent(
                "(sum(rate(frontend_ssr_governance_proxy_requests_total{route=~\"governance_api|telemetry_infrastructure|topology_metrics\",status_class=~\"4xx|5xx\"}[5m]))"
                        + " / clamp_min(sum(rate(frontend_ssr_governance_proxy_requests_total{route=~\"governance_api|telemetry_infrastructure|topology_metrics\"}[5m])), 0.0001)) * 100"
        );
        double frontendBackendCurrentMBps = queryPrometheusMBps(
                "sum(rate(frontend_ssr_frontend_response_bytes_total[1m]))"
        );
        double frontendBackendApiCurrentMBps = queryPrometheusMBps(
                "sum(rate(frontend_ssr_frontend_api_response_bytes_total[1m]))"
        );
        double frontendBackendRequestRate = queryPrometheusValue(
                "sum(rate(frontend_ssr_frontend_requests_total[1m]))"
        );
        double frontendBackendApiRequestRate = queryPrometheusValue(
                "sum(rate(frontend_ssr_frontend_api_requests_total[1m]))"
        );
        double frontendBackendLatencyMs = queryPrometheusMs(
                "(sum(rate(frontend_ssr_frontend_request_duration_seconds_sum[5m]))"
                        + " / clamp_min(sum(rate(frontend_ssr_frontend_request_duration_seconds_count[5m])), 0.0001)) * 1000"
        );
        double frontendBackendApiLatencyMs = queryPrometheusMs(
                "(sum(rate(frontend_ssr_frontend_api_request_duration_seconds_sum[5m]))"
                        + " / clamp_min(sum(rate(frontend_ssr_frontend_api_request_duration_seconds_count[5m])), 0.0001)) * 1000"
        );
        double frontendBackendErrorPct = queryPrometheusPercent(
                "(sum(rate(frontend_ssr_frontend_requests_total{status_class=~\"4xx|5xx\"}[5m]))"
                        + " / clamp_min(sum(rate(frontend_ssr_frontend_requests_total[5m])), 0.0001)) * 100"
        );
        double frontendBackendApiErrorPct = queryPrometheusPercent(
                "(sum(rate(frontend_ssr_frontend_api_requests_total{status_class=~\"4xx|5xx\"}[5m]))"
                        + " / clamp_min(sum(rate(frontend_ssr_frontend_api_requests_total[5m])), 0.0001)) * 100"
        );
        double frontendNginxCurrentMBps = queryPrometheusMBps(
                "sum(rate(nginx_static_http_response_size_bytes[1m]))"
        );
        double frontendNginxLatencyMs = queryPrometheusMs(
                "(sum(rate(nginx_static_http_response_time_seconds_sum[5m]))"
                        + " / clamp_min(sum(rate(nginx_static_http_response_time_seconds_count[5m])), 0.0001)) * 1000"
        );
        double frontendNginxErrorPct = queryPrometheusPercent(
                "(sum(rate(nginx_static_http_response_count_total{status=~\"4..|5..\"}[5m]))"
                        + " / clamp_min(sum(rate(nginx_static_http_response_count_total[5m])), 0.0001)) * 100"
        );
        double backendPromCurrentMBps = queryPrometheusMBps(
                "sum(rate(frontend_ssr_prometheus_proxy_response_bytes_total[1m]))"
        );
        double backendPromLatencyMs = queryPrometheusMs(
                "(sum(rate(frontend_ssr_prometheus_proxy_request_duration_seconds_sum[5m]))"
                        + " / clamp_min(sum(rate(frontend_ssr_prometheus_proxy_request_duration_seconds_count[5m])), 0.0001)) * 1000"
        );
        double backendPromErrorPct = queryPrometheusPercent(
                "(sum(rate(frontend_ssr_prometheus_proxy_requests_total{status_class=~\"4xx|5xx\"}[5m]))"
                        + " / clamp_min(sum(rate(frontend_ssr_prometheus_proxy_requests_total[5m])), 0.0001)) * 100"
        );
        double promAlertmanagerCurrentMBps = queryPrometheusMBps(
                "sum(rate(alertmanager_http_response_size_bytes_sum{handler!=\"/metrics\",handler!=\"/-/ready\"}[1m]))"
        );
        double promAlertmanagerLatencyMs = queryPrometheusMs(
                "(sum(rate(alertmanager_http_request_duration_seconds_sum{handler!=\"/metrics\",handler!=\"/-/ready\"}[5m]))"
                        + " / clamp_min(sum(rate(alertmanager_http_request_duration_seconds_count{handler!=\"/metrics\",handler!=\"/-/ready\"}[5m])), 0.0001)) * 1000"
        );
        double promAlertmanagerErrorPct = queryPrometheusPercent(
                "(sum(rate(alertmanager_http_request_duration_seconds_count{handler!=\"/metrics\",handler!=\"/-/ready\",code=~\"4..|5..\"}[5m]))"
                        + " / clamp_min(sum(rate(alertmanager_http_request_duration_seconds_count{handler!=\"/metrics\",handler!=\"/-/ready\"}[5m])), 0.0001)) * 100"
        );

        double loadScale = Math.max(0.10d, runtimeProfile.profilePct / 100.0d);
        double queueDepth = counts.queued + (counts.deferred * 0.75d);
        double queuePressure = Math.min(1.0d, queueDepth / 20.0d);
        double runningPressure = Math.min(1.0d, counts.running / 10.0d);
        double failurePressure = Math.min(1.0d, counts.failed / 8.0d);
        double governancePressure = Math.min(1.0d, (counts.running + counts.queued) / 16.0d);
        double operatorTrafficMBps = Math.max(0.0d, infrastructure.governanceOperatorReadCurrentMBps);
        double curationTrafficMBps = Math.max(0.0d, infrastructure.governanceCurationCurrentMBps);
        double backendGovernanceCurrentMBps = Math.max(
                18 + governancePressure * 120,
                operatorTrafficMBps + curationTrafficMBps
        );
        double governanceRedisLatencyMs = infrastructure.governanceRedisLatencyMs;
        double governanceRedisErrorPct = infrastructure.governanceRedisErrorPct;
        double governanceMinioLatencyMs = infrastructure.governanceMinioLatencyMs;
        double governanceMinioErrorPct = infrastructure.governanceMinioErrorPct;
        double pulsarIngressMeasuredMBps = preferMeasured(
                infrastructure.pulsarIngressMBps,
                infrastructure.governancePulsarIngestCurrentMBps
        );
        double pulsarDownstreamMeasuredMBps = preferMeasured(
                infrastructure.pulsarEgressMBps,
                infrastructure.governancePulsarIngestCurrentMBps
        );
        double combinedFrontendBackendCurrentMBps = sumMeasured(
                frontendBackendCurrentMBps,
                frontendBackendApiCurrentMBps
        );
        double combinedFrontendBackendLatencyMs = weightedMeasuredAverage(
                frontendBackendLatencyMs,
                frontendBackendRequestRate,
                frontendBackendApiLatencyMs,
                frontendBackendApiRequestRate
        );
        double combinedFrontendBackendErrorPct = weightedMeasuredAverage(
                frontendBackendErrorPct,
                frontendBackendRequestRate,
                frontendBackendApiErrorPct,
                frontendBackendApiRequestRate
        );

        setMeasuredOrDerivedLink(
                "frontend->backend",
                40,
                combinedFrontendBackendCurrentMBps,
                5 + loadScale * 8,
                combinedFrontendBackendLatencyMs > 0.0d ? combinedFrontendBackendLatencyMs : 14 + loadScale * 8,
                combinedFrontendBackendErrorPct >= 0.0d ? combinedFrontendBackendErrorPct : failurePressure * 0.10d
        );
        setMeasuredOrDerivedLink(
                "frontend->nginx",
                40,
                frontendNginxCurrentMBps,
                4 + loadScale * 7,
                frontendNginxLatencyMs > 0.0d ? frontendNginxLatencyMs : 10 + loadScale * 4,
                frontendNginxErrorPct >= 0.0d ? frontendNginxErrorPct : 0.01d
        );
        setMeasuredOrDerivedLink(
                "backend->java-governance",
                220,
                nestGovernanceCurrentMBps,
                backendGovernanceCurrentMBps,
                nestGovernanceLatencyMs > 0.0d
                        ? nestGovernanceLatencyMs
                        : (governanceHttpLatencyMs > 0.0d ? governanceHttpLatencyMs : 18 + governancePressure * 22),
                nestGovernanceErrorPct >= 0.0d
                        ? nestGovernanceErrorPct
                        : (governanceHttpErrorPct >= 0.0d ? governanceHttpErrorPct : failurePressure * 0.24d)
        );
        setMeasuredOrDerivedLink(
                "backend->redis",
                24,
                nestRedisCurrentMBps,
                0.35d + loadScale * 0.8d,
                nestRedisLatencyMs > 0.0d ? nestRedisLatencyMs : 5 + loadScale * 2,
                nestRedisErrorPct >= 0.0d ? nestRedisErrorPct : 0.01d
        );
        setMeasuredOrDerivedLink(
                "backend->prom",
                60,
                backendPromCurrentMBps,
                4 + loadScale * 8,
                backendPromLatencyMs > 0.0d ? backendPromLatencyMs : 12 + loadScale * 5,
                backendPromErrorPct >= 0.0d ? backendPromErrorPct : 0.01d
        );

        setMeasuredOrDerivedLink(
                "data-generator->pulsar",
                2800,
                pulsarIngressMeasuredMBps,
                observedIngestMBps * 0.52d,
                pulsarIngestLatencyMs > 0.0d ? pulsarIngestLatencyMs : 16 + loadScale * 12,
                pulsarIngestErrorPct >= 0.0d ? pulsarIngestErrorPct : failurePressure * 0.04d
        );
        setMeasuredOrDerivedLink(
                "data-generator->kafka",
                3200,
                generatorToKafkaMBps,
                observedIngestMBps,
                18 + loadScale * 16,
                failurePressure * 0.03d
        );
        setMeasuredOrDerivedLink(
                "data-generator->array-main",
                2200,
                generatorArrayMainMBps,
                observedIngestMBps * 0.46d,
                20 + loadScale * 10,
                0.02d
        );
        setMeasuredOrDerivedLink(
                "data-generator->array-lbl",
                1200,
                generatorArrayLblMBps,
                observedIngestMBps * 0.22d,
                18 + loadScale * 8,
                0.02d
        );
        setMeasuredOrDerivedLink(
                "data-generator->array-sba",
                1200,
                generatorArraySbaMBps,
                observedIngestMBps * 0.20d,
                18 + loadScale * 8,
                0.02d
        );

        setMeasuredOrDerivedLink(
                "pulsar->kafka",
                2400,
                pulsarDownstreamMeasuredMBps,
                observedIngestMBps * 0.44d,
                pulsarIngestLatencyMs > 0.0d ? pulsarIngestLatencyMs : 22 + loadScale * 12,
                pulsarIngestErrorPct >= 0.0d ? pulsarIngestErrorPct : 0.03d
        );
        setMeasuredOrDerivedLink(
                "pulsar->java-governance",
                1600,
                infrastructure.governancePulsarIngestCurrentMBps,
                6 + counts.queued * 3 + counts.running * 8,
                pulsarIngestLatencyMs > 0.0d ? pulsarIngestLatencyMs : 19 + queuePressure * 14,
                pulsarIngestErrorPct >= 0.0d ? pulsarIngestErrorPct : 0.03d + failurePressure * 0.12d
        );
        setLink("zookeeper->kafka", 100, 3 + runtimeProfile.workers * 1.2d, 8 + queuePressure * 4, 0.01d);
        setMeasuredOrDerivedLink(
                "rabbitmq->java-governance",
                260,
                infrastructure.rabbitmqCurrentMBps,
                10 + queueDepth * 7 + counts.failed * 4,
                rabbitIngestLatencyMs > 0.0d ? rabbitIngestLatencyMs : 18 + queuePressure * 18,
                rabbitIngestErrorPct >= 0.0d ? rabbitIngestErrorPct : 0.10d + failurePressure * 0.30d
        );
        setMeasuredOrDerivedLink(
                "kafka->java-governance",
                1600,
                infrastructure.governanceKafkaIngestCurrentMBps,
                8 + counts.queued * 4 + counts.running * 10,
                kafkaIngestLatencyMs > 0.0d ? kafkaIngestLatencyMs : 20 + queuePressure * 14,
                kafkaIngestErrorPct >= 0.0d ? kafkaIngestErrorPct : 0.03d + failurePressure * 0.14d
        );
        setMeasuredOrDerivedLink(
                "java-governance->rabbitmq",
                220,
                infrastructure.governanceRabbitmqCurrentMBps,
                6 + counts.completed * 0.8d + counts.failed * 1.6d,
                rabbitPublishLatencyMs > 0.0d ? rabbitPublishLatencyMs : 16 + queuePressure * 10,
                rabbitPublishErrorPct >= 0.0d ? rabbitPublishErrorPct : 0.04d + failurePressure * 0.18d
        );
        setMeasuredOrDerivedLink(
                "java-governance->kafka",
                720,
                governanceToKafkaMBps,
                30 + counts.running * 28 + loadScale * 90,
                20 + runningPressure * 16,
                0.03d + failurePressure * 0.20d
        );
        setMeasuredOrDerivedLink(
                "java-governance->minio",
                2800,
                infrastructure.minioCurrentMBps,
                observedIngestMBps * (0.55d + runningPressure * 0.20d),
                governanceMinioLatencyMs > 0.0d ? governanceMinioLatencyMs : 26 + runningPressure * 18,
                governanceMinioErrorPct >= 0.0d ? governanceMinioErrorPct : 0.02d + failurePressure * 0.12d
        );
        setMeasuredOrDerivedLink(
                "java-governance->redis",
                320,
                infrastructure.redisCurrentMBps,
                12 + queueDepth * 9 + counts.running * 6,
                governanceRedisLatencyMs > 0.0d ? governanceRedisLatencyMs : 12 + queuePressure * 12,
                governanceRedisErrorPct >= 0.0d ? governanceRedisErrorPct : 0.02d
        );
        setMeasuredOrDerivedLink(
                "kafka->java-ingest",
                2800,
                ingestFromKafkaMBps,
                observedIngestMBps * 0.82d,
                javaIngestLatencyMs > 0.0d ? javaIngestLatencyMs : 24 + loadScale * 16,
                javaIngestErrorPct >= 0.0d ? javaIngestErrorPct : 0.03d + failurePressure * 0.10d
        );

        setLink("prom->grafana", 120, 8 + loadScale * 6, 10 + loadScale * 4, 0.01d);
        setMeasuredOrDerivedLink(
                "prom->alertmanager",
                80,
                promAlertmanagerCurrentMBps,
                3 + failurePressure * 10,
                promAlertmanagerLatencyMs > 0.0d ? promAlertmanagerLatencyMs : 12 + failurePressure * 9,
                promAlertmanagerErrorPct >= 0.0d ? promAlertmanagerErrorPct : 0.01d
        );
        setLink("loki->grafana", 100, 5 + runningPressure * 10, 11 + runningPressure * 6, 0.01d);

        setMeasuredOrDerivedLink(
                "array-main->minio",
                2600,
                generatorArrayMainMBps,
                observedIngestMBps * 0.48d,
                28 + loadScale * 16,
                0.02d
        );
        setMeasuredOrDerivedLink(
                "array-lbl->minio",
                1400,
                generatorArrayLblMBps,
                observedIngestMBps * 0.24d,
                26 + loadScale * 12,
                0.02d
        );
        setMeasuredOrDerivedLink(
                "array-sba->minio",
                1400,
                generatorArraySbaMBps,
                observedIngestMBps * 0.21d,
                26 + loadScale * 12,
                0.02d
        );
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
        out.put("nodeActivity", nodeActivityMap());
        return out;
    }

    private void registerCanonicalLinks() {
        registerLink("frontend", "backend", "http");
        registerLink("frontend", "nginx", "http");
        registerLink("backend", "java-governance", "http");
        registerLink("backend", "redis", "cache");
        registerLink("backend", "prom", "http");
        registerLink("data-generator", "pulsar", "stream");
        registerLink("data-generator", "kafka", "stream");
        registerLink("data-generator", "array-main", "array");
        registerLink("data-generator", "array-lbl", "array");
        registerLink("data-generator", "array-sba", "array");
        registerLink("pulsar", "kafka", "stream");
        registerLink("pulsar", "java-governance", "stream");
        registerLink("zookeeper", "kafka", "control");
        registerLink("rabbitmq", "java-governance", "broker");
        registerLink("kafka", "java-governance", "stream");
        registerLink("java-governance", "rabbitmq", "broker");
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
        telemetry.metricSource = "derived";
    }

    private void setMeasuredOrDerivedLink(
            String key,
            double maxMBps,
            double measuredCurrentMBps,
            double derivedCurrentMBps,
            double latencyMs,
            double errorRatePct
    ) {
        LinkTelemetry telemetry = links.get(key);
        if (telemetry == null) {
            return;
        }
        telemetry.maxMBps = Math.max(1.0d, maxMBps);
        boolean live = measuredCurrentMBps >= 0.0d;
        double current = live ? measuredCurrentMBps : derivedCurrentMBps;
        telemetry.currentMBps = Math.max(0.0d, Math.min(telemetry.maxMBps, current));
        telemetry.latencyMs = Math.max(1.0d, latencyMs);
        telemetry.errorRatePct = Math.max(0.0d, errorRatePct);
        telemetry.metricSource = live ? "prometheus" : "derived";
    }

    private Map<String, Object> linkMap() {
        Map<String, Object> out = new LinkedHashMap<>();
        for (LinkTelemetry telemetry : links.values()) {
            out.put(telemetry.key(), Map.of(
                    "currentMBps", round2(telemetry.currentMBps),
                    "maxMBps", round2(telemetry.maxMBps),
                    "latencyMs", round2(telemetry.latencyMs),
                    "errorRatePct", round2(telemetry.errorRatePct),
                    "confidencePct", confidencePct(telemetry),
                    "transport", telemetry.transport,
                    "source", telemetry.metricSource
            ));
        }
        return out;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> nodeActivityMap() {
        Map<String, Object> out = new LinkedHashMap<>();
        try {
            Map<String, Object> snapshot = infrastructureTelemetryService.snapshot();
            Object servicesObj = snapshot.get("services");
            if (!(servicesObj instanceof Map<?, ?> services)) {
                return out;
            }

            Map<String, Object> governanceRuntime = safeServiceMap(services.get("governanceRuntime"));
            Map<String, Object> executors = safeServiceMap(governanceRuntime.get("executors"));

            out.put("java-governance", Map.of(
                    "businessRatePerSec", round2(
                            sumValues(
                                    governanceRuntime.get("submissionRatePerSec"),
                                    governanceRuntime.get("dispatchRatePerSec"),
                                    governanceRuntime.get("transitionRatePerSec"),
                                    governanceRuntime.get("datasetMutationRatePerSec"),
                                    governanceRuntime.get("jobMetadataMutationRatePerSec"),
                                    governanceRuntime.get("operatorReadRatePerSec")
                            )
                    ),
                    "businessBytesPerSec", round2(
                            sumValues(
                                    governanceRuntime.get("artifactPayloadBytesPerSec"),
                                    governanceRuntime.get("operatorReadBytesPerSec"),
                                    governanceRuntime.get("datasetMutationPayloadBytesPerSec"),
                                    governanceRuntime.get("jobMetadataMutationPayloadBytesPerSec")
                            )
                    ),
                    "executorLabels", executorLabels(executors)
            ));
            out.put("backend", Map.of(
                    "businessRatePerSec", round2(
                            sumValues(
                                    governanceRuntime.get("operatorReadRatePerSec"),
                                    governanceRuntime.get("datasetMutationRatePerSec")
                            )
                    ),
                    "businessBytesPerSec", round2(
                            sumValues(
                                    governanceRuntime.get("operatorReadBytesPerSec"),
                                    governanceRuntime.get("datasetMutationPayloadBytesPerSec")
                            )
                    )
            ));
            out.put("redis", Map.of(
                    "businessRatePerSec", round2(
                            sumValues(
                                    governanceRuntime.get("redisReadRatePerSec"),
                                    governanceRuntime.get("redisWriteRatePerSec")
                            )
                    ),
                    "businessBytesPerSec", round2(
                            sumValues(
                                    governanceRuntime.get("redisReadBytesPerSec"),
                                    governanceRuntime.get("redisWriteBytesPerSec")
                            )
                    )
            ));
            out.put("minio", Map.of(
                    "businessRatePerSec", round2(toDouble(governanceRuntime.get("minioObjectWriteRatePerSec"))),
                    "businessBytesPerSec", round2(toDouble(governanceRuntime.get("minioObjectWriteBytesPerSec")))
            ));
            out.put("rabbitmq", Map.of(
                    "businessRatePerSec", round2(
                            sumValues(
                                    governanceRuntime.get("rabbitmqPublishRatePerSec"),
                                    governanceRuntime.get("rabbitIngestReceiveRatePerSec")
                            )
                    ),
                    "businessBytesPerSec", round2(
                            sumValues(
                                    governanceRuntime.get("rabbitmqPublishBytesPerSec"),
                                    governanceRuntime.get("rabbitIngestPayloadBytesPerSec")
                            )
                    )
            ));
            out.put("kafka", Map.of(
                    "businessRatePerSec", round2(toDouble(governanceRuntime.get("kafkaIngestReceiveRatePerSec"))),
                    "businessBytesPerSec", round2(toDouble(governanceRuntime.get("kafkaIngestPayloadBytesPerSec")))
            ));
            out.put("pulsar", Map.of(
                    "businessRatePerSec", round2(toDouble(governanceRuntime.get("pulsarIngestReceiveRatePerSec"))),
                    "businessBytesPerSec", round2(toDouble(governanceRuntime.get("pulsarIngestPayloadBytesPerSec")))
            ));
        } catch (Exception ignored) {
            return out;
        }
        return out;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> safeServiceMap(Object value) {
        if (value instanceof Map<?, ?> map) {
            return (Map<String, Object>) map;
        }
        return Map.of();
    }

    private List<String> executorLabels(Map<String, Object> executors) {
        List<Map.Entry<String, Double>> ranked = new ArrayList<>();
        for (Map.Entry<String, Object> entry : executors.entrySet()) {
            Map<String, Object> metrics = safeServiceMap(entry.getValue());
            double score = sumValues(
                    metrics.get("dispatchRatePerSec"),
                    metrics.get("completedRatePerSec"),
                    metrics.get("failedRatePerSec"),
                    metrics.get("objectWriteRatePerSec")
            );
            if (score > 0.0d) {
                ranked.add(Map.entry(entry.getKey(), score));
            }
        }
        ranked.sort((left, right) -> Double.compare(right.getValue(), left.getValue()));
        List<String> labels = new ArrayList<>();
        for (int i = 0; i < Math.min(3, ranked.size()); i++) {
            Map.Entry<String, Double> entry = ranked.get(i);
            labels.add(entry.getKey() + " " + round2(entry.getValue()) + "/s");
        }
        return labels;
    }

    private int confidencePct(LinkTelemetry telemetry) {
        int base = switch (telemetry.metricSource) {
            case "prometheus" -> 96;
            case "admin" -> 84;
            case "derived" -> 48;
            case "mock" -> 24;
            default -> 0;
        };
        if (base == 0) {
            return 0;
        }
        double errorPenalty = Math.min(24.0d, telemetry.errorRatePct * 6.0d);
        double latencyPenalty = telemetry.metricSource.equals("prometheus")
                ? Math.max(0.0d, (telemetry.latencyMs - 120.0d) / 15.0d)
                : 0.0d;
        int adjusted = (int) Math.round(base - errorPenalty - latencyPenalty);
        return Math.max(0, Math.min(100, adjusted));
    }

    @SuppressWarnings("unchecked")
    private InfrastructureMetrics collectInfrastructureMetrics() {
        try {
            Map<String, Object> snapshot = infrastructureTelemetryService.snapshot();
            Object servicesObj = snapshot.get("services");
            if (!(servicesObj instanceof Map<?, ?> services)) {
                return InfrastructureMetrics.unavailable();
            }
            return new InfrastructureMetrics(
                    serviceCurrentMBps((Map<String, Object>) services.get("rabbitmq"), "rabbitmq"),
                    preferMeasured(
                            serviceCurrentMBps((Map<String, Object>) services.get("governanceRuntime"), "governance-redis"),
                            serviceCurrentMBps((Map<String, Object>) services.get("redis"), "redis")
                    ),
                    preferMeasured(
                            serviceCurrentMBps((Map<String, Object>) services.get("governanceRuntime"), "governance-minio-object"),
                            serviceCurrentMBps((Map<String, Object>) services.get("minio"), "minio")
                    ),
                    serviceCurrentMBps((Map<String, Object>) services.get("pulsar"), "pulsar"),
                    serviceCurrentMBps((Map<String, Object>) services.get("pulsar"), "pulsar-egress"),
                    serviceCurrentMBps((Map<String, Object>) services.get("governanceRuntime"), "governance-pulsar-ingest"),
                    serviceCurrentMBps((Map<String, Object>) services.get("governanceRuntime"), "governance-rabbitmq"),
                    serviceCurrentMBps((Map<String, Object>) services.get("governanceRuntime"), "governance-kafka-ingest"),
                    serviceCurrentMBps((Map<String, Object>) services.get("governanceRuntime"), "governance-operator-read"),
                    serviceCurrentMBps((Map<String, Object>) services.get("governanceRuntime"), "governance-curation"),
                    serviceLatencyMs((Map<String, Object>) services.get("governanceRuntime"), "governance-redis"),
                    serviceErrorPct((Map<String, Object>) services.get("governanceRuntime"), "governance-redis"),
                    serviceLatencyMs((Map<String, Object>) services.get("governanceRuntime"), "governance-minio-object"),
                    serviceErrorPct((Map<String, Object>) services.get("governanceRuntime"), "governance-minio-object")
            );
        } catch (Exception ignored) {
            return InfrastructureMetrics.unavailable();
        }
    }

    private double serviceCurrentMBps(Map<String, Object> service, String name) {
        if (service == null) {
            return -1.0d;
        }
        if (!"prometheus".equals(String.valueOf(service.get("source")))) {
            return -1.0d;
        }
        return switch (name) {
            case "rabbitmq" -> toMBps(
                    toDouble(service.get("publishRatePerSec")) * 2048.0d,
                    toDouble(service.get("deliverRatePerSec")) * 2048.0d
            );
            case "redis" -> toMBps(
                    toDouble(service.get("ingressBytesPerSec")),
                    toDouble(service.get("egressBytesPerSec"))
            );
            case "minio" -> toMBps(
                    toDouble(service.get("ingressBytesPerSec")),
                    toDouble(service.get("egressBytesPerSec"))
            );
            case "pulsar" -> toMBps(toDouble(service.get("ingressBytesPerSec")));
            case "pulsar-egress" -> toMBps(toDouble(service.get("egressBytesPerSec")));
            case "governance-rabbitmq" -> toMBps(toDouble(service.get("rabbitmqPublishBytesPerSec")));
            case "governance-kafka-ingest" -> toMBps(toDouble(service.get("kafkaIngestPayloadBytesPerSec")));
            case "governance-pulsar-ingest" -> toMBps(toDouble(service.get("pulsarIngestPayloadBytesPerSec")));
            case "governance-operator-read" -> toMBps(toDouble(service.get("operatorReadBytesPerSec")));
            case "governance-curation" -> toMBps(
                    toDouble(service.get("datasetMutationPayloadBytesPerSec")),
                    toDouble(service.get("jobMetadataMutationPayloadBytesPerSec"))
            );
            case "governance-redis" -> toMBps(
                    toDouble(service.get("redisReadBytesPerSec")),
                    toDouble(service.get("redisWriteBytesPerSec"))
            );
            case "governance-object" -> toMBps(toDouble(service.get("objectWriteBytesPerSec")));
            case "governance-minio-object" -> toMBps(toDouble(service.get("minioObjectWriteBytesPerSec")));
            default -> -1.0d;
        };
    }

    private double preferMeasured(double preferred, double fallback) {
        return preferred >= 0.0d ? preferred : fallback;
    }

    private double sumMeasured(double... values) {
        double total = 0.0d;
        boolean any = false;
        for (double value : values) {
            if (value >= 0.0d) {
                total += value;
                any = true;
            }
        }
        return any ? total : -1.0d;
    }

    private double weightedMeasuredAverage(
            double primaryValue,
            double primaryWeight,
            double secondaryValue,
            double secondaryWeight
    ) {
        double weightedTotal = 0.0d;
        double totalWeight = 0.0d;
        if (primaryValue >= 0.0d && primaryWeight > 0.0d) {
            weightedTotal += primaryValue * primaryWeight;
            totalWeight += primaryWeight;
        }
        if (secondaryValue >= 0.0d && secondaryWeight > 0.0d) {
            weightedTotal += secondaryValue * secondaryWeight;
            totalWeight += secondaryWeight;
        }
        if (totalWeight > 0.0d) {
            return weightedTotal / totalWeight;
        }
        if (primaryValue >= 0.0d) {
            return primaryValue;
        }
        return secondaryValue >= 0.0d ? secondaryValue : -1.0d;
    }

    private double serviceLatencyMs(Map<String, Object> service, String name) {
        if (service == null || !"prometheus".equals(String.valueOf(service.get("source")))) {
            return -1.0d;
        }
        return switch (name) {
            case "governance-redis" -> toDouble(service.get("redisAvgLatencyMs"));
            case "governance-minio-object" -> toDouble(service.get("minioObjectWriteAvgLatencyMs"));
            default -> -1.0d;
        };
    }

    private double serviceErrorPct(Map<String, Object> service, String name) {
        if (service == null || !"prometheus".equals(String.valueOf(service.get("source")))) {
            return -1.0d;
        }
        return switch (name) {
            case "governance-redis" -> toDouble(service.get("redisErrorRatePct"));
            case "governance-minio-object" -> toDouble(service.get("minioObjectWriteErrorRatePct"));
            default -> -1.0d;
        };
    }

    private double sumValues(Object... values) {
        double total = 0.0d;
        for (Object value : values) {
            total += Math.max(0.0d, toDouble(value));
        }
        return total;
    }

    private double toMBps(double... rawValues) {
        double totalBytesPerSecond = 0.0d;
        for (double rawValue : rawValues) {
            totalBytesPerSecond += Math.max(0.0d, rawValue);
        }
        return totalBytesPerSecond / (1024.0d * 1024.0d);
    }

    private double toDouble(Object rawValue) {
        try {
            return rawValue == null ? 0.0d : Double.parseDouble(String.valueOf(rawValue));
        } catch (Exception ignored) {
            return 0.0d;
        }
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

    private double fetchPrometheusIngestMBps() {
        double generatorMBps = queryPrometheusMBps("sum(rate(generator_bytes_produced_total[1m]))");
        if (generatorMBps >= 0.0d) {
            return generatorMBps;
        }
        return queryPrometheusMBps("sum(rate(application_network_bytes_total[1m]))");
    }

    private double queryPrometheusMBps(String query) {
        MetricValue metric = queryScalar(query);
        return metric.live() ? metric.value() / (1024.0d * 1024.0d) : -1.0d;
    }

    private double queryPrometheusValue(String query) {
        MetricValue metric = queryScalar(query);
        return metric.live() ? metric.value() : -1.0d;
    }

    private double queryPrometheusMs(String query) {
        MetricValue metric = queryScalar(query);
        return metric.live() ? metric.value() : -1.0d;
    }

    private double queryPrometheusPercent(String query) {
        MetricValue metric = queryScalar(query);
        return metric.live() ? metric.value() : -1.0d;
    }

    @SuppressWarnings("unchecked")
    private MetricValue queryScalar(String query) {
        String base = resolvePrometheusBaseUrl();
        if (base == null || base.isBlank()) {
            return MetricValue.unavailable();
        }

        try {
            String url = base + "/api/v1/query?query=" + URLEncoder.encode(query, StandardCharsets.UTF_8);
            ResponseEntity<Map> response = restTemplate.getForEntity(url, Map.class);
            if (!response.getStatusCode().is2xxSuccessful() || response.getBody() == null) {
                return MetricValue.unavailable();
            }
            Object dataObj = response.getBody().get("data");
            if (!(dataObj instanceof Map<?, ?> dataMap)) {
                return MetricValue.unavailable();
            }
            Object resultObj = dataMap.get("result");
            if (!(resultObj instanceof List<?> resultList) || resultList.isEmpty()) {
                return MetricValue.unavailable();
            }
            Object first = resultList.get(0);
            if (!(first instanceof Map<?, ?> firstMap)) {
                return MetricValue.unavailable();
            }
            Object valueObj = firstMap.get("value");
            if (!(valueObj instanceof List<?> valueList) || valueList.size() < 2) {
                return MetricValue.unavailable();
            }
            return MetricValue.live(Double.parseDouble(String.valueOf(valueList.get(1))));
        } catch (Exception ignored) {
            return MetricValue.unavailable();
        }
    }

    private String resolvePrometheusBaseUrl() {
        String base = prometheusBaseUrl;
        if (base == null || base.isBlank()) {
            base = System.getenv("PROMETHEUS_BASE_URL");
        }
        if (base == null || base.isBlank()) {
            base = System.getenv("PROMETHEUS_BASEURL");
        }
        return base;
    }

    private double round2(double value) {
        return Math.round(value * 100.0d) / 100.0d;
    }

    private record RuntimeProfile(int profilePct, int workers, String note) {}

    private record JobCounts(int queued, int running, int failed, int completed, int deferred) {}

    private record InfrastructureMetrics(
            double rabbitmqCurrentMBps,
            double redisCurrentMBps,
            double minioCurrentMBps,
            double pulsarIngressMBps,
            double pulsarEgressMBps,
            double governancePulsarIngestCurrentMBps,
            double governanceRabbitmqCurrentMBps,
            double governanceKafkaIngestCurrentMBps,
            double governanceOperatorReadCurrentMBps,
            double governanceCurationCurrentMBps,
            double governanceRedisLatencyMs,
            double governanceRedisErrorPct,
            double governanceMinioLatencyMs,
            double governanceMinioErrorPct
    ) {
        private static InfrastructureMetrics unavailable() {
            return new InfrastructureMetrics(
                    -1.0d, -1.0d, -1.0d, -1.0d, -1.0d,
                    -1.0d, -1.0d, -1.0d, -1.0d, -1.0d,
                    -1.0d, -1.0d, -1.0d, -1.0d
            );
        }
    }

    private record MetricValue(double value, boolean live) {
        private static MetricValue unavailable() {
            return new MetricValue(0.0d, false);
        }

        private static MetricValue live(double value) {
            return new MetricValue(value, true);
        }
    }

    private static final class LinkTelemetry {
        private final String source;
        private final String target;
        private final String transport;
        private volatile double currentMBps;
        private volatile double maxMBps;
        private volatile double latencyMs;
        private volatile double errorRatePct;
        private volatile String metricSource = "derived";

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
