<!-- markdownlint-disable MD013 -->

# Diagnostics View

This document describes the frontend Diagnostics view and the backend endpoints it relies on.

## Frontend

The diagnostics UI is at the `Diagnostics` feature in the frontend and uses a tabbed layout:

### Overview Tab

- Summarises file, infrastructure, and runtime diagnostics state
- Presents the system status cards and the existing live telemetry summaries

### Database & Benchmarks Tab

- Adds a monitoring-style slice for PostgreSQL and benchmark health
- Shows a source badge, refresh badge, KPI strip, trend indicators, and sparkline bars
- Surfaces PostgreSQL-native details, Prometheus signal availability, and benchmark values in a dashboard-like layout
- Uses the endpoint `GET /api/diagnostics/database-benchmarks` to populate the view
- Treats `source: "postgres"` as native PostgreSQL evidence; `fallback`, `prometheus`, and explicit mock sources must not be presented as native database measurements

### Broker Systems Tab

- Tiled cards showing the status of infrastructure services
- Each tile shows: service name, status badge, endpoint details, latency, and error info
- Services monitored:
  - **Prometheus** - metrics collection (HTTP readiness check)
  - **Grafana** - dashboards (HTTP health check)
  - **Loki** - log aggregation (HTTP ready check)
  - **Pulsar** - message broker (API status check + TCP port check)
  - **Kafka** - message broker (TCP port check)
  - **RabbitMQ** - message broker (API status check + TCP port check)
  - **Alertmanager** - alerting (HTTP readiness check)
  - **Redis** - cache/state (TCP port check)

### Files Tab

- Recent diagnostic files and `system-specs.txt` content
- The returned `path` value is a sanitized logical label (`diagnostics logs`),
  not a host absolute filesystem path

## Backend Endpoints

### `GET /api/diagnostics`

Returns an index object: `{ path: string, files: string[] }`

Example:

```json
{
  "path": "diagnostics logs",
  "files": ["system-specs.txt"]
}
```

### `GET /api/diagnostics/system-specs`

Returns `system-specs.txt` as plain text

### `GET /api/diagnostics/system-specs.json`

Returns a structured payload derived from `system-specs.txt` for summary
rendering and machine-readable diagnostics parsing.

### `GET /api/diagnostics/database-benchmarks`

Returns PostgreSQL and benchmark evidence for the Database & Benchmarks tab.

Evidence-source rules:

- `source: "postgres"` means the SSR process successfully connected to the configured PostgreSQL sidecar and read native PostgreSQL statistics.
- `source: "prometheus"` means native PostgreSQL access was unavailable but one or more relevant Prometheus queries returned measurements.
- `source: "fallback"` means neither native PostgreSQL nor the required Prometheus benchmark measurements were available. Values in that response are fallback status context and must not be interpreted as native database measurements.
- Explicit mock/test mode remains synthetic and must be visibly labeled as such.

A healthy native response has the following shape:

```json
{
  "source": "postgres",
  "postgres": {
    "status": "healthy",
    "connection": "configured",
    "host": "127.0.0.1:55432",
    "database": "cosmic_forge",
    "activeConnections": 3,
    "version": "..."
  }
}
```

The `postgres.host` field is endpoint identity only. It must never contain a password-bearing PostgreSQL URL or other secret. Local startup keeps the password out of `FORGE_POSTGRES_URL` and verifies the real host -> Docker authentication path before Nest SSR starts.

For the supported local startup contract, use `pnpm start:all`. Its PostgreSQL preflight:

1. Converges the sidecar against current Compose configuration while preserving the named volume.
2. Restricts the published database port to loopback (`127.0.0.1`).
3. Discovers the actual Docker-published host port.
4. Reconciles the persisted role password when needed.
5. Verifies authentication with the same host-side `node-postgres` path used by the SSR process.
6. Performs at most one controlled role-password reset and retry when the host path returns PostgreSQL `28P01`.

### `GET /api/diagnostics/docker-services`

Returns an array of service status objects:

```json
[
  {
    "name": "Prometheus",
    "status": "online",
    "details": "http://127.0.0.1:9090",
    "latencyMs": 15,
    "icon": "monitoring",
    "error": null
  }
]
```

Current list-endpoint status values: `healthy`, `degraded`, `offline`, `unknown`

Notes:

- Slow but reachable checks now emit `degraded` so the frontend can surface
  latency-sensitive health issues without marking the service fully offline.
- The single-service endpoint includes `lastChecked`; the list endpoint does
  not yet expose that field.

### `GET /api/diagnostics/docker-services/:name`

Returns detailed status for a single service by name (case-insensitive):

```json
{
  "name": "Prometheus",
  "status": "online",
  "details": "http://127.0.0.1:9090",
  "latencyMs": 12,
  "lastChecked": 1709654321000
}
```

## Runtime Load Profile / Stress Telemetry (new)

The frontend Stress Profile controls the backend runtime load profile, which spins up background worker processes/containers that write load metrics to disk.

