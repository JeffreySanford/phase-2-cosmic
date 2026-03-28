export type ForgeJobStatus =
  | "QUEUED"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type ForgeArtifactMode = "external" | "cached";

export type ForgeSurveyDto = Readonly<{
  id: string;
  name: string;
  providerName: string;
  waveband: string;
  supportsFits: boolean;
  supportsCutout: boolean;
  supportsPreview: boolean;
  previewReady: boolean;
  citationUrl: string;
}>;

export type ForgeServiceInfoDto = Readonly<{
  name: string;
  status: string;
  operationName: string | null;
  graphReady: boolean;
  contractVersion: string;
}>;

export type ForgeJobDto = Readonly<{
  id: string;
  type: string;
  status: ForgeJobStatus;
  progressPercent: number;
  requestedBy: string;
  targetName: string;
  ra: number;
  dec: number;
  radiusArcmin: number;
  requestedSurveyIds: readonly string[];
  resultImageIds: readonly string[];
  errorCode: string | null;
  errorMessage: string | null;
  request: Readonly<{
    providerAdapter: string;
    sourceService: string;
    missionFamily?: string | null;
    collection?: string | null;
    layer: string | null;
    bands: readonly string[];
    ra: number;
    dec: number;
    radiusArcmin: number;
    pixscale: number | null;
    size: number;
    width: number;
    height: number;
    outputFormat?: string | null;
    retrievalPathType?: string | null;
    discoveryUrl?: string | null;
    jpegCutoutUrl: string | null;
    fitsCutoutUrl: string | null;
  }> | null;
  compositeRequest?: Readonly<{
    operation: string;
    inputs: readonly ForgeJobDto["request"][];
    parameters?: Readonly<Record<string, unknown>>;
  }> | null;
  createdAt: string;
  updatedAt: string;
}>;

export type ForgeImageProductDto = Readonly<{
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
  cacheStatus: "external-only" | "cache-planned" | "cached";
  provenance: Readonly<{
    sourceSurvey: string;
    providerName: string;
    citationUrl: string;
    authoritativeUrl: string;
    accessedAt: string;
    transformChain: readonly string[];
    artifactMode: ForgeArtifactMode;
    retrievalPathType?: string;
    layer: string | null;
    bandSet: readonly string[];
    ra: number;
    dec: number;
    pixscale: number | null;
    size: number;
    width: number;
    height: number;
  }>;
  createdAt: string;
}>;

export type ForgeImageMutationResponseDto = Readonly<{
  data: Readonly<{
    imageProduct: ForgeImageProductDto;
  }>;
}>;

export type ForgeWorkbenchBootstrapDataDto = Readonly<{
  serviceInfo: ForgeServiceInfoDto;
  surveys: readonly ForgeSurveyDto[];
  jobs: readonly ForgeJobDto[];
  imageProducts: readonly ForgeImageProductDto[];
  diagnostics: Readonly<{
    queueDepth: number;
    runningJobs: number;
    failedJobs: number;
    completedJobs: number;
    blockedJobs: number;
    delayedJobs: number;
    retryingJobs: number;
  }>;
  metrics: Readonly<{
    totalJobs: number;
    avgRunTimeSec: number;
    successRate: number;
    queueDepth: number;
    successCount: number;
    failureCount: number;
    cachedArtifactCount: number;
  }>;
  jobEvents: readonly Readonly<{
    id: string;
    jobId: string;
    eventType: string;
    fromStatus: string | null;
    toStatus: string | null;
    message: string | null;
    errorCode: string | null;
    createdAt: string;
  }>[];
}>;

export type ForgeWorkbenchBootstrapResponseDto = Readonly<{
  data: ForgeWorkbenchBootstrapDataDto;
}>;

export type ForgeCreateCutoutJobInputDto = Readonly<{
  requestedBy: string;
  targetName: string;
  ra: number;
  dec: number;
  radiusArcmin: number;
  surveyIds: readonly string[];
}>;

export type ForgeCreateCutoutJobDataDto = Readonly<{
  createCutoutJob: ForgeJobDto;
}>;

export type ForgeCreateCutoutJobResponseDto = Readonly<{
  data: ForgeCreateCutoutJobDataDto;
}>;

export type ForgeCreateCompositeJobInputDto = Readonly<{
  requestedBy: string;
  targetName: string;
  ra: number;
  dec: number;
  radiusArcmin: number;
  surveyIds: readonly string[];
  compositeRequest: Readonly<{
    operation: string;
    inputs: readonly Readonly<Record<string, unknown>>[];
    parameters?: Readonly<Record<string, unknown>>;
  }>;
}>;

export type ForgeCreateCompositeJobResponseDto = Readonly<{
  data: Readonly<{
    createCompositeJob: ForgeJobDto;
  }>;
}>;

export type ForgeJobMutationResponseDto = Readonly<{
  data: Readonly<{
    job: ForgeJobDto;
  }>;
}>;

export type ForgeVmDiagnosticsDto = ForgeWorkbenchBootstrapDataDto["diagnostics"];
export type ForgeVmMetricsDto = ForgeWorkbenchBootstrapDataDto["metrics"];
export type ForgeVmJobEventDto = ForgeWorkbenchBootstrapDataDto["jobEvents"][number];
