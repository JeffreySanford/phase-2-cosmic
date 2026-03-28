export type ForgeJobType = "cutout" | "composite";

export type ForgeJobStatus =
  | "QUEUED"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type ForgeArtifactMode = "external" | "cached";

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
  format: "jpeg" | "fits";
  previewUrl: string;
  fitsUrl: string | null;
  authoritativeUrl: string;
  accessedAt: string;
  cacheKey: string | null;
  cacheStatus: "external-only" | "cached";
  provenance: ForgeImageProvenance;
  createdAt: string;
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
  resultImageIds: string[];
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
