# Trident FSP Allocator Simulator

A lightweight, in-process FSP (Frequency Slice Processor) allocation simulator for the Trident gateway. It enforces finite capacity constraints, detects subarray contention, and validates spectral configurations before any downstream backend is invoked.

## Overview

The simulator sits between the scheduling layer and the backend correlator. When a `SchedulingBlock` is submitted, the allocator:

1. **Validates** the spectral configuration against FSP hardware limits (200 MHz instantaneous bandwidth per FSP, recognised receiver bands only).
2. **Detects contention** — rejects the request with `409 CONTENTION` if the same subarray is already allocated for an overlapping time window.
3. **Checks capacity** — rejects with `409 CAPACITY_EXHAUSTED` when peak concurrent FSP demand across all allocations would exceed the 197-FSP ceiling.
4. **Produces an `FspAllocationPlan`** listing all assigned FSP IDs for the observation window.

## Contents

```text
tools/trident-allocator/
├── allocator.js        Pure allocation logic (no I/O — fully unit-testable)
├── allocator.test.js   Jest unit tests (16 assertions across 5 describe blocks)
├── server.js           Thin HTTP wrapper: POST /allocate · GET /health
├── package.json
└── README.md           (this file)
```

## Running the simulator

```bash
# From the workspace root
node tools/trident-allocator/server.js

# Or with a custom port
ALLOCATOR_PORT=8000 node tools/trident-allocator/server.js
```

Default port: **7777** (localhost only — `127.0.0.1`).

## REST API

### `POST /allocate`

Request body (JSON):

```json
{
  "schedulingBlock": {
    "id": "sb-001",
    "startTime": "2026-04-01T08:00:00Z",
    "endTime": "2026-04-01T10:00:00Z",
    "subarray": "subarray-1",
    "metadata": { "fspsRequested": 13 }
  },
  "spectralConfig": {
    "band": "L",
    "channelWidth": 13440,
    "numChannels": 4096
  },
  "existingAllocations": []
}
```

**Success — `200 OK`:** Returns an `FspAllocationPlan`.

```json
{
  "planId": "plan-sb-001-1712563200000",
  "subarray": "subarray-1",
  "allocations": [
    {
      "fspId": "fsp-001",
      "startTime": "...",
      "endTime": "...",
      "params": { "band": "L", "channelWidth": 13440 }
    }
  ]
}
```

**Contention — `409 Conflict`:**

```json
{
  "code": "CONTENTION",
  "message": "Subarray contention detected",
  "conflicts": [
    "Subarray \"subarray-1\" is already allocated to plan \"plan-...\" (...)"
  ]
}
```

**Capacity exhausted — `409 Conflict`:**

```json
{
  "code": "CAPACITY_EXHAUSTED",
  "message": "FSP capacity exceeded: peak demand 210 > 197 available"
}
```

**Invalid spectral config — `422 Unprocessable Entity`:**

```json
{
  "code": "INVALID_SPECTRAL",
  "message": "Spectral plan exceeds FSP bandwidth limit: 409.6 MHz > 200 MHz"
}
```

### `GET /health`

Returns `200 { "status": "ok", "service": "trident-allocator" }`.

## Running unit tests

```bash
# From the workspace root (recommended)
pnpm run test:trident-allocator

# Under the hood this now uses Vitest; the command will pick up
# `tools/trident-allocator/vitest.config.js` and run the same 20
# assertions defined in `allocator.test.js`.
```

## FSP capacity model

| Parameter        | Value                   | Notes                                                              |
| ---------------- | ----------------------- | ------------------------------------------------------------------ |
| `MAX_FSPS`       | 197                     | Total FSP units (SKA-Mid baseline)                                 |
| `FSP_MAX_BW_HZ`  | 200 MHz                 | Max instantaneous bandwidth per FSP                                |
| Default FSPs/obs | 13                      | One zoom-band configuration; override via `metadata.fspsRequested` |
| Valid bands      | UHF, L, S, C, X, Ka, Ku | SKA-Mid receiver bands                                             |

## Integration with the frontend

The Angular `TridentAllocatorService` calls this simulator at `http://localhost:7777/allocate` when the `trident.fsp-allocator` feature flag is enabled.

The **Diagnostics → Trident Allocator** tab in the frontend provides a form UI to submit `SchedulingBlock` requests and inspect the allocation result or conflict diagnostics.

## Notes

- The simulator is **stateless per request** — `existingAllocations` must be supplied by the caller. A future Sprint 3 integration will provide persistent plan storage through the execution API.
- No external dependencies are required to run or test this service.
