# Topology Data-Path Repair

> Status: **in progress**
> Scope: make the topology visualization, its confidence values, and the platform
> documentation reflect the real data path from data generation through the frontend.
> Label: **PR41 side quest — topology repair**

## Why this exists

The topology visualization asserts a data path that the code does not implement,
and presents synthetic numbers as measured evidence. This document is the plan to
repair that and to keep the visualization honest as the collector tier lands.

### Defects found (2026-08-09)

1. **The graph claims links that never existed.** `apps/frontend/server.nest.ts`
   declares `data-generator -> pulsar` and `pulsar -> kafka`. No Pulsar sink
   existed in the generator until this work, and nothing has ever bridged Pulsar
   to Kafka.
2. **Confidence is fabricated.** `confidencePct` is `92` when a link touches a
   name in a hardcoded infrastructure list and `74` otherwise. No measurement is
   consulted. The dialog renders `92` as **"High confidence"**.
3. **Throughput is fabricated.** `currentMBps` is computed from the link's array
   index: `maxMBps * (0.18 + ((index % 5) * 0.11 + channels * 0.03))`.
4. **The client fallback is a constant.** `confidencePct: mode === "mock" ? 24 : 48`.
5. **The real path is not represented.** `java-ingest` is shown as terminal, and
   there is no edge from ingest to the server API, nor from the API to the
   frontend over SSE.

## Target data path

```text
data-generator (Go)
  -> Pulsar edge cluster (per region: 3 geographically independent clusters)
    -> pulsar-collector (one per region, forwards with region attribution)
      -> Kafka (single analytical backbone)
        -> java-ingest (forwards to the server API)
          -> Nest SSR server API
            -> SSE event channel
              -> Angular frontend
```

Parallel paths that remain and must stay visible as distinct:

- `Kafka | Pulsar | RabbitMQ -> java-governance` — governance consumes all three
  brokers directly for broker comparison and DLQ handling. This is fan-in, not a
  chain, and must not be drawn as a chain.
- `data-generator -> file sink -> SSR` — disk-derived stress telemetry feeding the
  existing telemetry SSE channel. Independent of the event path above.

## Confidence contract

Confidence must describe **evidence provenance and freshness**, never a hardcoded
node name. A link's confidence is only as good as the measurement behind it.

| State      | Meaning                                                          | Confidence |
| ---------- | ---------------------------------------------------------------- | ---------- |
| `measured` | A live scrape provided this link's throughput within the window  | high       |
| `stale`    | A real measurement exists but is older than the freshness window | reduced    |
| `derived`  | Computed from a real measurement on an adjacent link             | moderate   |
| `declared` | The link exists in the topology but nothing measures it          | none       |
| `mock`     | Demo/mock mode                                                   | none       |

Rules:

- A `declared` or `mock` link must not report a numeric confidence that renders as
  "High confidence". Absence of measurement is reported as absence, not as a number.
- Throughput for an unmeasured link must be reported as unavailable rather than
  synthesized.
- The measurement source must be named so a reader can verify it.

### Decisions (2026-08-09)

- **Measurement source: Prometheus.** Link throughput and freshness come from
  Prometheus queries against the series already scraped from the generator,
  the collectors, and the Kafka/RabbitMQ/Redis exporters. A link is `measured`
  only when a real series backs it.
- **Unmeasured links stay visible, visually marked.** They render dimmed/dashed
  and report "no measurement" instead of a number, so the architecture view is
  preserved without implying evidence that does not exist.
- **Unbuilt links are redrawn through the collector tier.** The direct
  `pulsar -> kafka` edge is replaced by `pulsar -> collector -> kafka` and marked
  unmeasured until the collectors actually run.

## Plan

### Stage 1 — collector tier

- [x] Add a Pulsar sink to the Go data generator.
- [x] Stop counting undelivered records as produced throughput.
- [x] Record the Pulsar-as-edge-collector decision in the Lakehouse Stage 5 backlog.
- [x] Build the `pulsar-collector` component that forwards Pulsar to Kafka with
      region attribution, negative-acking anything it fails to forward.
- [x] Add collector unit coverage and static analysis to the Go gate.
- [~] Add collector integration coverage against a live Pulsar and Kafka. The test
  is written and guarded by a build tag plus required environment variables,
  but it does not pass from the host: Kafka advertises partition leaders on
  the in-network listener, so a host-side client cannot route to them. It must
  run inside the compose network before it can be trusted.
- [x] Prove the chain manually: a regional generator produced through the edge
      Pulsar cluster and the collector forwarded to Kafka, with
      `collector_messages_forwarded_total{region="us-west"}` climbing and zero
      forward failures.
- [x] Wire three geographically independent Pulsar clusters and three collectors
      behind an opt-in compose profile, with a regional generator per cluster.

### Stage 2 — complete the chain

- [x] Make `java-ingest` forward consumed events to the server API instead of
      terminating at metrics. Forwarding is best-effort with a bounded timeout:
      Kafka stays the durable record, so a server outage is counted via
      `java_ingest_forward_failures_total` rather than blocking the partition.
- [x] Add an event-backed SSE channel (`/api/ingest/stream`) fed by ingested
      events, with a bounded replay buffer, leaving the existing disk-derived
      telemetry channel unchanged.
- [ ] Prove the full path end to end with a test that follows one generated record
      from the generator to the frontend.

### Stage 3 — honest topology visualization

- [ ] Represent the collector tier and the per-region Pulsar clusters as nodes.
- [ ] Add the missing `java-ingest -> server API -> SSE -> frontend` edges.
- [ ] Keep governance fan-in visually distinct from the collector chain.
- [ ] Replace the name-list provenance rule with the evidence states above.
- [ ] Remove index-derived throughput; report unmeasured links as unavailable.
- [ ] Replace the constant client-side confidence fallback.
- [ ] Source measured link throughput from Prometheus where a real metric exists.
- [ ] Add tests asserting an unmeasured link never renders as high confidence.

### Stage 4 — documentation alignment

- [ ] `documentation/architecture/ARCHITECTURE.md` — data path and collector tier.
- [ ] `documentation/architecture/DECISIONS.md` — collector tier, geo-distribution,
      and the `java-ingest` role change.
- [ ] `documentation/BROKER_SAFETY_RUNBOOK.md` — DLQ and replay across the new hop.
- [ ] `documentation/development/coding-standards/07-messaging.md` — broker roles.
- [ ] `documentation/frontend/features/TOPOLOGY.md` — visualization and confidence.
- [ ] `documentation/DIAGNOSTICS.md` — the event-backed SSE channel.
- [ ] `documentation/cosmic-forge/DOCKER_ENVIRONMENT.md` — Pulsar cluster profile.
- [ ] `documentation/data/DATA_ARCHITECTURE.md` — end-to-end flow.
- [ ] `ROADMAP.md` — reflect the collector tier in phase planning.
- [ ] PR41 definition of done and out-of-scope sections.

## Evidence boundary

Until Stage 3 lands, the topology visualization continues to display synthetic
throughput and confidence. Nothing in this document should be read as a claim that
those values are measured. Each Stage 3 item is checked off only when the
corresponding value is either genuinely measured or reported as unavailable.
