# Stress Test / Load Generation (Stress Load)

This section documents the **Stress Load** feature: spinning up synthetic load generators, validating the system under stress, and using the dashboard replay + validation tooling.

## Overview

Stress Load is controlled via the frontend UI and a backend orchestration service. It is designed for:

- quick safety checks (smoke stress)
- measuring system behavior under load
- validating that observability (Prometheus/Grafana) reflects real work
- stress replay (replay a recorded profile sequence)

Stress load is implemented in the frontend backend (`RuntimeLoadProfileService`) and may run using:

- **Docker workers** (recommended) via `STRESS_USE_DOCKER_WORKERS=true`
- **Local binary workers** (fallback) if Docker is unavailable

The CI pipeline includes validation steps and artifact collection to make failures easier to debug.

---

## How to run stress load locally

### 1) Start the full stack

The fastest way is to use the `dev-compose` stack and the SSR server:

```bash
pnpm run start:all
```

or, if you want the full stack (with docker compose + SSR) in a single script:

```bash
bash scripts/dev-up.sh
```

### 2) Enable stress mode in the UI

In the footer:

- Toggle **Stress** on
- Select a stress profile (10/25/50/100)
- When active, the dashboard shows a **Stress Load** card with:
  - active/inactive state
  - profile %
  - worker count
  - a sparkline history
  - a **Replay history** button

### 3) Use replay mode

Once you have used stress mode, the system records profile changes.
Click **Replay history** to re-run the same sequence automatically.

#### Auto‑replay controls

The dashboard also includes an **auto‑replay mode** that will periodically replay the recorded sequence automatically.

- Use the **interval input** to choose how often the history should replay (in ms).
- Choose a replay behavior:
  - **Loop** (default): repeat indefinitely.
  - **Once**: replay a single time and stop.
  - **Random**: replay on a random cadence between 100ms and 60s.
- The UI shows a small banner when auto‑replay is active, including a countdown to the next run.

---

## CI validation and troubleshooting

The CI pipeline runs a dedicated validation harness:

- `scripts/ci-validate-stress.sh` starts the compose stack + SSR
- it runs two validation scripts:
  - `scripts/check-stress-containers.sh` (verifies containers start/stop)
  - `scripts/validate-100pct-load.js` (verifies Prometheus metrics increase)

### Debug endpoints (useful when telemetry seems stuck)

There are a couple of useful server-side endpoints for debugging whether stress mode is actually generating load and whether the telemetry stream is updating:

- `GET /api/load-profile/debug` - returns current profile status + per-worker process/container snapshots + the latest telemetry payload sent over SSE.
- `GET /api/telemetry/debug` - returns the last SSE payload, the active SSE client count, and the list of worker log files (`tools/data-generator/logs/runtime-profile.worker-*.bin`).

Example:

```bash
curl http://localhost:3000/api/load-profile/debug | jq .
curl http://localhost:3000/api/telemetry/debug | jq .
```

If these endpoints return stable/unchanging values despite stress mode being enabled, then either the workers are not actually running or their output logs are not being written to the expected directory.

### Telemetry streaming (push vs polling)

The frontend no longer relies solely on periodic polling for stress-related metrics. Instead, the backend streams updates via Server-Sent Events (SSE) from `/api/telemetry/stream`.

The SSE stream is triggered whenever the runtime profile worker log files change, so the UI reflects load changes in near real-time without requiring manual polling.

The backend still maintains a 1s heartbeat broadcast as a fallback.

### Artifacts

On failure, CI uploads artifacts to aid debugging:

- `validation-output/**`
  - `before-*.json`, `after-*.json` (Prometheus snapshots)
  - `container-count-before.txt`, `container-count-after.txt`
  - `docker-ps.txt`, `compose-ps.txt`, `compose-logs.txt` (if applicable)
  - `ssr.log` (SSR output)
  - `error.txt` (validation diagnostics)

### Configurable validation thresholds

By default the validation requires a measurable delta in bytes and CPU.
You can tune thresholds using env vars:

- `MIN_DELTA_BYTES` (default: 1)
- `MIN_DELTA_CPU` (default: 1)
- `ADAPTIVE_THRESHOLD=true` (default) enables noise-aware thresholds based on baseline stddev.

Example:

```bash
ADAPTIVE_THRESHOLD=true MIN_DELTA_BYTES=5 MIN_DELTA_CPU=2 node scripts/validate-100pct-load.js
```

---

## Safety rails (auto-revert, max duration, kill switch)

The backend automatically reverts stress mode after a maximum duration to prevent runaway load.

Environment variables affecting this behavior:

- `STRESS_MAX_DURATION` (seconds) — maximum duration before auto-revert
- `STRESS_AUTO_REVERT=false` — disable auto-revert
- `STRESS_DISABLE=true` — immediate kill switch (disables stress and stops workers)

---

## Where to look for related docs

- [CI validation scripts](../../scripts/ci-validate-stress.sh) — runs in CI

---

## Design notes & future work

### What already existed (Phase 0 discovery)

- A runtime load profile controller lives in `apps/frontend/server.nest.ts` and supports:
  - `GET /api/load-profile` (read current profile)
  - `POST /api/load-profile` (set profile to 10/25/50/100)
- The backend previously started `tools/data-generator` worker processes to generate load.
- The frontend `LoadProfileService` persisted the selected profile in localStorage, and adjusted telemetry polling cadence based on it.
- A mock mode was already implemented; it scales fake telemetry outputs without generating real load.

### Control model & orchestration direction

The current implementation treats the frontend as a **control plane**, and the backend as the **authoritative orchestrator**:

- The frontend sends profile changes to `/api/load-profile`.
- The backend manages worker lifecycle and health (either local binaries or Docker containers).
- Stress mode is opt-in and requires explicit UI activation.

### Telemetry & real load

When stress mode is active, **all operational telemetry should come from real collection/query paths** (no canned values). This ensures the dashboard reflects real system behavior under load.

### Safety rails (already implemented)

- **Auto-revert**: stress mode automatically reverts after a maximum duration (configurable via `STRESS_MAX_DURATION`).
- **Global kill-switch**: `STRESS_DISABLE=true` immediately disables stress and stops workers.
- **Worker caps**: `STRESS_MAX_WORKERS` enforces a maximum worker count (and is auto-calibrated by CPU count).

### Future improvements (non-blocking)

- Persist auto-replay / replay-interval UI state across reloads.
- Add a clear “Auto‑replay is active” indicator with countdown.
- Add a “stop replay on manual profile change” behavior to avoid conflicting inputs.
- Add replay mode selection (e.g., loop / once / random).
- Add unit/integration tests to verify Docker orchestration behavior and cleanup.
