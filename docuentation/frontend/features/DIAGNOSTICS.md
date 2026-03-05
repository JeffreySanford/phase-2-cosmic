# Diagnostics

Alignment anchors

- Frontend UX source of truth: [../../FRONTEND_UI.md](/docuentation/frontend/FRONTEND_UI.md)
- Execution backlog: [../../../TODO.md](/docuentation/planning/TODO.md)
- Delivery plan: [../../../ROADMAP.md](/ROADMAP.md)

This document describes the diagnostics that run inside the `data-generator` container image, where their artifacts land, and how to use them for troubleshooting or capacity planning.

## What runs at container startup

- A lightweight passive collector runs automatically on container start and writes output to `logs/system-specs.txt` inside the container (and to the mapped host folder when using `docker-compose` with volume mounts).
- Optionally, when `DIAG_RUN=true`, short active benchmarks are executed if the required tools are available: `fio` for a quick disk IO micro-benchmark and `iperf3` for a short network benchmark (requires `DIAG_IPERF_TARGET`).

Current relationship to global stress profile:

- The frontend footer profile (`10%`, `25%`, `50%`, `100%`) currently affects telemetry polling intensity only.
- Diagnostics outputs here are still the primary machine-capacity reference for development planning.
- Runtime machine stress control is planned and will require live host metrics + generator control APIs.

## Files produced

- `logs/system-specs.txt` — human-readable snapshot (CPU model, kernel, memory, disk topology, mountpoints, basic ip route and interface details, container limits).
- `logs/` may also contain `fio-*.log` or `iperf3-*.log` when `DIAG_RUN=true` produced active benchmark outputs.

## How to run locally

1. Using Docker Compose (development): `docker compose -f docker/dev-compose.yml up --build -d` — the `data-generator` container will write `logs/system-specs.txt` into the mapped `tools/data-generator/logs` folder by default.
2. Run interactively inside the image (for manual diagnostics):

```bash
docker run --rm -it \
  -e DIAG_RUN=true -e DIAG_IPERF_TARGET=10.0.0.1 \
  -v $(pwd)/tools/data-generator/logs:/app/logs \
  your-registry/data-generator:latest /bin/sh -c '/app/collect-system-specs.sh && /app/data-generator --no-stdout'
```

### Enable diagnostics in `docker/dev-compose.yml` (example)

Add or override the `data-generator` service environment and volume to enable active diagnostics and persist logs on the host:

```yaml
services:
  data-generator:
    image: your-registry/data-generator:local
    build: ./tools/data-generator
    environment:
      - DIAG_RUN=true
      - DIAG_IPERF_TARGET=10.0.0.1 # optional; only if you have a reachable iperf3 server
    volumes:
      - ./tools/data-generator/logs:/app/logs
```

After bringing the compose stack up, the diagnostics files will appear in `tools/data-generator/logs` on the host.

## Environment variables

- `DIAG_RUN` (default: `false`) — when `true`, attempt `fio` and `iperf3` active tests.
- `DIAG_IPERF_TARGET` — hostname/IP of a reachable `iperf3` server for a short network test.

## Interpretation & usage

- Use `logs/system-specs.txt` as the canonical snapshot of the container's view of the host/node (kernel, CPU features, mounts, cgroup limits). Attach it to bug reports when investigating IO or network anomalies.
- Active benchmark outputs are intentionally short; they are for signal and trend, not exhaustive benchmarking.
- Treat startup diagnostics as baseline envelope data for choosing stress profile defaults in development until live host exporters are integrated.

## Privacy & Safety

- Active diagnostics may generate network traffic to the configured `iperf3` target and will perform small disk IO tests. Only enable `DIAG_RUN` in trusted environments.

## Mermaid: diagnostics and generator startup flow

```mermaid
flowchart LR
  Compose["docker compose up"] --> Image["data-generator container image"]
  Image --> Collect["collect-system-specs.sh (passive)"]
  Collect --> Logs["logs/system-specs.txt (host mapped)"]
  Image --> Generator["data-generator (no-stdout / file sink)"]
  Generator --> Prom["Prometheus /metrics endpoint"]
  subgraph optional
    Collect --> FIO["fio (if DIAG_RUN=true)"]
    Collect --> IPERF["iperf3 (if DIAG_RUN=true & target set)"]
  end
```

## Where to find the script

- The collector script is available at `tools/data-generator/collect-system-specs.sh` in this repository and is included in the container image.

## Recommended next steps

