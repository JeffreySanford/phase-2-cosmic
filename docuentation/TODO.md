# TODO: Local Data-Rate Simulation Harness (Phase 2)

Alignment anchors

- Frontend UX source of truth: [FRONTEND_UI.md](FRONTEND_UI.md)
- Execution backlog: [../TODO.md](../TODO.md)
- Delivery plan: [../ROADMAP.md](../ROADMAP.md)

Status note

- This file is now a focused simulation-harness specification.
- The canonical repository backlog is [../TODO.md](../TODO.md).
- If task priority conflicts appear, root `TODO.md` and `ROADMAP.md` take precedence.

Specification

- Title: Local Data-Rate Simulation Harness (Phase 2)

- Start Date: 2026-02-26

- Owner: Platform & QA team (TBD)

- Purpose: Provide a reproducible local test harness to approximate production ingest behavior and validate streaming/governance integrations.

- Target Rates: 7.5–8 GB/s (approximate production), and 1 Mb/s (low-rate functional tests)

- Units & Conventions: rates expressed in bytes/sec for tooling; human-friendly suffixes supported (GB/s, MB/s, mbit). 7.5 GB/s = 7_500_000_000 bytes/s; 1 Mb/s = 1_000_000 bits/s = 125_000 bytes/s.

- Target System for Development: Intel i9 desktop, 64 GB RAM, 10 GB GPU. This machine is used for approximation/testing only; production-scale tests require HPC resources.

- Approximation Strategy: support burst-mode, steady-mode, and sampled-mode to emulate sustained high throughput on limited hardware.

Objective

- Provide a reproducible local test harness that can:

  - Simulate sustained ingest at 7.5–8 GB/s (target production-rate approximation)

  - Throttle down to very low rates (1 Mb/s) for functional/integration tests

  - Integrate with the Operational Streaming Plane (Kafka/Pulsar/RabbitMQ) and the Governance API used in Phase 2

  - Produce telemetry and validation metrics (throughput, latency, packet/record loss)

Target machine

- Local dev: Intel i9, 64 GB RAM, 10 GB GPU (note: single desktop hardware cannot fully reproduce exascale I/O; we approximate behaviour via synthetic generators, in-memory buffers, and scaled validation)

Assumptions & notes

- Rate units: we treat the 7.5–8 GB/s target as gigabytes per second (GiB/GB). For clarity use both: 7.5 GB/s = 7.5 * 10^9 bytes/s. "1 Mb/s" is megabit/s (1 Mb/s = 125 KB/s = 0.125 MB/s). All tools accept bytes/sec, so document conversions clearly.

- Local hardware will likely be I/O/CPU bound. Options to approximate the load:

  - Generate raw byte-streams and publish to local Kafka (or write to tmpfs/NVMe if available)

  - Use sampling and scaled bursts to simulate effective sustained rates without requiring sustained disk throughput (e.g., generate 1s bursts at full speed with scaled idle between bursts to approximate average rate)

  - Use multiple parallel producers to saturate NIC/kernel paths

Deliverables

- `tools/data-generator/` (prototype generator in Go or Python) with:

  - Rate limiter flag: `--rate <bytes/s>` and human suffixes (GB/s, MB/s, kb/s)

  - Output targets: `kafka://topic`, `stdout`, `file://path`, `http://go-gateway/ingest`

  - Payload types: random bytes, pre-defined FITS-like blobs, or configurable templates

  - Mode flags: `--burst-mode`, `--steady-mode`, `--sample-rate`

  - Metrics export: Prometheus endpoint with produced bytes/s, record count, latency, errors

- `docs/benchmarks/` records and scripts to measure CPU, memory, disk and NIC when running tests

- `scripts/run-sim.sh` wrapper that brings up required infra (local broker via docker-compose) and launches generator(s)

Step-by-step implementation plan

1. Prototype generator

   - Choose language: Go recommended (low GC overhead and native concurrency). Python acceptable for easier dev but watch GC.

   - Implement token-bucket rate limiter and multi-threaded producers.

   - Implement output adapters: Kafka (sarama/confluent), HTTP client (POST to Governance API), and file sink.

   - Add toggles: `--rate`, `--duration`, `--parallelism`, `--payload-size` (bytes), `--mode` (burst/steady).

1. Local infra setup

   - Provide docker-compose dev profile to start a single-node Kafka (or Pulsar) and ZooKeeper if required.

   Note: For canonical dev infra and frontend run steps, see [GETTING_STARTED.md](GETTING_STARTED.md). For `.env` handling and what is safe to expose to the frontend, see [ENVIRONMENT.md](ENVIRONMENT.md).

   - Provide a preconfigured topic with sufficient partitions to allow producer parallelism.

   - Optionally run a local instance of the Go Gateway to receive HTTP ingest POSTs; otherwise test direct Kafka writes.

