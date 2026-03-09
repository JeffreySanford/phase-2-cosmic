# Java Governance Telemetry Plan

## Goal

Make `java-governance` the authoritative telemetry bridge between Prometheus-backed infrastructure signals, governance-native runtime events, and the Angular telemetry/topology views.

## Current State

- `java-governance` now returns live infrastructure telemetry from Prometheus for Redis, Kafka, RabbitMQ, MinIO, Pulsar, and Nest SSR when exporters are available.
- Empty Prometheus results now remain `prometheus` with zero values instead of degrading to `unavailable`.
- Prometheus query failures are now logged with the exact query so exporter mismatches are diagnosable.
- Governance-native runtime metrics have started with job submission, dispatch, transition, artifact attachment, and RabbitMQ publish counters.
- Governance now also records native Redis read/write activity and local object-output writes from job executors and persistence services.
- Governance runtime now records terminal job outcomes and measured completion/failure durations from the actual job lifecycle.
- The telemetry contract now exposes both terminal totals and terminal rates so sparse real activity is still visible between Prometheus scrape/rate windows.
- Governance runtime now exposes executor-specific telemetry for `simulator`, `vo`, and `tacc`, including dispatch, terminal outcomes, and object-write activity.
- Governance now records Kafka ingest receive, success, validation-failure, DLQ-forward, failure, and payload-rate telemetry from the actual listener path.
- Governance now records dataset creation plus manifest/lineage mutation rates, so curation activity is visible alongside executor and broker traffic.
- Governance now records operator read traffic for job status, logs, artifacts, audit, manifests, lineage, and dataset reads.
- Governance now records Archive DR policy creation and restore-drill success/failure/latency metrics.
- The telemetry contract now exposes a `governanceRuntime` section, and topology can use those measurements for governance-side Redis, RabbitMQ, and object/output links.
- Topology now includes a measured `kafka -> java-governance` ingest edge, and backend/governance link pressure can reflect real governance operator-read and curation payload activity.
- RabbitMQ and Pulsar ingest listeners now exist in `java-governance`, share the same validation/duplicate-suppression pipeline as Kafka ingest, and expose broker-specific runtime ingest rates.
- Dataset creation now persists a real governance object to MinIO when available, falls back to a local object-store spool when it is not, and the runtime contract now separates `minio` object-write traffic from local object-store writes.
- Topology links now carry a per-link confidence score derived from telemetry provenance and quality penalties, and the Angular force view exposes that score in both the summary bar and link detail dialog.
- A repeatable local traffic generator now exists at `scripts/generate-governance-telemetry-traffic.ps1` to exercise governance HTTP, Redis/MinIO-backed dataset paths, and broker ingest paths against the live stack.
- A smoke-check script now exists at `scripts/test-governance-telemetry-smoke.ps1` to generate live traffic and assert that governance telemetry changes afterward.
- A deterministic scenario runner now exists at `scripts/run-governance-telemetry-scenarios.ps1` so each executor path and broker path can be exercised on demand.
- An example capture script now exists at `scripts/capture-governance-telemetry-examples.ps1` so idle-versus-live telemetry/topology payloads can be recorded for validation and documentation.
- Governance now emits ingest-processing duration by broker and RabbitMQ publish duration, and topology uses those metrics to replace synthetic latency/error on `rabbitmq -> java-governance`, `kafka -> java-governance`, `data-generator -> pulsar`, `pulsar -> kafka`, and `java-governance -> rabbitmq` when live data is present.
- Topology now carries a measured `pulsar -> java-governance` ingest edge sourced from governance-native Pulsar ingest payload telemetry, and the Angular topology contract plus operator surfaces expose that path.
- Governance now emits Redis operation timing/error and MinIO object-write timing/error metrics, and topology plus telemetry use those live values for governance-side Redis/MinIO behavior.
- Topology node summaries now include governance-native business activity and executor breakdowns, so `java-governance`, `backend`, `redis`, `minio`, `kafka`, `rabbitmq`, and `pulsar` can show real runtime pressure beyond pure link throughput.
- Nest SSR now exports governance-proxy request count, response bytes, latency, and status-class metrics, and topology uses those live Prometheus series to drive `backend -> java-governance` throughput/latency/error when traffic is present.
- The shared infrastructure telemetry contract now carries Nest SSR governance-proxy metrics, and the Angular telemetry page plus dashboard surface those live values for operators.
- Nest SSR frontend page-traffic metrics now drive `frontend -> backend` throughput/latency/error when browser traffic is present, so one more previously synthetic topology edge is backed by live SSR measurements.
- Nest SSR now also emits frontend-originated API traffic metrics by API group, and governance uses both page and API flows when calculating `frontend -> backend` topology pressure.
- The data generator now emits `array_segment`-labeled Prometheus metrics, and topology uses those live series to drive `data-generator -> array-*` plus `array-* -> minio` throughput when the generator is running with segment metrics enabled.
- `tools/java-ingest` now emits first-party consumer processing metrics for receive rate, processed rate, validation failures, failures, payload bytes, and processing latency, and governance telemetry plus topology use those values for the downstream Kafka consumer path.
- NGINX access-log metrics are now exported to Prometheus, and topology uses those live bytes, status, and response-time series to drive `frontend -> nginx` when the static frontend is served through the Docker NGINX path.
- Nest SSR now emits Prometheus-proxy request, byte, error, and latency metrics, and governance topology uses those series for `backend -> prom` while the telemetry UI exposes them in the `Nest SSR` tab.
- Prometheus now scrapes Grafana, Loki, and Alertmanager internal metrics, the telemetry contract exposes them as first-class observability services, and the Angular telemetry page surfaces them in a dedicated `Observability` tab.
- Topology now uses live Alertmanager HTTP metrics for `prom -> alertmanager`; the remaining observability-plane topology gaps are the Grafana-linked edges whose available metrics are still too coarse to map cleanly to individual upstreams.
- Transient alert ingest, replay, and DLQ depth metrics are now part of the shared governance runtime telemetry contract, and the `Operators` tab reads them directly instead of relying only on the separate alert endpoint.
- `java-governance` now emits route-family HTTP request, response-byte, error, and latency metrics for its own API surface, and the runtime telemetry/UI expose those values in a dedicated governance API tile.
- Operator read metrics now carry a `resource_family` breakdown, the runtime contract exposes route-family read rates, and the `Operators` tab surfaces which read paths are active.
- Governance runtime now exposes workflow-level outcome summaries for the active workflow types, including per-workflow queue wait and runtime separation instead of only aggregate terminal latency.
- The Phase 4 traffic scripts were tightened to use valid dataset manifests, valid VO schema payloads, and broker publish/auth flows that work under PowerShell, so the governance telemetry smoke path is live again.
- Governance runtime now exposes live scheduler pressure, including queued/running/deferred/blocked work, queue age, scanner interval, and deferred-release totals/rates, so dispatch pressure is no longer inferred only from terminal outcomes.
- Governance runtime now exposes transient-alert replay outcomes by path, including single replay success/miss, replay-all success/empty, replay batch size, and replay latency, so DLQ behavior is visible beyond aggregate replay totals.
- Governance now owns a first-party Kafka audit/control publish path through `AuditService`, emits Kafka publish rate, payload, latency, and error metrics, and surfaces those values in the shared runtime telemetry and Angular UI.

