import type { ForgeImageProduct, ForgeJob } from "../domain/forge.models";
import type { ForgeCutoutRequestSource, ForgeSurveyAdapter } from "./survey-adapter";

export const SKYVIEW_SURVEY_ID = "skyview";
export const SKYVIEW_PROVIDER_NAME = "NASA GSFC SkyView";
export const SKYVIEW_CITATION_URL = "https://skyview.gsfc.nasa.gov/current/cgi/query.pl";
export const SKYVIEW_DEFAULT_SURVEY = "DSS2 Red";

const SKYVIEW_DEFAULT_PIXELS = 900;

function normalizeNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeSizeDegrees(radiusArcmin: number): number {
  return Math.max(0.05, Number(((Math.max(0.5, radiusArcmin) * 2) / 60).toFixed(4)));
}

function encodeSkyViewQuery(params: Record<string, string | number>): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    searchParams.set(key, String(value));
  }

  return `${SKYVIEW_CITATION_URL}?${searchParams.toString()}`;
}

export function buildSkyViewCutoutRequest(job: ForgeCutoutRequestSource) {
  const radiusArcmin = Math.max(0.5, normalizeNumber(job.radiusArcmin, 1));
  const ra = Number(normalizeNumber(job.ra, 0).toFixed(5));
  const dec = Number(normalizeNumber(job.dec, 0).toFixed(5));
  const sizeDegrees = normalizeSizeDegrees(radiusArcmin);
  const survey = SKYVIEW_DEFAULT_SURVEY;
  const previewUrl = encodeSkyViewQuery({
    Position: `${ra.toFixed(5)},${dec.toFixed(5)}`,
    Survey: survey,
    Size: sizeDegrees.toFixed(4),
    Pixels: SKYVIEW_DEFAULT_PIXELS,
    Return: "JPEG",
    Sampler: "Clip",
    scaling: "Log",
  });

  return {
    providerAdapter: "skyview-derived-preview",
    sourceService: "skyview-query",
    missionFamily: "skyview",
    collection: "skyview/derived-preview",
    layer: survey,
    bands: [survey],
    ra,
    dec,
    radiusArcmin,
    pixscale: null,
    size: SKYVIEW_DEFAULT_PIXELS,
    width: SKYVIEW_DEFAULT_PIXELS,
    height: SKYVIEW_DEFAULT_PIXELS,
    outputFormat: "jpeg",
    retrievalPathType: "skyview-query",
    discoveryUrl: previewUrl,
    jpegCutoutUrl: previewUrl,
    fitsCutoutUrl: null,
  };
}

export function createSkyViewImageProduct(
  job: ForgeJob,
  imageId: string,
  accessedAt: string
): ForgeImageProduct {
  const request = job.request ?? buildSkyViewCutoutRequest(job);
  const previewUrl = request.jpegCutoutUrl ?? request.discoveryUrl ?? SKYVIEW_CITATION_URL;

  return {
    id: imageId,
    jobId: job.id,
    surveyId: SKYVIEW_SURVEY_ID,
    providerName: SKYVIEW_PROVIDER_NAME,
    artifactMode: "external",
    format: "jpeg",
    previewUrl,
    fitsUrl: null,
    authoritativeUrl: previewUrl,
    accessedAt,
    cacheKey: null,
    cacheStatus: "external-only",
    provenance: {
      sourceSurvey: request.layer ?? SKYVIEW_DEFAULT_SURVEY,
      providerName: SKYVIEW_PROVIDER_NAME,
      citationUrl: SKYVIEW_CITATION_URL,
      authoritativeUrl: previewUrl,
      accessedAt,
      transformChain: ["skyview-query", "skyview-derived-image"],
      artifactMode: "external",
      missionFamily: "skyview",
      collection: "skyview/derived-preview",
      retrievalPathType: "skyview-query",
      outputFormat: "image/jpeg",
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

export const skyViewSurveyAdapter: ForgeSurveyAdapter = {
  surveyId: SKYVIEW_SURVEY_ID,
  providerName: SKYVIEW_PROVIDER_NAME,
  buildCutoutRequest: buildSkyViewCutoutRequest,
  createImageProduct: createSkyViewImageProduct,
};
