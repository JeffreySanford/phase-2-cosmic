import {
  ForgeDomainError,
  type ForgeCutoutRequest,
  type ForgeImageProduct,
  type ForgeJob,
} from "../domain/forge.models";
import type { ForgeCutoutRequestSource, ForgeSurveyAdapter } from "./survey-adapter";

export const PANSTARRS_SURVEY_ID = "panstarrs";
export const PANSTARRS_PROVIDER_NAME = "MAST / STScI";
export const PANSTARRS_CITATION_URL =
  "https://outerspace.stsci.edu/display/PANSTARRS/PS1+Image+Cutout+Service";
export const PANSTARRS_ACKNOWLEDGMENT_URL =
  "https://outerspace.stsci.edu/display/PANSTARRS/How%2Bto%2Bretrieve%2Band%2Buse%2BPS1%2Bdata";
export const PANSTARRS_FILTERS = ["g", "r", "i", "z", "y"] as const;
export const PANSTARRS_COLOR_FILTERS = ["i", "r", "g"] as const;

const PANSTARRS_FILENAMES_URL = "https://ps1images.stsci.edu/cgi-bin/ps1filenames.py";
const PANSTARRS_FITSCUT_URL = "https://ps1images.stsci.edu/cgi-bin/fitscut.cgi";
const PANSTARRS_SCALE_ARCSEC_PER_PIXEL = 0.25;
const PANSTARRS_MIN_SIZE_PX = 240;
const PANSTARRS_MAX_SIZE_PX = 2048;

type PanstarrsImageRecord = {
  filter: string;
  filename: string;
  shortname: string;
};

function normalizeNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeSizePixels(radiusArcmin: number): number {
  const requested = Math.round(Math.max(0.5, radiusArcmin) * 240);
  return Math.min(PANSTARRS_MAX_SIZE_PX, Math.max(PANSTARRS_MIN_SIZE_PX, requested));
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\"") {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function parsePanstarrsImageList(csv: string): PanstarrsImageRecord[] {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    return [];
  }

  const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase());
  const filterIndex = headers.indexOf("filter");
  const filenameIndex = headers.indexOf("filename");
  const shortnameIndex = headers.indexOf("shortname");

  if (filterIndex === -1 || filenameIndex === -1) {
    return [];
  }

  return lines
    .slice(1)
    .map((line) => parseCsvLine(line))
    .filter((values) => values.length > Math.max(filterIndex, filenameIndex))
    .map((values) => ({
      filter: values[filterIndex] ?? "",
      filename: values[filenameIndex] ?? "",
      shortname: shortnameIndex >= 0 ? values[shortnameIndex] ?? "" : "",
    }))
    .filter((row) => row.filter && row.filename);
}

function buildFitscutUrl(
  params: Record<string, string | number | null | undefined>
): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") {
      continue;
    }
    searchParams.set(key, String(value));
  }

  return `${PANSTARRS_FITSCUT_URL}?${searchParams.toString()}`;
}

function classifyPanstarrsHttpError(
  status: number,
  stage: string,
  details: Record<string, unknown>
) {
  if (status === 408 || status === 429 || status === 502 || status === 503 || status === 504) {
    return new ForgeDomainError(
      "FORGE_UPSTREAM_UNAVAILABLE",
      `Pan-STARRS ${stage} is currently unavailable (${status}).`,
      true,
      details
    );
  }

  return new ForgeDomainError(
    "FORGE_UPSTREAM_BAD_RESPONSE",
    `Pan-STARRS ${stage} returned an unexpected status (${status}).`,
    false,
    details
  );
}

function classifyPanstarrsTransportError(
  error: unknown,
  stage: string,
  details: Record<string, unknown>
) {
  if (error instanceof ForgeDomainError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof Error && error.name === "AbortError") {
    return new ForgeDomainError(
      "FORGE_UPSTREAM_TIMEOUT",
      `Pan-STARRS ${stage} timed out.`,
      true,
      details
    );
  }

  if (/timeout|timed out/i.test(message)) {
    return new ForgeDomainError(
      "FORGE_UPSTREAM_TIMEOUT",
      `Pan-STARRS ${stage} timed out.`,
      true,
      details
    );
  }

  return new ForgeDomainError(
    "FORGE_UPSTREAM_UNAVAILABLE",
    `Pan-STARRS ${stage} could not be reached.`,
    true,
    {
      ...details,
      cause: message,
    }
  );
}

