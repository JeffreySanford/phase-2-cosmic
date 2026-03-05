<!-- markdownlint-disable MD013 -->

# TODO

## Status

- Active execution backlog for PI-1 (March-April 2026).
- Current focus: testing reliability, messaging parity, mission-closure gaps, and data-architecture hardening.

## Current

- Sprint execution underway for Testcontainers scaffold, provenance E2E, and CI gating.
- Messaging-fabric expansion planned across Kafka, RabbitMQ, and Pulsar paths.
- ngVLA data-architecture alignment and mission-oversight closure tracks are defined and queued.
- Remaining frontend hardening is being folded into adjacent feature work rather
  than run as a standalone pause. See `FRONTEND_HARDENING_TRACKER.md`.

## Next

### Immediate

- Add token validation/claims extraction and production policy checks in `AuthFilter`.
- Add CI doc-validation for broken links and required citations in `MVP_ACCEPTANCE_CRITERIA.md` and `DEMO_CHECKLIST.md`.
- Finalize Sprint 1 Testcontainers scaffold for `apps/java-governance`.

### High

- Provenance E2E implementation and artifact validation.
- RabbitMQ control-plane wiring and Kafka audit mirroring.
- Pulsar edge-ingest bridge with replay/DLQ runbook.
- Topology/Visualization broker parity (Kafka + RabbitMQ + Pulsar).
- ngVLA timing integrity and RFI/EMC observability tracks.

### Medium

- Dataset manifest schema + validation flow (`POST /api/v1/datasets`).
- Job manifest attach + lineage endpoints (`/jobs/{id}/manifest`, `/jobs/{id}/lineage`).
- Dataset catalog filtering and ObsCore-like interoperability metadata fields.
- Queue-aware ingest control with reprocessing budget policy.
- Viewer Mode B progressive high-resolution path rollout.

### Low

- `demo-notes/` evidence package output requirements.
- Post-PI catalog search/lineage analytics expansion.
- Streaming/control-plane parity follow-ons and HPC adapter pathway planning.

## Backlog

- Integration tests with Kafka/Testcontainers for ingest flow.
- Backward-compatibility checks when `openapi/governance.yaml` changes.
- `apps/frontend` coverage expansion for jobs/datasets/error states and DTO mapping tests.
- `apps/frontend-e2e` target hygiene and key operator journeys.
- `apps/java-governance` negative-path tests and Redis durability/restart recovery tests.
- `tools/java-ingest` initial test suite, surefire/failsafe reports, JaCoCo publication.
- `tools/data-generator` Go unit/integration tests and broker failure-path checks.
- Compose smoke and failure-injection scripts (broker/Redis restart resilience).
- ngVLA data-architecture DA-1..DA-11 delivery track.
- Messaging fabric MF-1..MF-6 and required MF-TEST matrix.
- Mission oversights MG-1..MG-6 closure track.
- Viewer Mode B VB-1..VB-4 implementation and go/no-go decision spike.
- Streaming and control-plane parity (go-processors, topic contracts, DLQ/replay tooling, trace correlation).
- HPC adapter pathway (contracts, local mocks, async dispatch, provenance linkage).
- Operations/observability SLOs, dashboards, and benchmark runbook.
- Large-scale validation program (240 PB readiness model and stability board artifacts).

## Completed

- Add authN/authZ middleware to Java governance API (dev-permissive baseline with header enforcement toggle).
- Add audit logging for job submissions and state transitions.
- Add explicit integration/e2e stress tests and verbose test harness baseline.
- Add `documentation/NGVLA_REFERENCES.md` as canonical NGVLA fact/citation index.
- Add NGVLA array fixtures (`main`, `long-baseline`, `sba`) and wire into demo/mock paths.
- Extend contract/domain models with `arraySegment`, `antennaClass`, and `frequencyBandGHz`.
- Add regression tests for NGVLA constant drift.
- Enhance `scripts/demo-verify.sh` with pass/fail automation.
- Normalize Topology labels/tooltips to `Main`, `Long Baseline`, and `SBA`.
- Add modeling disclaimer banner/text across demo-facing operator routes.
- Add dataset provenance linkage panel in `Datasets`.

## INSTRUCTIONS

- Status legend: `[NOW]`, `[NEXT]`, `[LATER]`, `[DONE]`.
- Every new `[NOW]`, `[NEXT]`, or `[LATER]` item must include mission linkage:
  - `Mission outcome:` one of `Observatory continuity`, `Reproducible science`, `Compute-to-archive efficiency`, `Institutional trust and audit`, `Human decision speed`.
  - `Operator/science impact:` one measurable sentence.
  - `Validation evidence:` contract/test/runtime proof signal.
- Use this template for new work items:

```md
- [NEXT] <task title>
  - Mission outcome: <canonical outcome>
  - Operator/science impact: <observable improvement>
  - Validation evidence: <tests/checks/artifacts>
```

- PI planning baseline:
  - PI: PI-1 (Mar 2026-Apr 2026)
  - Sprint length: 2 weeks
  - Sprints: 4
- Keep completed items in `Completed`; do not delete historical evidence.
- Testing architecture references:
  - `docuentation/testing/TESTING_FRAMEWORK_ARCHITECTURE.md`
  - `docuentation/testing/TESTING_REQUIREMENTS.md`
- Mission alignment references:
  - `docuentation/ngvla/NGVLA_MISSION_ALIGNMENT.md`
  - `docuentation/ngvla/MISSION_TO_CAPABILITY_TRACE.md`
  - `docuentation/ngvla/MISSION_GATES.md`
  <!-- markdownlint-enable MD013 -->
