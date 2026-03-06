<!-- markdownlint-disable MD013 -->

# Diagnostics View

This document describes the frontend Diagnostics view and the backend endpoints it relies on.

## Frontend

The diagnostics UI is at the `Diagnostics` feature in the frontend and uses a tabbed layout:

### Overview Tab

- **Live Signals**: Vibrant, colorful metric cards showing real-time Prometheus data
  - Ingest Rate (1m) - cyan gradient
  - Total Bytes - violet gradient
  - Generator Up - mint gradient
  - Records Rate - amber gradient
  - Targets Up - blue gradient
  - CPU Load - rose gradient

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

Current list-endpoint status values: `online`, `offline`, `unknown`

Notes:

- The frontend styles a `degraded` state, but the list endpoint does not emit
  it yet.
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
- Tests: `apps/frontend/src/app/features/diagnostics/*.spec.ts`
<!-- markdownlint-enable MD013 -->
