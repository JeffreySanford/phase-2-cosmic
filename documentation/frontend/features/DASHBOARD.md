# Dashboard

Alignment anchors

- Frontend UX source of truth: [../../FRONTEND_UI.md](/docuentation/frontend/FRONTEND_UI.md)
- Execution backlog: [../../../TODO.md](/docuentation/planning/TODO.md)
- Delivery plan: [../../../ROADMAP.md](/ROADMAP.md)

This page describes the Dashboard view in the frontend application. The Dashboard provides a high-level operational overview and quick access to key telemetry, diagnostics and control actions for the platform.

## Purpose

- Surface the overall health and recent activity of the system.
- Provide at-a-glance telemetry cards, recent diagnostics artifacts, and quick links to deeper investigation pages (Telemetry, Topology, Visualizations, Diagnostics).

## Primary sections

- **System Summary**: CPU, memory, disk, and cluster-level status derived from the passive diagnostics snapshot and Prometheus metrics.
- **Telemetry Overview**: Small cards showing current values for important metrics (generator bytes produced, write rate, error rates). Each card links to the Telemetry view for detailed charts.
- **Global Load Profile**: Display the active global stress profile selected in the footer (`10%`, `25%`, `50%`, `100%`) and show whether widgets are currently in scaffold mode or runtime-controlled mode.
- **Recent Diagnostics**: Shows presence and timestamp of `logs/system-specs.txt` and any recent `fio-*` / `iperf3-*` logs. Links to the diagnostics page.
- **Generator Status**: Health indicator for the `data-generator` service including scrape status for `/metrics`, last seen timestamp, and quick actions (download logs, re-run diagnostics guidance).
- **Alerts & Warnings**: Lightweight list of noteworthy signals derived from simple PromQL rules (e.g., very high error rates, generator not scraped).

## Data sources

- Prometheus metrics (proxied via `/api/proxy/prometheus`).
- Read-only Diagnostics endpoints on the SSR server (e.g. `/api/diagnostics` and `/api/diagnostics/system-specs`).

Data-source policy:

- Every dashboard widget should expose a source label when implemented:
  - `live` for direct API/Prometheus-backed values
  - `fallback` for API-failure fallback values
  - `mock` for intentionally synthetic values
  - `stale` for expired cached values

## Interaction patterns

- Clicking a telemetry card navigates to `/telemetry` with the selected metric prefilled.
- Recent diagnostics entries open a preview modal or download the artifact.
- Quick actions present safe, read-only operations and links to documentation for any destructive tasks.

## Implementation notes

- Keep the Dashboard lightweight: rely on Prometheus instant/range queries for values and avoid heavy client-side processing.
- Use the existing `TelemetryService` for Prometheus access and the SSR diagnostics endpoints for file artifacts.
- Consider caching the diagnostics index for a short TTL to avoid repeated filesystem reads on the server.
