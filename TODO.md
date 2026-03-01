# TODO (Root Backlog)

This is the authoritative execution backlog for the repo root.  
Status legend: `[NOW]`, `[NEXT]`, `[LATER]`, `[DONE]`.

Testing architecture references:

- [docuentation/TESTING_FRAMEWORK_ARCHITECTURE.md](docuentation/TESTING_FRAMEWORK_ARCHITECTURE.md)
- [docuentation/TESTING_REQUIREMENTS.md](docuentation/TESTING_REQUIREMENTS.md)

## [NOW] 0. Stabilize what exists

- [DONE] Add baseline Java governance API endpoints:
  - `GET /api/v1/health`
  - `POST /api/v1/ingest`
  - `POST /api/v1/jobs`
  - `GET /api/v1/jobs/{id}`
- [DONE] Add initial OpenAPI contract at `openapi/governance.yaml`.
- [DONE] Add schema fixtures under `schemas/fixtures/`.
- [DONE] Add CI gate flow for lint + format + unit + OpenAPI + e2e smoke.
- [NEXT] Add missing unit tests for error and validation paths in Java governance.
- [NEXT] Add CI coverage threshold enforcement script (fail if aggregated < 90%).
- [NEXT] Ensure CI runs the full test matrix (unit, integration, e2e, coverage) without `-DskipTests`.
- [NEXT] Add verbose test reporting and archived test artifacts (JUnit XML, coverage reports) to CI runs for easier failure triage.
- [NEXT] Remove `-DskipTests` from required CI Java workflows (`.github/workflows/maven.yml`) and split build stages into:
  - `verify` (tests + coverage) as required status check
  - `package` (image/jar build) as non-test packaging stage
- [NEXT] Add a Java test/coverage lane for `tools/java-ingest` (module currently has no `src/test` coverage).
- [NEXT] Convert `docker/test-runner` from "Nx test only" to full matrix runner:
  - unit (`nx run-many --target=test`)
  - integration (container-backed tests)
  - e2e smoke (`frontend-e2e`)
  - publish reports to mounted artifact directory
- [NEXT] Create scale-profile smoke/stress harness for synthetic large-volume validation:
  - `profile-smoke` (minutes, PR-safe)
  - `profile-soak` (30-90 min, nightly)
  - `profile-stress` (burst/failure injection, scheduled)
  - include explicit throughput + failure budget assertions
- [DONE] Make `scripts/start-all.sh` export `FRONTEND_PORT` and set default to 4000 for cross-platform dev runs.
- [DONE] Update `apps/frontend/proxy.conf.json` to target `http://localhost:4000` (aligns dev proxy with SSR shim).

## [NOW] 1. Remove architecture drift

- [DONE] Fix broken doc links in `docuentation/README.md`.
- [DONE] Fix malformed Mermaid code fences in messaging docs.
- [NEXT] Mark each architecture doc section as `implemented` / `in-progress` / `planned`.
- [NEXT] Reconcile service naming between docs and compose (`java-ingest` vs `java-governance`) in all docs.
- [DONE] Fix docker compose mounts for Loki/Grafana/Alertmanager (corrected `docker/dev-compose.yml` paths).
- [DONE] Align developer SSR port to avoid conflicts with Grafana (set `FRONTEND_PORT=4000` default).

## [NEXT] 2. Governance durability and correctness

