# Frontend Hardening Tracker

This file tracks the frontend cleanup and hardening work that is now being
folded into adjacent `TODO.md` and `ROADMAP.md` delivery instead of running
as a standalone pause in execution.

## Status

- Started: March 5, 2026
- Execution mode: folded into adjacent roadmap work
- Scope: frontend architecture, operator trust, live/mock semantics, and
  route-level reliability

## Work Items

- [done] Remove silent live-mode fallback to mock data

  - Topology should show explicit unavailable/stale state in live mode.
  - Diagnostics/telemetry-facing routes should not quietly substitute mock
    visuals when live dependencies fail.

- [done] Harden diagnostics security and environment behavior

  - Stop exposing absolute host paths.
  - Make diagnostics access and source labeling environment-aware.

- [done] Make global status/freshness handling trustworthy

  - Replace partial health assumptions with explicit multi-source status.
  - Make the status band persistent and spec-aligned.

- [pending] Refactor Jobs route state management

  - Remove nested subscription chains.
  - Clean up polling teardown and align page-state UX.
- [done] Display and edit job lineage in Jobs route
  - Show lineage info in job-detail panel and allow submit payloads to include lineage metadata
  - Mission outcome: Institutional trust and audit
  - Operator/science impact: operators can trace parent/ancestor jobs directly from UI
  - Validation evidence: new unit tests for JobsService and e2e scenario covering lineage, plus dialog and editor component tests
- [new] Evaluate Pulsar status component integration into Telemetry/Diagnostics view
  - Determine if the existing Pulsar-dashboard component can be embedded just like Kafka/RabbitMQ
  - Mission outcome: Observatory continuity
  - Operator/science impact: earlier visibility into message‑fabric health for Pulsar
  - Validation evidence: prototype draft and performance smoke tests

- [pending] Unify load-profile and operational-state UX
  - Clarify runtime-controlled vs scaffold behavior.
  - Reuse shared freshness/source semantics across Overview, Telemetry,
    Diagnostics, and Topology.

## Validation

- Required checks for each implementation slice:
  - `pnpm nx run frontend:lint`
  - `pnpm nx run frontend:test --runInBand`
  - targeted doc lint when documentation changes

## Notes

- Remaining frontend cleanup should be completed inside the adjacent feature
  work that touches the same routes and services.
- Highest-value remaining carry-forward item:
  - `Jobs` route state management and polling cleanup
