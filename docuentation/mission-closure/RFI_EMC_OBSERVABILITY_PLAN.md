# RFI EMC Observability And Mitigation Plan

Status: planned  
Owner: Streaming + Frontend + Data Quality  
Related backlog: `TODO.md` `MG-2`

## Problem

Radio Frequency Interference (RFI) and electromagnetic compatibility (EMC) issues can degrade data quality and increase false positives in operational alerts. Current planning lacks a dedicated event model and closed operator loop for detecting, flagging, and replaying affected intervals.

Current platform risk:
- no explicit RFI/EMC schema in API contracts
- no mandatory propagation of RFI quality flags to dataset manifests
- no dedicated operator indicators and replay workflow for RFI-flagged windows

## Why this is necessary

- Protects scientific validity by exposing contamination risk early.
- Avoids publishing or promoting data products with unresolved interference artifacts.
- Improves operational response speed during interference episodes.

## What this enables

- consistent RFI event ingestion and quality-flag propagation
- operator triage workflows with immediate visibility
- targeted replay/reprocessing for flagged windows

## Planned integration steps

1. Contract and data model
- Add `RfiEvent` schema (source, band, intensity, duration, affected channels).
- Attach `rfiFlags`/`qualityFlags` to manifests and provenance records.
- Version API contract examples for RFI paths.

2. Streaming and governance integration
- Count and classify RFI events at ingest.
- Link affected jobs/datasets to corresponding RFI intervals.
- Add replay selector for RFI-flagged time windows.

3. UI and operator flow
- Topology: show impacted links/nodes.
- Telemetry/Visualization: show RFI event rate, affected band/time, and severity.
- Add operator action pattern: acknowledge -> replay -> verify.

4. Testing
- Unit tests for RFI classification and flag propagation logic.
- Integration tests for event-to-manifest mapping and replay selection.
- E2E tests for UI indicators and RFI-driven replay flow.

## Acceptance criteria

- RFI events are visible and traceable to affected datasets/jobs.
- Quality flags are present for every affected product.
- Replay flow can isolate and re-run flagged intervals with auditable outcomes.
