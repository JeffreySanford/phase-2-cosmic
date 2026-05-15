# Topology Grafana Phase 2 Provisioning

## Result

**Completed.**

Phase 2 provisioned the first source-controlled Grafana dashboard for the topology metrics tab. No Angular topology UI code was changed.

## Dashboard

- Title: `Phase2 Topology Operations`
- UID: `phase2-topology-ops`
- Slug: `phase2-topology-operations`
- Source JSON: `docker/grafana/dashboards/topology-operations.json`
- Full dashboard URL: `http://localhost:3000/d/phase2-topology-ops/phase2-topology-operations?orgId=1&kiosk`
- Single-panel smoke URL: `http://localhost:3000/d-solo/phase2-topology-ops/phase2-topology-operations?orgId=1&panelId=2`

## Stable Panel IDs

| Panel ID | Panel                      |
| -------- | -------------------------- |
| `1`      | Service health by job      |
| `2`      | Topology link utilization  |
| `3`      | Topology link throughput   |
| `4`      | Topology link latency      |
| `5`      | Topology link error rate   |
| `6`      | Java request rate          |
| `7`      | Process CPU by job         |
| `8`      | Process memory by job      |
| `9`      | RabbitMQ queue depth       |
| `10`     | Kafka consumer lag         |
| `11`     | Redis clients and memory   |
| `12`     | Observability stack health |

## Verification

- Dashboard JSON parses successfully.
- Grafana was restarted with `docker compose -f docker/dev-compose.yml restart grafana`.
- Grafana was recreated with `docker compose -f docker/dev-compose.yml up -d --force-recreate grafana`.
- `http://localhost:3000/api/health` returned `200`.
- Full dashboard URL returned `200`.
- `d-solo` panel URL returned `200`.
- Grafana dashboard API returned UID `phase2-topology-ops`.
- Grafana dashboard API returned panel IDs `1,2,3,4,5,6,7,8,9,10,11,12`.
- `X-Frame-Options` was not present on the dashboard or panel responses.

## Layout Update

The dashboard was adjusted after app integration for readability in the topology tab:

- Panels use a roomier two-column layout instead of the initial three-column layout.
- Time-series panels are taller.
- Legends use right-side table mode with the latest value visible.
- The topology iframe is taller and scrollable so dashboard detail/fullscreen views have usable vertical space.

## Phase 3 Input

Phase 3 can use the full dashboard URL for the topology metrics tab. The UI should read this URL from runtime configuration rather than hardcoding it in the Angular component.
