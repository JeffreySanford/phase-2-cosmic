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

Notes & next steps

- This simple script is for quick smoke/load checks. For robust performance testing use a dedicated tool (Gatling, k6, or JMeter) and run against an isolated staging environment.
- When running against the full compose stack, ensure Kafka and Redis are available and the governance service is configured with the correct `KAFKA_BOOTSTRAP_SERVERS`.
