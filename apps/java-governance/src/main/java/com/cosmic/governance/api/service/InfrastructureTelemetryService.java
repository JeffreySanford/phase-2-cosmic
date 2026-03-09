package com.cosmic.governance.api.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.pulsar.client.admin.PulsarAdmin;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class InfrastructureTelemetryService {
    private static final Logger log = LoggerFactory.getLogger(InfrastructureTelemetryService.class);
    private final RestTemplate restTemplate = new RestTemplate();
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final JobService jobService;

    public InfrastructureTelemetryService(JobService jobService) {
        this.jobService = jobService;
    }

    @Value("${prometheus.baseUrl:}")
    private String prometheusBaseUrl;

    @Value("${pulsar.admin.url:http://localhost:8085}")
    private String pulsarAdminUrl;

    public Map<String, Object> snapshot() {
        ServiceSnapshot redis = redisSnapshot();
        ServiceSnapshot rabbitmq = rabbitmqSnapshot();
        ServiceSnapshot minio = minioSnapshot();
        ServiceSnapshot nginx = nginxSnapshot();
        ServiceSnapshot frontendSsr = frontendSsrSnapshot();
        ServiceSnapshot dataGenerator = dataGeneratorSnapshot();
        ServiceSnapshot kafka = kafkaSnapshot();
        ServiceSnapshot javaIngest = javaIngestSnapshot();
        ServiceSnapshot pulsar = pulsarSnapshot();
        ServiceSnapshot grafana = grafanaSnapshot();
        ServiceSnapshot loki = lokiSnapshot();
        ServiceSnapshot alertmanager = alertmanagerSnapshot();
        ServiceSnapshot governanceRuntime = governanceRuntimeSnapshot();

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("measuredAt", Instant.now().toString());
        out.put("source", overallSource(
                redis,
                rabbitmq,
                minio,
                nginx,
                frontendSsr,
                dataGenerator,
                kafka,
                javaIngest,
                pulsar,
                grafana,
                loki,
                alertmanager,
                governanceRuntime
        ));
        Map<String, Object> services = new LinkedHashMap<>();
        services.put("redis", redis.payload());
        services.put("rabbitmq", rabbitmq.payload());
        services.put("minio", minio.payload());
        services.put("nginx", nginx.payload());
        services.put("frontendSsr", frontendSsr.payload());
        services.put("dataGenerator", dataGenerator.payload());
        services.put("kafka", kafka.payload());
        services.put("javaIngest", javaIngest.payload());
        services.put("pulsar", pulsar.payload());
        services.put("grafana", grafana.payload());
        services.put("loki", loki.payload());
        services.put("alertmanager", alertmanager.payload());
        services.put("governanceRuntime", governanceRuntime.payload());
        out.put("services", services);
        return out;
    }

    private ServiceSnapshot redisSnapshot() {
        MetricValue opsPerSec = queryScalar("sum(redis_commands_processed_total offset 1m)");
        MetricValue opsRate = queryScalar("sum(rate(redis_commands_processed_total[1m]))");
        MetricValue ingressBps = queryScalar("sum(rate(redis_net_input_bytes_total[1m]))");
        MetricValue egressBps = queryScalar("sum(rate(redis_net_output_bytes_total[1m]))");
        MetricValue connectedClients = queryScalar("sum(redis_connected_clients)");
        MetricValue memoryUsedBytes = queryScalar("sum(redis_memory_used_bytes)");

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("source", sourceOf(opsRate, ingressBps, egressBps, connectedClients, memoryUsedBytes));
        payload.put("opsPerSec", round2(opsRate.value()));
        payload.put("ingressBytesPerSec", round2(ingressBps.value()));
        payload.put("egressBytesPerSec", round2(egressBps.value()));
        payload.put("connectedClients", round2(connectedClients.value()));
        payload.put("memoryUsedBytes", round2(memoryUsedBytes.value()));
        payload.put("counterSample", round2(opsPerSec.value()));
        return new ServiceSnapshot(payload);
    }

    private ServiceSnapshot rabbitmqSnapshot() {
        MetricValue queueDepth = queryScalar("sum(rabbitmq_queue_messages)");
        MetricValue readyDepth = queryScalar("sum(rabbitmq_queue_messages_ready)");
        MetricValue unackedDepth = queryScalar("sum(rabbitmq_queue_messages_unacknowledged)");
        MetricValue publishRate = queryScalar(
                "sum(rate(rabbitmq_published_total[1m]))"
                        + " or sum(rate(rabbitmq_queue_messages_published_total[1m]))"
        );
        MetricValue deliverRate = queryScalar(
                "sum(rate(rabbitmq_consumed_total[1m]))"
                        + " or sum(rate(rabbitmq_queue_messages_delivered_total[1m]))"
        );
        MetricValue consumers = queryScalar("sum(rabbitmq_consumers)");

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("source", sourceOf(queueDepth, publishRate, deliverRate, consumers));
        payload.put("queueDepth", round2(queueDepth.value()));
        payload.put("readyMessages", round2(readyDepth.value()));
        payload.put("unackedMessages", round2(unackedDepth.value()));
        payload.put("publishRatePerSec", round2(publishRate.value()));
        payload.put("deliverRatePerSec", round2(deliverRate.value()));
        payload.put("consumers", round2(consumers.value()));
        return new ServiceSnapshot(payload);
    }

    private ServiceSnapshot minioSnapshot() {
        MetricValue ingressBps = queryScalar("sum(rate(minio_s3_traffic_received_bytes[1m]))");
        MetricValue egressBps = queryScalar("sum(rate(minio_s3_traffic_sent_bytes[1m]))");
        MetricValue requestRate = queryScalar("sum(rate(minio_s3_requests_incoming_total[1m]))");
        MetricValue errorsRate = queryScalar(
                "sum(rate(minio_s3_requests_rejected_auth_total[1m]))"
                        + " or sum(rate(minio_s3_requests_rejected_header_total[1m]))"
                        + " or sum(rate(minio_s3_requests_rejected_invalid_total[1m]))"
                        + " or sum(rate(minio_s3_requests_rejected_timestamp_total[1m]))"
        );

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("source", sourceOf(ingressBps, egressBps, requestRate, errorsRate));
        payload.put("ingressBytesPerSec", round2(ingressBps.value()));
        payload.put("egressBytesPerSec", round2(egressBps.value()));
        payload.put("requestsPerSec", round2(requestRate.value()));
        payload.put("errorRatePerSec", round2(errorsRate.value()));
        return new ServiceSnapshot(payload);
    }

    private ServiceSnapshot nginxSnapshot() {
        MetricValue requestRate = queryScalar("sum(rate(nginx_static_http_response_count_total[1m]))");
        MetricValue ingressBps = queryScalar("sum(rate(nginx_static_http_request_size_bytes[1m]))");
        MetricValue egressBps = queryScalar("sum(rate(nginx_static_http_response_size_bytes[1m]))");
        MetricValue errorRate = queryScalar("sum(rate(nginx_static_http_response_count_total{status=~\"4..|5..\"}[1m]))");
        MetricValue avgLatencyMs = queryScalar(
                "(sum(rate(nginx_static_http_response_time_seconds_sum[5m]))"
                        + " / clamp_min(sum(rate(nginx_static_http_response_time_seconds_count[5m])), 0.0001)) * 1000"
        );

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("source", sourceOf(requestRate, ingressBps, egressBps, errorRate, avgLatencyMs));
        payload.put("requestsPerSec", round2(requestRate.value()));
        payload.put("ingressBytesPerSec", round2(ingressBps.value()));
        payload.put("egressBytesPerSec", round2(egressBps.value()));
        payload.put("errorRatePerSec", round2(errorRate.value()));
        payload.put("avgLatencyMs", round2(avgLatencyMs.value()));
        return new ServiceSnapshot(payload);
    }

    private ServiceSnapshot frontendSsrSnapshot() {
        MetricValue connected = queryScalar("sum(frontend_ssr_redis_client_connected)");
        MetricValue hitRate = queryScalar("sum(rate(frontend_ssr_redis_cache_requests_total{result=\"hit\"}[1m]))");
        MetricValue missRate = queryScalar("sum(rate(frontend_ssr_redis_cache_requests_total{result=\"miss\"}[1m]))");
        MetricValue bypassRate = queryScalar("sum(rate(frontend_ssr_redis_cache_requests_total{result=\"bypass\"}[1m]))");
        MetricValue servedBps = queryScalar("sum(rate(frontend_ssr_redis_cache_bytes_served_total[1m]))");
        MetricValue writtenBps = queryScalar("sum(rate(frontend_ssr_redis_cache_bytes_written_total[1m]))");
        MetricValue errorRate = queryScalar("sum(rate(frontend_ssr_redis_cache_errors_total[1m]))");
        MetricValue avgLatencyMs = queryScalar(
                "(sum(rate(frontend_ssr_redis_cache_request_duration_seconds_sum[5m]))"
                        + " / clamp_min(sum(rate(frontend_ssr_redis_cache_request_duration_seconds_count[5m])), 0.0001)) * 1000"
        );
        MetricValue governanceProxyRate = queryScalar(
                "sum(rate(frontend_ssr_governance_proxy_requests_total{route=~\"governance_api|telemetry_infrastructure|topology_metrics\"}[1m]))"
        );
        MetricValue governanceProxyBps = queryScalar(
                "sum(rate(frontend_ssr_governance_proxy_response_bytes_total{route=~\"governance_api|telemetry_infrastructure|topology_metrics\"}[1m]))"
        );
        MetricValue governanceProxyErrorRate = queryScalar(
                "sum(rate(frontend_ssr_governance_proxy_requests_total{route=~\"governance_api|telemetry_infrastructure|topology_metrics\",status_class=~\"4xx|5xx\"}[1m]))"
        );
        MetricValue governanceProxyLatencyMs = queryScalar(
                "(sum(rate(frontend_ssr_governance_proxy_request_duration_seconds_sum{route=~\"governance_api|telemetry_infrastructure|topology_metrics\"}[5m]))"
                        + " / clamp_min(sum(rate(frontend_ssr_governance_proxy_request_duration_seconds_count{route=~\"governance_api|telemetry_infrastructure|topology_metrics\"}[5m])), 0.0001)) * 1000"
        );
        MetricValue prometheusProxyRate = queryScalar(
                "sum(rate(frontend_ssr_prometheus_proxy_requests_total[1m]))"
        );
        MetricValue prometheusProxyBps = queryScalar(
                "sum(rate(frontend_ssr_prometheus_proxy_response_bytes_total[1m]))"
        );
        MetricValue prometheusProxyErrorRate = queryScalar(
                "sum(rate(frontend_ssr_prometheus_proxy_requests_total{status_class=~\"4xx|5xx\"}[1m]))"
        );
        MetricValue prometheusProxyLatencyMs = queryScalar(
                "(sum(rate(frontend_ssr_prometheus_proxy_request_duration_seconds_sum[5m]))"
                        + " / clamp_min(sum(rate(frontend_ssr_prometheus_proxy_request_duration_seconds_count[5m])), 0.0001)) * 1000"
        );
        MetricValue frontendRequestRate = queryScalar(
                "sum(rate(frontend_ssr_frontend_requests_total[1m]))"
        );
        MetricValue frontendResponseBps = queryScalar(
                "sum(rate(frontend_ssr_frontend_response_bytes_total[1m]))"
        );
        MetricValue frontendErrorRate = queryScalar(
                "sum(rate(frontend_ssr_frontend_requests_total{status_class=~\"4xx|5xx\"}[1m]))"
        );
        MetricValue frontendLatencyMs = queryScalar(
                "(sum(rate(frontend_ssr_frontend_request_duration_seconds_sum[5m]))"
                        + " / clamp_min(sum(rate(frontend_ssr_frontend_request_duration_seconds_count[5m])), 0.0001)) * 1000"
        );
        MetricValue frontendApiRequestRate = queryScalar(
                "sum(rate(frontend_ssr_frontend_api_requests_total[1m]))"
        );
        MetricValue frontendApiResponseBps = queryScalar(
                "sum(rate(frontend_ssr_frontend_api_response_bytes_total[1m]))"
        );
        MetricValue frontendApiErrorRate = queryScalar(
                "sum(rate(frontend_ssr_frontend_api_requests_total{status_class=~\"4xx|5xx\"}[1m]))"
        );
        MetricValue frontendApiLatencyMs = queryScalar(
                "(sum(rate(frontend_ssr_frontend_api_request_duration_seconds_sum[5m]))"
                        + " / clamp_min(sum(rate(frontend_ssr_frontend_api_request_duration_seconds_count[5m])), 0.0001)) * 1000"
        );
        Map<String, Double> routeRequestRates = frontendRouteRequestRates();
        Map<String, Double> apiRouteRequestRates = frontendApiRouteRequestRates();

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("source", sourceOf(
                connected,
                hitRate,
                missRate,
                bypassRate,
                servedBps,
                writtenBps,
                errorRate,
                avgLatencyMs,
                governanceProxyRate,
                governanceProxyBps,
                governanceProxyErrorRate,
                governanceProxyLatencyMs,
                prometheusProxyRate,
                prometheusProxyBps,
                prometheusProxyErrorRate,
                prometheusProxyLatencyMs,
                frontendRequestRate,
                frontendResponseBps,
                frontendErrorRate,
                frontendLatencyMs,
                frontendApiRequestRate,
                frontendApiResponseBps,
                frontendApiErrorRate,
                frontendApiLatencyMs
        ));
        payload.put("connectedClients", round2(connected.value()));
        payload.put("hitRatePerSec", round2(hitRate.value()));
        payload.put("missRatePerSec", round2(missRate.value()));
        payload.put("bypassRatePerSec", round2(bypassRate.value()));
        payload.put("ingressBytesPerSec", round2(writtenBps.value()));
        payload.put("egressBytesPerSec", round2(servedBps.value()));
        payload.put("errorRatePerSec", round2(errorRate.value()));
        payload.put("avgLatencyMs", round2(avgLatencyMs.value()));
        payload.put("governanceProxyRatePerSec", round2(governanceProxyRate.value()));
        payload.put("governanceProxyBytesPerSec", round2(governanceProxyBps.value()));
        payload.put("governanceProxyErrorRatePerSec", round2(governanceProxyErrorRate.value()));
        payload.put("governanceProxyLatencyMs", round2(governanceProxyLatencyMs.value()));
        payload.put("prometheusProxyRatePerSec", round2(prometheusProxyRate.value()));
        payload.put("prometheusProxyBytesPerSec", round2(prometheusProxyBps.value()));
        payload.put("prometheusProxyErrorRatePerSec", round2(prometheusProxyErrorRate.value()));
        payload.put("prometheusProxyLatencyMs", round2(prometheusProxyLatencyMs.value()));
        payload.put("frontendRequestRatePerSec", round2(frontendRequestRate.value()));
        payload.put("frontendResponseBytesPerSec", round2(frontendResponseBps.value()));
        payload.put("frontendErrorRatePerSec", round2(frontendErrorRate.value()));
        payload.put("frontendRequestLatencyMs", round2(frontendLatencyMs.value()));
        payload.put("frontendApiRequestRatePerSec", round2(frontendApiRequestRate.value()));
        payload.put("frontendApiResponseBytesPerSec", round2(frontendApiResponseBps.value()));
        payload.put("frontendApiErrorRatePerSec", round2(frontendApiErrorRate.value()));
        payload.put("frontendApiLatencyMs", round2(frontendApiLatencyMs.value()));
        payload.put("routeRequestRatesPerSec", routeRequestRates);
        payload.put("apiRouteRequestRatesPerSec", apiRouteRequestRates);
        return new ServiceSnapshot(payload);
    }

    private Map<String, Double> frontendRouteRequestRates() {
        List<String> routeGroups = List.of(
                "landing",
                "dashboard",
                "telemetry",
                "topology",
                "jobs",
                "viewer",
                "datasets",
                "diagnostics",
                "settings",
                "other"
        );
        Map<String, Double> out = new LinkedHashMap<>();
        for (String routeGroup : routeGroups) {
            MetricValue rate = queryScalar(
                    "sum(rate(frontend_ssr_frontend_requests_total{route_group=\"" + routeGroup + "\"}[1m]))"
            );
            if (rate.live() || rate.value() > 0) {
                out.put(routeGroup, round2(rate.value()));
            }
        }
        return out;
    }

    private Map<String, Double> frontendApiRouteRequestRates() {
        List<String> routeGroups = List.of(
                "telemetry",
                "alerts",
                "commissioning",
                "health",
                "pulsar",
                "rabbitmq",
                "vo",
                "jobs",
                "admin",
                "public_sources",
                "other"
        );
        Map<String, Double> out = new LinkedHashMap<>();
        for (String routeGroup : routeGroups) {
            MetricValue rate = queryScalar(
                    "sum(rate(frontend_ssr_frontend_api_requests_total{api_group=\"" + routeGroup + "\"}[1m]))"
            );
            if (rate.live() || rate.value() > 0) {
                out.put(routeGroup, round2(rate.value()));
            }
        }
        return out;
    }

    private ServiceSnapshot dataGeneratorSnapshot() {
        MetricValue totalBps = queryScalar("sum(rate(generator_bytes_produced_total[1m]))");
        MetricValue totalRecordsPerSec = queryScalar("sum(rate(generator_records_produced_total[1m]))");
        MetricValue mainSegmentBps = queryScalar(
                "sum(rate(generator_bytes_produced_by_segment_total{array_segment=\"main\"}[1m]))"
        );
        MetricValue lblSegmentBps = queryScalar(
                "sum(rate(generator_bytes_produced_by_segment_total{array_segment=\"lbl\"}[1m]))"
        );
        MetricValue sbaSegmentBps = queryScalar(
                "sum(rate(generator_bytes_produced_by_segment_total{array_segment=\"sba\"}[1m]))"
        );
        MetricValue mainSegmentRecordsPerSec = queryScalar(
                "sum(rate(generator_records_produced_by_segment_total{array_segment=\"main\"}[1m]))"
        );
        MetricValue lblSegmentRecordsPerSec = queryScalar(
                "sum(rate(generator_records_produced_by_segment_total{array_segment=\"lbl\"}[1m]))"
        );
        MetricValue sbaSegmentRecordsPerSec = queryScalar(
                "sum(rate(generator_records_produced_by_segment_total{array_segment=\"sba\"}[1m]))"
        );

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("source", sourceOf(
                totalBps,
                totalRecordsPerSec,
                mainSegmentBps,
                lblSegmentBps,
                sbaSegmentBps,
                mainSegmentRecordsPerSec,
                lblSegmentRecordsPerSec,
                sbaSegmentRecordsPerSec
        ));
        payload.put("egressBytesPerSec", round2(totalBps.value()));
        payload.put("recordsPerSec", round2(totalRecordsPerSec.value()));
        payload.put("mainSegmentBytesPerSec", round2(mainSegmentBps.value()));
        payload.put("lblSegmentBytesPerSec", round2(lblSegmentBps.value()));
        payload.put("sbaSegmentBytesPerSec", round2(sbaSegmentBps.value()));
        payload.put("mainSegmentRecordsPerSec", round2(mainSegmentRecordsPerSec.value()));
        payload.put("lblSegmentRecordsPerSec", round2(lblSegmentRecordsPerSec.value()));
        payload.put("sbaSegmentRecordsPerSec", round2(sbaSegmentRecordsPerSec.value()));
        return new ServiceSnapshot(payload);
    }

    private ServiceSnapshot kafkaSnapshot() {
        MetricValue brokers = queryScalar("sum(kafka_brokers)");
        MetricValue topics = queryScalar("count(count by (topic) (kafka_topic_partitions))");
        MetricValue consumerLag = queryScalar("sum(kafka_consumergroup_lag_sum)");
        MetricValue ingressBps = queryScalar("sum(rate(generator_bytes_produced_total[1m]))");
        MetricValue egressBps = queryScalar(
                "sum(rate(kafka_consumer_fetch_manager_bytes_consumed_total{job=\"java-ingest\"}[1m]))"
                        + " or sum(rate(kafka_consumer_consumer_fetch_manager_metrics_bytes_consumed_total{job=\"java-ingest\"}[1m]))"
        );

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("source", sourceOf(brokers, topics, consumerLag, ingressBps, egressBps));
        payload.put("brokers", round2(brokers.value()));
        payload.put("topics", round2(topics.value()));
        payload.put("consumerLag", round2(consumerLag.value()));
        payload.put("ingressBytesPerSec", round2(ingressBps.value()));
        payload.put("egressBytesPerSec", round2(egressBps.value()));
        return new ServiceSnapshot(payload);
    }

    private ServiceSnapshot javaIngestSnapshot() {
        MetricValue receiveRate = queryScalar("sum(rate(java_ingest_received_total[1m]))");
        MetricValue processedRate = queryScalar("sum(rate(java_ingest_processed_total[1m]))");
        MetricValue validationFailureRate = queryScalar("sum(rate(java_ingest_validation_failures_total[1m]))");
        MetricValue failureRate = queryScalar("sum(rate(java_ingest_failures_total[1m]))");
        MetricValue retryRate = queryScalar("sum(rate(java_ingest_retry_total[1m]))");
        MetricValue dlqRate = queryScalar("sum(rate(java_ingest_dlq_total[1m]))");
        MetricValue payloadBps = queryScalar("sum(rate(java_ingest_payload_bytes_sum[1m]))");
        MetricValue avgLatencyMs = queryScalar(
                "(sum(rate(java_ingest_processing_duration_seconds_sum[5m]))"
                        + " / clamp_min(sum(rate(java_ingest_processing_duration_seconds_count[5m])), 0.0001)) * 1000"
        );

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("source", sourceOf(
                receiveRate,
                processedRate,
                validationFailureRate,
                failureRate,
                retryRate,
                dlqRate,
                payloadBps,
                avgLatencyMs
        ));
        payload.put("receiveRatePerSec", round2(receiveRate.value()));
        payload.put("processedRatePerSec", round2(processedRate.value()));
        payload.put("validationFailureRatePerSec", round2(validationFailureRate.value()));
        payload.put("failureRatePerSec", round2(failureRate.value()));
        payload.put("retryRatePerSec", round2(retryRate.value()));
        payload.put("dlqRatePerSec", round2(dlqRate.value()));
        payload.put("payloadBytesPerSec", round2(payloadBps.value()));
        payload.put("avgLatencyMs", round2(avgLatencyMs.value()));
        return new ServiceSnapshot(payload);
    }

    private ServiceSnapshot pulsarSnapshot() {
        MetricValue ingressBps = queryScalar(
                "sum(rate(pulsar_broker_in_bytes_total[1m]))"
                        + " or sum(rate(pulsar_in_bytes_total[1m]))"
                        + " or sum(pulsar_broker_throughput_in)"
                        + " or sum(pulsar_rate_in * pulsar_average_msg_size)"
                        + " or sum(pulsar_throughput_in)"
        );
        MetricValue egressBps = queryScalar(
                "sum(rate(pulsar_broker_out_bytes_total[1m]))"
                        + " or sum(rate(pulsar_out_bytes_total[1m]))"
                        + " or sum(pulsar_broker_throughput_out)"
                        + " or sum(pulsar_throughput_out)"
        );
        MetricValue msgInRate = queryScalar(
                "sum(rate(pulsar_broker_in_messages_total[1m]))"
                        + " or sum(rate(pulsar_in_messages_total[1m]))"
                        + " or sum(pulsar_broker_rate_in)"
                        + " or sum(pulsar_rate_in)"
        );
        MetricValue msgOutRate = queryScalar(
                "sum(rate(pulsar_broker_out_messages_total[1m]))"
                        + " or sum(rate(pulsar_out_messages_total[1m]))"
                        + " or sum(pulsar_broker_rate_out)"
                        + " or sum(pulsar_rate_out)"
        );

        try (PulsarAdmin admin = PulsarAdmin.builder()
                .serviceHttpUrl(pulsarAdminUrl)
                .build()) {
            int brokers = 0;
            List<String> clusters = admin.clusters().getClusters();
            if (!clusters.isEmpty()) {
                brokers = admin.brokers().getActiveBrokers(clusters.get(0)).size();
            }

            int topics = 0;
            int partitions = 0;
            try {
                List<String> tenants = admin.tenants().getTenants();
                for (String tenant : tenants) {
                    List<String> namespaces = admin.namespaces().getNamespaces(tenant);
                    for (String namespace : namespaces) {
                        List<String> topicList = admin.topics().getList(namespace);
                        topics += topicList.size();
                        for (String topic : topicList) {
                            try {
                                var metadata = admin.topics().getPartitionedTopicMetadata(topic);
                                partitions += metadata.partitions > 0 ? metadata.partitions : 1;
                            } catch (Exception ignored) {
                                partitions += 1;
                            }
                        }
                    }
                }
            } catch (Exception e) {
                log.debug("Pulsar admin namespace enumeration failed: {}", e.toString());
                topics = -1;
                partitions = -1;
            }

            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("source", sourceOf(ingressBps, egressBps, msgInRate, msgOutRate).equals("prometheus")
                    ? "prometheus"
                    : "admin");
            payload.put("brokers", round2(brokers));
            payload.put("topics", round2(topics));
            payload.put("partitions", round2(partitions));
            payload.put("status", brokers > 0 ? "healthy" : "degraded");
            payload.put("ingressBytesPerSec", round2(ingressBps.value()));
            payload.put("egressBytesPerSec", round2(egressBps.value()));
            payload.put("publishRatePerSec", round2(msgInRate.value()));
            payload.put("deliverRatePerSec", round2(msgOutRate.value()));
            return new ServiceSnapshot(payload);
        } catch (Exception e) {
            log.warn("Pulsar admin snapshot unavailable from {}: {}", pulsarAdminUrl, e.toString());
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("source", "unavailable");
            payload.put("brokers", 0.0d);
            payload.put("topics", 0.0d);
            payload.put("partitions", 0.0d);
            payload.put("status", "unavailable");
            return new ServiceSnapshot(payload);
        }
    }

    private ServiceSnapshot grafanaSnapshot() {
        MetricValue requestRate = queryScalar(
                "sum(rate(grafana_http_request_duration_seconds_count{handler!=\"/metrics\"}[1m]))"
        );
        MetricValue errorRate = queryScalar(
                "sum(rate(grafana_http_request_duration_seconds_count{handler!=\"/metrics\",status_code=~\"4..|5..\"}[1m]))"
        );
        MetricValue avgLatencyMs = queryScalar(
                "(sum(rate(grafana_http_request_duration_seconds_sum{handler!=\"/metrics\"}[5m]))"
                        + " / clamp_min(sum(rate(grafana_http_request_duration_seconds_count{handler!=\"/metrics\"}[5m])), 0.0001)) * 1000"
        );
        MetricValue dataproxyRate = queryScalar(
                "sum(rate(grafana_api_dataproxy_request_all_milliseconds_count[1m]))"
        );
        MetricValue dataproxyLatencyMs = queryScalar(
                "sum(rate(grafana_api_dataproxy_request_all_milliseconds_sum[5m]))"
                        + " / clamp_min(sum(rate(grafana_api_dataproxy_request_all_milliseconds_count[5m])), 0.0001)"
        );
        MetricValue datasources = queryScalar("sum(grafana_stat_totals_datasource)");
        MetricValue activeAlerts = queryScalar("sum(grafana_alerting_active_alerts)");

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("source", sourceOf(
                requestRate,
                errorRate,
                avgLatencyMs,
                dataproxyRate,
                dataproxyLatencyMs,
                datasources,
                activeAlerts
        ));
        payload.put("requestsPerSec", round2(requestRate.value()));
        payload.put("errorRatePerSec", round2(errorRate.value()));
        payload.put("avgLatencyMs", round2(avgLatencyMs.value()));
        payload.put("dataproxyRatePerSec", round2(dataproxyRate.value()));
        payload.put("dataproxyLatencyMs", round2(dataproxyLatencyMs.value()));
        payload.put("datasources", round2(datasources.value()));
        payload.put("activeAlerts", round2(activeAlerts.value()));
        return new ServiceSnapshot(payload);
    }

    private ServiceSnapshot lokiSnapshot() {
        MetricValue requestRate = queryScalar(
                "sum(rate(loki_request_duration_seconds_count{route!~\"metrics|ready\"}[1m]))"
        );
        MetricValue ingressBps = queryScalar(
                "sum(rate(loki_request_message_bytes_sum{route!~\"metrics|ready\"}[1m]))"
        );
        MetricValue egressBps = queryScalar(
                "sum(rate(loki_response_message_bytes_sum{route!~\"metrics|ready\"}[1m]))"
        );
        MetricValue errorRate = queryScalar(
                "sum(rate(loki_request_duration_seconds_count{route!~\"metrics|ready\",status_code=~\"4..|5..\"}[1m]))"
        );
        MetricValue avgLatencyMs = queryScalar(
                "(sum(rate(loki_request_duration_seconds_sum{route!~\"metrics|ready\"}[5m]))"
                        + " / clamp_min(sum(rate(loki_request_duration_seconds_count{route!~\"metrics|ready\"}[5m])), 0.0001)) * 1000"
        );
        MetricValue inflight = queryScalar("sum(loki_inflight_requests{route!~\"metrics|ready\"})");

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("source", sourceOf(requestRate, ingressBps, egressBps, errorRate, avgLatencyMs, inflight));
        payload.put("requestsPerSec", round2(requestRate.value()));
        payload.put("ingressBytesPerSec", round2(ingressBps.value()));
        payload.put("egressBytesPerSec", round2(egressBps.value()));
        payload.put("errorRatePerSec", round2(errorRate.value()));
        payload.put("avgLatencyMs", round2(avgLatencyMs.value()));
        payload.put("inflightRequests", round2(inflight.value()));
        return new ServiceSnapshot(payload);
    }

    private ServiceSnapshot alertmanagerSnapshot() {
        MetricValue requestRate = queryScalar(
                "sum(rate(alertmanager_http_request_duration_seconds_count{handler!=\"/metrics\",handler!=\"/-/ready\"}[1m]))"
        );
        MetricValue egressBps = queryScalar(
                "sum(rate(alertmanager_http_response_size_bytes_sum{handler!=\"/metrics\",handler!=\"/-/ready\"}[1m]))"
        );
        MetricValue errorRate = queryScalar(
                "sum(rate(alertmanager_http_request_duration_seconds_count{handler!=\"/metrics\",handler!=\"/-/ready\",code=~\"4..|5..\"}[1m]))"
        );
        MetricValue avgLatencyMs = queryScalar(
                "(sum(rate(alertmanager_http_request_duration_seconds_sum{handler!=\"/metrics\",handler!=\"/-/ready\"}[5m]))"
                        + " / clamp_min(sum(rate(alertmanager_http_request_duration_seconds_count{handler!=\"/metrics\",handler!=\"/-/ready\"}[5m])), 0.0001)) * 1000"
        );
        MetricValue alertsReceived = queryScalar("sum(rate(alertmanager_alerts_received_total[1m]))");
        MetricValue activeAlerts = queryScalar("sum(alertmanager_alerts{state=\"active\"})");

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("source", sourceOf(requestRate, egressBps, errorRate, avgLatencyMs, alertsReceived, activeAlerts));
        payload.put("requestsPerSec", round2(requestRate.value()));
        payload.put("egressBytesPerSec", round2(egressBps.value()));
        payload.put("errorRatePerSec", round2(errorRate.value()));
        payload.put("avgLatencyMs", round2(avgLatencyMs.value()));
        payload.put("alertsReceivedRatePerSec", round2(alertsReceived.value()));
        payload.put("activeAlerts", round2(activeAlerts.value()));
        return new ServiceSnapshot(payload);
    }

    private ServiceSnapshot governanceRuntimeSnapshot() {
        MetricValue submissionRate = queryScalar("sum(rate(governance_job_submissions_total[5m]))");
        MetricValue dispatchRate = queryScalar("sum(rate(governance_job_dispatch_total[5m]))");
        MetricValue transitionRate = queryScalar("sum(rate(governance_job_transitions_total[5m]))");
        MetricValue artifactRate = queryScalar("sum(rate(governance_job_artifacts_total[5m]))");
        MetricValue artifactPayloadBps = queryScalar("sum(rate(governance_job_artifact_payload_bytes_sum[5m]))");
        MetricValue rabbitmqPublishRate = queryScalar("sum(rate(governance_rabbitmq_publish_total{result=\"success\"}[5m]))");
        MetricValue rabbitmqPublishBps = queryScalar("sum(rate(governance_rabbitmq_publish_payload_bytes_sum[5m]))");
        MetricValue kafkaPublishRate = queryScalar("sum(rate(governance_kafka_publish_total{result=\"success\"}[5m]))");
        MetricValue kafkaPublishBps = queryScalar("sum(rate(governance_kafka_publish_payload_bytes_sum[5m]))");
        MetricValue kafkaPublishLatencyMs = queryScalar(
                "(sum(rate(governance_kafka_publish_duration_seconds_sum[5m]))"
                        + " / clamp_min(sum(rate(governance_kafka_publish_duration_seconds_count[5m])), 0.0001)) * 1000"
        );
        MetricValue kafkaPublishErrorRate = queryScalar("sum(rate(governance_kafka_publish_total{result=\"failure\"}[5m]))");
        MetricValue redisReadRate = queryScalar("sum(rate(governance_redis_reads_total[5m]))");
        MetricValue redisWriteRate = queryScalar("sum(rate(governance_redis_writes_total[5m]))");
        MetricValue redisReadBps = queryScalar("sum(rate(governance_redis_read_payload_bytes_sum[5m]))");
        MetricValue redisWriteBps = queryScalar("sum(rate(governance_redis_write_payload_bytes_sum[5m]))");
        MetricValue redisAvgLatencyMs = queryScalar(
                "(sum(rate(governance_redis_operation_duration_seconds_sum{store=\"redis\"}[5m]))"
                        + " / clamp_min(sum(rate(governance_redis_operation_duration_seconds_count{store=\"redis\"}[5m])), 0.0001)) * 1000"
        );
        MetricValue redisErrorRatePct = queryScalar(
                "(sum(rate(governance_redis_operations_total{store=\"redis\",result=\"failure\"}[5m]))"
                        + " / clamp_min(sum(rate(governance_redis_operations_total{store=\"redis\"}[5m])), 0.0001)) * 100"
        );
        MetricValue objectWriteRate = queryScalar("sum(rate(governance_object_writes_total[5m]))");
        MetricValue objectWriteBps = queryScalar("sum(rate(governance_object_write_payload_bytes_sum[5m]))");
        MetricValue minioObjectWriteRate = queryScalar("sum(rate(governance_object_writes_total{storage=\"minio\"}[5m]))");
        MetricValue minioObjectWriteBps = queryScalar("sum(rate(governance_object_write_payload_bytes_sum{storage=\"minio\"}[5m]))");
        MetricValue minioObjectWriteAvgLatencyMs = queryScalar(
                "(sum(rate(governance_object_write_duration_seconds_sum{storage=\"minio\"}[5m]))"
                        + " / clamp_min(sum(rate(governance_object_write_duration_seconds_count{storage=\"minio\"}[5m])), 0.0001)) * 1000"
        );
        MetricValue minioObjectWriteErrorRatePct = queryScalar(
                "(sum(rate(governance_object_write_attempts_total{storage=\"minio\",result=\"failure\"}[5m]))"
                        + " / clamp_min(sum(rate(governance_object_write_attempts_total{storage=\"minio\"}[5m])), 0.0001)) * 100"
        );
        MetricValue localObjectWriteRate = queryScalar("sum(rate(governance_object_writes_total{storage!=\"minio\"}[5m]))");
        MetricValue localObjectWriteBps = queryScalar("sum(rate(governance_object_write_payload_bytes_sum{storage!=\"minio\"}[5m]))");
        MetricValue artifactReadRate = queryScalar("sum(rate(governance_artifact_reads_total{result=\"success\"}[5m]))");
        MetricValue artifactReadBps = queryScalar("sum(rate(governance_artifact_read_payload_bytes_sum[5m]))");
        MetricValue artifactReadAvgLatencyMs = queryScalar(
                "(sum(rate(governance_artifact_read_duration_seconds_sum{result=\"success\"}[5m]))"
                        + " / clamp_min(sum(rate(governance_artifact_read_duration_seconds_count{result=\"success\"}[5m])), 0.0001)) * 1000"
        );
        MetricValue artifactReadErrorRate = queryScalar("sum(rate(governance_artifact_reads_total{result=\"failure\"}[5m]))");
        MetricValue artifactAvgSizeBytes = queryScalar(
                "sum(rate(governance_job_artifact_payload_bytes_sum[15m]))"
                        + " / clamp_min(sum(rate(governance_job_artifact_payload_bytes_count[15m])), 0.0001)"
        );
        MetricValue kafkaIngestReceiveRate = queryScalar("sum(rate(governance_ingest_received_total{broker=\"kafka\"}[5m]))");
        MetricValue kafkaIngestSuccessRate = queryScalar("sum(rate(governance_ingest_processed_total{broker=\"kafka\"}[5m]))");
        MetricValue kafkaIngestValidationFailureRate = queryScalar("sum(rate(governance_ingest_validation_failures_total{broker=\"kafka\"}[5m]))");
        MetricValue kafkaIngestDlqRate = queryScalar("sum(rate(governance_ingest_dlq_total{broker=\"kafka\"}[5m]))");
        MetricValue kafkaIngestFailureRate = queryScalar("sum(rate(governance_ingest_failures_total{broker=\"kafka\"}[5m]))");
        MetricValue kafkaIngestPayloadBps = queryScalar("sum(rate(governance_ingest_payload_bytes_sum{broker=\"kafka\"}[5m]))");
        MetricValue rabbitIngestReceiveRate = queryScalar("sum(rate(governance_ingest_received_total{broker=\"rabbitmq\"}[5m]))");
        MetricValue rabbitIngestSuccessRate = queryScalar("sum(rate(governance_ingest_processed_total{broker=\"rabbitmq\"}[5m]))");
        MetricValue rabbitIngestValidationFailureRate = queryScalar("sum(rate(governance_ingest_validation_failures_total{broker=\"rabbitmq\"}[5m]))");
        MetricValue rabbitIngestDlqRate = queryScalar("sum(rate(governance_ingest_dlq_total{broker=\"rabbitmq\"}[5m]))");
        MetricValue rabbitIngestFailureRate = queryScalar("sum(rate(governance_ingest_failures_total{broker=\"rabbitmq\"}[5m]))");
        MetricValue rabbitIngestPayloadBps = queryScalar("sum(rate(governance_ingest_payload_bytes_sum{broker=\"rabbitmq\"}[5m]))");
        MetricValue pulsarIngestReceiveRate = queryScalar("sum(rate(governance_ingest_received_total{broker=\"pulsar\"}[5m]))");
        MetricValue pulsarIngestSuccessRate = queryScalar("sum(rate(governance_ingest_processed_total{broker=\"pulsar\"}[5m]))");
        MetricValue pulsarIngestValidationFailureRate = queryScalar("sum(rate(governance_ingest_validation_failures_total{broker=\"pulsar\"}[5m]))");
        MetricValue pulsarIngestDlqRate = queryScalar("sum(rate(governance_ingest_dlq_total{broker=\"pulsar\"}[5m]))");
        MetricValue pulsarIngestFailureRate = queryScalar("sum(rate(governance_ingest_failures_total{broker=\"pulsar\"}[5m]))");
        MetricValue pulsarIngestPayloadBps = queryScalar("sum(rate(governance_ingest_payload_bytes_sum{broker=\"pulsar\"}[5m]))");
        MetricValue datasetMutationRate = queryScalar("sum(rate(governance_dataset_mutations_total[5m]))");
        MetricValue datasetMutationPayloadBps = queryScalar("sum(rate(governance_dataset_mutation_payload_bytes_sum[5m]))");
        MetricValue jobMetadataMutationRate = queryScalar("sum(rate(governance_job_metadata_mutations_total[5m]))");
        MetricValue jobMetadataMutationPayloadBps = queryScalar("sum(rate(governance_job_metadata_mutation_payload_bytes_sum[5m]))");
        MetricValue datasetPublishRate = queryScalar("sum(rate(governance_business_actions_total{resource=\"dataset\",action=\"publish\"}[5m]))");
        MetricValue datasetPublishPayloadBps = queryScalar("sum(rate(governance_business_action_payload_bytes_sum{resource=\"dataset\",action=\"publish\"}[5m]))");
        MetricValue datasetReadRate = queryScalar("sum(rate(governance_business_actions_total{resource=\"dataset\",action=\"read\"}[5m]))");
        MetricValue datasetReadPayloadBps = queryScalar("sum(rate(governance_business_action_payload_bytes_sum{resource=\"dataset\",action=\"read\"}[5m]))");
        MetricValue manifestPublishRate = queryScalar("sum(rate(governance_business_actions_total{resource=\"manifest\",action=\"publish\"}[5m]))");
        MetricValue manifestPublishPayloadBps = queryScalar("sum(rate(governance_business_action_payload_bytes_sum{resource=\"manifest\",action=\"publish\"}[5m]))");
        MetricValue manifestReadRate = queryScalar("sum(rate(governance_business_actions_total{resource=\"manifest\",action=\"read\"}[5m]))");
        MetricValue manifestReadPayloadBps = queryScalar("sum(rate(governance_business_action_payload_bytes_sum{resource=\"manifest\",action=\"read\"}[5m]))");
        MetricValue operatorReadRate = queryScalar("sum(rate(governance_operator_reads_total[5m]))");
        MetricValue operatorReadPayloadBps = queryScalar("sum(rate(governance_operator_read_payload_bytes_sum[5m]))");
        MetricValue httpRequestRate = queryScalar("sum(rate(governance_http_requests_total[5m]))");
        MetricValue httpResponseBps = queryScalar("sum(rate(governance_http_response_bytes_sum[5m]))");
        MetricValue httpErrorRate = queryScalar(
                "sum(rate(governance_http_requests_total{status_class=~\"4xx|5xx\"}[5m]))"
        );
        MetricValue httpLatencyMs = queryScalar(
                "(sum(rate(governance_http_request_duration_seconds_sum[5m]))"
                        + " / clamp_min(sum(rate(governance_http_request_duration_seconds_count[5m])), 0.0001)) * 1000"
        );
        MetricValue restoreDrillRate = queryScalar("sum(rate(governance_restore_drills_total[15m]))");
        MetricValue restoreDrillSuccessRate = queryScalar("sum(rate(governance_restore_drills_total{result=\"success\"}[15m]))");
        MetricValue restoreDrillFailureRate = queryScalar("sum(rate(governance_restore_drills_total{result=\"failure\"}[15m]))");
        MetricValue restoreDrillAvgMs = queryScalar(
                "(sum(rate(governance_restore_drill_duration_ms_sum[15m]))"
                        + " / clamp_min(sum(rate(governance_restore_drill_duration_ms_count[15m])), 0.0001))"
        );
        MetricValue voAdapterRequestRate = queryScalar("sum(rate(governance_external_adapter_requests_total{adapter=\"vo\"}[5m]))");
        MetricValue voAdapterPayloadBps = queryScalar("sum(rate(governance_external_adapter_request_payload_bytes_sum{adapter=\"vo\"}[5m]))");
        MetricValue voAdapterLatencyMs = queryScalar(
                "(sum(rate(governance_external_adapter_request_duration_seconds_sum{adapter=\"vo\"}[5m]))"
                        + " / clamp_min(sum(rate(governance_external_adapter_request_duration_seconds_count{adapter=\"vo\"}[5m])), 0.0001)) * 1000"
        );
        MetricValue voAdapterErrorRate = queryScalar("sum(rate(governance_external_adapter_requests_total{adapter=\"vo\",result=\"failure\"}[5m]))");
        MetricValue taccAdapterRequestRate = queryScalar("sum(rate(governance_external_adapter_requests_total{adapter=\"tacc\"}[5m]))");
        MetricValue taccAdapterPayloadBps = queryScalar("sum(rate(governance_external_adapter_request_payload_bytes_sum{adapter=\"tacc\"}[5m]))");
        MetricValue taccAdapterLatencyMs = queryScalar(
                "(sum(rate(governance_external_adapter_request_duration_seconds_sum{adapter=\"tacc\"}[5m]))"
                        + " / clamp_min(sum(rate(governance_external_adapter_request_duration_seconds_count{adapter=\"tacc\"}[5m])), 0.0001)) * 1000"
        );
        MetricValue taccAdapterErrorRate = queryScalar("sum(rate(governance_external_adapter_requests_total{adapter=\"tacc\",result=\"failure\"}[5m]))");
        MetricValue alertIngestedTotal = queryScalar("sum(alert_ingested_total)");
        MetricValue alertIngestRate = queryScalar("sum(rate(alert_ingested_total[5m]))");
        MetricValue alertReplaysTotal = queryScalar("sum(alert_replays_total)");
        MetricValue alertReplayRate = queryScalar("sum(rate(alert_replays_total[5m]))");
        MetricValue alertDlqDepth = queryScalar("sum(alert_dlq_depth)");
        MetricValue alertReplaySingleSuccessRate = queryScalar("sum(rate(alert_replay_attempts_total{path=\"single\",result=\"success\"}[5m]))");
        MetricValue alertReplaySingleMissRate = queryScalar("sum(rate(alert_replay_attempts_total{path=\"single\",result=\"miss\"}[5m]))");
        MetricValue alertReplayAllSuccessRate = queryScalar("sum(rate(alert_replay_attempts_total{path=\"all\",result=\"success\"}[5m]))");
        MetricValue alertReplayAllEmptyRate = queryScalar("sum(rate(alert_replay_attempts_total{path=\"all\",result=\"empty\"}[5m]))");
        MetricValue alertReplayItemsRate = queryScalar("sum(rate(alert_replay_items_total[5m]))");
        MetricValue alertReplayAvgBatchSize = queryScalar(
                "sum(rate(alert_replay_items_total{path=\"all\",result=\"success\"}[15m]))"
                        + " / clamp_min(sum(rate(alert_replay_attempts_total{path=\"all\",result=\"success\"}[15m])), 0.0001)"
        );
        MetricValue alertReplayAvgLatencyMs = queryScalar(
                "(sum(rate(alert_replay_duration_seconds_sum[5m]))"
                        + " / clamp_min(sum(rate(alert_replay_duration_seconds_count[5m])), 0.0001)) * 1000"
        );
        MetricValue deferredReleaseRate = queryScalar("sum(rate(governance_scheduler_deferred_releases_total[15m]))");
        MetricValue deferredReleaseTotal = queryScalar("sum(governance_scheduler_deferred_releases_total)");
        MetricValue completedTotal = queryScalar("sum(governance_job_terminal_total{result=\"COMPLETED\"})");
        MetricValue failedTotal = queryScalar("sum(governance_job_terminal_total{result=\"FAILED\"})");
        MetricValue completedRate = queryScalar("sum(rate(governance_job_terminal_total{result=\"COMPLETED\"}[5m]))");
        MetricValue failedRate = queryScalar("sum(rate(governance_job_terminal_total{result=\"FAILED\"}[5m]))");
        MetricValue avgCompletionMs = queryScalar(
                "(sum(rate(governance_job_terminal_duration_seconds_sum{result=\"COMPLETED\"}[15m]))"
                        + " / clamp_min(sum(rate(governance_job_terminal_duration_seconds_count{result=\"COMPLETED\"}[15m])), 0.0001)) * 1000"
        );
        MetricValue avgFailureMs = queryScalar(
                "(sum(rate(governance_job_terminal_duration_seconds_sum{result=\"FAILED\"}[15m]))"
                        + " / clamp_min(sum(rate(governance_job_terminal_duration_seconds_count{result=\"FAILED\"}[15m])), 0.0001)) * 1000"
        );
        JobService.SchedulerSnapshot scheduler = jobService.schedulerSnapshot();

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("source", sourceOf(
                submissionRate,
                dispatchRate,
                transitionRate,
                artifactRate,
                artifactPayloadBps,
                rabbitmqPublishRate,
                rabbitmqPublishBps,
                kafkaPublishRate,
                kafkaPublishBps,
                kafkaPublishLatencyMs,
                kafkaPublishErrorRate,
                redisReadRate,
                redisWriteRate,
                redisReadBps,
                redisWriteBps,
                redisAvgLatencyMs,
                redisErrorRatePct,
                objectWriteRate,
                objectWriteBps,
                minioObjectWriteRate,
                minioObjectWriteBps,
                minioObjectWriteAvgLatencyMs,
                minioObjectWriteErrorRatePct,
                localObjectWriteRate,
                localObjectWriteBps,
                artifactReadRate,
                artifactReadBps,
                artifactReadAvgLatencyMs,
                artifactReadErrorRate,
                artifactAvgSizeBytes,
                kafkaIngestReceiveRate,
                kafkaIngestSuccessRate,
                kafkaIngestValidationFailureRate,
                kafkaIngestDlqRate,
                kafkaIngestFailureRate,
                kafkaIngestPayloadBps,
                rabbitIngestReceiveRate,
                rabbitIngestSuccessRate,
                rabbitIngestValidationFailureRate,
                rabbitIngestDlqRate,
                rabbitIngestFailureRate,
                rabbitIngestPayloadBps,
                pulsarIngestReceiveRate,
                pulsarIngestSuccessRate,
                pulsarIngestValidationFailureRate,
                pulsarIngestDlqRate,
                pulsarIngestFailureRate,
                pulsarIngestPayloadBps,
                datasetMutationRate,
                datasetMutationPayloadBps,
                jobMetadataMutationRate,
                jobMetadataMutationPayloadBps,
                datasetPublishRate,
                datasetPublishPayloadBps,
                datasetReadRate,
                datasetReadPayloadBps,
                manifestPublishRate,
                manifestPublishPayloadBps,
                manifestReadRate,
                manifestReadPayloadBps,
                operatorReadRate,
                operatorReadPayloadBps,
                httpRequestRate,
                httpResponseBps,
                httpErrorRate,
                httpLatencyMs,
                voAdapterRequestRate,
                voAdapterPayloadBps,
                voAdapterLatencyMs,
                voAdapterErrorRate,
                taccAdapterRequestRate,
                taccAdapterPayloadBps,
                taccAdapterLatencyMs,
                taccAdapterErrorRate,
                restoreDrillRate,
                restoreDrillSuccessRate,
                restoreDrillFailureRate,
                restoreDrillAvgMs,
                alertIngestedTotal,
                alertIngestRate,
                alertReplaysTotal,
                alertReplayRate,
                alertDlqDepth,
                alertReplaySingleSuccessRate,
                alertReplaySingleMissRate,
                alertReplayAllSuccessRate,
                alertReplayAllEmptyRate,
                alertReplayItemsRate,
                alertReplayAvgBatchSize,
                alertReplayAvgLatencyMs,
                deferredReleaseRate,
                deferredReleaseTotal,
                completedTotal,
                failedTotal,
                completedRate,
                failedRate,
                avgCompletionMs,
                avgFailureMs
        ));
        payload.put("submissionRatePerSec", round2(submissionRate.value()));
        payload.put("dispatchRatePerSec", round2(dispatchRate.value()));
        payload.put("transitionRatePerSec", round2(transitionRate.value()));
        payload.put("artifactRatePerSec", round2(artifactRate.value()));
        payload.put("artifactPayloadBytesPerSec", round2(artifactPayloadBps.value()));
        payload.put("rabbitmqPublishRatePerSec", round2(rabbitmqPublishRate.value()));
        payload.put("rabbitmqPublishBytesPerSec", round2(rabbitmqPublishBps.value()));
        payload.put("kafkaPublishRatePerSec", round2(kafkaPublishRate.value()));
        payload.put("kafkaPublishBytesPerSec", round2(kafkaPublishBps.value()));
        payload.put("kafkaPublishLatencyMs", round2(kafkaPublishLatencyMs.value()));
        payload.put("kafkaPublishErrorRatePerSec", round2(kafkaPublishErrorRate.value()));
        payload.put("redisReadRatePerSec", round2(redisReadRate.value()));
        payload.put("redisWriteRatePerSec", round2(redisWriteRate.value()));
        payload.put("redisReadBytesPerSec", round2(redisReadBps.value()));
        payload.put("redisWriteBytesPerSec", round2(redisWriteBps.value()));
        payload.put("redisAvgLatencyMs", round2(redisAvgLatencyMs.value()));
        payload.put("redisErrorRatePct", round2(redisErrorRatePct.value()));
        payload.put("objectWriteRatePerSec", round2(objectWriteRate.value()));
        payload.put("objectWriteBytesPerSec", round2(objectWriteBps.value()));
        payload.put("minioObjectWriteRatePerSec", round2(minioObjectWriteRate.value()));
        payload.put("minioObjectWriteBytesPerSec", round2(minioObjectWriteBps.value()));
        payload.put("minioObjectWriteAvgLatencyMs", round2(minioObjectWriteAvgLatencyMs.value()));
        payload.put("minioObjectWriteErrorRatePct", round2(minioObjectWriteErrorRatePct.value()));
        payload.put("localObjectWriteRatePerSec", round2(localObjectWriteRate.value()));
        payload.put("localObjectWriteBytesPerSec", round2(localObjectWriteBps.value()));
        payload.put("artifactReadRatePerSec", round2(artifactReadRate.value()));
        payload.put("artifactReadBytesPerSec", round2(artifactReadBps.value()));
        payload.put("artifactReadAvgLatencyMs", round2(artifactReadAvgLatencyMs.value()));
        payload.put("artifactReadErrorRatePerSec", round2(artifactReadErrorRate.value()));
        payload.put("artifactAvgSizeBytes", round2(artifactAvgSizeBytes.value()));
        payload.put("kafkaIngestReceiveRatePerSec", round2(kafkaIngestReceiveRate.value()));
        payload.put("kafkaIngestSuccessRatePerSec", round2(kafkaIngestSuccessRate.value()));
        payload.put("kafkaIngestValidationFailureRatePerSec", round2(kafkaIngestValidationFailureRate.value()));
        payload.put("kafkaIngestDlqRatePerSec", round2(kafkaIngestDlqRate.value()));
        payload.put("kafkaIngestFailureRatePerSec", round2(kafkaIngestFailureRate.value()));
        payload.put("kafkaIngestPayloadBytesPerSec", round2(kafkaIngestPayloadBps.value()));
        payload.put("kafkaIngestValidationReasonRatesPerSec", ingestReasonRates("kafka", "validation"));
        payload.put("kafkaIngestDuplicateReasonRatesPerSec", ingestReasonRates("kafka", "duplicate"));
        payload.put("rabbitIngestReceiveRatePerSec", round2(rabbitIngestReceiveRate.value()));
        payload.put("rabbitIngestSuccessRatePerSec", round2(rabbitIngestSuccessRate.value()));
        payload.put("rabbitIngestValidationFailureRatePerSec", round2(rabbitIngestValidationFailureRate.value()));
        payload.put("rabbitIngestDlqRatePerSec", round2(rabbitIngestDlqRate.value()));
        payload.put("rabbitIngestFailureRatePerSec", round2(rabbitIngestFailureRate.value()));
        payload.put("rabbitIngestPayloadBytesPerSec", round2(rabbitIngestPayloadBps.value()));
        payload.put("rabbitIngestValidationReasonRatesPerSec", ingestReasonRates("rabbitmq", "validation"));
        payload.put("rabbitIngestDuplicateReasonRatesPerSec", ingestReasonRates("rabbitmq", "duplicate"));
        payload.put("pulsarIngestReceiveRatePerSec", round2(pulsarIngestReceiveRate.value()));
        payload.put("pulsarIngestSuccessRatePerSec", round2(pulsarIngestSuccessRate.value()));
        payload.put("pulsarIngestValidationFailureRatePerSec", round2(pulsarIngestValidationFailureRate.value()));
        payload.put("pulsarIngestDlqRatePerSec", round2(pulsarIngestDlqRate.value()));
        payload.put("pulsarIngestFailureRatePerSec", round2(pulsarIngestFailureRate.value()));
        payload.put("pulsarIngestPayloadBytesPerSec", round2(pulsarIngestPayloadBps.value()));
        payload.put("pulsarIngestValidationReasonRatesPerSec", ingestReasonRates("pulsar", "validation"));
        payload.put("pulsarIngestDuplicateReasonRatesPerSec", ingestReasonRates("pulsar", "duplicate"));
        payload.put("datasetMutationRatePerSec", round2(datasetMutationRate.value()));
        payload.put("datasetMutationPayloadBytesPerSec", round2(datasetMutationPayloadBps.value()));
        payload.put("jobMetadataMutationRatePerSec", round2(jobMetadataMutationRate.value()));
        payload.put("jobMetadataMutationPayloadBytesPerSec", round2(jobMetadataMutationPayloadBps.value()));
        payload.put("datasetPublishRatePerSec", round2(datasetPublishRate.value()));
        payload.put("datasetPublishPayloadBytesPerSec", round2(datasetPublishPayloadBps.value()));
        payload.put("datasetReadRatePerSec", round2(datasetReadRate.value()));
        payload.put("datasetReadPayloadBytesPerSec", round2(datasetReadPayloadBps.value()));
        payload.put("manifestPublishRatePerSec", round2(manifestPublishRate.value()));
        payload.put("manifestPublishPayloadBytesPerSec", round2(manifestPublishPayloadBps.value()));
        payload.put("manifestReadRatePerSec", round2(manifestReadRate.value()));
        payload.put("manifestReadPayloadBytesPerSec", round2(manifestReadPayloadBps.value()));
        payload.put("operatorReadRatePerSec", round2(operatorReadRate.value()));
        payload.put("operatorReadBytesPerSec", round2(operatorReadPayloadBps.value()));
        payload.put("operatorReadRouteRatesPerSec", operatorReadRouteRates());
        payload.put("httpRequestRatePerSec", round2(httpRequestRate.value()));
        payload.put("httpResponseBytesPerSec", round2(httpResponseBps.value()));
        payload.put("httpErrorRatePerSec", round2(httpErrorRate.value()));
        payload.put("httpLatencyMs", round2(httpLatencyMs.value()));
        payload.put("httpRouteRequestRatesPerSec", governanceHttpRouteRequestRates());
        payload.put("voAdapterRequestRatePerSec", round2(voAdapterRequestRate.value()));
        payload.put("voAdapterPayloadBytesPerSec", round2(voAdapterPayloadBps.value()));
        payload.put("voAdapterLatencyMs", round2(voAdapterLatencyMs.value()));
        payload.put("voAdapterErrorRatePerSec", round2(voAdapterErrorRate.value()));
        payload.put("voAdapterFailureClassRatesPerSec", externalAdapterFailureRates("vo"));
        payload.put("voAdapterOperationRatesPerSec", externalAdapterOperationRates("vo"));
        payload.put("taccAdapterRequestRatePerSec", round2(taccAdapterRequestRate.value()));
        payload.put("taccAdapterPayloadBytesPerSec", round2(taccAdapterPayloadBps.value()));
        payload.put("taccAdapterLatencyMs", round2(taccAdapterLatencyMs.value()));
        payload.put("taccAdapterErrorRatePerSec", round2(taccAdapterErrorRate.value()));
        payload.put("taccAdapterFailureClassRatesPerSec", externalAdapterFailureRates("tacc"));
        payload.put("taccAdapterOperationRatesPerSec", externalAdapterOperationRates("tacc"));
        payload.put("restoreDrillRatePerSec", round2(restoreDrillRate.value()));
        payload.put("restoreDrillSuccessRatePerSec", round2(restoreDrillSuccessRate.value()));
        payload.put("restoreDrillFailureRatePerSec", round2(restoreDrillFailureRate.value()));
        payload.put("avgRestoreDrillLatencyMs", round2(restoreDrillAvgMs.value()));
        payload.put("alertIngestedTotal", round2(alertIngestedTotal.value()));
        payload.put("alertIngestRatePerSec", round2(alertIngestRate.value()));
        payload.put("alertReplaysTotal", round2(alertReplaysTotal.value()));
        payload.put("alertReplayRatePerSec", round2(alertReplayRate.value()));
        payload.put("alertDlqDepth", round2(alertDlqDepth.value()));
        payload.put("alertReplaySingleSuccessRatePerSec", round2(alertReplaySingleSuccessRate.value()));
        payload.put("alertReplaySingleMissRatePerSec", round2(alertReplaySingleMissRate.value()));
        payload.put("alertReplayAllSuccessRatePerSec", round2(alertReplayAllSuccessRate.value()));
        payload.put("alertReplayAllEmptyRatePerSec", round2(alertReplayAllEmptyRate.value()));
        payload.put("alertReplayItemsRatePerSec", round2(alertReplayItemsRate.value()));
        payload.put("alertReplayAvgBatchSize", round2(alertReplayAvgBatchSize.value()));
        payload.put("alertReplayAvgLatencyMs", round2(alertReplayAvgLatencyMs.value()));
        payload.put("queuedJobs", scheduler.queuedJobs());
        payload.put("runningJobs", scheduler.runningJobs());
        payload.put("deferredJobs", scheduler.deferredJobs());
        payload.put("blockedJobs", scheduler.blockedJobs());
        payload.put("avgQueueAgeMs", round2(scheduler.avgQueueAgeMs()));
        payload.put("maxQueueAgeMs", round2(scheduler.maxQueueAgeMs()));
        payload.put("scannerIntervalSeconds", scheduler.scannerIntervalSeconds());
        payload.put("deferredReleaseRatePerSec", round2(deferredReleaseRate.value()));
        payload.put("deferredReleaseTotal", round2(deferredReleaseTotal.value()));
        payload.put("completedTotal", round2(completedTotal.value()));
        payload.put("failedTotal", round2(failedTotal.value()));
        payload.put("completedRatePerSec", round2(completedRate.value()));
        payload.put("failedRatePerSec", round2(failedRate.value()));
        payload.put("avgCompletionLatencyMs", round2(avgCompletionMs.value()));
        payload.put("avgFailureLatencyMs", round2(avgFailureMs.value()));
        payload.put("workflowOutcomes", workflowOutcomeSnapshots());
        payload.put("executors", Map.of(
                "simulator", executorRuntimeSnapshot("simulator"),
                "vo", executorRuntimeSnapshot("vo"),
                "tacc", executorRuntimeSnapshot("tacc")
        ));
        return new ServiceSnapshot(payload);
    }

    private Map<String, Object> executorRuntimeSnapshot(String executor) {
        MetricValue dispatchRate = queryScalar("sum(rate(governance_job_dispatch_total{executor=\"" + executor + "\"}[5m]))");
        MetricValue completedTotal = queryScalar("sum(governance_job_terminal_total{executor=\"" + executor + "\",result=\"COMPLETED\"})");
        MetricValue failedTotal = queryScalar("sum(governance_job_terminal_total{executor=\"" + executor + "\",result=\"FAILED\"})");
        MetricValue completedRate = queryScalar("sum(rate(governance_job_terminal_total{executor=\"" + executor + "\",result=\"COMPLETED\"}[5m]))");
        MetricValue failedRate = queryScalar("sum(rate(governance_job_terminal_total{executor=\"" + executor + "\",result=\"FAILED\"}[5m]))");
        MetricValue objectWriteRate = queryScalar("sum(rate(governance_object_writes_total{executor=\"" + executor + "\"}[5m]))");
        MetricValue objectWriteBps = queryScalar("sum(rate(governance_object_write_payload_bytes_sum{executor=\"" + executor + "\"}[5m]))");
        MetricValue avgCompletionMs = queryScalar(
                "(sum(rate(governance_job_terminal_duration_seconds_sum{executor=\"" + executor + "\",result=\"COMPLETED\"}[15m]))"
                        + " / clamp_min(sum(rate(governance_job_terminal_duration_seconds_count{executor=\"" + executor + "\",result=\"COMPLETED\"}[15m])), 0.0001)) * 1000"
        );

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("source", sourceOf(
                dispatchRate,
                completedTotal,
                failedTotal,
                completedRate,
                failedRate,
                objectWriteRate,
                objectWriteBps,
                avgCompletionMs
        ));
        payload.put("dispatchRatePerSec", round2(dispatchRate.value()));
        payload.put("completedTotal", round2(completedTotal.value()));
        payload.put("failedTotal", round2(failedTotal.value()));
        payload.put("completedRatePerSec", round2(completedRate.value()));
        payload.put("failedRatePerSec", round2(failedRate.value()));
        payload.put("objectWriteRatePerSec", round2(objectWriteRate.value()));
        payload.put("objectWriteBytesPerSec", round2(objectWriteBps.value()));
        payload.put("avgCompletionLatencyMs", round2(avgCompletionMs.value()));
        return payload;
    }

    private Map<String, Object> workflowOutcomeSnapshots() {
        Map<String, Object> workflows = new LinkedHashMap<>();
        for (String workflow : List.of("ingest", "vo.adql.query", "simulate.visibility")) {
            workflows.put(workflow, workflowOutcomeSnapshot(workflow));
        }
        return workflows;
    }

    private Map<String, Object> workflowOutcomeSnapshot(String workflow) {
        MetricValue completedTotal = queryScalar("sum(governance_job_terminal_total{workflow=\"" + workflow + "\",result=\"COMPLETED\"})");
        MetricValue failedTotal = queryScalar("sum(governance_job_terminal_total{workflow=\"" + workflow + "\",result=\"FAILED\"})");
        MetricValue completedRate = queryScalar("sum(rate(governance_job_terminal_total{workflow=\"" + workflow + "\",result=\"COMPLETED\"}[5m]))");
        MetricValue failedRate = queryScalar("sum(rate(governance_job_terminal_total{workflow=\"" + workflow + "\",result=\"FAILED\"}[5m]))");
        MetricValue avgDispatchWaitMs = queryScalar(
                "(sum(rate(governance_job_dispatch_wait_seconds_sum{workflow=\"" + workflow + "\"}[15m]))"
                        + " / clamp_min(sum(rate(governance_job_dispatch_wait_seconds_count{workflow=\"" + workflow + "\"}[15m])), 0.0001)) * 1000"
        );
        MetricValue avgRuntimeMs = queryScalar(
                "(sum(rate(governance_job_runtime_seconds_sum{workflow=\"" + workflow + "\"}[15m]))"
                        + " / clamp_min(sum(rate(governance_job_runtime_seconds_count{workflow=\"" + workflow + "\"}[15m])), 0.0001)) * 1000"
        );

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("source", sourceOf(
                completedTotal,
                failedTotal,
                completedRate,
                failedRate,
                avgDispatchWaitMs,
                avgRuntimeMs
        ));
        payload.put("completedTotal", round2(completedTotal.value()));
        payload.put("failedTotal", round2(failedTotal.value()));
        payload.put("completedRatePerSec", round2(completedRate.value()));
        payload.put("failedRatePerSec", round2(failedRate.value()));
        payload.put("avgDispatchWaitMs", round2(avgDispatchWaitMs.value()));
        payload.put("avgRuntimeMs", round2(avgRuntimeMs.value()));
        return payload;
    }

    private Map<String, Double> governanceHttpRouteRequestRates() {
        Map<String, Double> rates = new LinkedHashMap<>();
        String[] routeFamilies = {
                "jobs",
                "datasets",
                "telemetry",
                "metrics",
                "alerts",
                "broker",
                "rabbitmq",
                "pulsar",
                "vo",
                "archive",
                "admin",
                "api_other",
                "other"
        };
        for (String routeFamily : routeFamilies) {
            MetricValue rate = queryScalar(
                    "sum(rate(governance_http_requests_total{route_family=\"" + routeFamily + "\"}[5m]))"
            );
            if (rate.live()) {
                rates.put(routeFamily, round2(rate.value()));
            }
        }
        return rates;
    }

    private Map<String, Double> operatorReadRouteRates() {
        Map<String, Double> rates = new LinkedHashMap<>();
        String[] resourceFamilies = {
                "jobs",
                "datasets",
                "alerts",
                "archive",
                "other"
        };
        for (String resourceFamily : resourceFamilies) {
            MetricValue rate = queryScalar(
                    "sum(rate(governance_operator_reads_total{resource_family=\"" + resourceFamily + "\"}[5m]))"
            );
            if (rate.live()) {
                rates.put(resourceFamily, round2(rate.value()));
            }
        }
        return rates;
    }

    private Map<String, Double> externalAdapterOperationRates(String adapter) {
        Map<String, Double> rates = new LinkedHashMap<>();
        String[] operations = {
                "adql_query",
                "obscore_search",
                "cone_search",
                "votable_fetch",
                "datalink_resolve",
                "product_fetch",
                "soda_cutout",
                "preview_fetch",
                "submit"
        };
        for (String operation : operations) {
            MetricValue rate = queryScalar(
                    "sum(rate(governance_external_adapter_requests_total{adapter=\"" + adapter + "\",operation=\"" + operation + "\"}[5m]))"
            );
            if (rate.live()) {
                rates.put(operation, round2(rate.value()));
            }
        }
        return rates;
    }

    private Map<String, Double> externalAdapterFailureRates(String adapter) {
        Map<String, Double> rates = new LinkedHashMap<>();
        String[] failureClasses = {
                "http_4xx",
                "http_5xx",
                "timeout",
                "connect",
                "invalid_request",
                "RuntimeException",
                "none",
                "unknown"
        };
        for (String failureClass : failureClasses) {
            MetricValue rate = queryScalar(
                    "sum(rate(governance_external_adapter_requests_total{adapter=\"" + adapter + "\",result=\"failure\",error_class=\"" + failureClass + "\"}[5m]))"
            );
            if (rate.live() && rate.value() > 0.0d) {
                rates.put(failureClass, round2(rate.value()));
            }
        }
        return rates;
    }

    private Map<String, Double> ingestReasonRates(String broker, String kind) {
        Map<String, Double> rates = new LinkedHashMap<>();
        String metric = "validation".equals(kind)
                ? "governance_ingest_validation_failures_total"
                : "governance_ingest_duplicates_total";
        String[] reasons = {
                "workflow",
                "datasetId",
                "request_id",
                "payload",
                "unknown"
        };
        for (String reason : reasons) {
            MetricValue rate = queryScalar(
                    "sum(rate(" + metric + "{broker=\"" + broker + "\",reason=\"" + reason + "\"}[5m]))"
            );
            if (rate.live()) {
                rates.put(reason, round2(rate.value()));
            }
        }
        return rates;
    }

    private MetricValue queryScalar(String query) {
        String base = resolvePrometheusBaseUrl();
        if (base == null || base.isBlank()) {
            log.debug("Prometheus base URL missing; query unavailable: {}", query);
            return MetricValue.unavailable();
        }

        try {
            URI uri = URI.create(
                    base + "/api/v1/query?query="
                            + URLEncoder.encode(query, StandardCharsets.UTF_8)
            );
            ResponseEntity<String> response = restTemplate.getForEntity(uri, String.class);
            if (!response.getStatusCode().is2xxSuccessful() || response.getBody() == null) {
                log.warn("Prometheus query failed status={} query={}", response.getStatusCode(), query);
                return MetricValue.unavailable();
            }

            JsonNode root = objectMapper.readTree(response.getBody());
            if (!"success".equals(root.path("status").asText())) {
                log.warn("Prometheus query returned non-success payload for query={}: {}", query, response.getBody());
                return MetricValue.unavailable();
            }
            JsonNode result = root.path("data").path("result");
            if (!result.isArray() || result.isEmpty()) {
                log.debug("Prometheus query returned no series for query={}", query);
                return MetricValue.live(0.0d);
            }

            JsonNode value = result.get(0).path("value");
            if (!value.isArray() || value.size() < 2) {
                log.warn("Prometheus query returned malformed value for query={}: {}", query, response.getBody());
                return MetricValue.unavailable();
            }

            return MetricValue.live(Double.parseDouble(value.get(1).asText()));
        } catch (Exception e) {
            log.warn("Prometheus query exception for query={}: {}", query, e.toString());
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

    private String sourceOf(MetricValue... values) {
        for (MetricValue value : values) {
            if (value.live()) {
                return "prometheus";
            }
        }
        return "unavailable";
    }

    private String overallSource(ServiceSnapshot... snapshots) {
        for (ServiceSnapshot snapshot : snapshots) {
            if ("prometheus".equals(snapshot.payload().get("source"))) {
                return "prometheus";
            }
        }
        for (ServiceSnapshot snapshot : snapshots) {
            if ("admin".equals(snapshot.payload().get("source"))) {
                return "admin";
            }
        }
        return "unavailable";
    }

    private double round2(double value) {
        return Math.round(value * 100.0d) / 100.0d;
    }

    private record MetricValue(double value, boolean live) {
        static MetricValue unavailable() {
            return new MetricValue(0.0d, false);
        }

        static MetricValue live(double value) {
            return new MetricValue(value, true);
        }
    }

    private record ServiceSnapshot(Map<String, Object> payload) {}
}