## Phase 1: Infrastructure Telemetry

- [x] Wire Prometheus exporter metrics into `InfrastructureTelemetryService`.
- [x] Fix query transport/encoding so governance can reliably query Prometheus.
- [x] Align Redis metric queries with the active exporter.
- [x] Align Kafka metric queries with the active exporter.
- [x] Align RabbitMQ metric queries with the active exporter.
- [x] Align MinIO metric queries with the active exporter.
- [x] Align Pulsar metric queries with the active exporter.
- [x] Expose truthful `source` values: `prometheus`, `admin`, `mock`, `unavailable`.
- [x] Keep real zero traffic as live telemetry instead of downgrading to unavailable.

## Phase 2: Governance-Native Runtime Metrics

- [x] Add Micrometer service for governance runtime counters and payload summaries.
- [x] Record job submission metrics.
- [x] Record job dispatch metrics by workflow and executor.
- [x] Record job transition metrics by workflow and state change.
- [x] Record artifact attachment metrics and payload sizes.
- [x] Record RabbitMQ publish success/failure and payload size metrics.
- [x] Add governance-side Redis read/write counters and payload sizes.
- [x] Add governance-side object/output write counters and payload sizes.
- [x] Add job completion/failure duration histograms.
- [x] Add executor-specific runtime metrics for `simulator`, `vo`, and `tacc`.
- [x] Add dataset ingest/write metrics for true MinIO-backed object outputs.
- [x] Distinguish local artifact-store writes from real MinIO writes in the runtime contract.
- [x] Add ingest-listener metrics for Kafka, RabbitMQ, and Pulsar receives, validation failures, duplicate suppression, and DLQ forwarding.
- [x] Add audit/log/artifact read metrics so governance can distinguish write traffic from operator inspection traffic.
- [x] Add dataset/manifest/lineage mutation metrics so curation activity is visible independently from executor traffic.
- [x] Add Archive DR policy and restore-drill metrics, especially drill counts, success/failure, and recovery latency.

