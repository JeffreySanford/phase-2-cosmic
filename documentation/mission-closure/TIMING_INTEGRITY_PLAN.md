# Timing And Frequency Integrity Plan

Status: planned  
Owner: Data Architecture + Streaming + Governance  
Related backlog: `TODO.md` `MG-1`

## Problem

Interferometric science requires tight time and frequency coherence across antennas and processing stages. If timing metadata is missing, inconsistent, or out of tolerance, downstream calibration/imaging can be scientifically invalid even when pipelines appear operational.

Current platform risk:

- timestamp fields exist but no explicit timing-quality budget enforcement
- no first-class timing drift indicator in operator UI
- no gate that blocks promotion when timing integrity is not proven

## Why this is necessary

- Prevents silent scientific corruption caused by clock drift or reference mismatch.
- Aligns data product trust with observatory-grade interferometric requirements.
- Provides auditable evidence that promoted products meet timing integrity thresholds.

## What this enables

- deterministic timing-quality gates in ETL transitions
- operator-visible drift alarms and trend monitoring
- reproducible timing provenance for later validation/reprocessing

## Planned integration steps

1. Data model and schema

- Add fields to manifest/provenance:
  - `timeRef` (for example UTC(TAI)/GPS reference id)
  - `clockOffsetNs`
  - `timeSyncQuality`
  - `timingWindowStart`/`timingWindowEnd`
- Update schema validation rules and examples.

1. Quality gate enforcement

- Add `DQ-TIM-*` rules to `DATA_QUALITY_STANDARDS.md`. _(completed)_
- Enforce maximum allowed drift/offset per processing level. _(implemented in `JobService.transition`)_
- Block SCI promotion on timing-budget violation with `etl_quality_gate_failed`. _(unit and controller tests added)_

1. Runtime observability

- Emit timing metrics:
  - `timing_drift_ns`
  - `timing_budget_violations_total`
  - `timing_sync_quality_state`
- Surface in Topology/Visualization views with source-state labels.

1. Testing

- Unit tests for drift-budget calculations and schema validation.
- Integration tests for gate rejection on budget breach.
- E2E checks for timing alarm rendering and operator visibility.

## Acceptance criteria

- Promotion to SCI is blocked when timing budget is exceeded.
- Timing drift is visible in operator tooling with thresholds.
- CI includes unit + integration + e2e timing checks.
