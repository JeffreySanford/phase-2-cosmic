import type { ForgeImageProduct, ForgeJob } from "../domain/forge.models";
import type { ForgeCutoutRequestSource, ForgeSurveyAdapter } from "./survey-adapter";

export const SKYVIEW_SURVEY_ID = "skyview";
export const SKYVIEW_PROVIDER_NAME = "NASA GSFC SkyView";
export const SKYVIEW_CITATION_URL = "https://skyview.gsfc.nasa.gov/current/cgi/query.pl";
export const SKYVIEW_RUNQUERY_URL = "https://skyview.gsfc.nasa.gov/current/cgi/runquery.pl";
export const SKYVIEW_DEFAULT_SURVEY = "DSS2 Red";

const SKYVIEW_DEFAULT_PIXELS = 900;

type SkyViewSurveyDefinition = {
  surveyId: string;
  surveyLabel: string;
  skyViewSurvey: string;
  sourceSurvey: string;
  waveband: string;
  missionFamily: string;
  bands: string[];
};

export const skyViewSurveyDefinitions: readonly SkyViewSurveyDefinition[] = [
  {
    surveyId: SKYVIEW_SURVEY_ID,
    surveyLabel: SKYVIEW_DEFAULT_SURVEY,
    skyViewSurvey: SKYVIEW_DEFAULT_SURVEY,
    sourceSurvey: "SkyView DSS2 Red",
    waveband: "mixed",
    missionFamily: "skyview",
    bands: ["DSS2 Red"],
  },
  {
    surveyId: "dss2",
    surveyLabel: "DSS2 Red",
    skyViewSurvey: "DSS2 Red",
    sourceSurvey: "SkyView DSS2 Red",
    waveband: "optical",
    missionFamily: "dss2",
    bands: ["DSS2 Red"],
  },
  {
    surveyId: "first",
    surveyLabel: "FIRST",
    skyViewSurvey: "FIRST",
    sourceSurvey: "SkyView FIRST",
    waveband: "radio",
    missionFamily: "first",
    bands: ["FIRST"],
  },
  {
    surveyId: "2mass-j-preview",
    surveyLabel: "2mass-j",
    skyViewSurvey: "2mass-j",
    sourceSurvey: "SkyView 2MASS J",
    waveband: "infrared",
    missionFamily: "2mass",
    bands: ["J"],
  },
  {
    surveyId: "2mass-h-preview",
    surveyLabel: "2mass-h",
    skyViewSurvey: "2mass-h",
    sourceSurvey: "SkyView 2MASS H",
    waveband: "infrared",
    missionFamily: "2mass",
    bands: ["H"],
  },
  {
    surveyId: "2mass-k-preview",
    surveyLabel: "2mass-k",
    skyViewSurvey: "2mass-k",
    sourceSurvey: "SkyView 2MASS K",
    waveband: "infrared",
    missionFamily: "2mass",
    bands: ["K"],
  },
];

function normalizeNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeSizeDegrees(radiusArcmin: number): number {
  return Math.max(0.05, Number(((Math.max(0.5, radiusArcmin) * 2) / 60).toFixed(4)));
}

function encodeSkyViewQuery(baseUrl: string, params: Record<string, string | number>): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    searchParams.set(key, String(value));
  }

  return `${baseUrl}?${searchParams.toString()}`;
}

function skyViewCollection(definition: SkyViewSurveyDefinition): string {
  return definition.surveyId === SKYVIEW_SURVEY_ID
    ? "skyview/derived-preview"
    : `skyview/${definition.surveyId}/derived-preview`;
}

