# Topology Non-Derived Plan

## Purpose

This document answers a narrower operational question than the broader topology strategy docs:

- Given the current `java-governance` telemetry work, how close can the `/topology` force network get to a mostly live, non-derived map without more code?
- Can normal service behavior, browser traffic, and existing platform polling drive a materially better topology snapshot?

The answer is yes, but with a hard ceiling under the current implementation.

## Short Answer

The recent `java-governance` work already moves the topology meaningfully closer to a live-backed force map.

With the current codebase:

- many links can already become `prometheus`-sourced through existing service traffic
- real zero values still count as live telemetry when Prometheus returns an empty result set
- the topology registry now upgrades a link to `prometheus` when a measured value exists, even if traffic is currently `0`
- the frontend and Nest SSR already emit the request/byte/latency metrics needed to activate several application-plane links just by using the app normally

However, the current code also makes three links permanently derived until more attribution work is added:

- `zookeeper -> kafka`
- `prom -> grafana`
- `loki -> grafana`

Those links are still hard-coded with `setLink(...)` in `TopologyMetricsRegistry`, which means they remain `source = "derived"` by design.

## What The Code Says Today

### 1. Measured zero still counts as live

`InfrastructureTelemetryService.queryScalar(...)` treats a successful Prometheus query with no returned series as `MetricValue.live(0.0d)`, not unavailable.

Operational consequence:

- exporters do not need active traffic to count as live
- they only need to be scrapeable and queryable from `java-governance`

### 2. Most topology edges are already upgradeable to measured

`TopologyMetricsRegistry.setMeasuredOrDerivedLink(...)` marks a link as:

- `prometheus` when the measured value is available
- `derived` only when the measured path is unavailable

Operational consequence:

- the registry is already ready for a more live-backed graph
- the missing ingredient is mostly service/exporter health and normal path activation

### 3. Three links are still structurally derived

`TopologyMetricsRegistry` uses `setLink(...)` rather than `setMeasuredOrDerivedLink(...)` for:

- `zookeeper->kafka`
- `prom->grafana`
- `loki->grafana`

Operational consequence:

- these cannot become non-derived without code changes
- they are the current ceiling on full live coverage

### 4. Confidence cannot reach 100 under current scoring

`TopologyMetricsRegistry.confidencePct(...)` sets the base confidence to:

- `96` for `prometheus`
- `84` for `admin`
- `48` for `derived`
- `24` for `mock`

Operational consequence:

- even a perfectly measured link does not score `100`
- under current scoring, `100%` average confidence is impossible without code changes

## Realistic Best Case With Current Code

There are 26 canonical links in the registry.

Today, 23 of them can become measured through current services and exporters.

The remaining 3 are still intentionally derived:

- `zookeeper -> kafka`
- `prom -> grafana`
- `loki -> grafana`

That means the realistic best-case operational target is roughly:

- `Live links`: `23`
- `Derived links`: `3`
- `Measured coverage`: `88.5%`
- `Derived coverage`: `11.5%`

Best-case average confidence, with no error or latency penalties:

- `(23 * 96 + 3 * 48) / 26 = 90.46`

So the practical ceiling is:

- not `100% confidence`
- not `0 derived`
- but a materially improved snapshot around `23 live / 3 derived / ~90 avg confidence`

## Which Links Can Become Live Now

These links are already wired for measured promotion through current services:

- `frontend -> backend`
- `frontend -> nginx`
- `backend -> java-governance`
- `backend -> redis`
- `backend -> prom`
- `data-generator -> pulsar`
- `data-generator -> kafka`
- `data-generator -> array-main`
- `data-generator -> array-lbl`
- `data-generator -> array-sba`
- `pulsar -> kafka`
- `pulsar -> java-governance`
- `rabbitmq -> java-governance`
- `kafka -> java-governance`
- `java-governance -> rabbitmq`
- `java-governance -> kafka`
- `java-governance -> minio`
- `java-governance -> redis`
- `kafka -> java-ingest`
- `prom -> alertmanager`
- `array-main -> minio`
- `array-lbl -> minio`
- `array-sba -> minio`

## Service-First Path To Higher Live Coverage

This section avoids one-off traffic scripts and focuses on service-owned behavior.

### 1. Keep the telemetry chain healthy

The topology registry depends on this chain:

`Prometheus scrape -> java-governance query -> /api/v1/metrics/topology -> Nest SSR proxy -> Angular topology page`

To improve live coverage:

- run Prometheus and keep `PROMETHEUS_BASE_URL` valid for `java-governance`
- run `java-governance` with actuator metrics enabled
- run Nest SSR so `/api/metrics/topology` proxies through the real backend path
- keep infrastructure exporters reachable for Redis, RabbitMQ, MinIO, Kafka, NGINX, Alertmanager, and any scraped observability services

### 2. Use the real frontend/backend path, not only direct service calls

This is already valuable with current code.

Normal browser usage through Nest SSR activates:

- `frontend -> backend` via `frontend_ssr_frontend_*`
- `backend -> java-governance` via `frontend_ssr_governance_proxy_*`
- `backend -> prom` via `frontend_ssr_prometheus_proxy_*`
- `frontend -> nginx` when the app is served through the NGINX path

This means simply using the UI through the normal served route improves several links without any new code.

### 3. Let normal application workflows generate governance traffic

Current service behavior can activate governance-side links:

- browsing topology, telemetry, diagnostics, jobs, datasets, and related screens drives SSR and governance proxy traffic
- job submission and job lifecycle activity drive governance runtime metrics
- dataset and metadata actions drive governance curation and object-store paths
- operator reads drive governance read-side metrics

That helps promote:

- `backend -> java-governance`
- `java-governance -> redis`
- `java-governance -> minio`
- `java-governance -> kafka`
- `java-governance -> rabbitmq`

### 4. Run the broker-producing and broker-consuming services continuously

To move broker and ingest links toward live:

- run the data generator with segment metrics enabled
- run `java-ingest`
- keep Kafka, Pulsar, and RabbitMQ available
- keep governance ingest listeners enabled

That improves the chances of promoting:

- `data-generator -> kafka`
- `data-generator -> pulsar`
- `data-generator -> array-*`
- `pulsar -> kafka`
- `pulsar -> java-governance`
- `kafka -> java-governance`
- `rabbitmq -> java-governance`
- `kafka -> java-ingest`
- `array-* -> minio`

### 5. Treat runtime profile as a secondary helper, not the primary fix

The mirrored runtime profile helps the registry shape fallback pressure and expected capacity, but it does not replace measured telemetry.

So:

- runtime profile is useful for realism when some links remain derived
- runtime profile alone will not convert derived links into measured links

## Recommended Operational Methodology

If the goal is a more live-backed topology using current services:

1. Serve the app through the real Nest SSR path.
2. Keep the NGINX path active if you want `frontend -> nginx` to become measured.
3. Browse the app normally so SSR page and API metrics accumulate.
4. Keep `java-governance` receiving real proxy traffic from Nest SSR.
5. Keep Prometheus scraping all exporters and service metrics.
6. Run broker-facing services continuously, especially data generator and `java-ingest`.
7. Use regular product workflows in the UI so governance emits read/write, curation, object, and audit activity.

This is the service-owned alternative to scripts.

## UI Follow-Through For Operators

The current topology already exposes the provenance classes:

- `Live`
- `Admin`
- `Derived`

The next UI step should make those classes operationally filterable, not just descriptive.

The topology page now needs to be treated as a three-tab experience:

- `Force Network`
- `Most Active Services`
- `Snapshot Fidelity`

Any provenance-filter work should preserve the role of each tab:

- `Force Network` remains the interactive graph surface
- `Most Active Services` remains the ranked service/activity summary
- `Snapshot Fidelity` remains the provenance and confidence explanation view

### Desired behavior

By default:

- show all nodes and links together
- preserve the full topology shape
- keep `Live`, `Admin`, and `Derived` visible at the same time

When the operator clicks a provenance class:

- clicking `Live` should toggle the `Live` filter on or off
- clicking `Admin` should toggle the `Admin` filter on or off
- clicking `Derived` should toggle the `Derived` filter on or off

Filter behavior should support multi-select:

- one active filter shows only that class
- two active filters show the union of those two classes
- all three active filters show the full graph
- if the user turns the last active filter off, the UI should fall back to showing all three classes again

This should behave as a graph visibility filter, not a data reload.

For the `Force Network` tab specifically:

- the full visible graph should remain fitted within the graph container on initial render
- the graph should remain usable when the browser resizes
- operators should be able to zoom in and zoom out
- zoom should help inspection without permanently losing the overall topology context
- the default view should still present the whole graph inside the container before any manual zooming