async function discoverPanstarrsImages(
  request: ForgeCutoutRequest
): Promise<PanstarrsImageRecord[]> {
  let response: Response;
  try {
    response = await fetch(request.discoveryUrl ?? "", {
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    throw classifyPanstarrsTransportError(error, "image discovery", {
      stage: "ps1filenames",
      discoveryUrl: request.discoveryUrl,
    });
  }

  if (!response.ok) {
    throw classifyPanstarrsHttpError(response.status, "image discovery", {
      stage: "ps1filenames",
      discoveryUrl: request.discoveryUrl,
    });
  }

  const csv = await response.text();
  const rows = parsePanstarrsImageList(csv);
  if (rows.length === 0) {
    throw new ForgeDomainError(
      "FORGE_UPSTREAM_BAD_RESPONSE",
      "Pan-STARRS discovery returned no matching images.",
      false,
      {
        stage: "ps1filenames",
        discoveryUrl: request.discoveryUrl,
      }
    );
  }

  return rows;
}

function selectColorFile(
  records: readonly PanstarrsImageRecord[],
  preferredFilter: string
): string | null {
  return records.find((record) => record.filter === preferredFilter)?.filename ?? null;
}

export function buildPanstarrsCutoutRequest(job: ForgeCutoutRequestSource): ForgeCutoutRequest {
  const radiusArcmin = Math.max(0.5, normalizeNumber(job.radiusArcmin, 1));
  const ra = Number(normalizeNumber(job.ra, 0).toFixed(5));
  const dec = Number(normalizeNumber(job.dec, 0).toFixed(5));
  const size = normalizeSizePixels(radiusArcmin);
  const discoveryUrl =
    `${PANSTARRS_FILENAMES_URL}?ra=${ra.toFixed(5)}&dec=${dec.toFixed(5)}` +
    `&filters=${PANSTARRS_COLOR_FILTERS.join("")}&type=stack&sep=comma`;

  return {
    providerAdapter: "panstarrs-ps1",
    sourceService: "ps1filenames+fitscut",
    missionFamily: "panstarrs",
    collection: "ps1/stack",
    layer: "ps1-stack",
    bands: [...PANSTARRS_COLOR_FILTERS],
    ra,
    dec,
    radiusArcmin,
    pixscale: PANSTARRS_SCALE_ARCSEC_PER_PIXEL,
    size,
    width: size,
    height: size,
    outputFormat: "fits+jpeg",
    retrievalPathType: "fitscut",
    discoveryUrl,
    jpegCutoutUrl: null,
    fitsCutoutUrl: null,
  };
}

export async function executePanstarrsJob(
  job: ForgeJob,
  imageId: string,
  accessedAt: string
): Promise<ForgeImageProduct> {
  const request = job.request ?? buildPanstarrsCutoutRequest(job);
  const images = await discoverPanstarrsImages(request);
  const recordsByFilter = new Map(images.map((record) => [record.filter, record]));
  const red = selectColorFile(images, "i") ?? selectColorFile(images, "z");
  const green = selectColorFile(images, "r") ?? selectColorFile(images, "i");
  const blue = selectColorFile(images, "g") ?? selectColorFile(images, "r");
  const fitsRecord =
    recordsByFilter.get("i") ??
    recordsByFilter.get("r") ??
    recordsByFilter.get("g") ??
    images[0];

  if (!fitsRecord?.filename) {
    throw new ForgeDomainError(
      "FORGE_UPSTREAM_BAD_RESPONSE",
      "Pan-STARRS discovery returned no FITS-capable image selection.",
      false,
      {
        stage: "fitscut-selection",
        discoveryUrl: request.discoveryUrl,
      }
    );
  }

  const previewUrl = buildFitscutUrl({
    ra: request.ra.toFixed(5),
    dec: request.dec.toFixed(5),
    size: request.size,
    format: "jpeg",
    red,
    green,
    blue,
  });
  const fitsUrl = buildFitscutUrl({
    ra: request.ra.toFixed(5),
    dec: request.dec.toFixed(5),
    size: request.size,
    format: "fits",
    red: fitsRecord.filename,
  });

  let probeResponse: Response;
  try {
    probeResponse = await fetch(fitsUrl, {
      method: "HEAD",
      headers: { Accept: "application/fits" },
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    throw classifyPanstarrsTransportError(error, "cutout retrieval", {
      stage: "fitscut",
      fitsUrl,
      discoveryUrl: request.discoveryUrl,
    });
  }

  if (!probeResponse.ok) {
    throw classifyPanstarrsHttpError(probeResponse.status, "cutout retrieval", {
      stage: "fitscut",
      fitsUrl,
      discoveryUrl: request.discoveryUrl,
    });
  }

  const selectedBands = ["i", "r", "g"].filter((filterName) => recordsByFilter.has(filterName));
  const normalizedRequest: ForgeCutoutRequest = {
    ...request,
    bands: selectedBands.length > 0 ? selectedBands : [fitsRecord.filter],
    outputFormat: "fits+jpeg",
    jpegCutoutUrl: previewUrl,
    fitsCutoutUrl: fitsUrl,
  };
  job.request = normalizedRequest;

  return {
    id: imageId,
    jobId: job.id,
    surveyId: PANSTARRS_SURVEY_ID,
    providerName: PANSTARRS_PROVIDER_NAME,
    artifactMode: "external",
    format: "jpeg",
    previewUrl,
    fitsUrl,
    authoritativeUrl: fitsUrl,
    accessedAt,
    cacheKey: null,
    cacheStatus: "external-only",
    provenance: {
      sourceSurvey: "Pan-STARRS PS1 Stack",
      providerName: PANSTARRS_PROVIDER_NAME,
      citationUrl: PANSTARRS_CITATION_URL,
      authoritativeUrl: fitsUrl,
      accessedAt,
      transformChain: ["ps1-image-list-discovery", "ps1-fitscut-extraction"],
      artifactMode: "external",
      missionFamily: "panstarrs",
      collection: "ps1/stack",
      retrievalPathType: "fitscut",
      outputFormat: "image/fits+jpeg",
      citationReference: PANSTARRS_ACKNOWLEDGMENT_URL,
      layer: "ps1-stack",
      bandSet: normalizedRequest.bands,
      ra: request.ra,
      dec: request.dec,
      pixscale: PANSTARRS_SCALE_ARCSEC_PER_PIXEL,
      size: request.size,
      width: request.width,
      height: request.height,
    },
    createdAt: accessedAt,
  };
}

export const panstarrsSurveyAdapter: ForgeSurveyAdapter = {
  surveyId: PANSTARRS_SURVEY_ID,
  providerName: PANSTARRS_PROVIDER_NAME,
  buildCutoutRequest: buildPanstarrsCutoutRequest,
  executeJob: executePanstarrsJob,
};
