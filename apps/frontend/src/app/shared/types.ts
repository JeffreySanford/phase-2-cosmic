// Shared type definitions for the application

export interface PulsarStatus {
  brokers: number;
  topics: number;
  partitions: number;
  status?: string;
}

export interface RabbitMQStatus {
  status: string;
  connection: string;
  queues?: Record<string, unknown>;
  exchanges?: Record<string, unknown>;
  error?: string;
}

export interface InfraTelemetryServiceMetrics {
  source: string;
  status?: string;
  ingressBytesPerSec?: number;
  egressBytesPerSec?: number;
  opsPerSec?: number;
  connectedClients?: number;
  memoryUsedBytes?: number;
  hitRatePerSec?: number;
  missRatePerSec?: number;
  bypassRatePerSec?: number;
  avgLatencyMs?: number;
  governanceProxyRatePerSec?: number;
  governanceProxyBytesPerSec?: number;
  governanceProxyErrorRatePerSec?: number;
  governanceProxyLatencyMs?: number;
  prometheusProxyRatePerSec?: number;
  prometheusProxyBytesPerSec?: number;
  prometheusProxyErrorRatePerSec?: number;
  prometheusProxyLatencyMs?: number;
  frontendRequestRatePerSec?: number;
  frontendResponseBytesPerSec?: number;
  frontendErrorRatePerSec?: number;
  frontendRequestLatencyMs?: number;
  frontendApiRequestRatePerSec?: number;
  frontendApiResponseBytesPerSec?: number;
  frontendApiErrorRatePerSec?: number;
  frontendApiLatencyMs?: number;
  routeRequestRatesPerSec?: Record<string, number>;
  apiRouteRequestRatesPerSec?: Record<string, number>;
  httpRequestRatePerSec?: number;
  httpResponseBytesPerSec?: number;
  httpErrorRatePerSec?: number;
  httpLatencyMs?: number;
  httpRouteRequestRatesPerSec?: Record<string, number>;
  voAdapterRequestRatePerSec?: number;
  voAdapterPayloadBytesPerSec?: number;
  voAdapterLatencyMs?: number;
  voAdapterErrorRatePerSec?: number;
  voAdapterFailureClassRatesPerSec?: Record<string, number>;
  voAdapterOperationRatesPerSec?: Record<string, number>;
  taccAdapterRequestRatePerSec?: number;
  taccAdapterPayloadBytesPerSec?: number;
  taccAdapterLatencyMs?: number;
  taccAdapterErrorRatePerSec?: number;
  taccAdapterFailureClassRatesPerSec?: Record<string, number>;
  taccAdapterOperationRatesPerSec?: Record<string, number>;
  dataproxyRatePerSec?: number;
  dataproxyLatencyMs?: number;
  datasources?: number;
  activeAlerts?: number;
  inflightRequests?: number;
  alertsReceivedRatePerSec?: number;
  receiveRatePerSec?: number;
  processedRatePerSec?: number;
  validationFailureRatePerSec?: number;
  failureRatePerSec?: number;
  retryRatePerSec?: number;
  dlqRatePerSec?: number;
  payloadBytesPerSec?: number;
  brokers?: number;
  topics?: number;
  partitions?: number;
  consumerLag?: number;
  queueDepth?: number;
  readyMessages?: number;
  unackedMessages?: number;
  publishRatePerSec?: number;
  deliverRatePerSec?: number;
  consumers?: number;
  requestsPerSec?: number;
  errorRatePerSec?: number;
  submissionRatePerSec?: number;
  dispatchRatePerSec?: number;
  transitionRatePerSec?: number;
  artifactRatePerSec?: number;
  artifactPayloadBytesPerSec?: number;
  kafkaPublishRatePerSec?: number;
  kafkaPublishBytesPerSec?: number;
  kafkaPublishLatencyMs?: number;
  kafkaPublishErrorRatePerSec?: number;
  artifactReadRatePerSec?: number;
  artifactReadBytesPerSec?: number;
  artifactReadAvgLatencyMs?: number;
  artifactReadErrorRatePerSec?: number;
  artifactAvgSizeBytes?: number;
  rabbitmqPublishRatePerSec?: number;
  rabbitmqPublishBytesPerSec?: number;
  redisReadRatePerSec?: number;
  redisWriteRatePerSec?: number;
  redisReadBytesPerSec?: number;
  redisWriteBytesPerSec?: number;
  redisAvgLatencyMs?: number;
  redisErrorRatePct?: number;
  objectWriteRatePerSec?: number;
  objectWriteBytesPerSec?: number;
  minioObjectWriteRatePerSec?: number;
  minioObjectWriteBytesPerSec?: number;
  minioObjectWriteAvgLatencyMs?: number;
  minioObjectWriteErrorRatePct?: number;
  localObjectWriteRatePerSec?: number;
  localObjectWriteBytesPerSec?: number;
  kafkaIngestReceiveRatePerSec?: number;
  kafkaIngestSuccessRatePerSec?: number;
  kafkaIngestValidationFailureRatePerSec?: number;
  kafkaIngestDlqRatePerSec?: number;
  kafkaIngestFailureRatePerSec?: number;
  kafkaIngestPayloadBytesPerSec?: number;
  kafkaIngestValidationReasonRatesPerSec?: Record<string, number>;
  kafkaIngestDuplicateReasonRatesPerSec?: Record<string, number>;
  rabbitIngestReceiveRatePerSec?: number;
  rabbitIngestSuccessRatePerSec?: number;
  rabbitIngestValidationFailureRatePerSec?: number;
  rabbitIngestDlqRatePerSec?: number;
  rabbitIngestFailureRatePerSec?: number;
  rabbitIngestPayloadBytesPerSec?: number;
  rabbitIngestValidationReasonRatesPerSec?: Record<string, number>;
  rabbitIngestDuplicateReasonRatesPerSec?: Record<string, number>;
  pulsarIngestReceiveRatePerSec?: number;
  pulsarIngestSuccessRatePerSec?: number;
  pulsarIngestValidationFailureRatePerSec?: number;
  pulsarIngestDlqRatePerSec?: number;
  pulsarIngestFailureRatePerSec?: number;
  pulsarIngestPayloadBytesPerSec?: number;
  pulsarIngestValidationReasonRatesPerSec?: Record<string, number>;
  pulsarIngestDuplicateReasonRatesPerSec?: Record<string, number>;
  datasetMutationRatePerSec?: number;
  datasetMutationPayloadBytesPerSec?: number;
  jobMetadataMutationRatePerSec?: number;
  jobMetadataMutationPayloadBytesPerSec?: number;
  datasetPublishRatePerSec?: number;
  datasetPublishPayloadBytesPerSec?: number;
  datasetReadRatePerSec?: number;
  datasetReadPayloadBytesPerSec?: number;
  manifestPublishRatePerSec?: number;
  manifestPublishPayloadBytesPerSec?: number;
  manifestReadRatePerSec?: number;
  manifestReadPayloadBytesPerSec?: number;
  operatorReadRatePerSec?: number;
  operatorReadBytesPerSec?: number;
  operatorReadRouteRatesPerSec?: Record<string, number>;
  alertIngestedTotal?: number;
  alertIngestRatePerSec?: number;
  alertReplaysTotal?: number;
  alertReplayRatePerSec?: number;
  alertDlqDepth?: number;
  alertReplaySingleSuccessRatePerSec?: number;
  alertReplaySingleMissRatePerSec?: number;
  alertReplayAllSuccessRatePerSec?: number;
  alertReplayAllEmptyRatePerSec?: number;
  alertReplayItemsRatePerSec?: number;
  alertReplayAvgBatchSize?: number;
  alertReplayAvgLatencyMs?: number;
  queuedJobs?: number;
  runningJobs?: number;
  deferredJobs?: number;
  blockedJobs?: number;
  avgQueueAgeMs?: number;
  maxQueueAgeMs?: number;
  scannerIntervalSeconds?: number;
  deferredReleaseRatePerSec?: number;
  deferredReleaseTotal?: number;
  restoreDrillRatePerSec?: number;
  restoreDrillSuccessRatePerSec?: number;
  restoreDrillFailureRatePerSec?: number;
  avgRestoreDrillLatencyMs?: number;
  completedTotal?: number;
  failedTotal?: number;
  completedRatePerSec?: number;
  failedRatePerSec?: number;
  avgCompletionLatencyMs?: number;
  avgFailureLatencyMs?: number;
  avgDispatchWaitMs?: number;
  avgRuntimeMs?: number;
  workflowOutcomes?: Record<string, InfraTelemetryServiceMetrics>;
  executors?: Record<string, InfraTelemetryServiceMetrics>;
}

export interface InfrastructureTelemetrySnapshot {
  measuredAt: string;
  source: string;
  services: {
    redis: InfraTelemetryServiceMetrics;
    rabbitmq: InfraTelemetryServiceMetrics;
    minio: InfraTelemetryServiceMetrics;
    nginx: InfraTelemetryServiceMetrics;
    frontendSsr: InfraTelemetryServiceMetrics;
    kafka: InfraTelemetryServiceMetrics;
    javaIngest: InfraTelemetryServiceMetrics;
    pulsar: InfraTelemetryServiceMetrics;
    grafana: InfraTelemetryServiceMetrics;
    loki: InfraTelemetryServiceMetrics;
    alertmanager: InfraTelemetryServiceMetrics;
    governanceRuntime?: InfraTelemetryServiceMetrics;
  };
}

export interface DiagnosticsIndex {
  path: string;
  files: string[];
}

export interface DockerServiceStatus {
  name: string;
  status: "online" | "degraded" | "offline" | "unknown";
  details?: string;
  error?: string;
  latencyMs?: number;
  icon?: string;
}

export interface CommissioningScenario {
  id: string;
  name: string;
  type: string;
  description: string;
  requiredParameters: string[];
}
