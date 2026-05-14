import type {
  ForgeImageProduct,
  ForgeJob,
  ForgeSurvey,
} from "../domain/forge.models";
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
import {
  PANSTARRS_CITATION_URL,
  PANSTARRS_PROVIDER_NAME,
  PANSTARRS_SURVEY_ID,
  panstarrsSurveyAdapter,
} from "./panstarrs-adapter";
import {
  SKYVIEW_CITATION_URL,
  SKYVIEW_PROVIDER_NAME,
  SKYVIEW_SURVEY_ID,
  buildSkyViewCutoutRequest,
  skyViewSurveyAdapters,
} from "./skyview-adapter";
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
    previewReady: true,
    citationUrl: IRSA_CITATION_URL,
  },
  {
    id: SKYVIEW_SURVEY_ID,
    name: "SkyView Explorer",
    providerName: SKYVIEW_PROVIDER_NAME,
    waveband: "mixed",
    supportsFits: false,
    supportsCutout: true,
    supportsPreview: true,
    previewReady: true,
    citationUrl: SKYVIEW_CITATION_URL,
  },
  {
    id: "dss2",
    name: "DSS2 Preview",
    providerName: SKYVIEW_PROVIDER_NAME,
    waveband: "optical",
    supportsFits: false,
    supportsCutout: true,
    supportsPreview: true,
    previewReady: true,
    citationUrl: SKYVIEW_CITATION_URL,
  },
  {
    id: "first",
    name: "FIRST Preview",
    providerName: SKYVIEW_PROVIDER_NAME,
    waveband: "radio",
    supportsFits: false,
    supportsCutout: true,
    supportsPreview: true,
    previewReady: true,
    citationUrl: SKYVIEW_CITATION_URL,
  },
  {
    id: "2mass-j-preview",
    name: "2MASS J Preview",
    providerName: SKYVIEW_PROVIDER_NAME,
    waveband: "infrared",
    supportsFits: false,
    supportsCutout: true,
    supportsPreview: true,
    previewReady: true,
    citationUrl: SKYVIEW_CITATION_URL,
  },
  {
    id: "2mass-h-preview",
    name: "2MASS H Preview",
    providerName: SKYVIEW_PROVIDER_NAME,
    waveband: "infrared",
    supportsFits: false,
    supportsCutout: true,
    supportsPreview: true,
    previewReady: true,
    citationUrl: SKYVIEW_CITATION_URL,
  },
  {
    id: "2mass-k-preview",
    name: "2MASS K Preview",
    providerName: SKYVIEW_PROVIDER_NAME,
    waveband: "infrared",
    supportsFits: false,
    supportsCutout: true,
    supportsPreview: true,
    previewReady: true,
    citationUrl: SKYVIEW_CITATION_URL,
  },
  {
    id: "esasky",
    name: "ESASky",
    providerName: "ESA ESASky",
    waveband: "mixed",
    supportsFits: false,
    supportsCutout: true,
    supportsPreview: true,
    previewReady: false,
    citationUrl: "https://open.esa.int/esasky/",
  },
  {
    id: PANSTARRS_SURVEY_ID,
    name: "Pan-STARRS",
    providerName: PANSTARRS_PROVIDER_NAME,
    waveband: "optical",
    supportsFits: true,
    supportsCutout: true,
    supportsPreview: true,
    previewReady: true,
    citationUrl: PANSTARRS_CITATION_URL,
  },
];

export const forgeSurveyAdapters: Record<string, ForgeSurveyAdapter> = {
  [LEGACY_SURVEYS_ID]: legacySurveyAdapter,
  [IRSA_ALLWISE_SURVEY_ID]: irsaAllwiseSurveyAdapter,
  [PANSTARRS_SURVEY_ID]: panstarrsSurveyAdapter,
  ...skyViewSurveyAdapters,
};

const previewProviderPriority = [
  LEGACY_SURVEYS_ID,
  IRSA_ALLWISE_SURVEY_ID,
  SKYVIEW_SURVEY_ID,
  "dss2",
  "first",
  "2mass-j-preview",
  "2mass-h-preview",
  "2mass-k-preview",
  PANSTARRS_SURVEY_ID,
];

function getPreviewSurveyId(job: ForgeJob): string | null {
  const isLargeCutout = job.radiusArcmin > 12;

  for (const surveyId of previewProviderPriority) {
    if (surveyId === LEGACY_SURVEYS_ID && isLargeCutout) {
      // Legacy Surveys cutout can degrade or return blank for large radius requests,
      // so we prefer higher-reliability secondary adapters for large jobs.
      continue;
    }

    if (job.requestedSurveyIds.includes(surveyId)) {
      return surveyId;
    }
  }

  return null;
}

export function getSurveyAdapterForJob(
  job: ForgeJob
): ForgeSurveyAdapter | null {
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
  const selectedSurveyId = getPreviewSurveyId(job);
  if (!selectedSurveyId) {
    return null;
  }

  const adapter = forgeSurveyAdapters[selectedSurveyId];
  if (!adapter?.createImageProduct) {
    return null;
  }

  if (!job.request) {
    job.request = adapter.buildCutoutRequest(job);
  }

  const imageProduct = adapter.createImageProduct(job, imageId, accessedAt);
  if (!imageProduct) {
    return null;
  }

  const requestedHeaviest =
    job.requestedSurveyIds.length > 0 ? job.requestedSurveyIds[0] : null;
  if (requestedHeaviest && selectedSurveyId !== requestedHeaviest) {
    imageProduct.provenance.transformChain = [
      ...imageProduct.provenance.transformChain,
      `fallback:${requestedHeaviest}->${selectedSurveyId}`,
    ];
    imageProduct.provenance.outputFormat =
      imageProduct.provenance.outputFormat || "jpeg";
  }

  return imageProduct;
}

export {
  buildIrsaAllwiseCutoutRequest,
  buildLegacyCutoutRequest,
  buildSkyViewCutoutRequest,
};
