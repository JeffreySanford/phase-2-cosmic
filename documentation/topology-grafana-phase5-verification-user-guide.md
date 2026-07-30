# Phase 5: Verification and User Guide

## Status

Completed on 2026-05-14.

## Start The Local Stack

Run:

```powershell
pnpm start:all
```

Expected local URLs:

| Service           | URL                                                                                    |
| ----------------- | -------------------------------------------------------------------------------------- |
| Topology view     | `http://127.0.0.1:4200/topology`                                                       |
| SSR API           | `http://127.0.0.1:4000/api/env`                                                        |
| Grafana           | `http://localhost:3005`                                                                |
| Grafana dashboard | `http://localhost:3005/d/phase2-topology-ops/phase2-topology-operations?orgId=1&kiosk` |
| Prometheus        | `http://localhost:9090`                                                                |

## Manual Verification Checklist

- Confirm Docker services are running.
- Confirm `http://localhost:3005/api/health` returns `200`.
- Confirm `http://127.0.0.1:4000/api/env` includes:
  - `GRAFANA_DASHBOARD_URL`
  - `GRAFANA_DASHBOARD_ENABLED`
  - `GRAFANA_DASHBOARD_ACCESS_MODE`
  - `GRAFANA_DASHBOARD_EMBED_MODE`
- Confirm the Grafana dashboard URL returns `200`.
- Confirm Grafana does not return `X-Frame-Options: deny`.
- Open `http://127.0.0.1:4200/topology`.
- Select the Metrics Dashboard tab.
- Confirm the dashboard iframe renders.
- Confirm panels are large enough to scan and legends are readable.
- Open a panel detail/fullscreen view and confirm the embedded dashboard area can scroll.
- Confirm Open in Grafana opens the full Grafana dashboard.
- Check the browser console for frame, CORS, auth, or Angular runtime errors.

## Automated Checks

Run:

```powershell
pnpm nx run frontend:test -- --runInBand apps/frontend/src/app/features/topology/topology.component.spec.ts
pnpm nx run frontend:build:development --verbose
```

Optional browser smoke check:

```powershell
@'
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.goto('http://127.0.0.1:4200/topology', { waitUntil: 'networkidle' });
  await page.getByRole('tab', { name: 'Metrics Dashboard' }).click();
  const frame = page.locator('iframe.metrics-dashboard__frame');
  await frame.waitFor({ state: 'visible' });
  console.log({ src: await frame.getAttribute('src'), errors });
  await browser.close();
})();
'@ | node -
```

## Troubleshooting

### Metrics Dashboard tab is missing

- Check `/api/env`.
- If `GRAFANA_DASHBOARD_ENABLED=false`, the tab is intentionally hidden.
- For local Docker development, set or allow the default `GRAFANA_DASHBOARD_ENABLED=true`.

### Dashboard tab shows a configuration error

- Check that `/api/env` includes `GRAFANA_DASHBOARD_URL`.
- Restart the SSR/dev server after changing environment variables.
- Confirm `apps/frontend/server.nest.ts` is returning the expected local default.

### Iframe is blank or refused

- Check the Grafana response headers.
- `X-Frame-Options: deny` means Grafana embedding is not enabled.
- Local Docker requires `GF_SECURITY_ALLOW_EMBEDDING=true`.
- Confirm `GF_AUTH_ANONYMOUS_ENABLED=true` for local anonymous mode.

### Grafana shows a login page or auth loop

- Local Docker should use anonymous Viewer access.
- Production-like deployments should not rely on anonymous access.
- If same-site cookies or frame policies block auth, disable the tab with `GRAFANA_DASHBOARD_ENABLED=false` until a proxy or same-site auth path is implemented.

### Dashboard exists but panels are empty

- Open Prometheus at `http://localhost:9090`.
- Check scrape targets and confirm the relevant exporters are up.
- Confirm the dashboard datasource is the provisioned Prometheus datasource.

### Dashboard is missing after restart

- Confirm `docker/grafana/dashboards/topology-operations.json` exists.
- Confirm `docker/grafana/provisioning/dashboards/providers.yaml` points at `/var/lib/grafana/dashboards`.
- Recreate Grafana with Docker Compose and check the dashboard UID `phase2-topology-ops`.

## Production Notes

- Local direct anonymous embedding is only a development/demo posture.
- Production-like environments should start with `GRAFANA_DASHBOARD_ENABLED=false`.
- Enable the tab only after deciding between authenticated direct embedding and a backend proxy.
- Retest iframe headers, cookie behavior, TLS, and origin behavior before exposing the dashboard to users.