1. Measurement & validation

   - Add Prometheus scrape job for generator metrics and for broker metrics.

   - Provide validation script that computes delivered bytes/s vs requested bytes/s and reports errors.

   - Capture system metrics with `iostat`, `nvme` tools, `nethogs`/`iftop`, and `top`/`pidstat`.

1. High-rate approximation strategies (for desktop hardware)

   - Burst strategy: run `N` producers each producing at max speed for short windows (e.g., 1s bursts) with small inter-burst spacing to approximate average.

   - Payload sampling: produce smaller payloads but mark each produced record with a weight so downstream processing can scale metrics as if larger records were produced.

   - Synthetic headers-only events: produce lightweight events that exercise end-to-end code paths but avoid sustaining raw payload throughput; use separate data-replay tests with large blobs when testing storage IO.

1. Low-rate mode

   - Generator supports `--rate 1mbit` (convert to bytes/s internally) and ensures the token-bucket can cap to extremely low rates.

   - Provide quick commands to switch between modes without restarting infra.

1. Test scenarios to implement

   - Steady high: sustain 7.5 GB/s for short windows (e.g., 30s) while measuring pipeline behavior

   - Ramp: ramp from 0 → 8 GB/s over configurable seconds and watch degradation/backpressure

   - Low-rate functional: 1 Mb/s mode for long-running integration tests

   - Failure injection: drop broker, slow Governance API responses, and observe gateway behavior

1. Integration with Governance & UI

   - Ensure generator events include the schema fields used by the streaming plane and Governance API contract

   - Implement a small adapter that forwards/annotates produced events to the Governance API (test idempotency)

1. Documentation & runbooks

   - Add `docuentation/benchmarks/README.md` with commands and expected outcomes

   - Provide quick-run commands for the developer laptop and for scaled testbed (TACC)

1. Automation & CI

   - Add a smoke test GitHub Action that runs a very small-rate generator (1 Mb/s) against a kafka service to validate deploys

   - Add optional larger nightly jobs in CI infra (if available) to run scaled bursts when hardware supports it

Practical commands and examples

- Start local infra (example using docker-compose):

```bash
docker compose -f docker-compose.yml -f docker/docker-compose.puppeteer.override.yml up -d kafka zookeeper

# or pre-made dev compose that brings up kafka only

```

- Run generator (Go binary example):

```bash

bash

# steady 7.5 GB/s across 8 producers (example)
./data-generator --target kafka://localhost:9092/topic-ingest --parallel 8 --payload-size 4096 --rate 937500000 --duration 30s

# Explanation: 7.5 GB/s = 7_500_000_000 bytes/s; per-producer rate = total / parallel.

# low-rate mode (1 Mb/s bits):
./data-generator --target kafka://localhost:9092/topic-ingest --payload-size 512 --rate 125000 --duration 300s

# Explanation: 1 Mb/s = 1_000_000 bits/s = 125_000 bytes/s

```

(Implementation detail: accept human-friendly suffixes like `7.5GB/s` or `1mbit`)

Caveats & recommendations

- Sustaining 7.5–8 GB/s on a single desktop is unlikely unless specialized NVMe RAID + high-performance NICs are available. The generator should therefore support approximation modes and burst testing rather than forcing sustained disk writes.

- Use partitioned Kafka topics and multiple producers to better exercise parallelism in the streaming plane.

- Measure and tune: producer parallelism, payload size, and local broker configurables (linger.ms, batch.size) will strongly affect achievable throughput.

Timeline (suggested milestones)

- Week 1: Prototype basic generator with `--rate`, `--target kafka`, and single-producer mode

- Week 2: Add parallelism, Prometheus metrics, and docker-compose infra; run small experiments and capture baseline

- Week 3: Implement burst and approximation strategies; create runbooks and record benchmark artifacts

- Week 4: Integrate with Governance API adapter and add CI smoke test

---

Place this file under `docuentation/TODO.md` and link to any generated scripts and `tools/data-generator` code from the repo when implemented.

## Platform alignment and additional scope (Phase 2 decisions)

- Language choices: implement the `tools/data-generator` prototype in Go (recommended) and the Governance API in Java Spring Boot using an OpenAPI-first contract. Keep the existing `NestJS` API as a compatibility/proxy shim while the Java service is implemented and rolled out.

- Containerization: Dockerize Go and Java services (multi-stage Dockerfiles), add `docker/dev-compose.yml` for local dev including Kafka/Zookeeper, Prometheus, and mocked external services. Use Nx targets for `build:docker` and `run:dev` where practical.

