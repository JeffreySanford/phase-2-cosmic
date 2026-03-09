# Topology Metrics Strategy

## Purpose

This document explains the production-oriented topology metrics concept for Phase-2 Cosmic, why it is effective, what has been implemented as the first step, and how the system can evolve toward true broker-level and transport-level observability.

The immediate goal is not just to draw a prettier topology graph. The goal is to make the topology view an operational representation of live system behavior so that an operator can answer questions such as:

- Which edges are actually carrying traffic right now?
- Where is pressure building across Kafka, Pulsar, RabbitMQ, Redis, MinIO, and governance?
- Is the current visualization reflecting real transport behavior or synthetic demonstration behavior?
- When the operator selects a runtime load profile such as `10`, `25`, `50`, or `100`, which parts of the system should show pressure first?
- Which links should visually intensify when queue depth, ingest throughput, or worker count rises?

## The Core Concept

The topology graph should be driven by a canonical per-link metrics model rather than by one-off frontend animation rules.

That means the platform should expose metrics for edges, not just for services.

Examples:

- `data-generator -> kafka`
- `data-generator -> pulsar`
- `rabbitmq -> java-governance`
- `java-governance -> redis`
- `java-governance -> minio`
- `kafka -> java-ingest`
- `prometheus -> grafana`

Each edge should eventually have a live operational envelope with metrics such as:

- current throughput
- theoretical or configured max throughput
- utilization percentage
- latency
- error rate
- optional queue/backlog pressure
- optional semantic transport type such as `stream`, `broker`, `cache`, `object`, `metrics`, `science`, or `control`

The frontend topology view should not invent those values independently. It should consume them from a backend service that owns the canonical meaning of each edge.

## Why This Is Effective

This approach is effective for four reasons.

### 1. It makes the graph operational rather than decorative

Without per-link metrics, the topology graph is mostly static structure plus animation garnish. That is fine for demos, but it is not useful in production.

With per-link metrics, animation becomes a visual projection of real platform state:

- more flow objects on a link means more throughput or pressure
- faster travel means higher utilization
- warmer colors mean higher contention or error risk
- sparse or stalled flow means low activity or degraded transport

### 2. It creates a semantic contract for every edge

The hard problem in topology observability is not drawing the edge. The hard problem is agreeing on what the edge means.

For example:

- Does `rabbitmq -> java-governance` mean control-plane messages per second?
- Does `java-governance -> redis` mean cache writes, queue lookups, or both?
- Does `array-main -> minio` mean scientific visibility storage, downsampled artifacts, or proxy ingest staging?

By introducing a canonical registry in governance, each edge gets a stable identity and semantic meaning. That lets the visualization, dashboards, and alerts use the same model.

### 3. It supports progressive realism

You do not need perfect deep transport instrumentation on day one.

A good production migration path is:

1. Canonical edge registry
2. Deterministic modeled values from runtime load, queue depth, and throughput
3. Real service-level emitters in ingest/generator/governance
4. Real broker-level and transport-level correlation where justified

That lets the system become useful early without locking the frontend into fake behavior.

### 4. It improves alerting and debugging

Once the same edge metrics exist in Prometheus, they stop being only a topology-view concern.

You can alert on them, graph them in Grafana, and correlate them with job pressure, ingest traffic, or failure spikes.

Examples:

- alert when `cosmic_topology_link_utilization_pct{link="kafka->java-ingest"}` stays above `85`
- alert when `cosmic_topology_link_error_rate_pct{link="rabbitmq->java-governance"}` rises above baseline
- compare `java-governance -> redis` pressure against queued job count
- compare `array-main -> minio` throughput against ingest lag

## Which Container Should Own This?

There is no dedicated container for this today.

For the first meaningful production step, governance is the right owner.

Why governance is the correct initial owner:

- it already exposes platform-facing metrics endpoints
- it already understands job state and queue pressure
- it already has access to Prometheus configuration
- it already acts as the backend aggregator for visualization metrics
- it can define the canonical topology edge model in one place