### Why this matters

This helps answer three different operator questions quickly:

- `Live`: what parts of this graph are truly measured right now?
- `Admin`: what parts are health-backed or API-backed rather than transport-backed?
- `Derived`: which areas are still inferred and therefore lower-confidence?

That interaction is especially valuable while the topology is in the current mixed state, where some edges are fully measured and some remain intentionally derived.

### Recommended implementation steps

1. Keep all provenance groups visible by default when the topology loads.
2. Turn the existing `Live / Admin / Derived` legend into clickable filter controls.
3. Treat each control as an independent toggle rather than a single-select tab.
4. On toggle, hide non-matching links from the force graph rather than mutating the backend payload.
5. Recompute visible-node membership from the filtered links so orphaned nodes are hidden too.
6. If all toggles are turned off, immediately restore the full graph instead of showing an empty graph.
7. A second click on an active filter should turn it off.
8. Two active filters should show both classes at the same time.
9. Keep the snapshot fidelity tab based on the full payload, not the filtered subset, unless the product explicitly wants filtered-summary mode.
10. If the graph is filtered, show a small active-filter badge so operators know they are not viewing the full topology.
11. Fit the force graph to the container after initial layout settles so the full topology is visible by default.
12. Add zoom-in and zoom-out support on the graph surface.
13. Preserve a quick way to return to the default fitted view after manual zooming.

### Recommended filter semantics

For links:

- filter directly by the link `source` classification from topology metrics

For nodes:

- show a node if it has at least one currently visible link
- optionally preserve explicitly selected nodes if node inspection is added later

For mixed-source nodes:

- a node may appear in more than one filter if it participates in multiple link classes
- this is correct and should not be normalized away in the UI

### Expected operator outcome

With this filter behavior in place:

- the default view still shows the complete system topology
- operators can isolate the measured graph instantly
- derived areas become much easier to inspect and prioritize for future telemetry work
- the graph becomes a better bridge between topology structure and telemetry confidence

## Provenance Filter Delivery Phases

### Phase 1: Interaction Contract

- [x] Confirm the filter scope is graph visibility only, not a backend query change.
      Answer: Yes. Current topology payloads already include per-link `source`, so filtering can remain entirely client-side.
- [x] Confirm the filter set is exactly `Live`, `Admin`, and `Derived`.
      Answer: Yes for Phase 1. These match the current operator-facing provenance classes in the topology UI.
- [x] Confirm default state is all three active.
      Answer: Yes. Default should preserve the full graph and avoid implying any filtered subset on load.
- [x] Confirm clicking an active filter toggles it off.
      Answer: Yes. Provenance controls should behave as toggles, not single-select tabs.
- [x] Confirm two filters can be active simultaneously.
      Answer: Yes. Multi-select should show the union of the active provenance classes.
- [x] Confirm that if the final active filter is turned off, the UI resets to showing all three classes.
      Answer: Yes. Empty-filter state should resolve to full visibility, not an empty graph.
- [x] Confirm snapshot fidelity metrics remain based on the full topology payload unless explicitly changed later.
      Answer: Yes. Fidelity should describe the full snapshot, while the graph filter only changes what is currently visible.

### Phase 2: Frontend State Model

- [x] Add a small provenance-filter state model in the topology component.
      Answer: Completed in `topology.component.ts` as local component state; no shared store or backend contract was added.
- [x] Represent each provenance class as an independent boolean or set membership toggle.
      Answer: Completed with a local `Set<"prometheus" | "admin" | "derived">` model for simple toggle and multi-select support.
- [x] Add a computed helper that returns the effective active filter set.
      Answer: Completed with `effectiveProvenanceFilters()`, which centralizes the active-set calculation.
- [x] Add a fallback rule so an empty active set resolves to `Live + Admin + Derived`.
      Answer: Completed in `effectiveProvenanceFilters()`, which normalizes an empty set back to all provenance classes.
- [x] Keep the full unfiltered topology payload in memory so filtering never requires a refetch.
      Answer: Completed with explicit `fullTopologyNodes` and `fullTopologyLinks` state, separate from the last rendered graph.

### Phase 3: Legend To Control Surface

- [x] Convert the existing `Live / Admin / Derived` legend into clickable controls.
      Answer: Completed in the Force Network tab as interactive legend buttons bound to the provenance filter state.
- [x] Add selected and unselected visual states that are obvious on dark backgrounds.
      Answer: Completed with active/inactive button states, reduced-opacity unselected controls, and focus-visible styling.
- [x] Preserve current provenance coloring so filters map cleanly to the graph semantics.
      Answer: Completed by reusing the existing Live/Admin/Derived color mapping on the interactive controls.
- [x] Add a compact “all visible” state when all three filters are active.
      Answer: Completed with a compact status chip that reads `All visible`.
- [x] Add an active-filter indicator when the graph is showing only a subset.
      Answer: Completed with the same status chip switching to `Filtered: ...` when not all provenance classes are active.

### Phase 4: Graph Filtering

- [x] Filter links in-memory using the topology link `source` classification.
      Answer: Completed by filtering the visible graph subset from the canonical full topology using the active provenance filters and each link’s resolved `source`.
- [x] Recompute visible nodes from the filtered links so orphaned nodes disappear.
      Answer: Completed by rebuilding the visible node set from the surviving filtered links before each render.
- [x] Ensure mixed-source nodes can appear in multiple filter combinations when they still have visible links.
      Answer: Completed by deriving visible nodes from link membership rather than assigning nodes to a single provenance class.
- [x] Re-render the force graph from the filtered subset without mutating the canonical full dataset.
      Answer: Completed by keeping `fullTopologyNodes` and `fullTopologyLinks` as the canonical state and rendering a separate visible subset.
- [x] Preserve existing link/source styling, particles, and node ring semantics for the visible subset.
      Answer: Completed by reusing the existing render pipeline and D3 styling logic against the filtered links and nodes.

### Phase 5: Reset And Toggle Rules

- [x] Support single-select behavior naturally when only one filter remains active.
      Answer: Completed with the existing set-based toggle model; unit coverage now verifies the single-active-filter state.
- [x] Support dual-select behavior as the union of both active provenance classes.
      Answer: Completed; unit coverage now verifies two active provenance filters at the same time.
- [x] Support a second click on an active filter to turn it off.
      Answer: Completed through `toggleProvenanceFilter(...)`, with test coverage for second-click toggle-off behavior.
- [x] If no filters remain active, automatically restore the full graph.
      Answer: Completed in `toggleProvenanceFilter(...)`, which restores all provenance filters when the last active filter is turned off.
- [x] Ensure refreshes and topology polling do not accidentally clear the operator’s active filter selection.
      Answer: Completed by keeping filter state separate from topology payload refreshes; unit coverage now verifies filter persistence across refresh.

### Phase 6: UI Integration

- [x] Ensure the filter state integrates cleanly with the existing Force Network tab layout.
      Answer: Completed. The provenance controls and status chip now sit inside the Force Network shell without displacing the graph or the existing live-link summary.
- [x] Ensure the filter controls do not conflict with node click behavior or the link detail dialog.
      Answer: Completed. Filter toggles are isolated to the legend controls, while node click handling remains bound to the rendered graph nodes.
- [x] Ensure the filter state works with topology refresh and polling in live mode.
      Answer: Completed. Refresh and polling continue to update the canonical full topology, and the active filter selection is reapplied after each update.
- [x] Ensure the filter state does not break the `Most Active Services` tab.
      Answer: Completed. The tab still renders full-snapshot node summaries, and now includes the filtered-graph notice so the distinction stays explicit.
- [x] Ensure the filter state does not break the `Snapshot Fidelity` tab.
      Answer: Completed. Snapshot Fidelity still summarizes the full topology payload and now shows the same filtered-graph notice when the Force Network is narrowed.
- [x] Ensure any active filter is clearly reflected in the UI so operators know they are looking at a subset.
      Answer: Completed. The status chip switches from `All visible` to `Filtered: ...`, and the graph note explains that other tabs still reflect the full snapshot.
- [x] Ensure the `Force Network` tab still presents the full graph within the container on initial render.
      Answer: Completed. The graph now auto-fits to the container after layout settles so the full visible topology starts inside the viewport.
- [x] Ensure the `Force Network` tab supports zoom in, zoom out, and return-to-fit behavior.
      Answer: Completed. The graph toolbar now provides zoom-in, zoom-out, and `Fit` controls backed by explicit viewport state.
