package com.cosmic.governance.api.service;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Map;
import java.util.AbstractMap.SimpleEntry;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class TopologyMetricsRegistryTest {

    @Test
    void snapshotIncludesAllCanonicalLinksAndConfidenceForEveryLink() {
        TopologyMetricsRegistry registry = createRegistry();

        @SuppressWarnings("unchecked")
        Map<String, Object> snapshot = registry.snapshot();
        @SuppressWarnings("unchecked")
        Map<String, Map<String, Object>> links = (Map<String, Map<String, Object>>) snapshot.get("links");
        @SuppressWarnings("unchecked")
        Map<String, Object> diagnostics = (Map<String, Object>) snapshot.get("diagnostics");

        assertThat(links).hasSize(26);
        assertThat(links).containsKeys("pulsar->java-governance", "kafka->java-governance");
        assertThat(links.values()).allSatisfy(link -> {
            assertThat(link).containsKeys("currentMBps", "maxMBps", "latencyMs", "errorRatePct", "confidencePct", "measurementPath", "transport", "source");
            assertThat(link.get("confidencePct")).isInstanceOf(Integer.class);
        });

        assertThat(diagnostics).containsEntry("canonicalLinkCount", 26);
        assertThat(diagnostics).containsEntry("structuralDerivedLinkCount", 3);
        assertThat(diagnostics).containsKey("measurementPathCounts");
        assertThat(diagnostics.get("linksMissingFromSnapshot")).isEqualTo(List.of());
    }

    @Test
    void queryScalarTreatsEmptyPrometheusResultsAsLiveZero() {
        TopologyMetricsRegistry registry = createRegistry();
        ReflectionTestUtils.setField(registry, "prometheusBaseUrl", "http://prometheus.test");

        RestTemplate restTemplate = (RestTemplate) ReflectionTestUtils.getField(registry, "restTemplate");
        MockRestServiceServer server = MockRestServiceServer.bindTo(restTemplate).build();
        server.expect(requestTo(org.hamcrest.Matchers.startsWith("http://prometheus.test/api/v1/query?query=")))
                .andRespond(withSuccess("""
                        {"status":"success","data":{"resultType":"vector","result":[]}}
                        """, MediaType.APPLICATION_JSON));

        Object metricValue = ReflectionTestUtils.invokeMethod(registry, "queryScalar", "sum(rate(test_metric[1m]))");
        Boolean live = (Boolean) ReflectionTestUtils.invokeMethod(metricValue, "live");
        Double value = (Double) ReflectionTestUtils.invokeMethod(metricValue, "value");

        assertThat(metricValue).isNotNull();
        assertThat(live).isTrue();
        assertThat(value).isEqualTo(0.0d);
        server.verify();
    }

    @Test
    void snapshotPromotesInfrastructureBackedAppPlaneLinksWhenDirectQueriesAreUnavailable() {
        Map<String, Object> infrastructureSnapshot = Map.of(
                "services",
                Map.ofEntries(
                        new SimpleEntry<>("frontendSsr", Map.ofEntries(
                                new SimpleEntry<>("source", "prometheus"),
                                new SimpleEntry<>("frontendResponseBytesPerSec", 0.0d),
                                new SimpleEntry<>("frontendApiResponseBytesPerSec", 2048.0d),
                                new SimpleEntry<>("frontendRequestRatePerSec", 0.0d),
                                new SimpleEntry<>("frontendApiRequestRatePerSec", 1.0d),
                                new SimpleEntry<>("frontendRequestLatencyMs", 0.0d),
                                new SimpleEntry<>("frontendApiLatencyMs", 12.0d),
                                new SimpleEntry<>("governanceProxyBytesPerSec", 4096.0d),
                                new SimpleEntry<>("governanceProxyLatencyMs", 18.0d),
                                new SimpleEntry<>("prometheusProxyBytesPerSec", 1024.0d),
                                new SimpleEntry<>("prometheusProxyLatencyMs", 9.0d),
                                new SimpleEntry<>("ingressBytesPerSec", 256.0d),
                                new SimpleEntry<>("egressBytesPerSec", 512.0d),
                                new SimpleEntry<>("avgLatencyMs", 4.0d)
                        )),
                        new SimpleEntry<>("dataGenerator", Map.of(
                                "source", "prometheus",
                                "egressBytesPerSec", 4096.0d,
                                "recordsPerSec", 10.0d,
                                "mainSegmentBytesPerSec", 3072.0d,
                                "lblSegmentBytesPerSec", 512.0d,
                                "sbaSegmentBytesPerSec", 512.0d
                        )),
                        new SimpleEntry<>("nginx", Map.of(
                                "source", "prometheus",
                                "egressBytesPerSec", 512.0d,
                                "avgLatencyMs", 6.0d
                        )),
                        new SimpleEntry<>("kafka", Map.of(
                                "source", "prometheus",
                                "ingressBytesPerSec", 2048.0d,
                                "egressBytesPerSec", 1024.0d
                        )),
                        new SimpleEntry<>("javaIngest", Map.of(
                                "source", "prometheus",
                                "payloadBytesPerSec", 1024.0d
                        )),
                        new SimpleEntry<>("alertmanager", Map.of(
                                "source", "prometheus",
                                "egressBytesPerSec", 256.0d,
                                "avgLatencyMs", 11.0d
                        )),
                        new SimpleEntry<>("governanceRuntime", Map.ofEntries(
                                new SimpleEntry<>("source", "prometheus"),
                                new SimpleEntry<>("redisReadBytesPerSec", 128.0d),
                                new SimpleEntry<>("redisWriteBytesPerSec", 64.0d),
                                new SimpleEntry<>("redisAvgLatencyMs", 2.0d),
                                new SimpleEntry<>("redisErrorRatePct", 0.0d),
                                new SimpleEntry<>("minioObjectWriteBytesPerSec", 0.0d),
                                new SimpleEntry<>("minioObjectWriteAvgLatencyMs", 0.0d),
                                new SimpleEntry<>("minioObjectWriteErrorRatePct", 0.0d),
                                new SimpleEntry<>("kafkaPublishBytesPerSec", 1536.0d),
                                new SimpleEntry<>("kafkaIngestPayloadBytesPerSec", 0.0d),
                                new SimpleEntry<>("pulsarIngestPayloadBytesPerSec", 0.0d),
                                new SimpleEntry<>("rabbitmqPublishBytesPerSec", 0.0d),
                                new SimpleEntry<>("operatorReadBytesPerSec", 0.0d),
                                new SimpleEntry<>("datasetMutationPayloadBytesPerSec", 0.0d),
                                new SimpleEntry<>("jobMetadataMutationPayloadBytesPerSec", 0.0d)
                        )),
                        new SimpleEntry<>("rabbitmq", Map.of("source", "prometheus", "publishRatePerSec", 0.0d, "deliverRatePerSec", 0.0d)),
                        new SimpleEntry<>("redis", Map.of("source", "prometheus", "ingressBytesPerSec", 0.0d, "egressBytesPerSec", 0.0d)),
                        new SimpleEntry<>("minio", Map.of("source", "prometheus", "ingressBytesPerSec", 0.0d, "egressBytesPerSec", 0.0d)),
                        new SimpleEntry<>("pulsar", Map.of("source", "prometheus", "ingressBytesPerSec", 0.0d, "egressBytesPerSec", 0.0d))
                )
        );

        TopologyMetricsRegistry registry = createRegistry(infrastructureSnapshot);

        @SuppressWarnings("unchecked")
        Map<String, Object> snapshot = registry.snapshot();
        @SuppressWarnings("unchecked")
        Map<String, Map<String, Object>> links = (Map<String, Map<String, Object>>) snapshot.get("links");

        assertThat(links.get("frontend->backend")).containsEntry("source", "prometheus");
        assertThat(links.get("frontend->nginx")).containsEntry("source", "prometheus");
        assertThat(links.get("backend->java-governance")).containsEntry("source", "prometheus");
        assertThat(links.get("backend->redis")).containsEntry("source", "prometheus");
        assertThat(links.get("backend->prom")).containsEntry("source", "prometheus");
        assertThat(links.get("data-generator->kafka")).containsEntry("source", "prometheus");
        assertThat(links.get("data-generator->array-main")).containsEntry("source", "prometheus");
        assertThat(links.get("data-generator->array-lbl")).containsEntry("source", "prometheus");
        assertThat(links.get("data-generator->array-sba")).containsEntry("source", "prometheus");
        assertThat(links.get("java-governance->kafka")).containsEntry("source", "prometheus");
        assertThat(links.get("kafka->java-ingest")).containsEntry("source", "prometheus");
        assertThat(links.get("prom->alertmanager")).containsEntry("source", "prometheus");
        assertThat(links.get("array-main->minio")).containsEntry("source", "prometheus");
        assertThat(links.get("array-lbl->minio")).containsEntry("source", "prometheus");
        assertThat(links.get("array-sba->minio")).containsEntry("source", "prometheus");
        assertThat(links.get("backend->java-governance")).containsEntry("measurementPath", "direct-prometheus+infrastructure-fallback");
        assertThat(links.get("data-generator->array-main")).containsEntry("measurementPath", "direct-prometheus+infrastructure-fallback");
        assertThat(links.get("array-main->minio")).containsEntry("measurementPath", "direct-prometheus+infrastructure-fallback");
    }

    @Test
    void structurallyDerivedLinksRemainDerivedEvenWithFullPrometheusInfrastructure() {
        Map<String, Object> infrastructureSnapshot = Map.of(
                "services",
                Map.ofEntries(
                        new SimpleEntry<>("frontendSsr", Map.ofEntries(
                                new SimpleEntry<>("source", "prometheus"),
                                new SimpleEntry<>("frontendResponseBytesPerSec", 512.0d),
                                new SimpleEntry<>("frontendApiResponseBytesPerSec", 2048.0d),
                                new SimpleEntry<>("frontendRequestRatePerSec", 1.0d),
                                new SimpleEntry<>("frontendApiRequestRatePerSec", 1.0d),
                                new SimpleEntry<>("frontendRequestLatencyMs", 5.0d),
                                new SimpleEntry<>("frontendApiLatencyMs", 12.0d),
                                new SimpleEntry<>("governanceProxyBytesPerSec", 4096.0d),
                                new SimpleEntry<>("governanceProxyLatencyMs", 18.0d),
                                new SimpleEntry<>("prometheusProxyBytesPerSec", 1024.0d),
                                new SimpleEntry<>("prometheusProxyLatencyMs", 9.0d),
                                new SimpleEntry<>("ingressBytesPerSec", 256.0d),
                                new SimpleEntry<>("egressBytesPerSec", 512.0d),
                                new SimpleEntry<>("avgLatencyMs", 4.0d)
                        )),
                        new SimpleEntry<>("kafka", Map.of("source", "prometheus", "ingressBytesPerSec", 2048.0d, "egressBytesPerSec", 1024.0d)),
                        new SimpleEntry<>("governanceRuntime", Map.ofEntries(
                                new SimpleEntry<>("source", "prometheus"),
                                new SimpleEntry<>("redisReadBytesPerSec", 128.0d), new SimpleEntry<>("redisWriteBytesPerSec", 64.0d),
                                new SimpleEntry<>("redisAvgLatencyMs", 2.0d), new SimpleEntry<>("redisErrorRatePct", 0.0d),
                                new SimpleEntry<>("minioObjectWriteBytesPerSec", 0.0d), new SimpleEntry<>("minioObjectWriteAvgLatencyMs", 0.0d),
                                new SimpleEntry<>("minioObjectWriteErrorRatePct", 0.0d), new SimpleEntry<>("kafkaPublishBytesPerSec", 1536.0d),
                                new SimpleEntry<>("kafkaIngestPayloadBytesPerSec", 0.0d), new SimpleEntry<>("pulsarIngestPayloadBytesPerSec", 0.0d),
                                new SimpleEntry<>("rabbitmqPublishBytesPerSec", 0.0d), new SimpleEntry<>("operatorReadBytesPerSec", 0.0d),
                                new SimpleEntry<>("datasetMutationPayloadBytesPerSec", 0.0d), new SimpleEntry<>("jobMetadataMutationPayloadBytesPerSec", 0.0d)))
                )
        );

        TopologyMetricsRegistry registry = createRegistry(infrastructureSnapshot);

        @SuppressWarnings("unchecked")
        Map<String, Map<String, Object>> links = (Map<String, Map<String, Object>>) registry.snapshot().get("links");

        // These three links are set via setLink() not setMeasuredOrDerivedLink() — they must never become prometheus
        assertThat(links.get("zookeeper->kafka")).containsEntry("source", "derived");
        assertThat(links.get("prom->grafana")).containsEntry("source", "derived");
        assertThat(links.get("loki->grafana")).containsEntry("source", "derived");
        assertThat(links.get("zookeeper->kafka")).containsEntry("measurementPath", "derived-model");
        assertThat(links.get("prom->grafana")).containsEntry("measurementPath", "derived-model");
        assertThat(links.get("loki->grafana")).containsEntry("measurementPath", "derived-model");
    }

    @Test
    void diagnosticsFallbackDerivedLinksIsEmptyWhenAllPromotableLinksAreInfrastructureBacked() {
        Map<String, Object> infrastructureSnapshot = Map.of(
                "services",
                Map.ofEntries(
                        new SimpleEntry<>("frontendSsr", Map.ofEntries(
                                new SimpleEntry<>("source", "prometheus"),
                                new SimpleEntry<>("frontendResponseBytesPerSec", 0.0d),
                                new SimpleEntry<>("frontendApiResponseBytesPerSec", 2048.0d),
                                new SimpleEntry<>("frontendRequestRatePerSec", 0.0d),
                                new SimpleEntry<>("frontendApiRequestRatePerSec", 1.0d),
                                new SimpleEntry<>("frontendRequestLatencyMs", 0.0d),
                                new SimpleEntry<>("frontendApiLatencyMs", 12.0d),
                                new SimpleEntry<>("governanceProxyBytesPerSec", 4096.0d),
                                new SimpleEntry<>("governanceProxyLatencyMs", 18.0d),
                                new SimpleEntry<>("prometheusProxyBytesPerSec", 1024.0d),
                                new SimpleEntry<>("prometheusProxyLatencyMs", 9.0d),
                                new SimpleEntry<>("ingressBytesPerSec", 256.0d),
                                new SimpleEntry<>("egressBytesPerSec", 512.0d),
                                new SimpleEntry<>("avgLatencyMs", 4.0d)
                        )),
                        new SimpleEntry<>("dataGenerator", Map.of(
                                "source", "prometheus",
                                "egressBytesPerSec", 4096.0d, "recordsPerSec", 10.0d,
                                "mainSegmentBytesPerSec", 3072.0d, "lblSegmentBytesPerSec", 512.0d, "sbaSegmentBytesPerSec", 512.0d
                        )),
                        new SimpleEntry<>("nginx", Map.of("source", "prometheus", "egressBytesPerSec", 512.0d, "avgLatencyMs", 6.0d)),
                        new SimpleEntry<>("kafka", Map.of("source", "prometheus", "ingressBytesPerSec", 2048.0d, "egressBytesPerSec", 1024.0d)),
                        new SimpleEntry<>("javaIngest", Map.of("source", "prometheus", "payloadBytesPerSec", 1024.0d)),
                        new SimpleEntry<>("alertmanager", Map.of("source", "prometheus", "egressBytesPerSec", 256.0d, "avgLatencyMs", 11.0d)),
                        new SimpleEntry<>("governanceRuntime", Map.ofEntries(
                                new SimpleEntry<>("source", "prometheus"),
                                new SimpleEntry<>("redisReadBytesPerSec", 128.0d), new SimpleEntry<>("redisWriteBytesPerSec", 64.0d),
                                new SimpleEntry<>("redisAvgLatencyMs", 2.0d), new SimpleEntry<>("redisErrorRatePct", 0.0d),
                                new SimpleEntry<>("minioObjectWriteBytesPerSec", 0.0d), new SimpleEntry<>("minioObjectWriteAvgLatencyMs", 0.0d),
                                new SimpleEntry<>("minioObjectWriteErrorRatePct", 0.0d), new SimpleEntry<>("kafkaPublishBytesPerSec", 1536.0d),
                                new SimpleEntry<>("kafkaIngestPayloadBytesPerSec", 0.0d), new SimpleEntry<>("pulsarIngestPayloadBytesPerSec", 0.0d),
                                new SimpleEntry<>("rabbitmqPublishBytesPerSec", 0.0d), new SimpleEntry<>("operatorReadBytesPerSec", 0.0d),
                                new SimpleEntry<>("datasetMutationPayloadBytesPerSec", 0.0d), new SimpleEntry<>("jobMetadataMutationPayloadBytesPerSec", 0.0d)
                        )),
                        new SimpleEntry<>("rabbitmq", Map.of("source", "prometheus", "publishRatePerSec", 0.0d, "deliverRatePerSec", 0.0d)),
                        new SimpleEntry<>("redis", Map.of("source", "prometheus", "ingressBytesPerSec", 0.0d, "egressBytesPerSec", 0.0d)),
                        new SimpleEntry<>("minio", Map.of("source", "prometheus", "ingressBytesPerSec", 0.0d, "egressBytesPerSec", 0.0d)),
                        new SimpleEntry<>("pulsar", Map.of("source", "prometheus", "ingressBytesPerSec", 0.0d, "egressBytesPerSec", 0.0d))
                )
        );

        TopologyMetricsRegistry registry = createRegistry(infrastructureSnapshot);

        @SuppressWarnings("unchecked")
        Map<String, Object> diagnostics = (Map<String, Object>) registry.snapshot().get("diagnostics");

        assertThat(diagnostics.get("structuralDerivedLinkCount")).isEqualTo(3);
        assertThat(diagnostics.get("fallbackDerivedLinkCount")).isEqualTo(0);
        @SuppressWarnings("unchecked")
        List<String> fallbackDerivedLinks = (List<String>) diagnostics.get("fallbackDerivedLinks");
        assertThat(fallbackDerivedLinks).isEmpty();
    }

    private TopologyMetricsRegistry createRegistry() {
        return createRegistry(Map.of("services", Map.of()));
    }

    private TopologyMetricsRegistry createRegistry(Map<String, Object> infrastructureSnapshot) {
        JobService jobService = mock(JobService.class);
        when(jobService.listAll()).thenReturn(List.of());

        InfrastructureTelemetryService infrastructureTelemetryService = mock(InfrastructureTelemetryService.class);
        when(infrastructureTelemetryService.snapshot()).thenReturn(infrastructureSnapshot);

        return new TopologyMetricsRegistry(
                new SimpleMeterRegistry(),
                jobService,
                infrastructureTelemetryService
        );
    }
}
