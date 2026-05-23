# Topology Grafana Phase 1 Dashboard Contract

## Result

**Completed.**

Phase 1 defines the first Grafana dashboard contract for the topology metrics tab. The dashboard should be provisioned from source-controlled JSON and embedded only after this contract is implemented in Phase 2.

## Live Prometheus Inventory

Prometheus currently reports these scrape jobs as healthy:

| Job                 | Purpose                                           |
| ------------------- | ------------------------------------------------- |
| `alertmanager`      | Alertmanager health and runtime metrics           |
| `data-generator`    | Synthetic data generator metrics                  |
| `frontend-ssr`      | Nest SSR/API metrics and frontend proxy telemetry |
| `grafana`           | Grafana self-observability                        |
| `java-governance`   | Governance API JVM and Spring metrics             |
| `java-ingest`       | Ingest API JVM and Spring metrics                 |
| `kafka-exporter`    | Kafka broker/topic/consumer lag metrics           |
| `loki`              | Loki runtime metrics                              |
| `minio`             | MinIO cluster metrics                             |
| `nginxlog-exporter` | NGINX log/exporter metrics                        |
| `prometheus`        | Prometheus self-observability                     |
| `pulsar`            | Pulsar broker metrics                             |
| `rabbitmq-exporter` | RabbitMQ broker/queue metrics                     |
| `redis-exporter`    | Redis cache metrics                               |

## Available Metric Families

The current stack exposes enough data for a useful first dashboard:

| Area                    | Available metric families                                                                                                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Topology links          | `cosmic_topology_link_current_mbps`, `cosmic_topology_link_max_mbps`, `cosmic_topology_link_utilization_pct`, `cosmic_topology_link_latency_ms`, `cosmic_topology_link_error_rate_pct` |
| Service health          | `up`, `scrape_duration_seconds`, `scrape_samples_scraped`                                                                                                                              |
| Process resources       | `process_cpu_seconds_total`, `process_resident_memory_bytes`, `process_uptime_seconds`                                                                                                 |
| Java services           | `http_server_requests_seconds_count`, `http_server_requests_seconds_sum`, `jvm_*`, `system_*`                                                                                          |
| RabbitMQ                | `rabbitmq_up`, `rabbitmq_queue_messages`, `rabbitmq_consumers`, `rabbitmq_connections`                                                                                                 |
| Redis                   | `redis_up`, `redis_connected_clients`, `redis_memory_used_bytes`                                                                                                                       |
| Kafka                   | `kafka_brokers`, `kafka_topic_partitions`, `kafka_consumergroup_lag`                                                                                                                   |
| Pulsar                  | `pulsar_*` broker metrics                                                                                                                                                              |
| MinIO                   | `minio_cluster_*`, `minio_audit_*` metrics                                                                                                                                             |
| Grafana/Loki/Prometheus | `grafana_*`, `loki_*`, `prometheus_*` self-observability metrics                                                                                                                       |

## Dashboard Scope

The first embedded dashboard should answer these operator questions:

| Question                                      | Panel                          | Query                                                                                                |
| --------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Are all monitored services reachable?         | Service health table/stat      | `sum by (job) (up)`                                                                                  |
| Which topology links are under pressure?      | Topology link utilization      | `cosmic_topology_link_utilization_pct`                                                               |
| Which links have the most traffic?            | Topology link throughput       | `cosmic_topology_link_current_mbps`                                                                  |
| Are topology links showing latency or errors? | Link latency/error panels      | `cosmic_topology_link_latency_ms`, `cosmic_topology_link_error_rate_pct`                             |
| Are Java APIs receiving traffic?              | Governance/Ingest request rate | `sum by (job, status) (rate(http_server_requests_seconds_count[5m]))`                                |
| How much CPU and memory are services using?   | Process resource panels        | `sum by (job) (rate(process_cpu_seconds_total[5m]))`, `sum by (job) (process_resident_memory_bytes)` |
| Is RabbitMQ backing up?                       | RabbitMQ queue depth           | `rabbitmq_queue_messages`                                                                            |
| Is Redis healthy and active?                  | Redis clients/memory           | `redis_connected_clients`, `redis_memory_used_bytes`                                                 |
| Is Kafka lagging?                             | Kafka consumer lag             | `kafka_consumergroup_lag`                                                                            |
| Is the observability plane healthy?           | Prometheus/Grafana/Loki health | `grafana_build_info`, `loki_build_info`, `prometheus_tsdb_head_series`                               |

## Recommended First Dashboard Layout

Use one provisioned Grafana dashboard with these sections:

1. **Overview**

   - Service health by job
   - Scrape duration by job
   - Prometheus active series

2. **Topology Links**

   - Link utilization percentage
   - Current link throughput
   - Link latency
   - Link error rate

3. **Application Services**

   - Java Governance request rate by status
   - Java Ingest request rate by status
   - Process CPU by job
   - Process memory by job

4. **Messaging and Cache**

   - RabbitMQ queue depth
   - Kafka consumer lag
   - Kafka topic partitions
   - Redis connected clients and memory usage

5. **Observability Stack**
   - Grafana build/up status
   - Loki build/up status
   - Prometheus TSDB head series

## Dashboard Ownership

- Dashboard JSON should live in `docker/grafana/dashboards`.
- Grafana provisioning should continue to load dashboards from `docker/grafana/provisioning/dashboards/providers.yaml`.
- Prometheus should remain the default Grafana datasource from `docker/grafana/provisioning/datasources/datasource.yaml`.
- The dashboard UID should be stable so Phase 3 can embed a deterministic URL.

## Embed Contract for Phase 3

Phase 3 should embed a stable dashboard URL from runtime configuration, not a hardcoded component string.

Recommended local default:

```text
http://localhost:3000/d/<stable-dashboard-uid>/<dashboard-slug>?orgId=1&kiosk
```

Recommended single-panel pattern if the UI needs a compact version:

```text
http://localhost:3000/d-solo/<stable-dashboard-uid>/<dashboard-slug>?orgId=1&panelId=<panel-id>
```

## Known Gaps

- `http_server_requests_seconds_bucket` is not currently present, so p95 request latency should use `*_sum / *_count` or wait for histogram instrumentation.
- `nodejs_eventloop_lag_seconds` is not currently present.
- Some Pulsar and MinIO queries require final panel selection against the active metric names exposed by this stack.
- Production auth is not decided. Local anonymous Viewer access is acceptable only for development/demo unless explicitly approved.

## Phase 2 Input

Phase 2 should create or replace a provisioned Grafana dashboard JSON using this contract and keep the UID stable for embedding.
