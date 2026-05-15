# Proposal: Adding Grafana/Prometheus Data Visualization to Topology View

## Summary

Integrate a data visualization tab into the topology view using Grafana and/or Prometheus. This will allow users to monitor real-time and historical metrics (e.g., system health, resource usage, network traffic) directly within the application, leveraging already collected data.

## Reasoning

- **Improved Observability:** Users can correlate topology with live metrics, making troubleshooting and monitoring more intuitive.
- **Leverage Existing Data:** The system already collects metrics; visualizing them adds value without extra data collection overhead.
- **Industry Standard Tools:** Grafana and Prometheus are widely adopted, flexible, and support custom dashboards and queries.
- **User Experience:** Embedding dashboards in the topology view keeps users in one place, reducing context switching.

## Level of Effort

**High.** This has been attempted before without success, so the work should be treated as an integration effort rather than a small UI addition.

Expected effort is roughly **3-5 focused engineering days** for a working implementation, plus additional time if Grafana auth, iframe restrictions, dashboard provisioning, or cross-origin behavior require deeper changes. The highest-risk areas are embedding Grafana reliably inside the Angular topology view, handling permissions/authentication, and making the dashboard work consistently in local Docker and production-like environments.

## Current Status

Phases 0 through 5 are complete for local Docker development. The topology view now includes a Metrics Dashboard tab backed by the provisioned Grafana dashboard, runtime controls for visibility and access mode, and a verification/troubleshooting guide.

## Better Success Strategy

Treat this as a staged integration with an explicit feasibility gate before UI implementation. The previous attempt failed, so the first objective is to prove that Grafana can be embedded reliably in this app's local Docker/runtime setup before spending time on topology UI polish.

### Phase 0: Feasibility Spike

**Status:** Completed

- **Goal:** Prove the minimum working embed path outside the topology feature.
- **Scope:**
  - Confirm Grafana is reachable from the browser at the expected host/port.
  - Confirm the target dashboard can be rendered directly in a browser.
  - Confirm iframe embedding is allowed by Grafana configuration.
  - Confirm auth mode: anonymous, token, session, or reverse proxy.
  - Confirm browser console has no frame, CORS, mixed-content, or cookie errors.
- **Exit Criteria:**
  - A minimal static iframe or scratch Angular route can display a Grafana dashboard locally.
  - Required Grafana config changes are documented.
  - Any blockers are identified before topology UI work starts.
- **Result:**
  - Local Grafana iframe embedding is feasible after enabling `GF_SECURITY_ALLOW_EMBEDDING=true`.
  - Local anonymous Viewer access is required for the current proof path.
  - Direct dashboard and single-panel URLs return `200`.
  - Browser iframe proof exists at `documentation/topology-grafana-phase0-iframe-proof.html`.
  - Details are documented in `documentation/topology-grafana-phase0-feasibility.md`.
- **Decision Gate:** Do not proceed to topology integration until this works.

### Phase 1: Metrics Inventory and Dashboard Contract

**Status:** Completed

- **Goal:** Define exactly what the topology view should show.
- **Scope:**
  - List Prometheus targets and high-value metrics.
  - Map each dashboard panel to a user question, such as service health, request latency, throughput, error rate, or container resource usage.
  - Decide whether the topology tab embeds one Grafana dashboard, multiple panels, or custom Prometheus-driven charts.
- **Exit Criteria:**
  - Dashboard panel list is approved.
  - Required Prometheus queries are captured.
  - Dashboard ownership and provisioning approach are clear.
- **Result:**
  - Prometheus currently has 14 healthy scrape jobs.
  - The first dashboard should be one provisioned Grafana dashboard with sections for overview, topology links, application services, messaging/cache, and observability stack health.
  - Dashboard JSON should live in `docker/grafana/dashboards` with a stable UID.
  - The full contract is documented in `documentation/topology-grafana-phase1-dashboard-contract.md`.

### Phase 2: Grafana Provisioning

**Status:** Completed