- OpenAPI: maintain an OpenAPI contract for the Governance API; use it to generate server and client stubs and to validate the generator's event schema during integration tests.

- Mocks: provide local mock containers for TACC and CosmicAI (OpenAPI-compatible stubs) so developers can exercise job submission and inference flows without external credentials.

## Frontend views required for Phase 2

- Unified Viewer: Mode A (Aladin/HiPS preview) + Mode B (high-res canvas) in a single view state. See `VIEWER_MODEB.md` for the design and mermaid diagram.

- Dashboard: ingestion rates, backlog, topic metrics, and health indicators.

- Topology/Traffic Graph: interactive visualization of NGVLA → ingest → brokers → streaming plane → governance → storage. The diagram should show live metrics overlays (bytes/s, latency) when connected to dev infra.

- Diagnostics & Benchmarks: run generator scenarios (1 Mb/s smoke and burst tests) and capture `iostat`/`nvme`/network metrics; show results and artifacts in this view.

## NGVLA systems to model and mock

- Dish Array & Correlator (data source)

- Edge Preprocessing (RFI filtering, initial calibration)

- Data Ingest Gateway (ingest front-door)

- Operational Streaming Plane (Kafka cluster, partitions)

- Go Streaming Plane processors (real-time consumers)

- Java Governance API (metadata, control, job submission)

- Storage tiers (hot object store, warm buckets, cold archive)

- TACC/HPC and CosmicAI compute surfaces (mocked for local dev)

## Mocking & local testing notes

- Provide small HTTP/REST mocks for TACC and CosmicAI that implement the same OpenAPI surface as production; configure them in `docker/dev-compose.yml`.

- Use the mocks to simulate job submission latencies, queueing, and outputs. Make latency and behavior configurable via environment variables so tests can exercise slow/failed external services.

## Next steps (practical, ordered)

1. Pin preferred runtime versions: `Go 1.21` and `Java 21 (LTS)`. I will use these when scaffolding Dockerfiles and CI.
1. Scaffold tasks (ordered):

   - `tools/data-generator` — Go prototype with Prometheus metrics endpoint (scaffold).

   - `apps/java-governance` — Spring Boot OpenAPI skeleton (scaffold server + generated client stubs).

   - `docker/dev-compose.yml` — dev compose with Kafka, Zookeeper, Prometheus, generator, Java governance stub, and TACC/CosmicAI mocks.
1. Contract & CI work:

   - Add `openapi/governance.yaml` (OpenAPI spec) and `schemas/` payload fixtures.

   - Add a CI validation job that runs `openapi-generator` lint + schema validation against fixtures.
1. Add Nx targets for new services: `build:docker` and `run:dev` (in `project.json`/workspace config) to integrate with the monorepo toolchain.
1. Frontend: scaffold topology view and integrate `VIEWER_MODEB.md` guidance into the viewer adapter.
1. Migration plan: keep `NestJS` shim during rollout but have Java handle routing/proxying as the canonical runtime once deployed.

## Testing & Quality Gates (required)

- Project test coverage goal: **90%** overall across unit + integration + e2e tests. Coverage must be measured per-package/module and aggregated in CI. Failure to meet the threshold should fail the `quality:ci` pipeline.

- Required checks for every PR and CI run:

  - `pnpm run lint` (ESLint) and `pnpm run format:check:changed` (Prettier) — must pass.

  - Unit tests with coverage (`pnpm test` / `nx test`) — enforce minimum coverage per project.

  - Integration tests and API contract validation (OpenAPI lint + schema fixtures).

  - E2E smoke (`e2e:ci` small-rate generator) — must pass in the PR gate for feature branches; full `e2e` and nightly `e2e:ci` runs allowed to be longer.

  - OpenAPI spec validation and schema fixtures check (fail fast on contract drift).

- CI behavior:

  - Add a `quality:ci` job that runs lint, format check, unit tests with coverage, OpenAPI validation and a lightweight e2e smoke test (1 Mb/s generator) before merging.

  - Add a `coverage-report` job that uploads coverage artifacts and fails the pipeline if aggregated coverage < 90%.

  - Add nightly and weekly jobs for longer-running stress/burst tests and larger e2e suites.

- Coverage collection & reporting:

  - Use `c8`/`nyc` for Node projects, `go test -coverprofile` for Go, and JaCoCo for Java. Aggregate results via the CI and publish a coverage badge in the repository README.

## Developer ergonomics

- Provide `pnpm run test:watch` and `pnpm run coverage:short` commands for local fast feedback.

- Document all commands in `docuentation/TESTING_REQUIREMENTS.md` (added alongside this file).