In other words, governance is the best first system of record for topology metrics.

### Should this eventually become its own container?

Possibly, yes.

A future dedicated container could be named something like:

- `topology-observer`
- `transport-observer`
- `edge-metrics-aggregator`

That container would be justified if one or more of these become true:

- topology metrics aggregation becomes expensive
- multiple services need to push edge telemetry into a single independent processor
- governance should not own observability semantics long term
- you want topology telemetry to remain available even if governance is degraded
- you need pluggable collectors for Kafka, Pulsar, RabbitMQ, Redis, MinIO, and external systems

But that is a second-phase architectural extraction, not the right first implementation.

For now:

- keep the topology metrics registry in governance
- expose Prometheus gauges from governance
- let Prometheus scrape governance
- optionally add emitters from other services into governance’s model

## What Has Been Implemented

The current implementation moves the system toward the heavy-lift architecture without pretending that true broker-level observability is complete.

Implemented:

- Prometheus now scrapes `java-governance`
- governance now owns a canonical `TopologyMetricsRegistry`
- governance publishes per-link gauges for:
  - current throughput in MB/s
  - max throughput in MB/s
  - utilization percentage
  - latency in ms
  - error rate percentage
- the registry owns the canonical link list
- the registry is fed from:
  - runtime load profile mirrored from the frontend control plane
  - job queue and job state pressure from governance
  - observed Prometheus ingest throughput when available
  - canonical known topology edges
- `TopologyMetricsService` now returns the full shaped link map directly from governance

This means the topology view can increasingly rely on backend-owned edge metrics instead of inventing them in the frontend.

## Why the First Step Is Not Yet “True Live Transport Telemetry”

It is important to be precise about this.

The current implementation is production-oriented, but it is not yet the final heavy-lift solution.

It is still an aggregation/modeling layer because:

- Kafka is not yet publishing per-topic or per-edge throughput into the topology registry
- Pulsar is not yet publishing per-link topology telemetry
- RabbitMQ is not yet exposing queue-to-consumer traffic as canonical topology edges
- Redis operations are not yet tagged by edge semantics
- MinIO traffic is not yet correlated back to explicit topology edges
- the data generator and java-ingest do not yet emit edge-specific counters into the canonical model

So the current registry should be understood as:

`production-ready aggregation scaffolding`

not:

`final deep transport instrumentation`

That distinction matters because it keeps the representation honest.

## Recommended Production Evolution

### Phase 1: Canonical Edge Registry

This phase is now in progress.

Goals:

- define the full edge list
- emit Prometheus metrics for every edge
- make topology rendering backend-driven
- align runtime load profile with topology pressure

This is valuable immediately because it makes the graph operationally stable and Prometheus-visible.

### Phase 2: Real Service Emitters

Add edge-aware emitters to services that already know about transport behavior.

Examples:

- `java-ingest`

  - bytes consumed from Kafka
  - records processed
  - write throughput to MinIO
  - processing latency

- `data-generator`

  - bytes generated
  - stream output per broker target
  - pressure from runtime worker count

- `java-governance`
  - RabbitMQ command throughput
  - Redis read/write pressure
  - governance-produced Kafka event throughput
  - queue state transitions

These emitters should use stable tags:

- `source`
- `target`
- `link`
- `transport`

### Phase 3: Broker and Store Collectors

At this phase you can add deeper instrumentation from infrastructure systems.

Examples:

- Kafka topic throughput mapped to logical topology edges
- Pulsar namespace/topic throughput mapped to logical edges
- RabbitMQ queue publish/ack/consumer rates mapped to governance edges
- Redis operation counters grouped by cache function
- MinIO bucket/object throughput grouped by scientific storage edges

This stage requires semantic agreement. That is the real heavy lift.

### Phase 4: Dedicated Observability Container

Only extract a dedicated topology-observer container if the metrics pipeline outgrows governance.