- **Goal:** Make the dashboard reproducible.
- **Scope:**
  - Store dashboard JSON in the repo.
  - Add or update Docker/Grafana provisioning so the dashboard appears after `pnpm start:all`.
  - Avoid manual dashboard setup as a required step.
- **Exit Criteria:**
  - Fresh local startup provisions the dashboard automatically.
  - Dashboard UID and URL are stable.
  - Dashboard survives container restarts.
- **Result:**
  - Provisioned dashboard JSON exists at `docker/grafana/dashboards/topology-operations.json`.
  - Stable dashboard UID is `phase2-topology-ops`.
  - Full dashboard URL is `http://localhost:3000/d/phase2-topology-ops/phase2-topology-operations?orgId=1&kiosk`.
  - Stable panel IDs are `1` through `12`.
  - Dashboard was verified after a Grafana container recreate.
  - Details are documented in `documentation/topology-grafana-phase2-provisioning.md`.

### Phase 3: App Integration

**Status:** Completed

- **Goal:** Add the topology tab only after the dashboard embed is proven.
- **Scope:**
  - Add a Metrics tab to the topology view.
  - Source the Grafana URL from environment/runtime config instead of hardcoding it.
  - Add loading and failure states for iframe failures.
  - Add an "Open in Grafana" escape hatch.
- **Exit Criteria:**
  - Tab renders the dashboard at desktop and mobile sizes.
  - Missing/unreachable Grafana shows a clear in-app error state.
  - The topology view remains usable when Grafana is down.
- **Result:**
  - Added a Metrics Dashboard tab to the topology view.
  - Dashboard URL is sourced through `/api/env` as `GRAFANA_DASHBOARD_URL`, with a local default on the Nest SSR server.
  - Added loading, retry/error, and "Open in Grafana" states.
  - Verified `/api/env` through both `127.0.0.1:4000` and the Angular dev proxy at `127.0.0.1:4200`.
  - Verified desktop and mobile iframe rendering with Playwright; screenshots are in `tmp/phase3-topology-desktop.png` and `tmp/phase3-topology-mobile.png`.
  - Details are documented in `documentation/topology-grafana-phase3-app-integration.md`.

### Phase 4: Access Control and Runtime Modes

**Status:** Completed

- **Goal:** Make the feature safe across local, demo, and production-like environments.
- **Scope:**
  - Decide visibility rules for the tab.
  - Document local anonymous Grafana behavior separately from production auth.
  - If needed, add a backend proxy instead of exposing Grafana directly.
- **Exit Criteria:**
  - Access behavior is documented.
  - Production risks are explicitly accepted or mitigated.
  - Local demo mode remains simple.
- **Result:**
  - `/api/env` now exposes `GRAFANA_DASHBOARD_ENABLED`, `GRAFANA_DASHBOARD_ACCESS_MODE`, and `GRAFANA_DASHBOARD_EMBED_MODE`.
  - The topology Metrics Dashboard tab is hidden when `GRAFANA_DASHBOARD_ENABLED=false`.
  - Local Docker mode is documented as `local-anonymous` and `direct`.
  - Production-like guidance is documented: disable the tab unless direct authenticated embedding or a backend proxy path is explicitly designed and verified.
  - Details are documented in `documentation/topology-grafana-phase4-access-runtime-modes.md`.

### Phase 5: Verification and Documentation

**Status:** Completed

- **Goal:** Prevent another partial or non-working implementation.
- **Scope:**
  - Add a manual verification checklist.
  - Capture screenshots for successful local startup.
  - Document troubleshooting for blank iframe, refused frame, auth loop, missing dashboard, and unavailable metrics.
- **Exit Criteria:**
  - A new developer can run `pnpm start:all` and access the topology metrics tab using documented steps.
  - Known failure modes have documented fixes.
- **Result:**
  - Added manual startup and verification checklist.
  - Added automated check commands.
  - Added troubleshooting for hidden tab, missing config, refused iframe, auth loop, empty panels, and missing provisioned dashboard.
  - Added production notes for disabled-by-default production-like usage until auth/proxy behavior is explicit.
  - Details are documented in `documentation/topology-grafana-phase5-verification-user-guide.md`.