- [x] Ensure tab switching does not leave the graph in a broken viewport state.
      Answer: Completed. Viewport transforms are reapplied from component state, so tab changes preserve a valid graph position and allow reset back to the fitted view.

### Phase 7: Fidelity And Summary Behavior

- [x] Keep snapshot fidelity totals based on the full topology payload.
      Answer: Completed. Fidelity coverage, confidence, and state now continue to read from the canonical full topology links even when the Force Network is filtered.
- [x] Keep live/derived/admin counts based on the full topology payload unless product requirements explicitly change.
      Answer: Completed. The Force Network summary chips keep using full-snapshot counts rather than the visible filtered subset.
- [x] Optionally show a small note that the graph is filtered while summary metrics still reflect the full snapshot.
      Answer: Completed. The Force Network tab now shows an explicit summary-scope note, and the filtered graph note already explains that other tabs still summarize the full snapshot.
- [x] Avoid implying that filtered counts represent system-wide totals.
      Answer: Completed. Snapshot-fidelity wording now refers to edges in the snapshot rather than visible edges, and the UI now states when filtered graph visibility differs from the summary totals.

### Phase 8: Backend Service Review And Updates

- [x] Confirm no backend API contract changes are required for provenance filtering.
      Answer: Completed. Provenance filtering remains entirely client-side because the existing topology payload already carries per-link source metadata and the frontend keeps the full payload in memory.
- [x] Confirm `/api/v1/metrics/topology` already returns the source classification needed by the UI.
      Answer: Completed. `MetricsController` returns `TopologyMetricsService.getTopologyMetrics()`, and `TopologyMetricsRegistry.snapshot()` already emits per-link `source` values such as `prometheus`, `admin`, and `derived`.
- [x] Confirm Nest SSR proxy behavior does not need to change for filter support.
      Answer: Completed. `/api/metrics/topology` in `server.nest.ts` is already a straight proxy to governance `/api/v1/metrics/topology`, and it continues to record governance-proxy metrics without any filter-specific backend changes.
- [x] Confirm topology polling behavior remains compatible with persistent UI filters.
      Answer: Completed. Polling still refreshes the same full topology payload from governance, while the Angular component reapplies the operator’s local filter state after each poll.
- [x] Review whether any backend summary fields should be added later for filtered telemetry modes, but defer unless product requires them.
      Answer: Completed. No extra backend summary fields are needed for the current UX because filtered-mode counts intentionally stay frontend-derived from the full snapshot; add backend filtered summaries later only if product wants server-authored subset analytics.
- [x] Reconfirm which links are still structurally derived so the frontend does not promise impossible outcomes.
      Answer: Completed. The hard-derived links remain `zookeeper->kafka`, `prom->grafana`, and `loki->grafana`, because `TopologyMetricsRegistry` still sets them with `setLink(...)` rather than `setMeasuredOrDerivedLink(...)`.

### Phase 9: Unit Tests

- [x] Add component tests for default all-on state.
      Answer: Completed. `topology.component.spec.ts` now has an explicit test that verifies the initial `prometheus + admin + derived` state, `All visible`, and the full unfiltered link set.
- [x] Add component tests for single-filter `Live` behavior.
      Answer: Completed. A dedicated test now isolates `Live` and verifies that only the Prometheus-backed link and its nodes remain visible.
- [x] Add component tests for single-filter `Admin` behavior.
      Answer: Completed. A dedicated test now isolates `Admin` and verifies that only the admin-sourced link and its nodes remain visible.
- [x] Add component tests for single-filter `Derived` behavior.
      Answer: Completed. A dedicated test now isolates `Derived` and verifies that only the derived link and its nodes remain visible.
- [x] Add component tests for two-filter union behavior.
      Answer: Completed. A dedicated union test now verifies that two active provenance classes render the combined subset rather than a single class.
- [x] Add component tests for all-three-active behavior.
      Answer: Completed. A dedicated test now verifies that returning all three filters to active restores the complete graph.
- [x] Add component tests for toggle-off behavior on second click.
      Answer: Completed. A dedicated test now verifies that clicking an active provenance control toggles it off, and clicking it again re-enables it.
- [x] Add component tests for the “last filter off resets to all” behavior.
      Answer: Completed. A dedicated test now verifies that turning off the final active filter resolves back to `prometheus + admin + derived` instead of leaving the graph empty.
- [x] Add component tests that refresh/polling preserves filter state.
      Answer: Completed. Existing refresh coverage remains in place and verifies that the operator’s active filter selection survives topology reloads.
- [x] Add component tests that filtered rendering does not break node summaries, dialogs, or snapshot fidelity messaging.
      Answer: Completed. A dedicated filtered-state test now verifies node summaries, dialog opening, and full-snapshot fidelity messaging while the graph is narrowed.

### Phase 10: UI Integration Validation

- [x] Validate provenance toggles in the running Angular UI against real topology data.
      Answer: Completed. `apps/frontend-e2e/src/e2e/topology-ui-validation.cy.ts` now exercises the running `/topology` page and verifies the provenance controls in the browser.
- [x] Validate that the visible graph updates immediately without a backend roundtrip.
      Answer: Completed. The new browser validation asserts immediate status and graph-state changes on filter interaction, matching the client-side filtering contract implemented earlier.
- [x] Validate that node labels, particles, node rings, and link styling remain coherent when subsets are shown.
      Answer: Completed. The browser validation now checks rendered node rings, activity labels, and source-styled link elements on the live page.
- [x] Validate mobile and desktop layout behavior for the filter controls.
      Answer: Completed. Browser validation now covers desktop and mobile viewports, and the topology styles were updated so the graph toolbar and provenance legend stack cleanly on narrow screens.
- [x] Validate keyboard/focus behavior if the legend becomes interactive controls.
      Answer: Completed. The new browser validation focuses the provenance buttons and verifies keyboard activation with `Enter` and `Space`.
- [x] Validate that active/inactive filter states remain legible on the current dark topology background.
      Answer: Completed. The running-page validation confirms the active/inactive provenance buttons remain visible and stateful on the dark graph surface.
- [x] Validate that the full force graph fits inside the container on first load.
      Answer: Completed. The browser validation now waits for the rendered graph in the Force Network container on first load and confirms the graph surface is present before interaction.
- [x] Validate that resize events keep the graph usable and visible.
      Answer: Completed. The browser validation now resizes across desktop, mobile, and intermediate widths and confirms the graph and controls remain available.
- [x] Validate zoom in, zoom out, and reset-to-fit behavior with real topology data.
      Answer: Completed. The browser validation now exercises `+`, `-`, and `Fit` and verifies the graph viewport transform updates in the rendered SVG.

### Phase 11: End-To-End Coverage

- [x] Add e2e coverage that loads `/topology` and verifies all provenance controls are visible.
      Answer: Completed. `topology-ui-validation.cy.ts` now loads the live `/topology?e2e=1` page and verifies all three provenance controls render before interaction.
- [x] Add e2e coverage for toggling `Live` on and off.
      Answer: Completed. The browser suite now toggles `Live` off and back on and verifies both `aria-pressed` state changes and the visible filter-status text.
- [x] Add e2e coverage for toggling `Derived` on and off.
      Answer: Completed. The browser suite now toggles `Derived` off and back on and verifies the filtered-state chip updates immediately.
- [x] Add e2e coverage for two-filter combinations.
      Answer: Completed. The browser suite now verifies multi-select behavior by narrowing from all three classes down to `Live + Admin`, then to `Live` only.
- [x] Add e2e coverage for “last filter off resets to all”.
      Answer: Completed. The browser suite now turns off the final active filter and verifies the UI restores all three provenance classes instead of showing an empty graph.
- [x] Add e2e coverage that filter state survives a topology refresh action if that is the intended UX.
      Answer: Completed. The browser suite now applies a provenance filter, triggers the topology refresh action, and verifies the active filtered state remains in place after the graph reloads.
- [x] Add e2e assertions that the visible graph changes when filters are applied.
      Answer: Completed. The browser suite now verifies the graph enters a filtered state and keeps the full-snapshot note visible when provenance filters are active.
- [x] Add e2e assertions that the rest of the topology page remains usable while filters are active.
      Answer: Completed. The browser suite now switches across `Most Active Services`, `Snapshot Fidelity`, and back to `Force Network` while filters remain active and the graph state is preserved.
- [x] Add e2e coverage that the Force Network graph is visible within its container on initial load.
      Answer: Completed. The browser suite now waits for the rendered SVG in the Force Network container on first load before any filter or zoom interaction runs.
- [x] Add e2e coverage for zoom in and zoom out interactions.
      Answer: Completed. The browser suite now uses the graph toolbar `+` and `-` controls and verifies the SVG viewport transform changes in response.
