# Performance & Load Testing — Quickstart

This document provides a lightweight way to exercise the governance API for performance testing.

Prerequisites

- Governance service running locally on `http://localhost:8080`.
- `node` and `pnpm` installed for the provided script.

Quick run (small load)

```bash
pnpm install -w # or ensure node-fetch is available
node tools/perf/job-publisher.js
```

Environment variables

- `GOV_URL`: base URL for governance API (default `http://localhost:8080/api/v1/jobs`).
- `RATE`: messages per second (default `10`).
- `TOTAL`: total messages to publish (default `100`).

## Profiles

A convenience wrapper is provided to run predefined profiles:

```bash
# smoke: short burst
bash tools/perf/run-profile.sh smoke

# soak: longer run for 10k messages
bash tools/perf/run-profile.sh soak

# stress: high‑rate burst of 50k messages
bash tools/perf/run-profile.sh stress
```

Notes & next steps

- This simple script is for quick smoke/load checks. For robust performance testing use a dedicated tool (Gatling, k6, or JMeter) and run against an isolated staging environment.
- When running against the full compose stack, ensure Kafka and Redis are available and the governance service is configured with the correct `KAFKA_BOOTSTRAP_SERVERS`.

## Runtime load profile control (SSR API)

The frontend SSR server now exposes a runtime profile control endpoint used by the footer selector:

- `GET /api/load-profile` - current runtime mode and worker count
- `POST /api/load-profile` - apply profile (`10`, `25`, `50`, `100`)

Example:

```bash
curl -X POST http://localhost:4000/api/load-profile \
  -H "content-type: application/json" \
  -d '{"profilePct":100,"smokeSeconds":180}'
```

Profile `100` auto-reverts to `10` after the bounded smoke window.

## One-command stress harness

Use the repeatable harness to set profile, run publisher load, snapshot metrics, and collect logs:

```bash
bash scripts/stress-run.sh
```

PowerShell:

```powershell
.\scripts\stress-run.ps1
```

Key environment overrides:

- `SSR_URL` (default `http://localhost:4000`)
- `PROFILE` (default `100`)
- `SMOKE_SECONDS` (default `180`)
- `RATE` (publisher messages/sec, default `200`)
- `TOTAL` (publisher total messages, default `5000`)
