export type ForgeJobType = "cutout" | "composite";

export type ForgeJobStatus =
  | "QUEUED"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type ForgeArtifactMode = "external" | "cached";

export type ForgeErrorCode =
  | "FORGE_VALIDATION_ERROR"
  | "FORGE_BAD_REQUEST"
  | "FORGE_JOB_NOT_FOUND"
  | "FORGE_IMAGE_NOT_FOUND"
  | "FORGE_UNSUPPORTED_SURVEY"
  | "FORGE_UPSTREAM_UNAVAILABLE"
  | "FORGE_UPSTREAM_TIMEOUT"
  | "FORGE_UPSTREAM_BAD_RESPONSE"
  | "FORGE_ARTIFACT_UNAVAILABLE"
  | "FORGE_INTERNAL_ERROR";

export interface ForgeCutoutRequest {
  providerAdapter: string;
  sourceService: string;
  missionFamily: string | null;
  collection: string | null;
  layer: string | null;
  bands: string[];
  ra: number;
  dec: number;
  radiusArcmin: number;
  pixscale: number | null;
  size: number;
  width: number;
  height: number;
  outputFormat: string | null;
  retrievalPathType: string | null;
  discoveryUrl: string | null;
  jpegCutoutUrl: string | null;
  fitsCutoutUrl: string | null;
}

export interface ForgeImageProvenance {
  sourceSurvey: string;
  providerName: string;
  citationUrl: string;
  authoritativeUrl: string;
  accessedAt: string;
  transformChain: string[];
  artifactMode: ForgeArtifactMode;
  missionFamily?: string | null;
  collection?: string | null;
  retrievalPathType?: string | null;
  outputFormat?: string | null;
  citationReference?: string | null;
  datasetDoi?: string | null;
  layer: string | null;
  bandSet: string[];
  ra: number;
  dec: number;
  pixscale: number | null;
  size: number;
  width: number;
  height: number;
}

export interface ForgeImageProduct {
  id: string;
  jobId: string;
  surveyId: string;
  providerName: string;
  artifactMode: ForgeArtifactMode;
  format: string;
  previewUrl: string;
  fitsUrl: string | null;
  authoritativeUrl: string;
  accessedAt: string;
  cacheKey: string | null;
  cacheStatus: "external-only" | "cached";
  provenance: ForgeImageProvenance;
  createdAt: string;
}

export interface CompositeJobSpec {
  inputs: ForgeCutoutRequest[];
  operation: string;
  parameters?: Record<string, unknown>;
}

export interface ForgeDiagnostics {
  queueDepth: number;
  runningJobs: number;
  failedJobs: number;
  completedJobs: number;
  blockedJobs: number;
  delayedJobs: number;
  retryingJobs: number;
}

export interface ForgeMetrics {
  totalJobs: number;
  avgRunTimeSec: number;
  successRate: number;
  queueDepth: number;
  successCount: number;
  failureCount: number;
  cachedArtifactCount: number;
}

export interface ForgeJob {
  id: string;
  type: ForgeJobType;
  status: ForgeJobStatus;
  progressPercent: number;
  requestedBy: string;
  targetName: string;
  ra: number;
  dec: number;
  radiusArcmin: number;
  requestedSurveyIds: string[];
  request: ForgeCutoutRequest | null;
  compositeRequest?: CompositeJobSpec | null;
  resultImageIds: string[];
  errorCode: ForgeErrorCode | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ForgeSurvey {
  id: string;
  name: string;
  providerName: string;
  waveband: string;
  supportsFits: boolean;
  supportsCutout: boolean;
  supportsPreview: boolean;
  previewReady: boolean;
  citationUrl: string;
}

export interface ForgeCreateCutoutJobInput {
  requestedBy: string;
  targetName: string;
  ra: number;
  dec: number;
  radiusArcmin: number;
  surveyIds: string[];
}

export interface ForgeApiHealth {
  status: string;
  service: string;
  mode: string;
  timestamp: string;
}

export interface ForgeJobEvent {
  id: string;
  jobId: string;
  eventType: string;
  fromStatus: ForgeJobStatus | null;
  toStatus: ForgeJobStatus | null;
  message: string | null;
  errorCode: ForgeErrorCode | null;
  createdAt: string;
}

export interface ForgePersistedState {
  jobCounter: number;
  imageCounter: number;
  eventCounter: number;
  jobs: ForgeJob[];
  imageProducts: ForgeImageProduct[];
  jobEvents: ForgeJobEvent[];
}

export class ForgeDomainError extends Error {
  constructor(
    readonly code: ForgeErrorCode,
    message: string,
    readonly retryable = false,
    readonly details: Record<string, unknown> | null = null
  ) {
    super(message);
    this.name = "ForgeDomainError";
  }
}