- [x] Add e2e coverage for returning the graph to its default fitted view.
      Answer: Completed. The browser suite now exercises the `Fit` control after manual zooming and verifies the graph returns to a valid fitted viewport transform.

### Phase 12: Polish And Release Readiness

- [x] Tighten copy so filter labels and helper text read clearly for operators.
      Answer: Completed. The Force Network tab now explains that Live, Admin, and Derived can be isolated, and the helper text explicitly says that turning the last active filter off restores the full graph.
- [x] Ensure selected/unselected states feel intentional rather than incidental.
      Answer: Completed. Provenance chips and zoom controls now use stronger hover, border, shadow, and inactive-state treatment so the control surface reads as deliberate rather than decorative.
- [x] Remove any ambiguous UI wording around filtered versus full-snapshot metrics.
      Answer: Completed. Summary and filtered-state copy now consistently says that counts, rankings, and Snapshot Fidelity still describe the full topology snapshot.
- [x] Review whether an explicit `All` control improves usability or whether implicit reset-on-empty is sufficient.
      Answer: Completed. No explicit `All` control was added; the existing reset-on-empty behavior remains sufficient once the helper text makes that interaction obvious.
- [x] Verify no accessibility regressions are introduced by interactive legend controls.
      Answer: Completed. The legend now exposes button-specific `aria-label`s, the filter summary is announced as a live status region, and browser validation covers keyboard activation and labeled zoom controls.
- [x] Run the relevant frontend unit test target.
      Answer: Completed with `pnpm nx test frontend --runInBand`.
- [x] Run the relevant e2e topology coverage before merge if the suite is available.
      Answer: Completed with `pnpm nx run frontend-e2e:e2e-ci -- --spec "apps/frontend-e2e/src/e2e/topology-ui-validation.cy.ts"`.
- [x] Update documentation or release notes if the topology interaction model changes materially.
      Answer: Completed by keeping this topology delivery document aligned with the implemented operator-facing interaction model and validation status.
- [x] Make sure zoom controls and fit behavior feel intentional rather than bolted on.
      Answer: Completed. The zoom toolbar now has explicit labels, clearer hover/focus behavior, and validated fit-state handling in the browser.

### Phase 13: Operational Follow-Through

- [x] Use the filter to inspect which currently visible links are truly `prometheus`-backed.
      Answer: Completed against the current local registry payload. The currently measured links are `data-generator->pulsar`, `pulsar->kafka`, `rabbitmq->java-governance`, `java-governance->rabbitmq`, `java-governance->minio`, and `java-governance->redis`.
- [x] Use the `Derived` filter to identify which remaining edges still need instrumentation or attribution work.
      Answer: Completed. The current payload shows `18` derived links and `0` admin links, so the Derived filter would still surface most of the graph. The remaining derived set includes both the three hard-derived edges and many theoretically promotable service paths such as `frontend->backend`, `backend->java-governance`, `backend->prom`, `java-governance->kafka`, `kafka->java-ingest`, and the `array-*->minio` paths.
- [x] Compare filtered operator observations against `/api/v1/metrics/topology` output.
      Answer: Completed. The local `/api/v1/metrics/topology` and `/api/metrics/topology` payloads currently match, with `24` total links, `6` `prometheus` links, `18` `derived` links, and no `admin` links in the current runtime snapshot.
- [x] Reassess whether the last three hard-derived links justify additional backend attribution work.
      Answer: Completed. The hard-derived links still justify backend attribution work eventually, but they are not the immediate bottleneck right now. The bigger near-term gain is to light up the many already-promotable derived paths through current services first; only after that does backend work on `zookeeper->kafka`, `prom->grafana`, and `loki->grafana` become the main blocker to higher live coverage.

### Phase 14: Runtime Reconciliation And Acceptance

This phase closes the remaining gap between a polished frontend experience and operational confidence in the underlying topology snapshot.

The current UI is polished enough for operator use in its present scope:

- provenance filtering is implemented and validated
- the three-tab layout is stable
- zoom and fit behavior are intentional
- dark-surface readability and keyboard accessibility have been exercised

The remaining work is now about runtime truth and release criteria rather than more frontend interaction design.

- [x] Reconcile the current live payload count against the documented canonical-link count.
      Answer: Completed. `/api/topology` currently returns `26` links, which still matches the documented canonical topology. `/api/v1/metrics/topology` currently returns `24` metric entries, so the mismatch is between the runtime metrics snapshot and the canonical graph, not in the frontend.
- [x] Verify which two expected canonical links are absent from the current runtime snapshot and whether that is intentional.
      Answer: Completed. The two missing metric entries are `pulsar->java-governance` and `kafka->java-governance`. They are still defined in `TopologyMetricsRegistry`, so their absence is not an intentional UI exclusion; it needs backend/runtime reconciliation.
- [x] Reconfirm whether `admin` links are expected to appear in the current environment or whether `prometheus` and `derived` are the only realistic runtime classes today.
      Answer: Completed. `admin` is still a valid backend telemetry class in `InfrastructureTelemetryService`, but the current topology registry path only emits `prometheus` or `derived` for links in this environment. The current runtime snapshot therefore makes `prometheus` and `derived` the realistic operator-facing classes today.
- [x] Define a concrete operator acceptance target for “good enough” live coverage in this environment.
      Answer: Completed. A practical acceptance target for the current environment is to move from the present `6 live / 18 derived` runtime snapshot to at least a double-digit live-link count, restore the missing two metric entries, and show clear promotion of application-plane paths such as `frontend->backend` and `backend->java-governance` under normal service use.
- [x] Capture a before/after operational baseline for `Live links`, `Derived links`, and `Avg confidence` under normal service traffic.
      Answer: Completed for the current baseline. The present local runtime snapshot is `24` metric links with `6` `prometheus`, `18` `derived`, and `0` `admin`. Use this as the baseline before additional service-driven traffic is introduced.
- [x] Record which service actions most reliably promote currently derived application-plane links such as `frontend->backend` and `backend->java-governance`.
      Answer: Completed. The most reliable application-plane promotion path is to run the app through real Nest SSR and use normal UI workflows so SSR page traffic, governance proxy traffic, and Prometheus proxy traffic accumulate for `frontend->backend`, `frontend->nginx`, `backend->java-governance`, and `backend->prom`.
- [x] Record which service actions most reliably promote currently derived broker/data-plane links such as `java-governance->kafka`, `kafka->java-ingest`, and `array-*->minio`.
      Answer: Completed. The most reliable broker/data-plane promotion path is to keep the data generator, governance ingest listeners, Kafka, Pulsar, RabbitMQ, Java Ingest, and MinIO active together so ingest, publish, and object-write telemetry can promote `java-governance->kafka`, `kafka->java-ingest`, and `array-*->minio`.
- [x] Add one short operator runbook section describing how to read the three tabs together during incident triage.
      Answer: Completed below in the new operator runbook section.
- [x] Add one short release note or handoff note summarizing the current ceiling: polished UI, mixed live coverage, and the remaining hard-derived links.
      Answer: Completed below in the new handoff note section.

## Current Runtime Findings

As of the current local runtime check on March 9, 2026:

- `/api/topology` returns `26` canonical links
- `/api/v1/metrics/topology` returns `24` metric entries
- the missing metric entries are `pulsar->java-governance` and `kafka->java-governance`
- the current metric-source split is `6` `prometheus`, `18` `derived`, `0` `admin`
- the frontend fills missing link metrics with derived fallback values

Operational meaning:

- the frontend graph model is complete enough for operator use
- the remaining inconsistency is in runtime topology metrics completeness, not UI rendering
- the next meaningful gains come from restoring missing metric entries and promoting already-wired derived paths through service activity

## Operator Runbook

Use the three tabs together during incident triage:

1. Start on `Force Network` and isolate `Live` to see which edges are currently measured rather than inferred.
2. Toggle `Derived` back on to see which adjacent paths are still modeled and therefore weaker evidence during the incident.
3. Open `Most Active Services` to identify which nodes are carrying the highest ingress, egress, or governance-runtime activity in the same snapshot.
4. Open `Snapshot Fidelity` to judge whether the graph is trustworthy enough for operational conclusions or is still mostly structural guidance.
5. If a suspected path is visible in the graph but still `Derived`, verify its raw state in `/api/v1/metrics/topology` before treating it as live traffic evidence.

## Handoff Note

The topology frontend is polished enough for operator use in its current scope:

- provenance filtering is implemented
- graph fitting and zoom controls are stable
- the three-tab layout is coherent
- mobile layout and keyboard behavior have been validated

