# Frontend Feature Specs

Alignment anchors

- Frontend UX source of truth: [../../FRONTEND_UI.md](/docuentation/frontend/FRONTEND_UI.md)
- Execution backlog: [../../../TODO.md](/docuentation/planning/TODO.md)
- Delivery plan: [../../../ROADMAP.md](/ROADMAP.md)

This folder contains page-level frontend behavior specifications.

Current feature specs:

- [DASHBOARD.md](/docuentation\frontend\features\DASHBOARD.md)
- [JOBS.md](/docuentation\frontend\features\JOBS.md)
- [DATASETS.md](/docuentation\frontend\features\DATASETS.md)
- [DATASET_UI_VIEW.md](/docuentation\frontend\features\DATASET_UI_VIEW.md)
- [TELEMETRY.md](/docuentation\frontend\features\TELEMETRY.md)
- [TOPOLOGY.md](/docuentation\frontend\features\TOPOLOGY.md)
- [DIAGNOSTICS.md](/docuentation\frontend\features\DIAGNOSTICS.md)
- [VISUALIZATION.md](/docuentation\frontend\features\VISUALIZATION.md)
- [SETTINGS.md](/docuentation\frontend\features\SETTINGS.md)
- [VIEWER.md](/docuentation\frontend\features\VIEWER.md)

Implementation policy:

- If page behavior here conflicts with higher-level docs, prioritize:
  1. [FRONTEND_UI.md](/docuentation/frontend/FRONTEND_UI.md)
  2. [../../../TODO.md](/docuentation/planning/TODO.md)
  3. [../../../ROADMAP.md](/ROADMAP.md)

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
- `Viewer`: Aladin baseline with Mode B progressive-resolution strategy planned.
- `Landing`, `Settings`, `Visualizations`: placeholder content at this stage.