- [DONE] Replace in-memory job store with durable storage (Redis dev baseline).
- Implement full job lifecycle transitions:
  - `QUEUED`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELED`, `TIMED_OUT`.
- [NEXT] Decide and standardize job control contract:
  - keep `/jobs/{id}/transition`, or
  - introduce explicit action endpoints (`/cancel`, `/retry`, etc.).
- Add job cancellation endpoint and idempotent update semantics.
- Add request-id and trace-id propagation across all governance APIs.
- Add optimistic-locking/versioning for job updates.

### Recent updates

- Durable Jobs control-plane implemented in dev using Redis; job DTOs and frontend models normalized (`jobId`, `workflow`, `status`, `parameters`).
- Added a minimal Datasets API scaffold and frontend `Datasets` page route/component.
- Fixed `apps/java-governance` POM JSON Schema dependency version.

## [NEXT] 3. Frontend operations-console delivery

- [DONE] Implement `Jobs` route and baseline submit/status/transition flow.
- [DONE] Implement `Datasets` route and baseline CRUD scaffold.
- [NEXT] Normalize frontend models and UX labels to canonical contract (`jobId/workflow/status`) and remove legacy field naming.
- Add shared page-state components (`loading`, `empty`, `stale`, `error`, `recovered`).
- Evolve `Datasets` from CRUD scaffold to readiness/provenance operational view.
- Add global status/freshness band in app shell.

## [NEXT] 4. Security hardening

- Add authN/authZ middleware to Java governance API.
- Add environment-based route hardening in frontend Nest shim:
  - disable diagnostics listing in production
  - protect Prometheus proxy
  - remove absolute path disclosure
- Add audit logging for job submissions and state transitions.

## [NEXT] 5. Integration and contract reliability

- Add integration tests with Kafka/Testcontainers for ingest flow.
- Add explicit integration/e2e stress tests and a verbose test harness for large-scale smoke/stress validation (see ROADMAP testing additions).
- Add fixture compatibility tests for request/response examples across API versions.
- Add backward-compatibility checks when `openapi/governance.yaml` changes.

## [NEXT] 5B. Test Matrix By Service/Container

- `apps/frontend`:
  - increase unit coverage for jobs/datasets/error-state rendering
  - add contract tests around governance DTO mapping
- `apps/frontend-e2e`:
  - add explicit `e2e` and `e2e-ci` Nx targets if inferred targets drift
  - add journeys for job submit -> transition -> artifact view and dataset create -> list -> detail
- `apps/java-governance`:
  - add controller/service/repository negative-path tests
  - add integration tests for Redis durability and restart recovery
- `tools/java-ingest`:
  - add initial test suite (`src/test`) with ingest validation and failure-path tests
  - enforce surefire/failsafe reports and JaCoCo coverage publication
- `tools/data-generator`:
  - add Go `_test.go` unit tests for generator config validation and mode selection
  - add integration tests for Kafka publish success/failure handling
- `docker/dev-compose.yml` stack:
  - add compose smoke script that blocks until healthchecks are green, then runs API and UI probes
  - add a failure-injection smoke (broker restart, Redis restart) to verify graceful degradation/recovery

## [LATER] 6. Streaming and control-plane parity

- Implement `go-processors` consumer service referenced in docs.
- Add Kafka topic contract docs and versioned schemas.
- Add DLQ/replay tooling and runbook.
- Add end-to-end trace correlation from generator -> governance -> storage.

## [LATER] 7. HPC adapter pathway

- Define compute-adapter contract for external compute services.
- Add local TACC/CosmicAI mocks in `docker/dev-compose.yml`.
- Implement async dispatch queue and worker for compute jobs.
- Add dataset/provenance linkage for derived artifacts.

## [LATER] 8. Operations and observability

- Define SLOs and alert thresholds for:
  - API availability
  - p95 latency
  - job queue depth
  - ingestion error rate
- Add dashboards for governance lifecycle and API error taxonomy.
- Add quarterly performance benchmark runbook.

## [LATER] 9. Large-Scale Validation Program (240 PB readiness path)

- Define and document synthetic scale equivalence model so workstation/CI tests approximate production-class behavior.
- Add deterministic data profiles with reproducible seeds and dataset manifests.
- Track long-run stability metrics:
  - sustained ingest rate
  - queue depth stability
  - retry/error rates
  - memory/disk growth over time
- Add weekly "stability board" report artifact in CI (trend charts + pass/fail summary).
