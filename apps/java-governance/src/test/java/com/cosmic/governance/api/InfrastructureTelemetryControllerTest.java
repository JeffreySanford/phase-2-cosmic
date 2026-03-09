package com.cosmic.governance.api;

import com.cosmic.governance.test.AbstractRedisTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class InfrastructureTelemetryControllerTest extends AbstractRedisTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void infrastructureTelemetryReturnsSnapshotShape() throws Exception {
        mockMvc.perform(get("/api/v1/telemetry/infrastructure"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.measuredAt").isString())
                .andExpect(jsonPath("$.source").isString())
                .andExpect(jsonPath("$.services.redis.source").isString())
                .andExpect(jsonPath("$.services.rabbitmq.source").isString())
                .andExpect(jsonPath("$.services.minio.source").isString())
                .andExpect(jsonPath("$.services.frontendSsr.source").isString())
                .andExpect(jsonPath("$.services.kafka.source").isString())
                .andExpect(jsonPath("$.services.javaIngest.source").isString())
                .andExpect(jsonPath("$.services.pulsar.source").isString())
                .andExpect(jsonPath("$.services.grafana.source").isString())
                .andExpect(jsonPath("$.services.loki.source").isString())
                .andExpect(jsonPath("$.services.alertmanager.source").isString())
                .andExpect(jsonPath("$.services.governanceRuntime.source").isString())
                .andExpect(jsonPath("$.services.governanceRuntime.kafkaIngestReceiveRatePerSec").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.kafkaIngestSuccessRatePerSec").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.kafkaIngestValidationFailureRatePerSec").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.kafkaIngestDlqRatePerSec").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.rabbitIngestReceiveRatePerSec").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.pulsarIngestReceiveRatePerSec").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.minioObjectWriteRatePerSec").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.localObjectWriteRatePerSec").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.redisAvgLatencyMs").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.redisErrorRatePct").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.minioObjectWriteAvgLatencyMs").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.minioObjectWriteErrorRatePct").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.datasetMutationRatePerSec").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.jobMetadataMutationRatePerSec").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.datasetPublishRatePerSec").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.datasetReadRatePerSec").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.manifestPublishRatePerSec").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.manifestReadRatePerSec").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.artifactReadRatePerSec").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.artifactReadBytesPerSec").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.artifactReadAvgLatencyMs").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.artifactReadErrorRatePerSec").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.artifactAvgSizeBytes").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.kafkaPublishRatePerSec").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.kafkaPublishBytesPerSec").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.kafkaPublishLatencyMs").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.kafkaPublishErrorRatePerSec").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.operatorReadRatePerSec").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.operatorReadRouteRatesPerSec").isMap())
                .andExpect(jsonPath("$.services.governanceRuntime.httpRequestRatePerSec").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.httpResponseBytesPerSec").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.httpErrorRatePerSec").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.httpLatencyMs").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.httpRouteRequestRatesPerSec").isMap())
                .andExpect(jsonPath("$.services.governanceRuntime.voAdapterRequestRatePerSec").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.voAdapterPayloadBytesPerSec").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.voAdapterLatencyMs").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.voAdapterErrorRatePerSec").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.voAdapterOperationRatesPerSec").isMap())
                .andExpect(jsonPath("$.services.governanceRuntime.voAdapterFailureClassRatesPerSec").isMap())
                .andExpect(jsonPath("$.services.governanceRuntime.taccAdapterRequestRatePerSec").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.taccAdapterPayloadBytesPerSec").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.taccAdapterLatencyMs").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.taccAdapterErrorRatePerSec").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.taccAdapterOperationRatesPerSec").isMap())
                .andExpect(jsonPath("$.services.governanceRuntime.taccAdapterFailureClassRatesPerSec").isMap())
                .andExpect(jsonPath("$.services.governanceRuntime.alertIngestedTotal").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.alertIngestRatePerSec").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.alertReplaysTotal").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.alertReplayRatePerSec").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.alertDlqDepth").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.alertReplaySingleSuccessRatePerSec").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.alertReplaySingleMissRatePerSec").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.alertReplayAllSuccessRatePerSec").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.alertReplayAllEmptyRatePerSec").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.alertReplayItemsRatePerSec").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.alertReplayAvgBatchSize").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.alertReplayAvgLatencyMs").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.restoreDrillRatePerSec").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.avgRestoreDrillLatencyMs").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.workflowOutcomes").isMap())
                .andExpect(jsonPath("$.services.governanceRuntime.workflowOutcomes.ingest.avgDispatchWaitMs").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.workflowOutcomes.ingest.avgRuntimeMs").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.queuedJobs").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.runningJobs").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.deferredJobs").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.blockedJobs").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.avgQueueAgeMs").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.maxQueueAgeMs").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.scannerIntervalSeconds").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.deferredReleaseRatePerSec").isNumber())
                .andExpect(jsonPath("$.services.governanceRuntime.deferredReleaseTotal").isNumber())
                .andExpect(jsonPath("$.services.javaIngest.receiveRatePerSec").isNumber())
                .andExpect(jsonPath("$.services.javaIngest.processedRatePerSec").isNumber())
                .andExpect(jsonPath("$.services.javaIngest.validationFailureRatePerSec").isNumber())
                .andExpect(jsonPath("$.services.javaIngest.failureRatePerSec").isNumber())
                .andExpect(jsonPath("$.services.javaIngest.retryRatePerSec").isNumber())
                .andExpect(jsonPath("$.services.javaIngest.dlqRatePerSec").isNumber())
                .andExpect(jsonPath("$.services.javaIngest.payloadBytesPerSec").isNumber())
                .andExpect(jsonPath("$.services.javaIngest.avgLatencyMs").isNumber());
    }
}