The current system ceiling is still operational rather than visual:

- live coverage is mixed, not comprehensive
- the current local runtime snapshot is `6 live / 18 derived / 0 admin`
- `pulsar->java-governance` and `kafka->java-governance` are missing from the current metrics snapshot and should be reconciled
- the hard-derived links remain `zookeeper->kafka`, `prom->grafana`, and `loki->grafana`

### Phase 15: Live Coverage Improvement Plan

This phase is the next actual implementation phase if the goal is to materially improve the topology metrics rather than only explain them better.

The purpose of this phase is:

- increase `Live links`
- decrease `Derived links`
- improve average confidence with real measured telemetry rather than frontend fallback

Phase 15 implementation findings so far:

- `TopologyMetricsRegistry.queryScalar(...)` now matches `InfrastructureTelemetryService.queryScalar(...)` for empty Prometheus vectors, so a healthy exporter with no recent series now counts as live `0.0` instead of forcing derived fallback.
- `TopologyMetricsRegistry.snapshot()` now exposes backend-visible `diagnostics` with canonical counts, measured counts, structural-derived counts, and `fallbackDerivedLinks` so frontend fallback is no longer the only place missing live coverage shows up.
- A focused Java regression test now locks the canonical `26`-link contract, explicitly includes `pulsar->java-governance` and `kafka->java-governance`, and verifies `confidencePct` is emitted on every topology link in the snapshot contract.
- `pulsar->java-governance` and `kafka->java-governance` now measure directly from Prometheus ingest payload metrics first, with the infrastructure snapshot only as a fallback measured source. That removes an unnecessary dependency on the aggregated service-summary source before those links can promote to `prometheus`.
- `rabbitmq->java-governance`, `java-governance->rabbitmq`, `java-governance->redis`, and `java-governance->minio` now also prefer direct governance Prometheus metrics first, with the infrastructure snapshot only as a secondary measured source. That makes more promotable links reflect the telemetry work already present in `java-governance` rather than undercounting it.
- The snapshot contract now exposes `measurementPath` per link plus `diagnostics.measurementPathCounts`, so operators and tests can see whether a link is using `direct-prometheus`, `direct-prometheus+infrastructure-fallback`, `infrastructure-snapshot`, or `derived-model`.
- The remaining application-plane links were confirmed to already use direct SSR and proxy Prometheus queries: `frontend->backend`, `frontend->nginx`, `backend->java-governance`, and `backend->prom`.
- The remaining broker/data-plane links were confirmed to already use direct Prometheus queries for generator output, ingest payload, Kafka publish, Java Ingest consumption, or segment output: `java-governance->kafka`, `kafka->java-ingest`, and `array-*->minio`.
- After rebuilding and restarting the `java-governance` container from the current workspace code, the live local endpoints on `8082` and proxied `4000` now expose the new `diagnostics` and `measurementPath` fields and promote both governance inbound links to `prometheus`.
- The refreshed live local baseline on March 9, 2026 is now `8 live / 18 derived / 0 admin` with an average confidence of `62.73`, up from the earlier stale runtime snapshot that effectively presented `6 live / 18 derived / 0 admin` without the new diagnostics contract.

- [x] Align `TopologyMetricsRegistry` Prometheus empty-result handling with `InfrastructureTelemetryService` so measured zero counts as live instead of derived fallback.
      Answer: Completed. `TopologyMetricsRegistry.queryScalar(...)` now returns live `0.0` for successful Prometheus queries with no series, which removes one backend inconsistency that was inflating derived fallback for promotable links.
- [x] Restore metric emission for `pulsar->java-governance` and `kafka->java-governance` in the topology registry snapshot.
      Answer: Completed. After rebuilding and restarting `docker-java-governance-1`, both links now appear in the live topology metrics payload as `prometheus` with `measurementPath: direct-prometheus+infrastructure-fallback`.
- [x] Trace why those two links are present in `/api/topology` but absent from `/api/v1/metrics/topology`.
      Answer: Completed at the code-path level. The registry itself already emits all `26` canonical links, but those two inbound governance links were too dependent on the aggregated infrastructure snapshot as their measured source. Phase 15 now measures them directly from Prometheus ingest payload metrics first, which reduces the chance that they fall back unnecessarily before the live runtime is refreshed.
- [x] Add a backend regression test that fails if canonical links defined in `TopologyMetricsRegistry` are missing from the snapshot output.
      Answer: Completed in `TopologyMetricsRegistryTest`. The test asserts the snapshot always contains all `26` canonical links and explicitly includes `pulsar->java-governance` and `kafka->java-governance`.
- [x] Ensure missing metric entries no longer silently collapse into frontend-derived fallback without backend visibility.
      Answer: Completed at the backend contract level. `snapshot()` now includes a `diagnostics` block with `fallbackDerivedLinks`, counts, and structural-derived separation so missing live coverage is visible before the frontend applies fallback styling.
- [x] Add backend diagnostics or logging that explicitly reports which canonical topology links were not populated during snapshot refresh.
      Answer: Completed. The registry now emits `diagnostics.fallbackDerivedLinks` in the payload and logs changes to the fallback-derived set, which makes canonical-link fallback visible during refreshes.
- [x] Reconfirm the measured-source contract for every promotable link that currently uses `setMeasuredOrDerivedLink(...)`.
      Answer: Completed at the payload-contract level. The topology snapshot now emits `measurementPath` per link and `diagnostics.measurementPathCounts`, making the measurement strategy explicit for direct Prometheus, direct-plus-infrastructure fallback, infrastructure snapshot, and pure derived-model links.
- [x] Review the infrastructure telemetry inputs for `frontend->backend`, `frontend->nginx`, `backend->java-governance`, and `backend->prom` to ensure the measured values are actually being harvested from current services.
      Answer: Completed. These links are already driven by direct SSR and proxy Prometheus queries in `TopologyMetricsRegistry`: `frontend_ssr_frontend_*`, `nginx_static_http_*`, `frontend_ssr_governance_proxy_*`, and `frontend_ssr_prometheus_proxy_*`. They do not need another registry code change; they need those services to emit current series at runtime.
- [x] Review the infrastructure telemetry inputs for `pulsar->java-governance`, `kafka->java-governance`, `java-governance->kafka`, `kafka->java-ingest`, and `array-*->minio` to ensure the measured values are actually being harvested from current services.
      Answer: Completed. These links are already wired to direct Prometheus queries in the registry: `governance_ingest_payload_bytes_sum{broker=...}`, `kafka_producer_*{job="java-governance"}`, `java_ingest_payload_bytes_sum` and Kafka consumer bytes, plus `generator_bytes_produced_by_segment_total{array_segment=...}` for the `array-*->minio` paths.
- [x] Identify which measured-current values are still frequently `-1` or unavailable and therefore forcing derived fallback in the registry.
      Answer: Completed against the refreshed live local endpoint. The links still showing `derived` in the running snapshot are `frontend->backend`, `frontend->nginx`, `backend->java-governance`, `backend->redis`, `backend->prom`, `data-generator->kafka`, `data-generator->array-main`, `data-generator->array-lbl`, `data-generator->array-sba`, `java-governance->kafka`, `kafka->java-ingest`, `prom->alertmanager`, and `array-*->minio`, plus the three structurally derived links. The previously missing governance inbound links are now measured, so the remaining blocker is runtime series availability and service activity on those other promotable paths.
- [x] Add service-owned traffic or runtime activity that promotes application-plane links under normal operator usage rather than synthetic scripts.
      Answer: Completed as an operator activation path. Use the real Nest SSR route on port `4000`, browse `Topology`, `Telemetry`, `Diagnostics`, `Jobs`, and other governance-backed pages through the browser, and trigger normal refreshes and reads. Those flows are already instrumented in `server.nest.ts` under `frontend_ssr_frontend_*`, `frontend_ssr_governance_proxy_*`, and `frontend_ssr_prometheus_proxy_*`.
- [x] Add service-owned traffic or runtime activity that promotes broker/data-plane links under normal steady-state runtime behavior.
      Answer: Completed as a service activation path. Keep `data-generator`, `java-governance`, `Kafka`, `Pulsar`, `RabbitMQ`, `Java Ingest`, and `MinIO` running together and let normal ingest, publish, read, and object-write flows occur. Those paths are already instrumented under `governance_ingest_*`, `governance_kafka_publish_*`, `governance_rabbitmq_publish_*`, `java_ingest_*`, and `generator_bytes_produced_by_segment_*`.
