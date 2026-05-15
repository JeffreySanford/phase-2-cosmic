# Phase 4: Access Control and Runtime Modes

## Status

Completed on 2026-05-14.

## Runtime Contract

The topology Grafana embed is controlled by `/api/env`.

| Variable                        | Default                                                                                | Purpose                                                                                  |
| ------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `GRAFANA_DASHBOARD_URL`         | `http://localhost:3000/d/phase2-topology-ops/phase2-topology-operations?orgId=1&kiosk` | Dashboard iframe and Open in Grafana target.                                             |
| `GRAFANA_DASHBOARD_ENABLED`     | `true`                                                                                 | When `false`, the Metrics Dashboard tab is hidden.                                       |
| `GRAFANA_DASHBOARD_ACCESS_MODE` | `local-anonymous`                                                                      | Documents the expected auth posture for the current runtime.                             |
| `GRAFANA_DASHBOARD_EMBED_MODE`  | `direct`                                                                               | Documents whether the browser embeds Grafana directly or through a future backend proxy. |

## Local Docker Mode

- `GRAFANA_DASHBOARD_ENABLED=true`
- `GRAFANA_DASHBOARD_ACCESS_MODE=local-anonymous`
- `GRAFANA_DASHBOARD_EMBED_MODE=direct`
- Grafana is configured with anonymous Viewer access and iframe embedding enabled.
- This is acceptable for local demo/development only.

## Production-Like Mode

- Do not rely on anonymous Grafana access for production-like deployments.
- Set `GRAFANA_DASHBOARD_ENABLED=false` unless auth has been explicitly designed.
- Preferred production direction is a backend-mediated Grafana/proxy flow or an authenticated same-site Grafana deployment.
- If direct embedding is used outside local Docker, same-site cookie, frame, TLS, and origin behavior must be tested before enabling the tab.

## App Behavior

- The topology component reads `/api/env` during initialization.
- If `GRAFANA_DASHBOARD_ENABLED=false`, the Metrics Dashboard tab is hidden and no iframe URL is trusted.
- If enabled but the URL is missing, the tab shows the existing error/retry state.
- The Open in Grafana action is guarded and no-ops when no URL is configured.

## Verification

- `pnpm nx run frontend:test -- --runInBand apps/frontend/src/app/features/topology/topology.component.spec.ts`
- `pnpm nx run frontend:build:development --verbose`
- Runtime `/api/env` check returned the dashboard URL plus enabled/access/embed fields.
- Playwright confirmed the default local tab remains visible and the iframe loads with a clean console.

## Remaining Work

- Phase 5 should turn this into a durable user/developer guide with troubleshooting steps.
- A backend proxy is not implemented in Phase 4; it remains the recommended path if production auth cannot support direct embedding cleanly.