## Key Risks

- Grafana may block iframe embedding unless `allow_embedding` and related security settings are configured.
- Browser cookies/session auth can fail in iframes depending on same-site settings.
- Hardcoded localhost URLs can break in Docker, remote dev, or production-like environments.
- Prometheus may be running but missing the metrics needed for useful panels.
- A polished tab can still fail if dashboard provisioning is manual or unstable.

## Recommended First Milestone

**Completed:** Phases 0 through 5 proved local iframe embedding is feasible, defined the dashboard contract, provisioned the dashboard with a stable UID and panel IDs, embedded it in the topology view, added runtime access-mode controls, and documented verification/troubleshooting.

## Phase 2 Readiness Plan

Phase 2 should be a provisioning-only milestone. It should not add the topology tab or make Angular UI changes.

### Phase 2 Objective

Create a source-controlled Grafana dashboard that implements the Phase 1 contract and is automatically available after local Docker startup.

### Phase 2 Inputs

- `documentation/topology-grafana-phase1-dashboard-contract.md`
- Existing Grafana dashboard provider: `docker/grafana/provisioning/dashboards/providers.yaml`
- Existing Grafana datasource provider: `docker/grafana/provisioning/datasources/datasource.yaml`
- Existing dashboard directory: `docker/grafana/dashboards`

### Phase 2 Deliverables

- A provisioned dashboard JSON in `docker/grafana/dashboards`.
- A stable dashboard UID for future embedding.
- Stable panel IDs for any `d-solo` iframe use.
- A documented dashboard URL.
- A documented single-panel URL for iframe smoke testing.
- Verification notes added back to this plan or a Phase 2 completion note.

### Proposed Dashboard Identity

- Dashboard title: `Phase2 Topology Operations`
- Dashboard UID: `phase2-topology-ops`
- Dashboard slug: `phase2-topology-operations`
- Full dashboard URL: `http://localhost:3000/d/phase2-topology-ops/phase2-topology-operations?orgId=1&kiosk`

### Proposed Panel IDs

- `1`: Service health by job
- `2`: Topology link utilization
- `3`: Topology link throughput
- `4`: Topology link latency
- `5`: Topology link error rate
- `6`: Java request rate
- `7`: Process CPU by job
- `8`: Process memory by job
- `9`: RabbitMQ queue depth
- `10`: Kafka consumer lag
- `11`: Redis clients and memory
- `12`: Observability stack health

### Verification Checklist

- Restart only Grafana with `docker compose -f docker/dev-compose.yml up -d grafana`.
- Confirm `http://localhost:3000/api/health` returns `200`.
- Confirm the dashboard URL returns `200`.
- Confirm at least one `d-solo` panel URL returns `200`.
- Confirm Grafana does not return `X-Frame-Options: deny`.
- Confirm the dashboard still exists after recreating the Grafana container.

### Phase 2 Exit Criteria

- The dashboard is visible in Grafana without manual import.
- The dashboard uses the Prometheus datasource provisioned by the repo.
- The UID and panel IDs are stable and documented.
- No topology Angular UI code is changed in Phase 2.

## Implementation Steps (with Status)

### 1. Requirements & Data Audit

**Status:** Completed

- **Goal:** Identify which metrics are available and relevant for visualization.
- **Exit Criteria:** List of available Prometheus metrics and desired dashboard panels.
- **Result:** Completed in `documentation/topology-grafana-phase1-dashboard-contract.md`.

### 2. Grafana/Prometheus Setup Validation

**Status:** Completed

- **Goal:** Ensure Prometheus is scraping the right targets and Grafana is running and accessible.
- **Exit Criteria:** Prometheus and Grafana are reachable, and metrics endpoints are healthy.
- **Note:** Kubernetes is NOT required for either Grafana or Prometheus; both run as standalone Docker containers (already present in your compose stack).
- **Result:** Completed in Phase 0 and Phase 1. Grafana and Prometheus are reachable, and Prometheus reports 14 healthy scrape jobs.

