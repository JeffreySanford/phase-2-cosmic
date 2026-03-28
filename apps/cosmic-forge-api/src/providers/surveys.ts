import type { ForgeImageProduct, ForgeJob, ForgeSurvey } from "../domain/forge.models";
import {
  IRSA_ALLWISE_SURVEY_ID,
  IRSA_CITATION_URL,
  IRSA_PROVIDER_NAME,
  buildIrsaAllwiseCutoutRequest,
  irsaAllwiseSurveyAdapter,
} from "./irsa-allwise-adapter";
import {
  LEGACY_CITATION_URL,
  LEGACY_PROVIDER_NAME,
  LEGACY_SURVEYS_ID,
  buildLegacyCutoutRequest,
  legacySurveyAdapter,
} from "./legacy-surveys-adapter";
import type { ForgeSurveyAdapter } from "./survey-adapter";

export const forgeSurveys: ForgeSurvey[] = [
  {
    id: "vlass",
    name: "VLASS",
    providerName: "NRAO",
    waveband: "radio",
    supportsFits: true,
    supportsCutout: false,
    supportsPreview: true,
    previewReady: false,
    citationUrl: "https://science.nrao.edu/vlass",
  },
  {
    id: "nvas",
    name: "NVAS",
    providerName: "NRAO",
    waveband: "radio",
    supportsFits: true,
    supportsCutout: false,
    supportsPreview: true,
    previewReady: false,
    citationUrl: "https://www.vla.nrao.edu/astro/nvas/",
  },
  {
    id: LEGACY_SURVEYS_ID,
    name: "Legacy Surveys",
    providerName: LEGACY_PROVIDER_NAME,
    waveband: "optical",
    supportsFits: true,
    supportsCutout: true,
    supportsPreview: true,
    previewReady: true,
    citationUrl: LEGACY_CITATION_URL,
  },
  {
    id: IRSA_ALLWISE_SURVEY_ID,
    name: "AllWISE",
    providerName: IRSA_PROVIDER_NAME,
    waveband: "infrared",
    supportsFits: true,
    supportsCutout: true,
    supportsPreview: true,
    previewReady: false,
    citationUrl: IRSA_CITATION_URL,
  },
  {
    id: "skyview",
    name: "SkyView",
    providerName: "NASA GSFC",
    waveband: "mixed",
    supportsFits: true,
    supportsCutout: true,
    supportsPreview: true,
    previewReady: false,
    citationUrl: "https://skyview.gsfc.nasa.gov/current/cgi/query.pl",
  },
  {
    id: "panstarrs",
    name: "Pan-STARRS",
    providerName: "MAST / STScI",
    waveband: "optical",
    supportsFits: true,
    supportsCutout: true,
    supportsPreview: true,
    previewReady: false,
    citationUrl: "https://outerspace.stsci.edu/display/PANSTARRS",
  },
  {
    id: "dss2",
    name: "DSS2 Preview",
    providerName: "CDS",
    waveband: "optical",
    supportsFits: false,
    supportsCutout: false,
    supportsPreview: true,
    previewReady: false,
    citationUrl: "https://aladin.cds.unistra.fr/hips/list",
  },
];

export const forgeSurveyAdapters: Record<string, ForgeSurveyAdapter> = {
  [LEGACY_SURVEYS_ID]: legacySurveyAdapter,
  [IRSA_ALLWISE_SURVEY_ID]: irsaAllwiseSurveyAdapter,
};

const previewProviderPriority = [LEGACY_SURVEYS_ID];

function getPreviewSurveyId(job: ForgeJob): string | null {
  for (const surveyId of previewProviderPriority) {
    if (job.requestedSurveyIds.includes(surveyId)) {
      return surveyId;
    }
  }

  return null;
}

export function getSurveyAdapterForJob(job: ForgeJob): ForgeSurveyAdapter | null {
  for (const surveyId of job.requestedSurveyIds) {
    const adapter = forgeSurveyAdapters[surveyId];
    if (adapter) {
      return adapter;
    }
  }

  return null;
}

export function buildCutoutRequestForJob(job: ForgeJob) {
  const adapter = getSurveyAdapterForJob(job);
  return adapter?.buildCutoutRequest(job) ?? null;
}

export function createPreviewImageProduct(
  job: ForgeJob,
  imageId: string,
  accessedAt: string
): ForgeImageProduct | null {
  const surveyId = getPreviewSurveyId(job);
  if (!surveyId) {
    return null;
  }

  const adapter = forgeSurveyAdapters[surveyId];
  if (!adapter?.createImageProduct) {
    return null;
  }

  if (!job.request) {
    job.request = adapter.buildCutoutRequest(job);
  }

  return adapter.createImageProduct(job, imageId, accessedAt);
}

export { buildIrsaAllwiseCutoutRequest, buildLegacyCutoutRequest };