## Phase 3: Topology Fidelity

- [x] Replace major derived infrastructure links with Prometheus-backed measurements where available.
- [x] Mark topology links and nodes with truthful provenance.
- [x] Add a measured `java-governance -> rabbitmq` control-plane edge.
- [x] Let governance-native Redis/object measurements inform governance-side topology links.
- [x] Replace remaining derived Pulsar-side links with measured values.
- [x] Drive topology node activity from governance-native business metrics as well as exporter traffic.
- [x] Add confidence scoring so the UI distinguishes measured, inferred, and unavailable paths.
- [x] Replace the remaining `backend -> java-governance` derived throughput with application HTTP request metrics from governance and SSR.
- [x] Feed governance executor metrics into node-level activity so `simulator`, `vo`, and `tacc` behavior is reflected in topology summaries.

## Phase 4: Traffic Generation and Validation

- [x] Create repeatable traffic scripts for Redis, RabbitMQ, MinIO, Kafka, and Pulsar.
- [x] Add a governance-focused smoke test that verifies telemetry changes under generated load.
- [x] Document expected idle behavior so zero-value live metrics are not mistaken for failures.
- [x] Capture example screenshots/payloads for live versus idle infrastructure states.
- [x] Add deterministic job scenarios that exercise each executor and each broker path so executor-specific metrics can be validated in CI and locally.

## Phase 5: Test Coverage

- [x] Keep an infrastructure telemetry contract test for `/api/v1/telemetry/infrastructure`.
- [x] Add `RabbitIngestListener` integration coverage for accepted, duplicate, and DLQ/error paths.
- [x] Add `PulsarIngestListener` integration coverage for accepted and DLQ/error paths.
- [x] Add `GovernanceObjectStoreService` coverage for MinIO success and local fallback behavior.
- [x] Add a governance telemetry smoke test that submits workload and asserts `/api/v1/telemetry/infrastructure` changes.

## Phase 6: Governance Deep Metrics

- [x] Add route-family governance HTTP request metrics for request rate, response bytes, latency, and error rate.
- [x] Add endpoint-level operator read metrics by route family so heavy inspection flows are visible independently from overall HTTP traffic.
- [x] Add workflow outcome metrics by workflow type with end-to-end wait time and runtime separation.
- [x] Add scheduler queue-age, deferred-release, and blocked-work metrics so dispatch pressure is not inferred only from terminal outcomes.
- [x] Add duplicate-suppression and validation-failure reason taxonomy metrics by broker.
- [x] Add external adapter metrics for VO and TACC request rate, payload, latency, and failure classes.
- [x] Add object/artifact size histograms and retrieval latency metrics for governance-served outputs.
- [x] Add business publish/read metrics for datasets and manifests so curation success is distinguishable from low-level storage activity.
- [x] Add replay outcome metrics by broker/path once governance owns the replay pipeline beyond transient-alert counters.

## Codebase Opportunities

