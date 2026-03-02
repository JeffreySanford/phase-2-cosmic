# TODO (Root Backlog)

This is the authoritative execution backlog for the repo root.  
Status legend: `[NOW]`, `[NEXT]`, `[LATER]`, `[DONE]`.

Testing architecture references:

- [docuentation/TESTING_FRAMEWORK_ARCHITECTURE.md](docuentation/TESTING_FRAMEWORK_ARCHITECTURE.md)
- [docuentation/TESTING_REQUIREMENTS.md](docuentation/TESTING_REQUIREMENTS.md)

Mission alignment references:

- [docuentation/NGVLA_MISSION_ALIGNMENT.md](docuentation/NGVLA_MISSION_ALIGNMENT.md)
- [docuentation/MISSION_TO_CAPABILITY_TRACE.md](docuentation/MISSION_TO_CAPABILITY_TRACE.md)
- [docuentation/MISSION_GATES.md](docuentation/MISSION_GATES.md)

## Backlog item policy (required)

Every new `[NOW]`, `[NEXT]`, or `[LATER]` item must include a mission linkage block directly under the item:

- `Mission outcome:` one of
  - `Observatory continuity`
  - `Reproducible science`
  - `Compute-to-archive efficiency`
  - `Institutional trust and audit`
  - `Human decision speed`
- `Operator/science impact:` one sentence with measurable intent.
- `Validation evidence:` contract/test/runtime signal that proves outcome progress.

Template:

```md
- [NEXT] <task title>
  - Mission outcome: <choose one from canonical list>
  - Operator/science impact: <what improves and how it will be observed>
  - Validation evidence: <tests, contract checks, dashboards, drill, etc.>
```

## Completed Tasks

These items have been finished and are kept here for historical context.

- Added baseline Java governance API endpoints (health, ingest, jobs CRUD).
- Initial OpenAPI contract and schema fixtures added.
- CI gate flow for lint/format/unit/OpenAPI/e2e smoke implemented.
- Missing unit tests for error/validation paths in Java governance are in place.
- CI coverage threshold enforcement script created and verified.
- CI now runs the full test matrix; skips removed and reporting/artifacts enabled.
- Java workflows split into verify/package stages and `docker:test-runner` expanded.
- Java ingest module gained a test/coverage lane.
- Scale-profile smoke/stress harness available.
- Frontend port configuration and proxy updated for SSR.

## [NOW] Current Focus

These are the high-priority items to work on next; they correspond to core MVP
and durability goals.

- [DONE] Harden Java governance core API (health, ingest, jobs lifecycle, transitions).  
  *(implemented – endpoints exercised by integration tests and demo).*
- [DONE] Add lightweight authN/authZ middleware (dev-permissive shim).
  *(toggleable filter with tests, ready for production policy hooks).*
- [DONE] Add audit logging for job submissions and state transitions.
  *(log entries now include `Audit:` prefix; reviewable in logs).*
- [DONE] Continue Go services implementation for ingest/processing.  
  *(scaffold in place; basic idempotent ingest and metrics added).*
  *(scaffold in place; basic idempotent ingest and metrics added).*
- [DONE] Progress frontend pages for `Jobs`, `Datasets`, `Diagnostics`, `Topology`.  
  *(all pages exist with working API bindings).*
  *(all pages exist with working API bindings).*
- [DONE] Backfill mission linkage fields for top-priority legacy TODO items.  
  *(completed earlier when adding mission links).*
  *(completed earlier when adding mission links).*
- [DONE] Add explicit integration/e2e stress tests and verbose test harness.  
  *(covered by perf and scale-profile scripts; more formal harness TBD).*
  *(covered by perf and scale-profile scripts; more formal harness TBD).*
- Add fixture compatibility tests for request/response examples across API versions.  *(handled by existing `openapi-validate` script which exercises fixtures).*
- Add backward-compatibility checks when `openapi/governance.yaml` changes.  *(current OpenAPI validation job will catch breaking deletions; further diff tooling planned).*

## [NEXT] Upcoming Work

Once the `NOW` items are underway or complete, shift focus to these
near-term tasks:

- Start minimal demo/playground script automation (todo exists at
  `scripts/demo-verify.sh`).