### 3. Ensure Postgres Persistence

**Status:** Not applicable

- **Goal:** Ensure a persistent Postgres container (cosmic-postgres) is started with the stack for storing time-series or custom data.
- **Exit Criteria:** Postgres container is running and healthy before other services start.
- **Decision:** Not required for the Grafana/Prometheus topology integration. The active Docker dev stack does not define Postgres, Prometheus is the time-series store for this feature, and Grafana dashboards are provisioned from source-controlled JSON. The separate `docker/cosmic-forge-compose.yml` Postgres service is outside this topology dashboard path.

### 4. Dashboard Design

**Status:** Completed

- **Goal:** Design dashboard(s) for the topology view (e.g., node health, traffic, latency, resource usage).
- **Exit Criteria:** Dashboard JSON or configuration ready for embedding.
- **Result:** Completed in Phase 2. The provisioned dashboard is `Phase2 Topology Operations` with UID `phase2-topology-ops`.

### 5. Embedding in Topology View

**Status:** Completed

- **Goal:** Add a new tab to the topology UI that embeds the Grafana dashboard (via iframe or API integration).
- **Exit Criteria:** Tab displays live Grafana dashboard, with correct permissions and responsive layout.
- **Result:** Completed in Phase 3. The topology view has a Metrics Dashboard tab that embeds `phase2-topology-ops` from runtime config and provides loading/error handling plus an external Grafana link.

### 6. Access Control & Security

**Status:** Completed

- **Goal:** Ensure only authorized users can view dashboards; handle Grafana authentication (anonymous, token, or proxy).
- **Exit Criteria:** Dashboard is secure and only visible to intended users.
- **Result:** Completed for the local/demo runtime in Phase 4. Production-like mode is intentionally gated by `GRAFANA_DASHBOARD_ENABLED=false` unless auth/proxy behavior is explicitly configured and verified.

### 7. Advanced Styling & UX for Data Visualization Tab

**Status:** Completed

- **Goal:** Ensure the Metrics Dashboard tab and embedded visualization are highly styled and visually advanced, matching the rest of the topology UI.
- **Exit Criteria:**
  - Dashboard tab uses consistent theming, spacing, and controls as other tabs
  - Embedded iframe is visually integrated (rounded corners, shadows, responsive sizing)
  - Custom header, toolbar, or controls as needed for a seamless experience
  - (If advanced styling is challenging):
    - Sub-step: Prototype custom wrapper or overlay for iframe
    - Sub-step: Evaluate Grafana theming and embedding options
    - Sub-step: Add custom loading, error, and empty states
    - Exit Criteria: Document limitations and next steps for further UI/UX improvements
- **Result:** Completed in Phase 3. The tab uses the existing topology dark theme, compact header controls, stable iframe sizing, and custom loading/error states. Further production polish belongs with Phase 4/5 once access behavior is finalized.

### 8. Documentation & User Guide

**Status:** Completed

- **Goal:** Document how to use the new Metrics Dashboard tab, including:
  - How to access and use the embedded Grafana dashboard
  - Access control (when the tab is visible)
  - How to open the full Grafana UI
  - Troubleshooting common issues (e.g., dashboard not loading, permissions)
  - Developer notes for customizing the dashboard or access control
- **Exit Criteria:** Markdown user guide and developer notes committed to the repository.
- **Result:** Completed in Phase 5. See `documentation/topology-grafana-phase5-verification-user-guide.md`.

## Kubernetes Requirement

- **Not required.** Both Grafana and Prometheus are already supported in your Docker Compose setup. Kubernetes is only needed for large-scale, production-grade deployments or if you want to manage these services in a cluster.

---

## Conclusion

Integrating Grafana/Prometheus into the topology view will enhance observability and user experience without requiring additional data collection. This proposal outlines a clear path to implementation while ensuring security and usability.
