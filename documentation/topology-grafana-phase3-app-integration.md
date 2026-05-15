# Phase 3: Topology App Integration

## Status

Completed on 2026-05-14.

## Delivered

- Added a Metrics Dashboard tab to the topology view.
- Embedded the provisioned Grafana dashboard with a sanitized iframe URL.
- Sourced the dashboard URL from runtime config via `/api/env` as `GRAFANA_DASHBOARD_URL`.
- Added a Nest SSR default URL for local Docker development:
  `http://localhost:3000/d/phase2-topology-ops/phase2-topology-operations?orgId=1&kiosk`
- Added loading, retry/error, and Open in Grafana states.
- Fixed explicit Nest injection for `SsrService` so `/api/env` works under the local `tsx` runtime.

## Runtime Verification

- `http://127.0.0.1:4000/api/env` returns the Grafana dashboard URL.
- `http://127.0.0.1:4200/api/env` returns the same URL through the Angular dev proxy.
- Grafana dashboard URL returns `200`.
- Grafana response does not include `X-Frame-Options`.
- Playwright desktop check loads the iframe at `1440x1000`.
- Playwright mobile check loads the iframe at `390x844`.
- Browser console was clean during the final desktop and mobile iframe checks.

## Automated Verification

- `pnpm nx run frontend:test -- --runInBand apps/frontend/src/app/features/topology/topology.component.spec.ts`
- `pnpm nx run frontend:build:development --verbose`

## Evidence

- Desktop screenshot: `tmp/phase3-topology-desktop.png`
- Mobile screenshot: `tmp/phase3-topology-mobile.png`

## Remaining Work

- Phase 4 should define access rules for local, demo, and production-like modes.
- Phase 4 should decide whether production should embed Grafana directly or use a backend proxy.
- Phase 5 should add the durable user/developer guide and troubleshooting checklist.