- Messaging listeners: `KafkaIngestListener`, `RabbitIngestListener`, and `PulsarIngestListener` are strong candidates for governance-native ingest, duplicate, validation, and DLQ metrics.
- Current code reality: Kafka, RabbitMQ, and Pulsar ingest listeners now exist and are instrumented; the next broker-side gap is app-owned producer/replay telemetry rather than listener coverage.
- Persistence and curation: `DatasetService`, `JobService` manifest/lineage paths, and `ArchiveDrService` can expose real governance curation behavior beyond queue/storage traffic.
- Operator reads: job logs, artifacts, and audit retrieval endpoints can produce read-side metrics so UI inspection load is not conflated with pipeline writes.
- Alerting plane: `TransientAlertService` already tracks DLQ totals and can be expanded into governance-visible replay/depth metrics for telemetry and topology.
- Visualization bridge: `VisualizationMetricsService` and topology services can consume more governance-native metrics now that executor/runtime measurements exist.

## Next Concrete Metrics

- [x] Add governance-side Kafka publish timing/error metrics once `java-governance` owns a real Kafka producer path beyond the Spring DLQ recoverer.
  - Status: `AuditService` now publishes governance control-plane events to Kafka audit topic `cosmic-audit`, `GovernanceRuntimeMetricsService` records first-party Kafka publish counters/payload/latency/error, and the Angular telemetry UI exposes the result in the `Publish and Output` tile.
- [x] Add consumer processing metrics for the downstream Kafka consumer service for receive rate, payload bytes, processing duration, validation failures, and DLQ/retry behavior.
  - Status: `tools/java-ingest` now emits first-party `java_ingest_*` metrics, governance exposes them as a first-class telemetry service, the `Brokers` tab surfaces them in a dedicated tile, and topology prefers those app-native metrics for `kafka -> java-ingest`.
- [x] Add generator metrics labeled by `array_segment` so `array-main`, `array-lbl`, and `array-sba` topology links stop being percentage splits of aggregate ingest.
  - Status: the Go data generator now emits `generator_bytes_produced_by_segment_total` and `generator_records_produced_by_segment_total`, and governance topology consumes those live series with fallback only when they are absent.
- [x] Add Nest SSR route-level frontend request metrics for `frontend -> backend` browser-originated traffic beyond governance proxy calls.
  - Candidate metrics: request count, response bytes, latency, and status class by route group or feature.
  - Status: Nest SSR now emits route-group page traffic plus API-group request, response-byte, error, and latency metrics, and the telemetry UI exposes both in the `Nest SSR` tab.
- [x] Add NGINX exporter or stub-status scraping so `frontend -> nginx` becomes measured instead of structural.
  - Status: Docker NGINX now emits access-log metrics through `prometheus-nginxlog-exporter`, and governance topology consumes real request bytes, response-time, and error-rate series for `frontend -> nginx`.
- [x] Add Grafana, Loki, and Alertmanager internal metrics scraping so observability-plane links can be measured rather than decorative.
  - Status: Prometheus now scrapes Grafana, Loki, and Alertmanager, telemetry exposes those services directly, and `prom -> alertmanager` is measured.
  - Remaining gap: the available Grafana/Loki metrics in this stack are still too coarse to cleanly split `prom -> grafana` from `loki -> grafana` without inventing attribution, so the scrape work is complete even though two topology links remain partially attributed.

## Concrete Order

1. If Grafana datasource attribution becomes available, replace the remaining partial `prom -> grafana` and `loki -> grafana` topology links with measured values.

## UI Follow-Through

- Telemetry page should continue to add cards/subsections when a new governance signal is operator-facing and live-backed.
- Telemetry page should continue to add cards/subsections when a new infrastructure signal becomes truly measured and operator-facing, such as NGINX static-serving metrics.
- Telemetry page should pivot toward operator-focused tabs instead of one long mixed card stack.
  - Target tabs: `Measured Infrastructure`, `Java Governance Runtime`, `Nest SSR`, `Brokers`, `Storage`, `Operators`, and `Executors`.
- Dashboard should surface a compact governance runtime summary so real governance activity is visible without opening `/telemetry`.
- Topology should absorb governance-native signals where they improve provenance or replace derived flow.