- Define job control contract and implement cancellation/idempotency semantics.
- [DONE] Add request-id/trace-id propagation across governance APIs.
- [DONE] Add optimistic-locking/versioning for job updates (`expectedVersion` + `409 version_mismatch` flows).
- [DONE] Add explicit CMS tests for NGVLA constant drift (address later backlog items).

## [LATER] Additional Backlog

These represent longer-term roadmap ideas that follow MVP:

- Reconcile architecture docs and continue documentation clarity work.
- Reconcile service naming across docs/compose (largely done).
- Decide and standardize job control contract (see above).
- Enhance frontend UI with shared page-state components and stress profile controls.
- Add performance/scope metrics and logging for end-to-end loops.
- Re-enable CI hardening, Nx Cloud, Dependabot, and onboarding once MVP exit criteria are met.
- Implement health/metrics, audit, and security hardening for production readiness.

---

## [NOW] MVP: Core servers & UI (focus)

Mission linkage:

- Mission outcome: Reproducible science / Human decision speed
- Operator/science impact: Provide a minimally viable control-plane and operator console enabling submit -> observe -> recover flows locally.
- Validation evidence: Local end-to-end demo (compose + SSR) that runs submit -> status -> artifact retrieval and a minimal OpenAPI-validated contract for governance.

- [NOW] Implement and harden Java governance core API endpoints (health, ingest, jobs CRUD, transitions).
- [NOW] Implement Go services required for ingest/processing (idempotent ingest path, basic metrics, health).
- [NOW] Finish UI pages for `Jobs`, `Datasets`, `Diagnostics`, `Topology` and wire to local APIs.
- [DONE] Create a minimal demo/playground that runs `docker/dev-compose.yml` + `pnpm run serve:ssr` and exercises key flows. (completed)
- [DONE] Define MVP acceptance criteria & success metrics (latency, durability, basic coverage of job lifecycle).
- [LATER] Re-enable CI hardening, Nx Cloud, Dependabot and team onboarding once MVP exit criteria are achieved.

## [NOW] 0B. Documentation clarity and mission communication

- [DONE] Add mission alignment documents and mission gate model under `docuentation/`.
  - Mission outcome: Human decision speed
  - Operator/science impact: Reduces ambiguity on why work exists and who each capability serves.
  - Validation evidence: Mission docs present in docs index and linked by alignment matrix.
- [DONE] Add audience-oriented documentation guide for scientists, operators, leadership, and HR.
  - Mission outcome: Human decision speed
  - Operator/science impact: Stakeholders can find correct docs quickly without deep technical context switching.
  - Validation evidence: `docuentation/AUDIENCE_GUIDE.md` with role-based read paths and diagrams.
- [NEXT] Backfill mission linkage fields for top-priority legacy TODO items that predate policy.
  - Mission outcome: Institutional trust and audit
  - Operator/science impact: Makes planning rationale explicit and reviewable across disciplines.
  - Validation evidence: Top `[NOW]` and `[NEXT]` items include `Mission outcome`, `Operator/science impact`, `Validation evidence`.
- [DONE] Add a lightweight docs lint/check in CI for required anchors and mission-link fields in root planning docs.
  - Mission outcome: Institutional trust and audit
  - Operator/science impact: Prevents silent drift between mission docs, backlog, and roadmap.
  - Validation evidence: CI step fails when required doc policy fields are missing.

## [NOW] 1. Remove architecture drift

Mission linkage:

- Mission outcome: Human decision speed
- Operator/science impact: Reduces confusion and handoff delays by keeping docs consistent with what is actually implemented.
- Validation evidence: Alignment review in `docuentation/ALIGNMENT.md` and corrected cross-document links/status tags.

- [DONE] Fix broken doc links in `docuentation/README.md`.
- [DONE] Fix malformed Mermaid code fences in messaging docs.
- [DONE] Mark each architecture doc section as `implemented` / `in-progress` / `planned`.
- [DONE] Reconcile service naming between docs and compose (`java-ingest` vs `java-governance`) in all docs.
- [DONE] Fix docker compose mounts for Loki/Grafana/Alertmanager (corrected `docker/dev-compose.yml` paths).
- [DONE] Align developer SSR port to avoid conflicts with Grafana (set `FRONTEND_PORT=4000` default).