That service would:

- ingest metrics from services and brokers
- normalize them into canonical topology edges
- publish Prometheus metrics
- optionally expose a dedicated topology API

This should be driven by real scaling or separation-of-concern pressure, not by premature architecture splitting.

## Why a Dedicated Container Is Not the First Move

It is tempting to isolate this immediately into a separate Docker container because the problem sounds observability-specific.

That is usually the wrong first move.

Reasons:

- you would introduce a new deployment and health dependency before stabilizing the data contract
- you would still need governance or another source to define canonical edge semantics
- you would split ownership before the data model is mature
- you would increase failure surface during initial rollout

A separate container becomes worthwhile after the metric model is stable and multiple emitters need an independent aggregator.

## How the Runtime Load Profile Fits In

The `10 / 25 / 50 / 100` runtime load profile is useful because it provides a deterministic stress shape for the system.

That makes it valuable for topology metrics even in production-oriented development.

It should not remain just a frontend toggle.

Instead, it should influence the modeled or measured behavior of edges such as:

- `data-generator -> kafka`
- `kafka -> java-ingest`
- `java-governance -> minio`
- `rabbitmq -> java-governance`
- `java-governance -> redis`

That lets the topology graph change in a traceable, testable way when load is increased.

In the current implementation, the runtime profile is mirrored into governance so the topology registry can incorporate it into edge metrics.

## Why Prometheus Scraping Governance Matters

This is a crucial part of the architecture.

Once governance exposes edge metrics and Prometheus scrapes them:

- topology metrics become queryable outside the topology page
- Grafana can graph them
- alerting can use them
- backend verification becomes possible without opening the UI
- regression testing becomes easier because edge metrics are inspectable

This is what turns the topology model from UI behavior into platform telemetry.

## Suggested Next Engineering Steps

The following steps are the most effective next moves.

### Immediate next steps

- add Grafana panels for the new `cosmic_topology_link_*` metrics
- expose runtime profile state alongside topology metrics in a dedicated admin view
- teach the frontend topology page to use latency and error-rate metrics more explicitly

### Medium next steps

- instrument `java-ingest` to emit edge metrics with stable tags
- instrument `data-generator` to emit edge metrics with stable tags
- add semantic mapping from broker/topic/queue metrics into canonical edges

### Heavy-lift next steps

- add Kafka, Pulsar, RabbitMQ, Redis, and MinIO collectors that map infrastructure behavior to topology edges
- decide whether governance remains the canonical aggregator or whether a dedicated `topology-observer` container should take over
- formalize an edge taxonomy so each link has stable semantics across UI, alerts, docs, and dashboards

## Remaining Attribution Gaps

The current topology model is now largely measured for repo-owned application and infrastructure paths.

The remaining partial links are mostly external or structural attribution problems rather than missing
`java-governance` work:

- `zookeeper -> kafka`
- `prom -> grafana`
- `loki -> grafana`

These links remain partially inferred because the currently available metrics in this stack do not cleanly
attribute upstream traffic at the per-link level without inventing semantics.

That means the next work here is not "add more governance metrics" by default. The next work is one of:

- add datasource-level Grafana request attribution if Grafana exposes it in a usable way
- add Loki query/read attribution that can be mapped to Grafana datasource traffic
- add stronger Kafka control-plane metrics if Zookeeper/Kafka coordination visibility becomes operationally important

Until those signals exist, these links should remain explicitly marked as partial or derived in the topology
experience rather than overstated as fully measured.

## Summary

The effective production model is:

- governance owns the canonical edge model first
- Prometheus scrapes governance
- topology consumes backend-owned edge metrics
- runtime load profile, queue depth, and ingest throughput influence edge metrics immediately
- real emitters from `java-ingest` and `data-generator` are added next
- deeper broker/store collectors come after semantic alignment
- a separate container is optional later, not required now

This architecture is effective because it gives you immediate operational value while still providing a clean path toward true transport-level observability.