## UI Follow-Through Steps

- [x] Split telemetry overview into operator-focused tabs instead of one mixed stack.
- [x] Keep `Measured Infrastructure` as the broad exporter/admin-backed view.
- [x] Break `Java Governance Runtime` into smaller summary tiles instead of one long card.
- [x] Add a dedicated `Nest SSR` telemetry tab for cache and governance-proxy behavior.
- [x] Add a dedicated `Brokers` telemetry tab covering Kafka, RabbitMQ, and Pulsar plus governance ingest behavior.
- [x] Add a dedicated `Storage` telemetry tab covering Redis, MinIO, and governance object-store/state behavior.
- [x] Add a dedicated `Operators` telemetry tab covering curation, reads, and Archive DR behavior.
- [x] Add operator-summary alert/DLQ tiles that point into the dedicated `Alert SLO` workflow.
- [x] Add a dedicated `Executors` telemetry tab covering `simulator`, `vo`, and `tacc`.
- [x] Add route-level SSR/frontend request tiles once broader frontend-originated request metrics exist.
- [x] Add a governance runtime `API Surface` tile once governance-owned HTTP route metrics exist.
- [x] Add operator read breakdowns once governance exposes route-family read metrics.
- [x] Add workflow-outcome tiles once governance exposes per-workflow wait/runtime telemetry.
- [x] Add route-level SSR/frontend request tiles to the `Nest SSR` tab once those metrics exist.
- [x] Add a dedicated SSR `API Traffic` tile once frontend-originated API route-group metrics exist.
- [x] Add a `Prometheus Proxy` tile to the `Nest SSR` tab once backend-to-Prometheus proxy metrics exist.
- [x] Add replay/DLQ operator tiles when governance exposes broker replay and transient-alert depth metrics.
- [x] Add observability-plane tiles once Grafana/Loki/Alertmanager service metrics are live-measured and operationally meaningful, even if some cross-service topology attribution remains partial.
- [x] Add a dedicated `Observability` telemetry tab once Grafana, Loki, and Alertmanager are scraped and exposed through governance.
- [x] Add measured observability service tiles for Grafana, Loki, and Alertmanager once those metrics are live-backed.

## Verification

Run these after telemetry changes:

```text
mvn -f apps/java-governance/pom.xml -Dtest=InfrastructureTelemetryControllerTest test
curl http://127.0.0.1:8082/api/v1/telemetry/infrastructure
curl http://127.0.0.1:8082/actuator/prometheus
curl http://127.0.0.1:4000/api/v1/telemetry/infrastructure
curl "http://127.0.0.1:9090/api/v1/query?query=sum(redis_connected_clients)"
powershell -File scripts/generate-governance-telemetry-traffic.ps1
powershell -File scripts/test-governance-telemetry-smoke.ps1
powershell -File scripts/run-governance-telemetry-scenarios.ps1 -Scenario all
powershell -File scripts/capture-governance-telemetry-examples.ps1
```

## Expected Idle Behavior

- `source=prometheus` with `0` values means the exporter/query path is alive and the service is simply idle.
- RabbitMQ can legitimately sit near zero when it remains mostly control-plane.
- Pulsar can show `admin` health with zero throughput until a producer/consumer path is active.
- MinIO can be live with zero request/byte rates until object writes or reads actually occur.
- Governance runtime totals can remain visible even when short-window per-second rates decay back to zero.

## Notes

- `available` does not imply high throughput. Some services will correctly report live zero values when idle.
- RabbitMQ is expected to remain relatively light if it stays control-plane focused.
- MinIO and Pulsar should show clearer movement once workload generation is added.
- Current governance object-write telemetry measures executor artifact output. That is a real governance signal, but it is still a proxy for eventual MinIO integration until object writes land in a true MinIO client path.
- Dataset records now exercise a true MinIO client path when MinIO is reachable; executor artifact writes are still mostly local object-store/file signals unless those executors are moved onto the same MinIO-backed path.
- Job terminal timing currently reflects end-to-end governance lifecycle duration from job creation to terminal state transition.
- This document should be updated alongside any telemetry contract or topology provenance changes.
