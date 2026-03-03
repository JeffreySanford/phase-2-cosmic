# Topology — Phase 2 Cosmic

Alignment anchors
- Frontend UX source of truth: [../../FRONTEND_UI.md](/docuentation/frontend/FRONTEND_UI.md)
- Execution backlog: [../../../TODO.md](/docuentation/planning/TODO.md)
- Delivery plan: [../../../ROADMAP.md](/ROADMAP.md)


This document contains higher-fidelity topology diagrams (containers + components) and a security-boundary variant for the local development stack.

Files added:

- `docuentation/frontend/features/topology-containers.mmd` — container-level Mermaid diagram
- `docuentation/frontend/features/topology-security.mmd` — security-boundary variant

You can preview these diagrams directly on GitHub (Mermaid blocks are supported) or render them to PNG/SVG using the `@mermaid-js/mermaid-cli` (`mmdc`) tool.

## Container diagram (high-level)

```mmd
%% topology-containers.mmd
flowchart LR
  subgraph Infra [Infrastructure Services]
    direction TB
    ZK[Zookeeper]
    Kafka[Kafka]
    Rabbit[RabbitMQ]
    MinIO[MinIO (S3 API)]
    Prom[Prometheus]
  end

  subgraph App [Application Stack]
    direction TB
    DG[Data Generator (container)]
    Backend[Nest SSR & API\n`apps/frontend/server.nest.ts`]
    Frontend[Angular Frontend\n(dev / static)]
    TestRunner[CI / Test Runner\n(Playwright / Cypress)]
  end

  subgraph Client [Client / External]
    direction TB
    Browser[Browser]
    Aladin[Aladin-lite viewer]
    ExternalIRSA[External HiPS / IRSA]
  end

  Logs[Payload logs\n`tools/data-generator/logs`]

  DG -->|writes events| Kafka
  Kafka -->|ingest consumer| Backend
  DG -->|writes payload files| Logs
  DG -->|uploads artifacts| MinIO
  DG -->|exposes metrics| Prom

  Prom -->|scraped by| Prom
  Backend -->|serves `/api` & Prometheus proxy| Frontend
  Frontend -->|requests `/api/proxy/prometheus`| Backend
  Frontend -->|renders viewer| Aladin
  TestRunner -->|runs e2e against| Frontend
  TestRunner -->|calls APIs| Backend

  Backend -->|serves `system-specs.json`| Frontend
  ExternalIRSA -->|tiles| Frontend

```

## Security-boundary variant

```mmd
%% topology-security.mmd
flowchart LR
  subgraph Internal [Internal Network]
    direction TB
    DG[Data Generator]
    Kafka[Kafka]
    MinIO[MinIO]
    Backend[Nest SSR + API]
    Prom[Prometheus]
  end

  subgraph Exposed [Developer Host / Browser]
    direction TB
    Browser[Developer Browser]
    Frontend[Angular Dev Server]
  end

  subgraph External [Third-party / Public]
    direction TB
    ExternalIRSA[IRSA / HiPS Tiles]
  end

  Browser -->|HTTP(S) requests| Frontend
  Frontend -->|proxied `/api`| Backend
  Backend -->|internal metrics queries| Prom
  Backend -->|reads/writes| MinIO
  DG -->|push metrics| Prom

  classDef internal fill:#f3f4f6,stroke:#cbd5e1
  classDef exposed fill:#fff7ed,stroke:#f59e0b
  class Internal internal
  class Exposed exposed

```

## How to render to PNG/SVG

Install Mermaid CLI and render (requires Node.js):

```bash
pnpm add -D @mermaid-js/mermaid-cli
npx mmdc -i docuentation/frontend/features/topology-containers.mmd -o docuentation/frontend/features/topology-containers.svg
npx mmdc -i docuentation/frontend/features/topology-security.mmd -o docuentation/frontend/features/topology-security.svg
```

Alternatively paste the `.mmd` contents into <https://mermaid.live> to preview and export.

## Notes

- The container diagram shows runtime relationships for the local dev stack (docker-compose services + dev servers).
- The security diagram highlights which components run inside your local network and which are exposed to the developer browser or external services.
- If you want a PNG/SVG generated and committed, I can run `mmdc` here (if the environment has Node + pnpm available) and commit the generated assets.

---

Path: `docuentation/frontend/features/TOPOLOGY.md`

## Topology

The Topology page visualizes the system and network topology: nodes, services, and connections. It helps operators understand dataflows and locate components that may be implicated in incidents.

## Purpose

- Show an interactive map of services and hosts, their relationships, and basic health indicators.
- Must include messaging fabric nodes for `Kafka`, `RabbitMQ`, and `Pulsar` (not Kafka-only) when corresponding backends are enabled.

## Primary features

- **Node & link visualization**: nodes represent services/hosts; links represent network or logical connections.
- **Node details**: on-click panels display node metadata, recent diagnostics (if available), and key metrics.
- **Filtering & layout**: filter by type (generator, storage, ingress), searchable nodes, and alternate layout options (force-directed, grid).
- **Live updates**: optional live refresh of link weights / status driven by Prometheus metrics or heartbeats.

## Data sources & integration

- Topology metadata is expected from application APIs or a topology index. Telemetry metrics can be joined to nodes via labels (e.g. `instance` or `job`).
- Use Prometheus to surface node-level metrics and the SSR diagnostics endpoints for associated artifacts.
- Required broker metrics:
  - Kafka: consumer lag, broker availability
  - RabbitMQ: queue depth, ack/nack rate
  - Pulsar: backlog, publish/dispatch rate

## Frontend topology UI

- The repository includes a lightweight interactive topology page served by the frontend at the route `/topology`.
- It renders a force-directed graph using D3 and will attempt to fetch topology metadata from the optional backend endpoint `/api/topology`.
- If the backend endpoint is not present, the UI falls back to a local mocked topology so the page always shows a meaningful view.

How to use locally:

```bash
# start the Nest SSR server (API) on port 3000
pnpm nx serve frontend --configuration=development:ssr
# start the frontend dev server (Vite) on 4200
pnpm nx serve frontend
# open the topology page in your browser:
http://localhost:4200/topology
```

The page provides a `Refresh` button to re-query `/api/topology` and re-render. Node clicks currently log node details to the browser console; the component can be extended to show a details panel or integrate Prometheus metrics per-node.

## Implementation note (2026-03-03)

- Current frontend mock topology includes Kafka but does not yet include RabbitMQ/Pulsar nodes.
- Required next iteration: add RabbitMQ and Pulsar nodes/edges in both API-driven topology payloads and mock fallback topology.

## UX and performance

- For large topologies, implement progressive loading and clustering to keep the UI responsive.
- Use canvas/WebGL rendering for very large graphs or provide summarized cluster views.