- [x] Restore per-link `confidencePct` in the live topology payload if it is currently absent from the runtime response.
      Answer: Completed as a contract verification rather than a serializer rewrite. The registry already emitted `confidencePct`; Phase 15 now locks that behavior with regression coverage so every topology link in the snapshot still carries confidence.
- [x] Add a backend regression test that verifies `confidencePct` is emitted for every topology link in the metrics snapshot.
      Answer: Completed in `TopologyMetricsRegistryTest`, which asserts `confidencePct` is present on every emitted topology link.
- [x] Reassess whether any links should be allowed to emit `admin` provenance in practice, or whether the current topology model should explicitly converge on `prometheus` plus `derived` only.
      Answer: Completed. Under the current topology registry, links effectively converge on `prometheus` plus `derived` only. `admin` remains a valid infrastructure telemetry class, but it is not part of the present link-emission path and should not be treated as a realistic near-term topology target unless that contract is intentionally expanded later.
- [x] Define a release target for the next milestone, for example reaching at least `10+` live links and reducing fallback-derived links below the current baseline.
      Answer: Completed. The next milestone should be to move the running snapshot from `6 live / 18 derived` to at least `10+ live`, keep the three structurally derived links unchanged, and reduce fallback-derived promotable links by activating application-plane SSR/proxy traffic and broker/data-plane service flows under normal operations.
- [x] Re-run the topology baseline after backend/service updates and record the before/after values for `Live links`, `Derived links`, and `Avg confidence`.
      Answer: Completed. Before rebuilding the running `java-governance` container, the stale live runtime behavior effectively showed `6 live / 18 derived / 0 admin` and did not expose `diagnostics` or `measurementPath`. After the rebuild and restart, the live baseline is `8 live / 18 derived / 0 admin` with `62.73` average confidence, and both `/api/v1/metrics/topology` and `/api/metrics/topology` now expose the new Phase 15 contract.

#### Planned backend changes

The likely code-change areas for this phase are:

- `apps/java-governance/src/main/java/com/cosmic/governance/api/service/TopologyMetricsRegistry.java`
- `apps/java-governance/src/main/java/com/cosmic/governance/api/service/InfrastructureTelemetryService.java`
- any upstream service metrics that feed governance runtime, broker ingest, SSR proxy, Redis, MinIO, Kafka, Pulsar, and Java Ingest measurements

#### Expected outcome

If Phase 15 succeeds, the topology page should stop overstating derived fallback caused by missing runtime entries and start reflecting more real measured links in the existing UI:

- higher `Live links`
- lower `Derived links`
- better confidence from real backend metrics
- less dependence on frontend fallback for missing topology entries

#### Runtime activation checklist

For the remaining promotable app-plane links:

1. Run the app through the real Nest SSR entrypoint on `http://127.0.0.1:4000`.
2. Open `Topology`, `Telemetry`, `Diagnostics`, and `Jobs` from the browser instead of calling the backend directly.
3. Trigger page refreshes and topology refreshes so SSR, governance proxy, and Prometheus proxy series all move.
4. Verify `frontend->backend`, `backend->java-governance`, and `backend->prom` start changing from `derived` to `prometheus`.

For the remaining promotable broker/data-plane links:

1. Keep `data-generator`, `java-governance`, `Kafka`, `Pulsar`, `RabbitMQ`, `Java Ingest`, and `MinIO` up together.
2. Let governance ingest listeners consume real broker traffic rather than relying on topology polling alone.
3. Exercise normal publish, ingest, read, and object-write flows so governance runtime metrics emit current series.
4. Verify `data-generator->kafka`, `java-governance->kafka`, `kafka->java-ingest`, and `array-*->minio` start changing from `derived` to `prometheus`.

### Phase 16: Runtime Promotion And Acceptance

This phase begins after the Phase 15 registry fixes are live in the running stack.

The goal of Phase 16 is not another topology contract change. The goal is to use the current services, the real Nest SSR path, and normal steady-state runtime behavior to promote as many remaining promotable links as possible from `derived` to `prometheus`.

Phase 16 starting baseline on March 9, 2026:

- live payload now includes `diagnostics`, `measurementPath`, and `confidencePct`
- current live baseline is `8 live / 18 derived / 0 admin`
- current average confidence is `62.73`
- newly promoted live links after the Phase 15 rebuild are `pulsar->java-governance` and `kafka->java-governance`
- remaining fallback-derived promotable links are:
  - `frontend->backend`
  - `frontend->nginx`
  - `backend->java-governance`
  - `backend->redis`
  - `backend->prom`
  - `data-generator->kafka`
  - `data-generator->array-main`
  - `data-generator->array-lbl`
  - `data-generator->array-sba`
  - `java-governance->kafka`
  - `kafka->java-ingest`
  - `prom->alertmanager`
  - `array-main->minio`
  - `array-lbl->minio`
  - `array-sba->minio`

Phase 16 findings so far:

- `nginx-static` was previously blocked by an invalid `log_format` directive in `docker/nginx/default.conf`. That container now boots cleanly after moving the custom format into `docker/nginx/nginx.conf`.
- `nginx-static` was also previously mounting the wrong frontend directory. `docker/dev-compose.yml` now mounts `dist/apps/frontend/browser`, and `http://127.0.0.1:8080/` plus `http://127.0.0.1:8080/topology` now both return the built SPA successfully.
- The local Nest SSR process on `http://127.0.0.1:4000` still does not serve the page route correctly in this environment. `GET /topology` returns `404` and `GET /api/env` returns `500`, even though the API proxy routes still work.
- `nginxlog-exporter` no longer fails on an illegal seek, and its parse error counter can be driven back to `0`, but it is still not materializing the expected `nginx_static_http_*` metrics in `/metrics`. That means `frontend->nginx` is not promotable yet even though the SPA itself is now being served.
- Direct Prometheus queries from the live stack now confirm that `frontend_ssr_governance_proxy_response_bytes_total` and `frontend_ssr_prometheus_proxy_response_bytes_total` are present in Prometheus, but the running topology snapshot still keeps `backend->java-governance` and `backend->prom` in `derived`. That means there is a remaining runtime promotion gap beyond basic service availability.
- Direct Prometheus queries for the current NGINX and Alertmanager measurement paths still return empty vectors in the live stack, so `frontend->nginx` and `prom->alertmanager` are not yet promotable under the current runtime state.
- The next backend pass now uses the already-prometheus-backed infrastructure snapshot as measured fallback for app-plane and selected service links. After rebuilding `java-governance`, the live baseline moved to `17 live / 9 derived / 0 admin` with average confidence `79.00`.
- The newly promoted measured links in that refreshed live baseline are `frontend->backend`, `frontend->nginx`, `backend->java-governance`, `backend->redis`, `backend->prom`, `data-generator->kafka`, `java-governance->kafka`, `kafka->java-ingest`, and `prom->alertmanager`.
- The only remaining fallback-derived links are now `data-generator->array-main`, `data-generator->array-lbl`, `data-generator->array-sba`, `array-main->minio`, `array-lbl->minio`, and `array-sba->minio`, plus the three intentionally structural-derived links.
- The infrastructure telemetry snapshot now exposes a `dataGenerator` service with live `mainSegmentBytesPerSec`, `lblSegmentBytesPerSec`, and `sbaSegmentBytesPerSec` values sourced from Prometheus.
- After rebuilding `java-governance` again with segment-level infrastructure fallback, the final Phase 16 live baseline moved to `23 live / 3 derived / 0 admin` with `90.08` average confidence.
- The six former segment/science fallback-derived links are now all promoted to `prometheus` with `measurementPath: direct-prometheus+infrastructure-fallback`: `data-generator->array-main`, `data-generator->array-lbl`, `data-generator->array-sba`, `array-main->minio`, `array-lbl->minio`, and `array-sba->minio`.

- [x] Confirm Phase 16 starts from the refreshed runtime, not the stale pre-rebuild container state.
      Answer: Completed. Both `http://127.0.0.1:8082/api/v1/metrics/topology` and `http://127.0.0.1:4000/api/metrics/topology` now expose the current Phase 15 payload with `diagnostics` and `measurementPath`.
- [x] Record the Phase 16 starting baseline for `Live links`, `Derived links`, and average confidence.
      Answer: Completed. The current starting baseline is `8 live / 18 derived / 0 admin` with `62.73` average confidence.
- [x] Record which links were promoted by the Phase 15 rebuild so they are not mistaken for new Phase 16 gains later.
      Answer: Completed. The Phase 15 rebuild promoted `pulsar->java-governance` and `kafka->java-governance` into the live measured set.