- The Nest SSR server now exposes two readonly diagnostics endpoints:

  - `GET /api/diagnostics` — lists files present under `tools/data-generator/logs` (readonly index)
  - `GET /api/diagnostics/system-specs` — returns `system-specs.txt` content when present

- Add a JSON output mode for machine parsing, and a small summary parser that extracts CPU/memory/disk metrics into a single JSON file.
- Add a diagnostics summary endpoint specifically for stress-profile planning (`cpu_cores`, `mem_total`, `net_iface`, optional `gpu_present`) to support automatic dev profile recommendations.

## Frontend realtime diagnostics analysis

The current frontend Diagnostics page already has the right three tab groups, but the realtime behavior is uneven and the tabs do not yet act like one coordinated operational surface.

### Current implementation observations

- The `Overview` tab renders six live Prometheus cards.
- Each card polls independently and performs both an instant query and a range query on every cycle.
- The `Broker Systems` tab is the only tab with explicit auto-refresh controls.
- The `Broker Systems` polling only refreshes docker-service tiles, not the diagnostics file index or `system-specs` content.
- The `Files` tab is mostly manual: users must refresh the index explicitly and must separately load `system-specs.txt`.
- The UI styles support `degraded` tiles, but the list endpoint currently returns `online`, `offline`, or `unknown`.
- The backend already exposes `GET /api/diagnostics/system-specs.json`, but the current view still treats raw text as the primary file detail.

### Problems to address

- Realtime data is fragmented by tab, so freshness is inconsistent across the page.
- Prometheus polling is more expensive than necessary because each tile owns its own refresh cycle.
- Tabs do not show whether their contents are live, stale, mock, or manually loaded.
- Broker tiles are visually strong but weak as decision tools because they lack age, severity ordering, fallback context, and short history.
- The Files tab shows evidence, but it does not summarize what changed or why the artifacts matter.

### Improvements for tab groups

- Move to a page-level diagnostics view model that combines:
  - live overview metrics
  - broker-service health
  - diagnostics artifact index
  - parsed `system-specs.json` summary
- Poll once per load-profile cadence and fan the results into all tabs, instead of having each overview card fetch independently.
- Add shared page metadata:
  - `lastUpdated`
  - `refreshing`
  - `stale`
  - `source` (`live` or `mock`)
  - `error`
- Add summary badges on tab labels, for example:
  - `Overview (live)`
  - `Broker Systems (2 offline)`
  - `Files (3 new)`
- Keep the active tab in route query params so refreshes and deep links preserve context.
- Lazy-load only heavy detail views:
  - keep summary data hot
  - load raw `system-specs.txt` only when the Files tab is active

### Improvements for overview tiles

- Replace per-card polling with shared observables or a diagnostics facade/store.
- Add trend and delta indicators so operators can see whether a value is climbing, flat, or falling.
- Add `updated x seconds ago` to every tile.
- Normalize units and display formats:
  - bytes/sec
  - records/sec
  - percent
  - target count
- Add thresholds so a tile can show warning or abnormal state, not only its color tone.
- Revisit the current CPU query so it reflects the intended jobs or host/container scope rather than an overly broad aggregate.

### Improvements for broker system tiles

- Sort by severity first so offline or degraded systems appear before healthy ones.
- Group tiles by role:
  - observability
  - messaging
  - state/cache
- Extend the backend list endpoint to include:
  - `lastChecked`
  - `usedFallback`
  - `degraded`
  - optional recent probe history
- Mark a service as `degraded` when fallback succeeds, latency is above threshold, or readiness is partial.
- Show whether the tile is using its primary endpoint or a localhost fallback.
- Preserve error type detail, especially timeout vs DNS vs connection refusal.

### Improvements for the Files tab

- Use `GET /api/diagnostics/system-specs.json` as the primary summary source.
- Add summary tiles above the file list:
  - total artifacts
  - latest artifact age
  - `system-specs.txt` present/missing
  - `fio` log count
  - `iperf3` log count
- Parse timestamped filenames into relative age and absolute time.
- Highlight newly arrived artifacts since the last refresh.
- Keep raw `system-specs.txt` in an expandable detail section instead of making it the first-level view.

### Recommended implementation sequence

1. Introduce a shared diagnostics facade/store so all three tabs use one refresh model.
2. Switch summary rendering to `GET /api/diagnostics/system-specs.json`.
3. Extend `GET /api/diagnostics/docker-services` to return richer tile metadata and a real `degraded` state.
4. Update tab labels and tiles to show freshness, severity, and change since last refresh.
5. Reduce duplicate Prometheus traffic by consolidating overview-card queries.
