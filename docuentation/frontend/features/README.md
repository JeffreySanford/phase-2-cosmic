# Frontend Feature Specs

Alignment anchors

- Frontend UX source of truth: [../../FRONTEND_UI.md](../../FRONTEND_UI.md)
- Execution backlog: [../../../TODO.md](../../../TODO.md)
- Delivery plan: [../../../ROADMAP.md](../../../ROADMAP.md)

This folder contains page-level frontend behavior specifications.

Current feature specs:

- [DASHBOARD.md](DASHBOARD.md)
- [JOBS.md](JOBS.md)
- [DATASETS.md](DATASETS.md)
- [DATASET_UI_VIEW.md](DATASET_UI_VIEW.md)
- [TELEMETRY.md](TELEMETRY.md)
- [TOPOLOGY.md](TOPOLOGY.md)
- [DIAGNOSTICS.md](DIAGNOSTICS.md)
- [VISUALIZATION.md](VISUALIZATION.md)
- [SETTINGS.md](SETTINGS.md)

Implementation policy:

- If page behavior here conflicts with higher-level docs, prioritize:
  1. [FRONTEND_UI.md](../../FRONTEND_UI.md)
  2. [../../../TODO.md](../../../TODO.md)
  3. [../../../ROADMAP.md](../../../ROADMAP.md)

Global stress-profile policy (development):

- The footer-level global load profile (`10%`, `25%`, `50%`, `100%`) is the shared UX entry point for development stress behavior.
- Current implementation is a frontend polling-intensity scaffold and cross-page state indicator.
- Real machine stress control (CPU/memory/network/GPU target utilization) requires backend runtime controls and live host metrics; until then, all docs must describe this as `scaffold` or `planned`, not `implemented`.

Current data-source coverage (development):

- `Telemetry`: live Prometheus via SSR proxy.
- `Dashboard`: live Prometheus cards (no full system summary yet).
- `Diagnostics`: live SSR diagnostics endpoints + live Prometheus cards.
- `Jobs`: live governance API.
- `Datasets`: live governance API.
- `Topology`: API-first with mock fallback when `/api/topology` is unavailable.
- `Landing`, `Settings`, `Visualizations`: placeholder content at this stage.
