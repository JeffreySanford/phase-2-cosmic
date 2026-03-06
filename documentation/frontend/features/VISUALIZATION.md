# Visualization

Alignment anchors

- Frontend UX source of truth: [../../FRONTEND_UI.md](/docuentation/frontend/FRONTEND_UI.md)
- Execution backlog: [../../../TODO.md](/docuentation/planning/TODO.md)
- Delivery plan: [../../../ROADMAP.md](/ROADMAP.md)

This page documents the Visualizations area of the frontend where rich data visualizations and embeddable widgets live.

## Purpose

- Provide a centralized place for custom visualizations, charting widgets, and interactive graphs that complement the Telemetry and Topology pages.

## Key capabilities

- Host library-driven visualizations (D3, Vega, or the `ui-visualization` shared library) for:
  - Time series charts (line, area)
  - Histograms and distributions
  - Gauges and radial indicators
  - Custom spatial visualizations based on topology data
- Provide parameterized visualizations (metric selection, time window, thresholds) and export/download options.
- Include broker-specific operational cards for `Kafka`, `RabbitMQ`, and `Pulsar` when enabled.

## Data sources

- Prometheus via `TelemetryService` and `/api/proxy/prometheus`.
- Application APIs for pre-aggregated or topology-linked datasets.

Required broker metrics coverage:

- Kafka: topic lag, throughput, error/retry rate
- RabbitMQ: queue depth, delivery/ack/nack rate, consumer utilization
- Pulsar: backlog, publish rate, dispatch latency, subscription health

## Developer notes

- Visualizations should be implemented as reusable components that accept configuration inputs (metric expression, labels, time range, refresh interval).
- Prefer server-side queries for expensive aggregations and keep the client responsible for rendering only.
- Use `ui-visualization` for standardized controls and UI consistency.

## UX patterns

- Each visualization has a compact card view for Dashboard and an expanded view in the Visualizations page.
- Allow users to pin frequently-used charts to the Dashboard.
- Add broker filter chips/tabs (`kafka`, `rabbitmq`, `pulsar`) and flow filters (`ingest`, `control`, `audit`).
- Each card must display data source state (`live`, `fallback`, `mock`, `stale`) to avoid operator ambiguity.

## Implementation note (2026-03-03)

- Broker parity on this page is required by roadmap and backlog updates.
- The first non-placeholder version should ship with at least one chart per broker family.
