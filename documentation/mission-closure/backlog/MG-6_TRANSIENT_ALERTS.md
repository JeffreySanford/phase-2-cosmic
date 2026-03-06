# MG-6: Transient / Low-Latency Alert Path

Owner: Streaming + Science Operations

## Goal

Provide prioritized low-latency alert routing, SLO metrics, and operator controls for transient/multi-messenger alerts.

## Deliverables

- Alert priority routing in ingest pipeline.
- Latency SLOs and Prometheus metrics; dashboards and alerts.
- Frontend operator UI for alert triage and acknowledgement.
- Tests: latency SLO verification harness and e2e for alert flow.

## Acceptance Criteria

- Alerts are routed with priority and latency metrics are emitted.
- Operator UI allows triage and acknowledgement of transient alerts.
