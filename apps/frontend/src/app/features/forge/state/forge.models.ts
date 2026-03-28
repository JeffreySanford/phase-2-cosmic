export type ForgeJobStatus =
  | "QUEUED"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type ForgeArtifactMode = "external" | "cached";

export type ForgeHealthDto = Readonly<{
  service: string;
  status: string;
  mode?: string;
  timestamp?: string;
}>;

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
    layer: string | null;
    bands: readonly string[];
    ra: number;
    dec: number;
    radiusArcmin: number;
    pixscale: number | null;
    size: number;
    width: number;
    height: number;
    jpegCutoutUrl: string | null;
    fitsCutoutUrl: string | null;
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
  format: "jpeg" | "fits";
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

export type ForgeJobMutationResponseDto = Readonly<{
  data: Readonly<{
    job: ForgeJobDto;
  }>;
}>;
