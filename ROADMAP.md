# ROADMAP

## Status

- Working roadmap for 2026 delivery from architecture baseline to mission-aligned executable platform.
- MVP-first prioritization remains in effect.

## Current

- Foundation baseline established (frontend routes, governance API baseline, contracts, compose observability stack).
- Phase 1, 1B, and 1C completion milestones are recorded.
- Active roadmap execution is centered on Phase 2/2A/3/4 and PI-1 sprint sequencing.

## Next

### Immediate

- Finalize Sprint 1 Testcontainers scaffold and CI lane setup.
- Complete deterministic provenance E2E implementation.
- Close deferred docs-validation items from NGVLA fidelity track.

### High

- Phase 2 streaming-to-governance integration with broker interruption/replay safety.
- Phase 2A mission-critical closure (timing integrity, RFI loop, VO interoperability expansion, commissioning, DR policy).
- Phase 3 frontend control-plane fidelity and Viewer Mode B rollout.

### Medium

- Phase 4 reliability/security hardening (backpressure, rate limiting, auth, audit, SLO dashboards).
- Phase 5 HPC adapter path and compute-orchestration contract alignment.
- Phase 6 ngVLA data architecture delivery (manifest, lineage, catalog, RBAC, analytics).

### Low

- Post-PI long-horizon catalog search/lineage graph and data-lake format evaluation.
- Extended benchmark tracks and optional runtime distribution migrations.

## Backlog

- Phase 2: Kafka/RabbitMQ/Pulsar integration parity, contract versioning, DLQ/replay runbooks, full test matrix.
- Phase 2A: timing/frequency metadata gates, RFI model, TAP/ADQL/DataLink/SODA conformance, commissioning scenarios, DR drills.
- Phase 3: governance-integrated UI lifecycle flows, route-state fidelity, diagnostics hardening, stress-profile UX standardization.
- Phase 4: queue controls, authN/authZ enforcement, immutable audit strategy, load/failure resilience gates.
- Phase 5: external compute adapter contracts, async dispatch, provenance-linked compute outputs.
- Phase 6: canonical dataset manifest model, lineage chain APIs, dataset search/catalog, ETL quality validator, publication policy hooks.
- Ongoing tracks: testing coverage, documentation synchronization, messaging docs parity, quarterly performance benchmarks.

## Completed

- Baseline frontend telemetry/topology/diagnostics plus `Jobs`/`Datasets` routes with SSR shim.
- Baseline streaming stack: data generator + Kafka/Prometheus/Grafana compose setup.
- Baseline governance contracts and API scaffolding with Redis-backed local durability.
- Phase 1: governance API maturity outcomes marked complete.
- Phase 1B: frontend orchestration baseline outcomes marked complete.
- Phase 1C: NGVLA reference fidelity and demo automation outcomes marked complete (except explicitly deferred items moved to next phases).
- Added performance publisher tooling and testing documentation baseline.

## INSTRUCTIONS

- Add mission linkage to each new roadmap phase deliverable and exit criterion:
  - `Mission outcome:` canonical outcome from mission alignment docs.
  - `Operator/science impact:` observable operator/science improvement.
  - `Validation evidence:` objective artifact or gate.
- Canonical outcomes:
  1. Observatory continuity
  2. Reproducible science
  3. Compute-to-archive efficiency
  4. Institutional trust and audit
  5. Human decision speed
- Keep roadmap runtime-synchronized; avoid documentation-only claims.
- Favor contract-first integration and preserve migration safety with parallel transitional components when needed.
- Required quality track expectations:
  - PR gate: lint/format/OpenAPI validation/unit tests/coverage/frontend smoke e2e/Java verify.
  - Integration track: Testcontainers-based broker+state dependencies, compose smoke, compatibility tests.
  - Stress track: reproducible synthetic loads, failure injection, long-duration stability assertions.
- PI scheduling baseline:
  - PI-1 (Mar-Apr 2026), 2-week sprints, 4 sprints.
  - Sprint 1: Testcontainers scaffold.
  - Sprint 2: Provenance E2E.
  - Sprint 3: flaky-suite migration.
  - Sprint 4: CI gating and nightly lanes.
- References:
  - Testing: `docuentation/testing/TESTING_FRAMEWORK_ARCHITECTURE.md`, `docuentation/testing/TESTING_REQUIREMENTS.md`
  - Mission: `docuentation/ngvla/NGVLA_MISSION_ALIGNMENT.md`, `docuentation/ngvla/MISSION_TO_CAPABILITY_TRACE.md`, `docuentation/ngvla/MISSION_GATES.md`
  - Data architecture: `docuentation/data/DATA_ARCHITECTURE.md`, `docuentation/ngvla/NGVLA_DATA_ARCHITECT_RESEARCH.md`
  - Mission closure: `docuentation/mission-closure/*.md`
