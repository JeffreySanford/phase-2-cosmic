/* eslint-disable @typescript-eslint/no-require-imports */
/* global describe, it, expect, require */
"use strict";

const {
  allocate,
  detectContention,
  checkCapacity,
  validateSpectral,
  computeFspsRequired,
  MAX_FSPS,
} = require("./allocator");

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SB_A = {
  id: "sb-001",
  startTime: "2026-04-01T08:00:00Z",
  endTime: "2026-04-01T10:00:00Z",
  subarray: "subarray-1",
};

// Overlaps SB_A on the same subarray (09:00 – 11:00 vs 08:00 – 10:00)
const SB_B = {
  id: "sb-002",
  startTime: "2026-04-01T09:00:00Z",
  endTime: "2026-04-01T11:00:00Z",
  subarray: "subarray-1",
};

// Adjacent to SB_A (starts exactly when SB_A ends) — no overlap
const SB_C = {
  id: "sb-003",
  startTime: "2026-04-01T10:00:00Z",
  endTime: "2026-04-01T12:00:00Z",
  subarray: "subarray-1",
};

// Different subarray — never contends with SB_A
const SB_D = {
  id: "sb-004",
  startTime: "2026-04-01T08:00:00Z",
  endTime: "2026-04-01T10:00:00Z",
  subarray: "subarray-2",
};

const SPECTRAL_VALID = {
  band: "L",
  channelWidth: 13440, // Hz
  numChannels: 4096, // 4096 × 13 440 Hz ≈ 55 MHz — well within 200 MHz
};

// 4096 × 100 000 Hz = 409.6 MHz — exceeds the 200 MHz FSP limit
const SPECTRAL_TOO_WIDE = {
  band: "L",
  channelWidth: 100000,
  numChannels: 4096,
};

const SPECTRAL_BAD_BAND = {
  band: "XRAY", // not a recognised receiver band
  channelWidth: 13440,
  numChannels: 1000,
};

// ---------------------------------------------------------------------------
// detectContention
// ---------------------------------------------------------------------------

