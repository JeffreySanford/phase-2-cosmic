/* global module */
"use strict";

/** Total FSP units available across the correlator (SKA-Mid baseline). */
const MAX_FSPS = 197;

/** Valid receiver bands supported by the FSP hardware. */
const VALID_BANDS = ["UHF", "L", "S", "C", "X", "Ka", "Ku"];

/** Maximum instantaneous bandwidth per FSP in Hz (200 MHz). */
const FSP_MAX_BW_HZ = 200e6;

/**
 * True when two half-open time intervals [startA, endA) and [startB, endB) overlap.
 * @param {string} startA  ISO 8601 timestamp
 * @param {string} endA
 * @param {string} startB
 * @param {string} endB
 * @returns {boolean}
 */
function windowsOverlap(startA, endA, startB, endB) {
  return new Date(startA) < new Date(endB) && new Date(startB) < new Date(endA);
}

/**
 * Detect scheduling contention for a proposed SchedulingBlock against a list of
 * already-committed allocation entries.
 *
 * @param {{ id: string, subarray: string, startTime: string, endTime: string }} sb
 * @param {{ subarray: string, startTime: string, endTime: string, planId: string }[]} existing
 * @returns {string[]}  Human-readable conflict descriptions (empty = no contention).
 */
function detectContention(sb, existing = []) {
  const conflicts = [];
  for (const ex of existing) {
    if (
      ex.subarray === sb.subarray &&
      windowsOverlap(sb.startTime, sb.endTime, ex.startTime, ex.endTime)
    ) {
      conflicts.push(
        `Subarray "${sb.subarray}" is already allocated to plan "${ex.planId}" ` +
          `(${ex.startTime} \u2013 ${ex.endTime})`
      );
    }
  }
  return conflicts;
}

/**
 * Compute the peak concurrent FSP demand across existing allocations that overlap
 * the proposed time window, including the proposed block's own demand.
 *
 * @param {string} startTime
 * @param {string} endTime
 * @param {number} proposed   FSPs requested by the new block
 * @param {{ startTime: string, endTime: string, fspsUsed: number }[]} existing
 * @returns {{ peak: number, available: number, exhausted: boolean }}
 */
function checkCapacity(startTime, endTime, proposed, existing = []) {
  let peak = proposed;
  for (const ex of existing) {
    if (windowsOverlap(startTime, endTime, ex.startTime, ex.endTime)) {
      peak += ex.fspsUsed;
    }
  }
  return { peak, available: MAX_FSPS, exhausted: peak > MAX_FSPS };
}

/**
 * Validate a SpectralConfiguration against FSP hardware constraints.
 *
 * Rules:
 *  - `band` (if present) must be a recognised receiver band.
 *  - `channelWidth * numChannels` must not exceed FSP_MAX_BW_HZ (200 MHz).
 *
 * @param {{ band?: string, channelWidth?: number, numChannels?: number } | null} spectralConfig
 * @returns {{ valid: boolean, reason?: string }}
 */
function validateSpectral(spectralConfig) {
  if (!spectralConfig) return { valid: true };

  const { band, channelWidth, numChannels } = spectralConfig;

  if (band !== undefined && band !== null && !VALID_BANDS.includes(band)) {
    return {
      valid: false,
      reason: `Unknown band "${band}". Valid bands: ${VALID_BANDS.join(", ")}`,
    };
  }

  if (channelWidth != null && numChannels != null) {
    const totalBwHz = channelWidth * numChannels;
    if (totalBwHz > FSP_MAX_BW_HZ) {
      return {
        valid: false,
        reason:
          `Spectral plan exceeds FSP bandwidth limit: ` +
          `${(totalBwHz / 1e6).toFixed(1)} MHz > ${FSP_MAX_BW_HZ / 1e6} MHz`,
      };
    }
  }

  return { valid: true };
}

/**
 * Determine how many FSPs the scheduling block requires.
 * Honours explicit `metadata.fspsRequested`; otherwise defaults to 13 FSPs/observation
 * (one zoom-band configuration, typical for a single-subarray pointing).
 *
 * @param {{ metadata?: Record<string, unknown> }} sb
 * @returns {number}
 */
function computeFspsRequired(sb) {
  if (sb.metadata && typeof sb.metadata.fspsRequested === "number") {
    return sb.metadata.fspsRequested;
  }
  return 13;
}

/**
 * Attempt to allocate FSPs for a SchedulingBlock.
 *
 * Checks (in order):
 *  1. Spectral configuration validity.
 *  2. Subarray contention (same subarray, overlapping window).
 *  3. Total FSP capacity.
 *
 * @param {{ id: string, subarray: string, startTime: string, endTime: string, metadata?: object }} sb
 * @param {{ band?: string, channelWidth?: number, numChannels?: number } | null} spectralConfig
 * @param {{ subarray: string, startTime: string, endTime: string, planId: string, fspsUsed: number }[]} existingAllocations
 * @returns {{ plan?: object, error?: { code: string, message: string, conflicts?: string[] } }}
 */
function allocate(sb, spectralConfig, existingAllocations = []) {
  // 1. Spectral validation
  const spectralCheck = validateSpectral(spectralConfig);
  if (!spectralCheck.valid) {
    return {
      error: { code: "INVALID_SPECTRAL", message: spectralCheck.reason },
    };
  }

  // 2. Subarray contention
  const conflicts = detectContention(sb, existingAllocations);
  if (conflicts.length > 0) {
    return {
      error: {
        code: "CONTENTION",
        message: "Subarray contention detected",
        conflicts,
      },
    };
  }

  // 3. FSP capacity
  const fspsRequired = computeFspsRequired(sb);
  const capacity = checkCapacity(
    sb.startTime,
    sb.endTime,
    fspsRequired,
    existingAllocations
  );
  if (capacity.exhausted) {
    return {
      error: {
        code: "CAPACITY_EXHAUSTED",
        message: `FSP capacity exceeded: peak demand ${capacity.peak} > ${capacity.available} available`,
      },
    };
  }

  // Build allocation plan
  const planId = `plan-${sb.id}-${Date.now()}`;
  const fspIds = Array.from(
    { length: fspsRequired },
    (_, i) => `fsp-${String(i + 1).padStart(3, "0")}`
  );

  const plan = {
    planId,
    subarray: sb.subarray,
    allocations: fspIds.map((fspId) => ({
      fspId,
      startTime: sb.startTime,
      endTime: sb.endTime,
      params: spectralConfig
        ? {
            band: spectralConfig.band,
            channelWidth: spectralConfig.channelWidth,
          }
        : {},
    })),
  };

  return { plan };
}

module.exports = {
  allocate,
  detectContention,
  checkCapacity,
  validateSpectral,
  computeFspsRequired,
  MAX_FSPS,
  FSP_MAX_BW_HZ,
  VALID_BANDS,
};
