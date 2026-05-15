# Topology Grafana Phase 0 Feasibility

## Result
**Passed for local Docker development.**

Grafana can be embedded in a browser iframe when the local Docker Compose Grafana service enables embedding and anonymous viewer access.

## Verified Configuration
- Grafana URL: `http://localhost:3000`
- Dashboard URL: `http://localhost:3000/d/phase2-simple/phase2-simple-metrics?orgId=1&kiosk`
- Single-panel iframe URL: `http://localhost:3000/d-solo/phase2-simple/phase2-simple-metrics?orgId=1&panelId=1`
- Auth mode for local development: anonymous Viewer
- Embed requirement: `GF_SECURITY_ALLOW_EMBEDDING=true`

## Verification Performed
- Grafana container was running and reachable.
- Prometheus container was running and reachable.
- `http://localhost:3000/api/health` returned `200`.
- `http://localhost:3000/d/phase2-simple/phase2-simple-metrics?orgId=1&kiosk` returned `200`.
- `http://localhost:3000/d-solo/phase2-simple/phase2-simple-metrics?orgId=1&panelId=1` returned `200`.
- Grafana no longer returned `X-Frame-Options: deny` after enabling embedding.
- A minimal iframe proof page was added at `documentation/topology-grafana-phase0-iframe-proof.html`.

## Initial Blocker Found
The first check failed iframe feasibility because Grafana returned:

```text
X-Frame-Options: deny
```

That means embedding would fail in the topology view unless Grafana embedding is explicitly enabled.

## Compose Changes Required
The local Grafana service needs:

```yaml
GF_SECURITY_ALLOW_EMBEDDING: "true"
GF_AUTH_ANONYMOUS_ENABLED: "true"
GF_AUTH_ANONYMOUS_ORG_ROLE: Viewer
```

## Decision Gate
Phase 0 is complete for local development. Proceed to Phase 1 only if local anonymous embedding is acceptable for the demo/development environment.

Production-like environments still need a separate access-control decision. Anonymous Viewer access should not be assumed safe outside local/demo use.