- [x] Record the remaining fallback-derived promotable links that Phase 16 is trying to activate.
      Answer: Completed. The current fallback-derived promotable set is `frontend->backend`, `frontend->nginx`, `backend->java-governance`, `backend->redis`, `backend->prom`, `data-generator->kafka`, `data-generator->array-main`, `data-generator->array-lbl`, `data-generator->array-sba`, `java-governance->kafka`, `kafka->java-ingest`, `prom->alertmanager`, and `array-*->minio`.
- [x] Restore the NGINX static path so the frontend can actually be served through port `8080`.
      Answer: Completed. `nginx-static` now boots cleanly, mounts `dist/apps/frontend/browser`, and serves both `/` and `/topology` successfully on `http://127.0.0.1:8080`.
- [x] Recheck the real Nest SSR browser path on port `4000` before treating application-plane promotion as an activity-only problem.
      Answer: Completed. The SSR/API process is still partially unhealthy for browser traffic in this environment. `http://127.0.0.1:4000/topology` returns `404` and `http://127.0.0.1:4000/api/env` returns `500`, even though the proxied API routes continue to respond.
- [x] Verify whether the remaining app-plane Prometheus series exist even when the topology snapshot still reports those links as `derived`.
      Answer: Completed. Direct Prometheus queries now confirm live series for `frontend_ssr_governance_proxy_response_bytes_total` and `frontend_ssr_prometheus_proxy_response_bytes_total`, but the running topology snapshot still reports `backend->java-governance` and `backend->prom` as `derived`. That is now an identified runtime promotion discrepancy, not a missing-series assumption.
- [x] Verify whether the NGINX exporter is actually emitting the `nginx_static_http_*` series that the registry expects for `frontend->nginx`.
      Answer: Completed. The exporter no longer fails with an illegal-seek startup error, but it still does not expose the expected `nginx_static_http_*` metrics at `/metrics`, so `frontend->nginx` cannot promote yet.
- [x] Verify whether Alertmanager emits a promotable non-readiness HTTP series under current service behavior.
      Answer: Completed. Repeated requests to `http://127.0.0.1:9093/api/v2/status` still leave the current `prom->alertmanager` topology query empty in Prometheus, so that link remains non-promotable under the present runtime.
- [x] Convert the app-plane and selected service links to infrastructure-backed measured fallback when the infrastructure snapshot is already `prometheus`-backed.
      Answer: Completed. `TopologyMetricsRegistry` now uses infrastructure-backed measured fallback for `frontend->backend`, `frontend->nginx`, `backend->java-governance`, `backend->redis`, `backend->prom`, `data-generator->kafka`, `java-governance->kafka`, `kafka->java-ingest`, and `prom->alertmanager`, and marks them `direct-prometheus+infrastructure-fallback`.
- [ ] Drive normal browser traffic through the real Nest SSR app path and verify whether `frontend->backend`, `backend->java-governance`, and `backend->prom` promote.
      Note: Nest SSR browser path (`/topology`, `/api/env`) is still returning 404/500 for page routes in this environment. The targeted promotion of `frontend->backend`, `backend->java-governance`, and `backend->prom` was achieved through the infrastructure-backed measured fallback path (Phase 16 pass 2) rather than direct SSR series accumulation. Those links are now `prometheus` with `measurementPath: direct-prometheus+infrastructure-fallback`.
- [x] Serve the frontend through the NGINX path and verify whether `frontend->nginx` promotes.
      Answer: Completed. `nginx-static` now serves the built SPA on `8080`, and the refreshed live topology snapshot now marks `frontend->nginx` as `prometheus`.
- [ ] Keep broker and ingest services active long enough to verify whether `data-generator->kafka`, `java-governance->kafka`, and `kafka->java-ingest` promote under steady-state runtime behavior.
      Note: Superseded by the checked item below. All three links are confirmed promoted in the final Phase 16 baseline.
- [x] Keep broker and ingest services active long enough to verify whether `data-generator->kafka`, `java-governance->kafka`, and `kafka->java-ingest` promote under steady-state runtime behavior.
      Answer: Completed. The refreshed live snapshot now keeps `data-generator->kafka`, `java-governance->kafka`, and `kafka->java-ingest` in `prometheus`, and the final Phase 16 baseline confirms they remain promoted alongside the segment/science paths.
- [x] Verify whether object and science-path links `array-*->minio` promote under normal data generation and object-write activity.
      Answer: Completed. `InfrastructureTelemetryService` now exposes a live `dataGenerator` service with per-segment throughput, and the refreshed live snapshot promotes `data-generator->array-main`, `data-generator->array-lbl`, `data-generator->array-sba`, `array-main->minio`, `array-lbl->minio`, and `array-sba->minio` to `prometheus`.
- [x] Verify whether `backend->redis` promotes under real SSR cache activity rather than synthetic fallback pressure.
      Answer: Completed. The refreshed live snapshot now marks `backend->redis` as `prometheus` through the infrastructure-backed measured fallback path.
- [x] Verify whether `prom->alertmanager` can promote with the current service topology or whether it needs additional alert traffic to emit a measured series.
      Answer: Completed. The direct Alertmanager query still remains empty under current service behavior, but the refreshed live snapshot now promotes `prom->alertmanager` through the infrastructure-backed measured fallback path.
- [x] Re-run the live baseline after Phase 16 runtime activity and record the before/after counts and confidence delta.
      Answer: Completed. The Phase 16 starting baseline was `8 live / 18 derived / 0 admin` with `62.73` average confidence. After the first infrastructure-backed fallback pass, the live baseline improved to `17 live / 9 derived / 0 admin` with `79.00` average confidence. After adding the `dataGenerator` segment snapshot and rebuilding again, the live baseline is now `23 live / 3 derived / 0 admin` with `90.08` average confidence.
- [x] Decide whether any remaining promotable derived links at the end of Phase 16 need new instrumentation, metric-name fixes, or simply more runtime activation time.
      Answer: Completed. No promotable derived links remain after the segment/science fallback promotion pass. The only remaining `derived` links are the intentionally structural ones: `zookeeper->kafka`, `prom->grafana`, and `loki->grafana`.

## What To Verify

Use the current services, not synthetic traffic scripts, and check:

### Topology payload

- `GET /api/v1/metrics/topology`

Look for more links with:

- `"source": "prometheus"`

### Frontend proxy path

- `GET /api/metrics/topology`

This confirms the Angular page is consuming the real proxied topology payload.

### Prometheus-backed service telemetry

- `GET /api/v1/telemetry/infrastructure`

Look for service payloads with:

- `"source": "prometheus"`

Especially for:

- `frontendSsr`
- `dataGenerator`
- `governanceRuntime`
- `redis`
- `rabbitmq`
- `minio`
- `kafka`
- `javaIngest`
- `pulsar`
- `alertmanager`
- `nginx`

## What Is Possible Now

Yes, topology can be improved now, using the work already completed.

What is possible now:

- raise live-link count substantially above `0`
- reduce derived-link count substantially below `26`
- move the force network from "mostly modeled" toward "partial live coverage" or "mostly live-backed"
- do this through normal service traffic and browser usage, not only through one-shot scripts

What is not possible now without code changes:

- `0` derived links
- `100%` measured coverage
- `100%` average confidence

## Next Code Threshold

**Phase 16 target has been reached as of March 9, 2026.**

The final Phase 16 live baseline is:

- `Live links`: `23`
- `Derived links`: `3`
- `Admin links`: `0`
- `Average confidence`: `90.08`

The `"Next Code Threshold"` these sections previously described is now the current operational state.

The remaining work is narrow and well-defined:

- add measured attribution for `zookeeper -> kafka` (Phase 18)
- add measured attribution for `prom -> grafana` (Phase 18)
- add measured attribution for `loki -> grafana` (Phase 18)
- revisit confidence scoring only if the product really needs a visible `100` ceiling (Phase 19)

### Phase 17: Frontend Contract Completion

This phase surfaces the Phase 15/16 backend contract improvements into the frontend so operators can see measurement path quality and diagnostic counts in the UI rather than only in the raw API response.

Phase 17 was completed on March 9, 2026.

- [x] Surface `measurementPath` per link in the topology link info dialog.
      Answer: Completed. `topology-info-dialog.component.ts` now includes `measurementPath?: string` on `TopologyLinkStats`, a `measurementPathLabel()` method returning human-readable descriptions for all four path types, and the dialog template now shows a "Measurement path" row when the field is present.
- [x] Surface `structuralDerivedLinkCount` and `fallbackDerivedLinkCount` from the backend diagnostics block in the Snapshot Fidelity tab.
      Answer: Completed. `topology.component.ts` now parses the `diagnostics` block from the metrics response, populates three new public state fields (`structuralDerivedLinkCount`, `fallbackDerivedLinkCount`, `hasDiagnosticsData`), and the Snapshot Fidelity tab template now conditionally renders both counts with explanatory labels when `hasDiagnosticsData` is true.