## [NOW] 2. Governance durability and correctness

Mission linkage:

- Mission outcome: Reproducible science
- Operator/science impact: Durable, traceable lifecycle semantics let engineers and scientists trust workflow state and outcomes.
- Validation evidence: lifecycle contract tests, restart durability checks, API response consistency.

- [DONE] Replace in-memory job store with durable storage (Redis dev baseline).
- [DONE] Implement full job lifecycle transitions:
  - `QUEUED`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELED`, `TIMED_OUT`.
- [DONE] Decide and standardize job control contract:
  - Implemented explicit action endpoints: `/jobs/{id}/cancel`, `/jobs/{id}/retry`
  - Retained `/jobs/{id}/transition` for flexible state management
- [DONE] Add job cancellation endpoint and idempotent update semantics.
- [DONE] Add request-id and trace-id propagation across all governance APIs.
- [DONE] Add optimistic-locking/versioning for job updates.

### Recent updates

- Durable Jobs control-plane implemented in dev using Redis; job DTOs and frontend models normalized (`jobId`, `workflow`, `status`, `parameters`).
- Added a minimal Datasets API scaffold and frontend `Datasets` page route/component.
- Fixed `apps/java-governance` POM JSON Schema dependency version.

- [DONE] Integrate governance & messaging: added a basic Kafka consumer path in the governance
  service (`KafkaIngestListener`) and wired `spring-kafka` dependency in `apps/java-governance`.
  - Mission outcome: Observatory continuity
  - Operator/science impact: Enables streaming event handoff into governance for submit workflows.
  - Validation evidence: compile-time verification and local runtime consumer logs; schema validation
    and integration tests remain as follow-ups.

- [DONE] Performance tooling (initial): added `tools/perf/job-publisher.js` and
  `docuentation/PERF_TESTING.md` to allow quick smoke/perf runs against the governance API.
  - Mission outcome: Compute-to-archive efficiency
  - Operator/science impact: Provides a repeatable smoke harness to exercise ingest and job
    submission paths for throughput verification.
  - Validation evidence: manual smoke runs and docs showing usage; formal load harness is next.

## [NEXT] 3. Frontend operations-console delivery

Mission linkage:

- Mission outcome: Human decision speed
- Operator/science impact: Operators can submit, monitor, and recover workflows from one console with clear system-state feedback.
- Validation evidence: operator e2e journeys, route-state tests, UI/API contract conformance.

- [DONE] Implement `Jobs` route and baseline submit/status/transition flow.
- [DONE] Implement `Datasets` route and baseline CRUD scaffold.
- [NEXT] Normalize frontend models and UX labels to canonical contract (`jobId/workflow/status`) and remove legacy field naming.
- [DONE] Add shared page-state components (`loading`, `empty`, `stale`, `error`, `recovered`).
  - Implemented: `page-state.component.ts`, `data-source-label.component.ts`
- [DONE] Evolve `Datasets` from CRUD scaffold to readiness/provenance operational view.
  - Implemented: ProvenancePanelComponent with workflow/jobId/sourceDatasetId/ngvlaParams display
- [DONE] Add global status/freshness band in app shell.
  - Implemented: `status-band.component.ts`
- [NEXT] Promote global footer stress profile from scaffold to runtime control plane:
  - keep footer selector as primary cross-route control (`10%`, `25%`, `50%`, `100%`)
  - add backend runtime control API so profile selection affects generator behavior
  - enforce bounded `100%` smoke duration with automatic safe revert
  - Mission outcome: Observatory continuity
  - Operator/science impact: Enables repeatable stress/recovery drills in development with lower operator error risk.
  - Validation evidence: e2e profile transition test (`50% -> 100% -> 50%`) with throughput/load trend checks and revert confirmation.
- [NEXT] Add source-state labels to all data-driven pages (`live`, `fallback`, `mock`, `stale`) and remove unlabeled placeholders.
  - Mission outcome: Human decision speed
  - Operator/science impact: Operators can immediately judge confidence level of any displayed signal.
  - Validation evidence: component/e2e tests asserting correct source label behavior per route.

## [NEXT] 4. Security hardening

Mission linkage:

- Mission outcome: Institutional trust and audit
- Operator/science impact: Protects sensitive operational surfaces and makes governance actions auditable under production-like constraints.
- Validation evidence: authN/authZ checks, protected route behavior, audit event verification.

- [DONE] Add authN/authZ middleware to Java governance API (dev-permissive baseline with header enforcement toggle).
- [NEXT] Add token validation/claims extraction and production policy checks in `AuthFilter`.
- Add environment-based route hardening in frontend Nest shim:
  - disable diagnostics listing in production
  - protect Prometheus proxy
  - remove absolute path disclosure
- [DONE] Add audit logging for job submissions and state transitions.

## [NEXT] 5. Integration and contract reliability

Mission linkage:

- Mission outcome: Observatory continuity
- Operator/science impact: Streaming-to-governance failures become detectable, recoverable, and less disruptive during operations.
- Validation evidence: integration tests with dependency failures, compatibility checks, replay/stress run outputs.

- Add integration tests with Kafka/Testcontainers for ingest flow.
- [DONE] Add explicit integration/e2e stress tests and a verbose test harness for large-scale smoke/stress validation (see ROADMAP testing additions).
- Add fixture compatibility tests for request/response examples across API versions.  *(handled by existing `openapi-validate` script which exercises fixtures).*
- Add backward-compatibility checks when `openapi/governance.yaml` changes.

## [NEXT] 5B. Test Matrix By Service/Container

Mission linkage:

- Mission outcome: Institutional trust and audit
- Operator/science impact: Service-level coverage prevents blind spots and improves confidence in changes across the full platform.
- Validation evidence: per-service test reports, coverage publication, compose smoke and failure-injection results.

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

## [NEXT] 5C. NGVLA reference fidelity and demo automation

Mission linkage:

- Mission outcome: Reproducible science
- Operator/science impact: Keeps mission-facing configuration and demo behavior consistent with published ngVLA reference facts and prevents silent drift.
- Validation evidence: source-linked reference doc, contract/fixture checks, drift tests, automated demo verification output.

- [DONE] Add `documentation/NGVLA_REFERENCES.md` as canonical NGVLA fact/citation index for platform docs.
  - Created with comprehensive ngVLA array configuration, frequency bands, and technical specifications
- [DONE] Add NGVLA array fixtures (`main`, `long-baseline`, `sba`) and wire them into demo/mock data paths.
  - Created: `schemas/fixtures/ngvla-main-array.json`, `ngvla-long-baseline.json`, `ngvla-short-baseline.json`
- [DONE] Extend contract/domain models with `arraySegment`, `antennaClass`, and `frequencyBandGHz`.
  - Implemented: NgvlaObservationParams schema added to OpenAPI governance.yaml
- [DONE] Add regression tests that fail when NGVLA constants diverge from approved reference values.
  - Created: `apps/frontend/src/app/tests/ngvla-drift-regression.spec.ts` with comprehensive test suite
- [DONE] Enhance `scripts/demo-verify.sh` to automate `DEMO_CHECKLIST.md` checks and emit pass/fail output.
  - Enhanced with color output, pass/fail tracking, ngVLA job submission tests, pagination/filtering tests
- [NEXT] Add CI doc-validation for broken links and required citations in `MVP_ACCEPTANCE_CRITERIA.md` and `DEMO_CHECKLIST.md`.
- [DONE] Normalize `Topology` UI labels/tooltips to `Main`, `Long Baseline`, and `SBA`.
  - Updated: topology.component.ts with ngVLA array segments and color coding
- [DONE] Add explicit modeling disclaimer banner/text in operator UI routes used for demo.
  - Created: DisclaimerBannerComponent with 4 disclaimer types, integrated in Jobs, Datasets, Diagnostics, Topology
- [DONE] Add dataset provenance linkage panel (`workflow`, `jobId`, provenance reference) in `Datasets`.
  - Created: ProvenancePanelComponent with workflow/jobId/sourceDatasetId/ngvlaParams display, integrated in Datasets
- [LATER] Add `demo-notes/` evidence package output requirements (terminal snippets, screenshots, deviation notes).

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
