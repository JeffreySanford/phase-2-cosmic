# MG-1: Timing Integrity

Owner: Data Architecture + Streaming + Governance

## Goal

Add timing & frequency metadata, implement timing-quality gates that block promotion to SCI when budgets exceeded, expose timing metrics, and provide operator UI indicators.

## Deliverables

- Schema: declare `timeRef`, `clockOffsetNs`, `timeSyncQuality`, `timingWindowStart`, `timingWindowEnd` in `openapi/governance.yaml` and packaged resources.
- Backend: enforce `DQ-TIM-001` gate in `JobService` for SCI promotion.
- Tests: unit tests for drift-budget calculation; integration test where transition to COMPLETED fails with `etl_quality_gate_failed` and details include `DQ-TIM-001`.
- Frontend: Diagnostics/Topology card to show `timing_drift_ns` and alert when exceeding threshold.
- Runbook: operator steps to triage timing violations and run clock-sync checks.

## Acceptance Criteria

- Promotion to SCI is blocked when timing budget exceeded (test asserts `etl_quality_gate_failed` with `DQ-TIM-001`).
- `timing_drift_ns` metric exported and visible in UI diagnostics.
- CI includes unit + integration + frontend unit tests covering this behavior.

## Notes

Existing code already includes manifest fields and a `DQ-TIM-001` rule; ensure tests and schema resources are consistent.