function buildSkyViewCutoutRequestForSurvey(
  definition: SkyViewSurveyDefinition,
  job: ForgeCutoutRequestSource
) {
  const radiusArcmin = Math.max(0.5, normalizeNumber(job.radiusArcmin, 1));
  const ra = Number(normalizeNumber(job.ra, 0).toFixed(5));
  const dec = Number(normalizeNumber(job.dec, 0).toFixed(5));
  const sizeDegrees = normalizeSizeDegrees(radiusArcmin);
  const discoveryUrl = encodeSkyViewQuery(SKYVIEW_CITATION_URL, {
    Position: `${ra.toFixed(5)},${dec.toFixed(5)}`,
    Survey: definition.skyViewSurvey,
    Size: sizeDegrees.toFixed(4),
    Pixels: SKYVIEW_DEFAULT_PIXELS,
    Return: "JPEG",
    Sampler: "Clip",
    scaling: "Log",
  });

  const previewUrl = encodeSkyViewQuery(SKYVIEW_RUNQUERY_URL, {
    Position: `${ra.toFixed(5)},${dec.toFixed(5)}`,
    Survey: definition.skyViewSurvey,
    Size: sizeDegrees.toFixed(4),
    Pixels: SKYVIEW_DEFAULT_PIXELS,
    Return: "JPEG",
    Sampler: "Clip",
    scaling: "Log",
  });

  return {
    providerAdapter: "skyview-derived-preview",
    sourceService: "skyview-query",
    missionFamily: definition.missionFamily,
    collection: skyViewCollection(definition),
    layer: definition.surveyLabel,
    bands: definition.bands,
    ra,
    dec,
    radiusArcmin,
    pixscale: null,
    size: SKYVIEW_DEFAULT_PIXELS,
    width: SKYVIEW_DEFAULT_PIXELS,
    height: SKYVIEW_DEFAULT_PIXELS,
    outputFormat: "jpeg",
    retrievalPathType: "skyview-query",
    discoveryUrl,
    jpegCutoutUrl: previewUrl,
    fitsCutoutUrl: null,
  };
}

function createSkyViewImageProductForSurvey(
  definition: SkyViewSurveyDefinition,
  job: ForgeJob,
  imageId: string,
  accessedAt: string
): ForgeImageProduct {
  const request = job.request ?? buildSkyViewCutoutRequestForSurvey(definition, job);
  const previewUrl = request.jpegCutoutUrl ?? request.discoveryUrl ?? SKYVIEW_CITATION_URL;

  return {
    id: imageId,
    jobId: job.id,
    surveyId: definition.surveyId,
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
      sourceSurvey: definition.sourceSurvey,
      providerName: SKYVIEW_PROVIDER_NAME,
      citationUrl: SKYVIEW_CITATION_URL,
      authoritativeUrl: previewUrl,
      accessedAt,
      transformChain: ["skyview-query", "skyview-derived-image"],
      artifactMode: "external",
      missionFamily: definition.missionFamily,
      collection: skyViewCollection(definition),
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

function createSkyViewSurveyAdapter(definition: SkyViewSurveyDefinition): ForgeSurveyAdapter {
  return {
    surveyId: definition.surveyId,
    providerName: SKYVIEW_PROVIDER_NAME,
    buildCutoutRequest: (job) => buildSkyViewCutoutRequestForSurvey(definition, job),
    createImageProduct: (job, imageId, accessedAt) =>
      createSkyViewImageProductForSurvey(definition, job, imageId, accessedAt),
  };
}

export function buildSkyViewCutoutRequest(job: ForgeCutoutRequestSource) {
  return buildSkyViewCutoutRequestForSurvey(skyViewSurveyDefinitions[0], job);
}

export function createSkyViewImageProduct(
  job: ForgeJob,
  imageId: string,
  accessedAt: string
): ForgeImageProduct {
  return createSkyViewImageProductForSurvey(skyViewSurveyDefinitions[0], job, imageId, accessedAt);
}

export const skyViewSurveyAdapters: Record<string, ForgeSurveyAdapter> = Object.fromEntries(
  skyViewSurveyDefinitions.map((definition) => [
    definition.surveyId,
    createSkyViewSurveyAdapter(definition),
  ])
);

export const skyViewSurveyAdapter = skyViewSurveyAdapters[SKYVIEW_SURVEY_ID];