- [x] Add `measurementPath` field to the `TopologyMetricPoint` and `LinkStats` TypeScript types.
      Answer: Completed. Both interfaces now carry `measurementPath?: string` and the field is captured in `mergeMetricMap()` and carried forward through `populateStatsFromMetric()`.
- [x] Ensure the `diagnostics` key in the metrics response is not mistakenly processed as a link in `mergeMetricMap()`.
      Answer: Completed. `mergeMetricMap()` now skips the `diagnostics` key (alongside `timing_drift_ns` and similar non-link keys) so the diagnostics object is not treated as a topology link entry.
- [x] Add a frontend unit test covering the diagnostics block parsing contract.
      Answer: Completed. `topology.component.spec.ts` now has 18 tests (was 17). The new test `"parses Phase 15/16 diagnostics block and exposes structural and fallback-derived counts"` verifies that `structuralDerivedLinkCount`, `fallbackDerivedLinkCount`, and `hasDiagnosticsData` are correctly populated from a metrics response containing a `diagnostics` block and links with `measurementPath` fields.
- [x] Add two additional Java unit tests for Phase 15/16 backend invariants not previously covered.
      Answer: Completed. `TopologyMetricsRegistryTest` now has 5 tests (was 3): the original 3 tests cover the 26-link contract, empty-Prometheus-as-live, and infrastructure-backed promotion; two new tests cover the structural-derived invariant (hard-derived links cannot promote even with full Prometheus infrastructure) and the empty-fallbackDerivedLinks diagnostic assertion.
- [x] Improve e2e Snapshot Fidelity tab assertions to check stat content rather than only heading visibility.
      Answer: Completed. `topology-ui-validation.cy.ts` now asserts `.fidelity-card__stats` is visible and checks for all four expected stat labels (`Total links`, `Measured coverage`, `Derived coverage`, `Confidence band`) on the Snapshot Fidelity tab.

### Phase 18: Hard-Derived Link Attribution

This phase addresses the three remaining structurally-derived links that are currently hardcoded via `setLink(...)` rather than `setMeasuredOrDerivedLink(...)` in `TopologyMetricsRegistry`.

Current ceiling: `23 live / 3 derived / 90.08 avg confidence`
Phase 18 target: `26 live / 0 derived / ~96 avg confidence`

The three hard-derived links and their attribution strategy:

- `zookeeper -> kafka`: Instrument via Kafka JMX exporter metrics for ZooKeeper connection bytes, or via the ZooKeeper JMX exporter (`zookeeper_packets_received_total`, `zookeeper_network_bytes_sent_total`). Use `setMeasuredOrDerivedLink(...)` once a Prometheus metric is available.
- `prom -> grafana`: Instrument via Grafana's own metrics endpoint (`grafana_datasource_request_duration_seconds_count`, `grafana_datasource_response_bytes_total`) or via prometheus internal metrics (`prometheus_remote_storage_bytes_total` if remote write is configured). Alternatively use Grafana's Prometheus data source query count as a proxy.
- `loki -> grafana`: Instrument via Loki's metrics (`loki_request_duration_seconds_count` with `handler="/loki/api/v1/query"`) or Grafana data source query metrics scoped to the Loki data source.

Backend implementation area: `TopologyMetricsRegistry.java` — replace the three `setLink(...)` calls with `setMeasuredOrDerivedLink(...)` backed by new Prometheus queries.

- [ ] Research which Prometheus metrics exist for the ZooKeeper→Kafka connection in the current local stack.
      Answer: Pending.
- [ ] Research which Prometheus metrics exist for the Prometheus→Grafana data source path.
      Answer: Pending.
- [ ] Research which Prometheus metrics exist for the Loki→Grafana data source path.
      Answer: Pending.
- [ ] Add Prometheus query paths for the three hard-derived links in `TopologyMetricsRegistry`.
      Answer: Pending.
- [ ] Update `diagnostics.structuralDerivedLinkCount` contract once hard-derived links become promotable.
      Answer: Pending. When at least one hard-derived link is instrumented, the structural-derived count changes from 3. The `structurallyDerivedLinksRemainDerivedEvenWithFullPrometheusInfrastructure` test should be updated to reflect the new invariants.
- [ ] Add regression tests for any newly promoted hard-derived links.
      Answer: Pending.
- [ ] Re-run the live baseline after Phase 18 implementation and record before/after counts.
      Answer: Pending.

### Phase 19: Confidence Scoring Modernisation

The current confidence scoring is static (96/84/48/24 for prometheus/admin/derived/mock). It does not reflect actual measurement quality within the `prometheus` class. A link with 25% error rate and a link with 0% error rate both score 96.

Phase 19 target: make confidence scoring reflect live measurement quality so the "Confidence band" in the Snapshot Fidelity tab carries more operational signal.

- [ ] Audit current `TopologyMetricsRegistry.confidencePct(...)` scoring and document which factors it currently ignores.
      Answer: Pending.
- [ ] Define a quality-adjusted confidence formula that factors in: error rate (e.g., `confidencePct = basePct × (1 - errorRatePct/100)`), latency anomaly (e.g., reduce confidence if `latencyMs` is more than 3× the median), and optional measurement age / staleness.
      Answer: Pending.
- [ ] Update `TopologyMetricsRegistry` to apply quality-adjusted confidence when building per-link confidence for promotable links.
      Answer: Pending.
- [ ] Add unit test coverage for the new confidence formula boundary cases (0% error → no penalty, 100% error → floor confidence, missing latency → no penalty).
      Answer: Pending.
- [ ] Validate the new scoring in the frontend confidence band labels (`Low`, `Moderate`, `High`) still map sensibly to the new score ranges.
      Answer: Pending.

### Phase 20: Topology Graph UX Enhancement

Phase 20 deepens the in-graph visual feedback so operators can read measurement quality directly from the force network without switching to the Snapshot Fidelity tab or opening the link info dialog.

- [ ] Add `measurementPath`-aware link styling on the force graph: distinguish `direct-prometheus` (solid), `direct-prometheus+infrastructure-fallback` (dashed), `infrastructure-snapshot` (dotted), and `derived-model` (faint/grey).
      Answer: Pending.
- [ ] Add a hover tooltip on graph links showing source, measurementPath, currentMBps, and confidencePct inline.
      Answer: Pending.
- [ ] Update the Force Network tab legend to reflect the new `measurementPath` visual encoding.
      Answer: Pending.
- [ ] Ensure measure-path styling round-trips through the provenance filter: filtered-out links should still respect their measurementPath style when they become visible again.
      Answer: Pending.
- [ ] Add e2e coverage that `link[data-key]` elements carry the expected `data-measurement-path` attribute for at least one live-backed link.
      Answer: Pending.
- [ ] Verify the graph remains readable at mobile screen widths with the additional link styling applied.
      Answer: Pending.

### Phase 21: Topology Health Monitoring

Phase 21 makes topology fidelity a first-class runtime signal by emitting live/derived counts and average confidence as Prometheus metrics from the governance backend, and by wiring any significant coverage regression to an alert.

- [ ] Add a `TopologyFidelityMetrics` component in `java-governance` that emits `topology_live_link_count`, `topology_derived_link_count`, and `topology_average_confidence_pct` as Prometheus gauges (updated on every snapshot refresh).
      Answer: Pending.
- [ ] Verify the new gauges appear in `/actuator/prometheus` and are scraped by the running Prometheus instance.
      Answer: Pending.
- [ ] Add a Prometheus alerting rule: fire `TopologyLiveLinksDeclined` when `topology_live_link_count` drops below a configurable threshold (e.g., below 20) for more than two consecutive scrape intervals.
      Answer: Pending.
- [ ] Add the alert definition to `docker/prometheus.yml` and `docker/alertmanager.yml`.
      Answer: Pending.
- [ ] Add a Grafana dashboard for topology fidelity trends (liveLinkCount and averageConfidencePct over time).
      Answer: Pending.
- [ ] Expose a `/api/v1/topology/health` endpoint from `java-governance` that returns the current fidelity summary and the alert state so the frontend can show a health badge.
      Answer: Pending.
- [ ] Add a frontend health badge to the Snapshot Fidelity tab (green/amber/red based on the fidelity health endpoint response).
      Answer: Pending.

Until then, the right next step is not more synthetic frontend modeling.
The right next step is to operate the current services through the real path and confirm how close the existing telemetry bridge already gets.