### `GET /api/load-profile`

Returns the current profile status:

```json
{
  "profilePct": 25,
  "workers": 2,
  "mode": "runtime-controlled",
  "note": "low stress"
}
```

### `POST /api/load-profile`

Change the active profile (allowed values: `10`, `25`, `50`, `100`).

### `GET /api/load-profile/debug`

Debug view exposing:

- status (same as `/api/load-profile`)
- a snapshot of active worker processes/containers
- the latest telemetry payload sent via SSE

### `GET /api/telemetry/debug`

Debug view exposing:

- the last SSE telemetry payload
- the number of active SSE clients connected
- a list of worker log files (`tools/data-generator/logs/runtime-profile.worker-*.bin`) with size and modified time

### Live telemetry stream

The frontend consumes a Server-Sent Events (SSE) stream at `/api/telemetry/stream`. The server broadcasts a new payload when worker log files change, so the UI updates in near‑real time.

This replaces earlier polling-based telemetry for stress metrics and makes the dashboard reflect real generated load more reliably.

### Messaging Status Endpoints

The diagnostics view also displays detailed messaging broker status through dedicated API endpoints:

#### `GET /api/v1/rabbitmq/status`

Returns RabbitMQ broker health and configuration:

```json
{
  "queues": {
    "audit": "cosmic.audit.queue",
    "control": "cosmic.control.queue"
  },
  "exchanges": {
    "audit": "cosmic.audit.exchange",
    "control": "cosmic.control.exchange"
  },
  "connection": "established",
  "status": "healthy",
  "lastUpdated": "2026-03-06T05:52:49.856084300Z"
}
```

#### `GET /api/v1/pulsar/status`

Returns Pulsar cluster health and topology:

```json
{
  "brokers": 1,
  "topics": 3,
  "partitions": 3,
  "status": "healthy",
  "lastUpdated": "2026-03-06T05:52:44.468003168Z"
}
```

## Service Health Checks

The backend performs real connectivity checks:

**TCP Services** (Pulsar, Kafka, RabbitMQ, Redis):

- Attempts TCP socket connection with 3s timeout
- Falls back to localhost (`127.0.0.1`) if Docker hostname fails
- Returns latency in milliseconds

**HTTP Services** (Prometheus, Grafana, Loki, Alertmanager):

- Performs HTTP GET to readiness/health endpoint with 3s timeout
- Falls back to localhost URLs if Docker hostname fails
- Returns latency in milliseconds

## Environment Variables

Override default service URLs via environment variables:

- `PROMETHEUS_URL` - default: `http://prometheus:9090/-/ready`
- `GRAFANA_URL` - default: `http://grafana:3000/api/health`
- `LOKI_URL` - default: `http://loki:3100/ready`
- `PULSAR_BROKER` - default: `pulsar:6650`
- `KAFKA_BROKER` - default: `broker:9092`
- `RABBITMQ_URL` - default: `rabbitmq:5672`
- `ALERTMANAGER_URL` - default: `http://alertmanager:9093/-/ready`
- `REDIS_URL` - default: `redis:6379`
- `FORGE_POSTGRES_DB` - local Cosmic Forge database name
- `FORGE_POSTGRES_USER` - local Cosmic Forge database role
- `FORGE_POSTGRES_PASSWORD` - private local credential; do not log or commit it
- `FORGE_POSTGRES_HOST_PORT` - preferred local published port; normal startup verifies the actual Docker binding
- `FORGE_POSTGRES_URL` - runtime endpoint identity used by SSR; local startup keeps the password out of this value

## Styling

Tiles currently use the following gradients:

- **Online**: Green gradient (`#4caf50` → `#2e7d32`)
- **Degraded**: Amber gradient (`#ff9800` → `#f57c00`)
- **Offline**: Red gradient (`#f44336` → `#c62828`)
- **Unknown**: Gray gradient (`#607d8b` → `#455a64`)

Live signal cards use colorful tone classes:

- `cyan`, `violet`, `amber`, `mint`, `rose`, `blue`

## Mock Mode

When running in mock mode (`DataSourceService.mode === 'mock'`), the frontend
uses `MockDataService.mockDockerServices()` and metric-specific mock telemetry
series for development. The live tiles now derive their display values from
the same mock range series used to render sparklines.

## Source Files

- UI: `apps/frontend/src/app/features/diagnostics/diagnostics.component.*`
- PromQL Cards: `apps/frontend/src/app/shared/promql-card/promql-card.component.*`
- Mock Data: `apps/frontend/src/app/services/mock-data.service.ts`
- Server Endpoints: `apps/frontend/server.nest.ts`
- PostgreSQL startup preflight: `scripts/start-all-local.sh`, `scripts/reconcile-forge-postgres.sh`, `scripts/verify-forge-postgres.mjs`
- Tests: `apps/frontend/src/app/features/diagnostics/*.spec.ts`
<!-- markdownlint-enable MD013 -->