# MG-2: RFI/EMC Observability & Mitigation

Owner: Streaming + Frontend + Data Quality

## Goal

Define an RFI event model, attach `rfiFlags` to manifests, add classification and DLQ/replay controls, and surface RFI indicators in operator UI.

## Deliverables

- Schema: `RfiEvent` schema and `rfiFlags` structure in `openapi/governance.yaml`.
- Backend: ingest classification and attach flags to job/dataset manifests; record audit entries.
- DLQ/Replay: tooling and runbook to inspect DLQ and replay flagged windows.
- Frontend: RFI metrics and topology highlights, replay action UI.
- Tests: unit/integration tests mapping events->manifests and replay selection.

## Acceptance Criteria

- RFI events are traceable to affected jobs/datasets.
- `rfiFlags` present in manifests for affected products.
- Replay flow can be triggered for flagged windows with auditable outcome.
