import type { ForgeImageProduct, ForgeJob } from "../domain/forge.models";
import type { ForgeCutoutRequestSource, ForgeSurveyAdapter } from "./survey-adapter";

export const IRSA_ALLWISE_SURVEY_ID = "allwise";
export const IRSA_PROVIDER_NAME = "NASA/IPAC IRSA";
export const IRSA_CITATION_URL = "https://irsa.ipac.caltech.edu/Missions/wise.html";
export const IRSA_ALLWISE_COLLECTION = "allwise/p3am_cdd";
export const IRSA_ALLWISE_BANDS = ["W1", "W2", "W3", "W4"];
export const IRSA_ALLWISE_DEFAULT_BAND = "W1";
export const IRSA_ACKNOWLEDGMENT_URL = "https://irsa.ipac.caltech.edu/ack.html";
export const IRSA_ALLWISE_DOI = "10.26131/IRSA1";

const IRSA_ALLWISE_SIA_URL =
  "https://irsa.ipac.caltech.edu/ibe/sia/wise/allwise/p3am_cdd";

type AllwiseDiscoveryRecord = {
  title: string;
  accessUrl: string;
  format: string;
  band: string;
  scaleDegPerPixel: number | null;
  uncertaintyUrl: string | null;
  coverageUrl: string | null;
  coaddId: string | null;
};

function normalizeNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeSizeArcsec(radiusArcmin: number): number {
  return Math.max(60, Math.round(Math.max(0.5, radiusArcmin) * 120));
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

function appendCutoutQuery(baseUrl: string, center: string, sizeArcsec: number): string {
  const separator = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${separator}center=${center}&size=${sizeArcsec}arcsec&gzip=false`;
}

function parseVotableRows(xml: string): AllwiseDiscoveryRecord[] {
  const fieldNames = Array.from(xml.matchAll(/<FIELD[^>]+name="([^"]+)"/g)).map(
    (match) => match[1]
  );
  const rows: AllwiseDiscoveryRecord[] = [];
  const rowMatches = xml.matchAll(/<TR>([\s\S]*?)<\/TR>/g);

  for (const rowMatch of rowMatches) {
    const cellValues = Array.from(rowMatch[1].matchAll(/<TD>([\s\S]*?)<\/TD>/g)).map((match) =>
      decodeXmlEntities(match[1])
    );
    if (cellValues.length === 0 || cellValues.length !== fieldNames.length) {
      continue;
    }

    const cells = Object.fromEntries(fieldNames.map((name, index) => [name, cellValues[index]]));
    rows.push({
      title: cells["sia_title"] ?? "",
      accessUrl: cells["sia_url"] ?? "",
      format: cells["sia_fmt"] ?? "image/fits",
      band: cells["sia_bp_id"] ?? "",
      scaleDegPerPixel: cells["sia_scale"]
        ? Number.parseFloat(String(cells["sia_scale"]).split(/\s+/)[0] ?? "")
        : null,
      uncertaintyUrl: cells["unc_url"] || null,
      coverageUrl: cells["cov_url"] || null,
      coaddId: cells["coadd_id"] || null,
    });
  }

  return rows.filter((row) => row.accessUrl && row.band);
}

async function discoverAllwiseImage(
  request: ReturnType<typeof buildIrsaAllwiseCutoutRequest>
): Promise<AllwiseDiscoveryRecord> {
  const response = await fetch(request.discoveryUrl ?? "");
  if (!response.ok) {
    throw new Error(`IRSA SIA discovery failed: ${response.status}`);
  }

  const xml = await response.text();
  const rows = parseVotableRows(xml);
  const requestedBand = request.bands[0] ?? IRSA_ALLWISE_DEFAULT_BAND;
  const match =
    rows.find((row) => row.band.toUpperCase() === requestedBand.toUpperCase()) ?? rows[0];

  if (!match) {
    throw new Error("IRSA SIA discovery returned no matching AllWISE image.");
  }

  return match;
}

export function buildIrsaAllwiseCutoutRequest(job: ForgeCutoutRequestSource) {
  const radiusArcmin = Math.max(0.5, normalizeNumber(job.radiusArcmin, 1));
  const sizeArcsec = normalizeSizeArcsec(radiusArcmin);
  const ra = Number(normalizeNumber(job.ra, 0).toFixed(5));
  const dec = Number(normalizeNumber(job.dec, 0).toFixed(5));
  const band = IRSA_ALLWISE_DEFAULT_BAND;
  const discoveryUrl =
    `${IRSA_ALLWISE_SIA_URL}?POS=${ra.toFixed(5)},${dec.toFixed(5)}` +
    `&SIZE=${(radiusArcmin / 60).toFixed(5)}&INTERSECT=OVERLAPS`;
  const fitsCutoutUrl = `${IRSA_ALLWISE_SIA_URL}?pending=ibe-cutout`;

  return {
    providerAdapter: "irsa-allwise",
    sourceService: "sia-v2",
    missionFamily: "allwise",
    collection: IRSA_ALLWISE_COLLECTION,
    layer: IRSA_ALLWISE_COLLECTION,
    bands: [band],
    ra,
    dec,
    radiusArcmin,
    pixscale: null,
    size: sizeArcsec,
    width: sizeArcsec,
    height: sizeArcsec,
    outputFormat: "fits",
    retrievalPathType: "ibe-cutout",
    discoveryUrl,
    jpegCutoutUrl: null,
    fitsCutoutUrl,
  };
}

export function createIrsaAllwiseImageProduct(
  job: ForgeJob,
  imageId: string,
  accessedAt: string,
  discoveryRecord: AllwiseDiscoveryRecord
): ForgeImageProduct {
  const request = job.request ?? buildIrsaAllwiseCutoutRequest(job);
  const center = `${request.ra.toFixed(5)},${request.dec.toFixed(5)}`;
  const fitsCutoutUrl = appendCutoutQuery(discoveryRecord.accessUrl, center, request.size);

  return {
    id: imageId,
    jobId: job.id,
    surveyId: IRSA_ALLWISE_SURVEY_ID,
    providerName: IRSA_PROVIDER_NAME,
    artifactMode: "external",
    format: "fits",
    previewUrl: fitsCutoutUrl,
    fitsUrl: fitsCutoutUrl,
    authoritativeUrl: fitsCutoutUrl,
    accessedAt,
    cacheKey: null,
    cacheStatus: "external-only",
    provenance: {
      sourceSurvey: discoveryRecord.title || "AllWISE Atlas",
      providerName: IRSA_PROVIDER_NAME,
      citationUrl: IRSA_CITATION_URL,
      authoritativeUrl: fitsCutoutUrl,
      accessedAt,
      transformChain: ["irsa-sia-discovery", "irsa-ibe-cutout"],
      artifactMode: "external",
      missionFamily: "allwise",
      collection: IRSA_ALLWISE_COLLECTION,
      retrievalPathType: "ibe-cutout",
      outputFormat: discoveryRecord.format || "image/fits",
      citationReference: IRSA_ACKNOWLEDGMENT_URL,
      datasetDoi: IRSA_ALLWISE_DOI,
      layer: request.layer,
      bandSet: [discoveryRecord.band],
      ra: request.ra,
      dec: request.dec,
      pixscale:
        discoveryRecord.scaleDegPerPixel !== null
          ? Number((discoveryRecord.scaleDegPerPixel * 3600).toFixed(6))
          : null,
      size: request.size,
      width: request.width,
      height: request.height,
    },
    createdAt: accessedAt,
  };
}

async function executeIrsaAllwiseJob(
  job: ForgeJob,
  imageId: string,
  accessedAt: string
): Promise<ForgeImageProduct> {
  const request = job.request ?? buildIrsaAllwiseCutoutRequest(job);
  const discoveryRecord = await discoverAllwiseImage(request);
  const center = `${request.ra.toFixed(5)},${request.dec.toFixed(5)}`;
  const fitsCutoutUrl = appendCutoutQuery(discoveryRecord.accessUrl, center, request.size);

  const probeResponse = await fetch(fitsCutoutUrl, {
    method: "HEAD",
    headers: { Accept: "application/fits" },
  });
  if (!probeResponse.ok) {
    throw new Error(`IRSA IBE retrieval failed: ${probeResponse.status}`);
  }

  job.request = {
    ...request,
    bands: [discoveryRecord.band],
    pixscale:
      discoveryRecord.scaleDegPerPixel !== null
        ? Number((discoveryRecord.scaleDegPerPixel * 3600).toFixed(6))
        : null,
    outputFormat: "fits",
    fitsCutoutUrl,
  };

  return createIrsaAllwiseImageProduct(job, imageId, accessedAt, discoveryRecord);
}

export const irsaAllwiseSurveyAdapter: ForgeSurveyAdapter = {
  surveyId: IRSA_ALLWISE_SURVEY_ID,
  providerName: IRSA_PROVIDER_NAME,
  buildCutoutRequest: buildIrsaAllwiseCutoutRequest,
  executeJob: executeIrsaAllwiseJob,
};
