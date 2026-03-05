# TODO: Local Data-Rate Simulation Harness (Phase 2)

## Status

- Focused planning backlog for local data-rate simulation harness work.
- Root `TODO.md` and `ROADMAP.md` remain precedence when priorities conflict.

## Current

- Scope is defined for a reproducible local ingest simulation harness tied to Phase 2 streaming/governance validation.
- Baseline constraints documented for desktop approximation (Intel i9, 64 GB RAM, 10 GB GPU).

## Next

### Immediate

- Pin runtime baselines: `Go 1.21` and `Java 21`.
- Scaffold `tools/data-generator` with rate limiting, targets, and metrics endpoint.
- Add `openapi/governance.yaml` validation flow with schema fixtures in CI.

### High

- Implement generator modes: steady, burst, sampled; include low-rate `1 Mb/s` mode.
- Stand up `docker/dev-compose.yml` profile for Kafka/Zookeeper/Prometheus and mock surfaces.
- Add integration path to Governance API and schema-aligned event payloads.
- Add lightweight PR smoke lane (`1 Mb/s`) and nightly stress lane.

### Medium

- Add benchmark scripts and artifacts under `docuentation/benchmarks/`.
- Build diagnostics/benchmark UI hooks and topology/traffic visualization integration.
- Add TACC/CosmicAI local mock services with configurable latency/failure behavior.
- Add Nx targets for `build:docker` and `run:dev` for generator/governance components.

### Low

- Expand scaled testbed guidance for non-desktop environments.
- Deepen long-duration soak/stress automation and reporting cadence.

## Backlog

- Generator CLI and adapters:
  - `--rate`, `--duration`, `--parallelism`, `--payload-size`, `--mode`
  - targets: `kafka://topic`, `stdout`, `file://path`, `http://.../ingest`
  - payloads: random bytes, FITS-like blobs, template-based records
- Telemetry and validation:
  - Prometheus metrics for bytes/s, record count, latency, errors
  - delivered-vs-requested throughput validation tooling
  - host metrics capture (`iostat`, `pidstat`, network tools)
- Scenario suite:
  - steady high-rate windows
  - ramp tests (0 -> target)
  - low-rate long-running functional tests
  - failure injection (broker down, slow API)
- Governance/UI integration:
  - schema-compliant event forwarding
  - idempotency-focused ingest adapter checks
  - dashboard/topology/diagnostics page integrations
- Automation and quality:
  - `quality:ci` coverage + contract + smoke checks
  - nightly/weekly stress jobs and artifact publication
  - aggregated coverage reporting across Node/Go/Java

## Completed

- None recorded in this planning file yet.

## INSTRUCTIONS

- Alignment anchors:
  - Frontend UX source of truth: `docuentation/frontend/FRONTEND_UI.md`
  - Canonical execution backlog: root `TODO.md`
  - Delivery plan: root `ROADMAP.md`
- Purpose: provide a reproducible local harness to approximate production ingest behavior and validate streaming/governance integrations.
- Target rates:
  - high-rate approximation target: `7.5-8 GB/s`
  - low-rate functional target: `1 Mb/s`
- Unit conventions:
  - tooling should accept bytes/sec as canonical input
  - support human-friendly suffixes (`GB/s`, `MB/s`, `mbit`)
  - conversion note: `1 Mb/s = 125,000 bytes/s`
- Hardware assumption: desktop hardware is approximation-only; production-scale validation requires HPC-class resources.
- Approximation strategy requirements:
  - burst-mode, steady-mode, sampled-mode
  - support parallel producers and partitioned topics
  - allow weighted/synthetic events where needed to emulate effective rates
- Required deliverables:
  - `tools/data-generator/` prototype (Go preferred)
  - `scripts/run-sim.sh` harness wrapper
  - `docuentation/benchmarks/` scripts + benchmark records
- Local infra expectations:
  - compose profile for broker stack and observability
  - preconfigured partitioning for producer parallelism
  - optional local gateway ingest route for HTTP mode
- Testing and quality gates:
  - target 90% aggregated coverage across unit/integration/e2e
  - required PR checks: lint, format, unit coverage, integration+contract validation, e2e smoke
  - nightly/weekly stress/burst jobs for longer validation
- Recommended implementation sequence:
  1. Generator prototype and rate limiter
  2. Infra compose + topics + metrics wiring
  3. Validation/benchmark scripts
  4. Failure-injection scenarios
  5. Governance/UI integration
  6. CI automation and reporting