describe("detectContention", () => {
  it("returns no conflicts when the existing list is empty", () => {
    expect(detectContention(SB_A, [])).toEqual([]);
  });

  it("detects overlap on the same subarray", () => {
    const existing = [
      {
        subarray: SB_A.subarray,
        startTime: SB_A.startTime,
        endTime: SB_A.endTime,
        planId: "plan-existing-001",
      },
    ];
    const conflicts = detectContention(SB_B, existing);
    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts[0]).toContain("subarray-1");
    expect(conflicts[0]).toContain("plan-existing-001");
  });

  it("does not flag contention for adjacent (non-overlapping) time windows", () => {
    const existing = [
      {
        subarray: SB_A.subarray,
        startTime: SB_A.startTime,
        endTime: SB_A.endTime,
        planId: "plan-existing-001",
      },
    ];
    expect(detectContention(SB_C, existing)).toEqual([]);
  });

  it("does not flag contention when subarrays differ", () => {
    const existing = [
      {
        subarray: SB_A.subarray,
        startTime: SB_A.startTime,
        endTime: SB_A.endTime,
        planId: "plan-existing-001",
      },
    ];
    expect(detectContention(SB_D, existing)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// checkCapacity
// ---------------------------------------------------------------------------

describe("checkCapacity", () => {
  it("reports no exhaustion when demand is within limits", () => {
    const result = checkCapacity(SB_A.startTime, SB_A.endTime, 13, []);
    expect(result.exhausted).toBe(false);
    expect(result.peak).toBe(13);
    expect(result.available).toBe(MAX_FSPS);
  });

  it("reports exhaustion when cumulative concurrent demand exceeds MAX_FSPS", () => {
    // 15 existing observations × 14 FSPs each = 210 FSPs during the window
    const existing = Array.from({ length: 15 }, () => ({
      startTime: SB_A.startTime,
      endTime: SB_A.endTime,
      fspsUsed: 14,
    }));
    const result = checkCapacity(SB_A.startTime, SB_A.endTime, 13, existing);
    expect(result.exhausted).toBe(true);
    expect(result.peak).toBeGreaterThan(MAX_FSPS);
  });

  it("ignores non-overlapping existing allocations when computing peak", () => {
    const nonOverlapping = [
      {
        startTime: "2026-04-01T00:00:00Z",
        endTime: "2026-04-01T07:59:59Z",
        fspsUsed: MAX_FSPS, // would exhaust capacity, but window does not overlap
      },
    ];
    const result = checkCapacity(
      SB_A.startTime,
      SB_A.endTime,
      13,
      nonOverlapping
    );
    expect(result.exhausted).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateSpectral
// ---------------------------------------------------------------------------

describe("validateSpectral", () => {
  it("accepts null (no spectral config provided)", () => {
    expect(validateSpectral(null).valid).toBe(true);
  });

  it("accepts a valid spectral configuration", () => {
    expect(validateSpectral(SPECTRAL_VALID).valid).toBe(true);
  });

  it("rejects a spectral config whose bandwidth exceeds FSP_MAX_BW_HZ", () => {
    const result = validateSpectral(SPECTRAL_TOO_WIDE);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/200 MHz/);
  });

  it("rejects an unrecognised band identifier", () => {
    const result = validateSpectral(SPECTRAL_BAD_BAND);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/band/i);
    expect(result.reason).toContain("XRAY");
  });

  it("accepts a config with a valid band but no channel dimensions", () => {
    expect(validateSpectral({ band: "L" }).valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// computeFspsRequired
// ---------------------------------------------------------------------------

describe("computeFspsRequired", () => {
  it("returns 13 for a block with no metadata", () => {
    expect(computeFspsRequired(SB_A)).toBe(13);
  });

  it("honours an explicit fspsRequested override in metadata", () => {
    expect(
      computeFspsRequired({ ...SB_A, metadata: { fspsRequested: 27 } })
    ).toBe(27);
  });
});

// ---------------------------------------------------------------------------
// allocate (integration of all guards)
// ---------------------------------------------------------------------------

describe("allocate", () => {
  it("returns a valid FspAllocationPlan for a happy-path request", () => {
    const result = allocate(SB_A, SPECTRAL_VALID, []);
    expect(result.error).toBeUndefined();
    expect(result.plan).toBeDefined();
    expect(result.plan.planId).toMatch(/^plan-sb-001-/);
    expect(result.plan.subarray).toBe(SB_A.subarray);
    expect(result.plan.allocations.length).toBe(13);
    expect(result.plan.allocations[0].startTime).toBe(SB_A.startTime);
  });

  it("returns CONTENTION error when subarray is already allocated in the same window", () => {
    const existing = [
      {
        subarray: SB_A.subarray,
        startTime: SB_A.startTime,
        endTime: SB_A.endTime,
        planId: "plan-existing",
        fspsUsed: 13,
      },
    ];
    const result = allocate(SB_B, null, existing);
    expect(result.error).toBeDefined();
    expect(result.error.code).toBe("CONTENTION");
    expect(result.error.conflicts).toBeDefined();
    expect(result.error.conflicts.length).toBeGreaterThan(0);
  });

  it("returns CAPACITY_EXHAUSTED when concurrent FSP demand exceeds capacity", () => {
    // Use different subarrays to avoid CONTENTION; only trigger capacity limit
    const overloaded = Array.from({ length: 15 }, (_, i) => ({
      subarray: `subarray-${i + 100}`,
      startTime: SB_A.startTime,
      endTime: SB_A.endTime,
      planId: `plan-${i}`,
      fspsUsed: 14, // 15 × 14 = 210 > 197
    }));
    const result = allocate(SB_A, null, overloaded);
    expect(result.error).toBeDefined();
    expect(result.error.code).toBe("CAPACITY_EXHAUSTED");
  });

  it("returns INVALID_SPECTRAL error for an incompatible spectral configuration", () => {
    const result = allocate(SB_A, SPECTRAL_TOO_WIDE, []);
    expect(result.error).toBeDefined();
    expect(result.error.code).toBe("INVALID_SPECTRAL");
  });

  it("returns INVALID_SPECTRAL before checking capacity or contention", () => {
    // Even with a contending existing allocation, spectral check fires first
    const existing = [
      {
        subarray: SB_A.subarray,
        startTime: SB_A.startTime,
        endTime: SB_A.endTime,
        planId: "plan-existing",
        fspsUsed: 13,
      },
    ];
    const result = allocate(SB_B, SPECTRAL_TOO_WIDE, existing);
    expect(result.error.code).toBe("INVALID_SPECTRAL");
  });

  it("includes spectral params in allocation entries when spectralConfig is provided", () => {
    const result = allocate(SB_A, SPECTRAL_VALID, []);
    const firstAlloc = result.plan.allocations[0];
    expect(firstAlloc.params).toMatchObject({
      band: SPECTRAL_VALID.band,
      channelWidth: SPECTRAL_VALID.channelWidth,
    });
  });
});
