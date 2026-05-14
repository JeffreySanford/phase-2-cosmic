import type { ForgeImageProduct, ForgeJob } from "../domain/forge.models";
import type {
  ForgeCutoutRequestSource,
  ForgeSurveyAdapter,
} from "./survey-adapter";

export const LEGACY_SURVEYS_ID = "legacy";
export const LEGACY_PROVIDER_NAME = "NOIRLab / Legacy Surveys";
export const LEGACY_CITATION_URL = "https://www.legacysurvey.org/viewer";
const LEGACY_LAYER = "ls-dr10";
const LEGACY_BANDS = ["g", "r", "z"];
const LEGACY_MAX_SIZE = 512;
const LEGACY_NATIVE_PIXSCALE = 0.262;

function normalizeNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampSize(value: number): number {
  const size = Math.round(normalizeNumber(value, LEGACY_MAX_SIZE));
  return Math.max(64, Math.min(LEGACY_MAX_SIZE, size));
}

export function buildLegacyCutoutRequest(job: ForgeCutoutRequestSource) {
  const radiusArcmin = Math.max(0.5, normalizeNumber(job.radiusArcmin, 1));
  const size = LEGACY_MAX_SIZE;
  const width = size;
  const height = size;
  const diameterArcsec = Math.max(60, radiusArcmin * 120);
  const pixscale = Math.max(LEGACY_NATIVE_PIXSCALE, diameterArcsec / size);
  const ra = Number(normalizeNumber(job.ra, 0).toFixed(5));
  const dec = Number(normalizeNumber(job.dec, 0).toFixed(5));
  const bands = [...LEGACY_BANDS];
  const bandSet = bands.join("");
  const encodedLayer = encodeURIComponent(LEGACY_LAYER);
  const encodedBands = encodeURIComponent(bandSet);
  const jpegCutoutUrl =
    `${LEGACY_CITATION_URL}/jpeg-cutout?ra=${ra.toFixed(5)}&dec=${dec.toFixed(
      5
    )}` +
    `&layer=${encodedLayer}&size=${clampSize(size)}&pixscale=${pixscale.toFixed(
      3
    )}` +
    `&bands=${encodedBands}`;
  const fitsCutoutUrl =
    `${LEGACY_CITATION_URL}/fits-cutout?ra=${ra.toFixed(5)}&dec=${dec.toFixed(
      5
    )}` +
    `&layer=${encodedLayer}&size=${clampSize(size)}&pixscale=${pixscale.toFixed(
      3
    )}`;

  return {
    providerAdapter: "legacy-surveys",
    sourceService: "viewer-cutout",
    missionFamily: "legacy-surveys",
    collection: "legacy-surveys/dr10",
    layer: LEGACY_LAYER,
    bands,
    ra,
    dec,
    radiusArcmin,
    pixscale: Number(pixscale.toFixed(3)),
    size,
    width,
    height,
    outputFormat: "jpeg+fits",
    retrievalPathType: "viewer-cutout",
    discoveryUrl: null,
    jpegCutoutUrl,
    fitsCutoutUrl,
  };
}

export function createLegacyImageProduct(
  job: ForgeJob,
  imageId: string,
  accessedAt: string
): ForgeImageProduct {
  const request = job.request ?? buildLegacyCutoutRequest(job);

  return {
    id: imageId,
    jobId: job.id,
    surveyId: LEGACY_SURVEYS_ID,
    providerName: LEGACY_PROVIDER_NAME,
    artifactMode: "external",
    format: "jpeg",
    previewUrl: request.jpegCutoutUrl,
    fitsUrl: request.fitsCutoutUrl,
    authoritativeUrl: request.jpegCutoutUrl,
    accessedAt,
    cacheKey: null,
    cacheStatus: "external-only",
    provenance: {
      sourceSurvey: "Legacy Surveys DR10",
      providerName: LEGACY_PROVIDER_NAME,
      citationUrl: LEGACY_CITATION_URL,
      authoritativeUrl: request.jpegCutoutUrl,
      accessedAt,
      transformChain: [
        "legacy-surveys-cutout-request",
        "jpeg-preview-link",
        "fits-cutout-link",
      ],
      artifactMode: "external",
      layer: request.layer,
      bandSet: request.bands,
      ra: request.ra,
      dec: request.dec,
      pixscale: request.pixscale,
      size: request.size,
      width: request.width,
      height: request.height,
    },
    createdAt: accessedAt,
  };
}

export const legacySurveyAdapter: ForgeSurveyAdapter = {
  surveyId: LEGACY_SURVEYS_ID,
  providerName: LEGACY_PROVIDER_NAME,
  buildCutoutRequest: buildLegacyCutoutRequest,
  createImageProduct: createLegacyImageProduct,
};
