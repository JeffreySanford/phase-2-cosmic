# Topology Data-Path Repair

> Status: **in progress — transport/reliability contract implemented; visualization evidence work remains**
> Scope: make the topology visualization, runtime path, delivery semantics, and platform documentation reflect the real data path from data generation through Angular and into the lakehouse boundary.
> Label: **PR41 side quest — topology repair**

## Why this exists

The topology visualization asserted links the code did not implement and presented synthetic numbers as measured evidence. PR41 expanded to repair the runtime path first, then align the visualization and documentation around evidence that can actually be proven.

### Defects found (2026-08-09)

1. The graph claimed `data-generator -> Pulsar -> Kafka` while no collector bridge existed.
2. Confidence was fabricated from hardcoded node names.
3. Throughput was fabricated from link array position rather than measurements.
4. The client fallback used constant confidence values.
5. `java-ingest` terminated at metrics instead of projecting events to the frontend.
6. The repaired path had no immutable event identity, duplicate contract, or durable Java-to-frontend failure path.
7. Broker roles were ambiguous enough that RabbitMQ could be misread as an inline hop instead of a parallel control/governance path.
8. The lakehouse boundary was not explicitly separated from the operational broker topology.

## Accepted architectural decision

ADR-006 in `DECISIONS.md` is authoritative:

- **Pulsar = regional/edge ingestion.**
- **`pulsar-collector` = regional Pulsar-to-Kafka bridge.**
- **Kafka = central durable streaming backbone and replay boundary.**
- **RabbitMQ = parallel control/governance/comparison path, not an inline hop.**
- **Kafka = lakehouse ingestion boundary.**
- **Presentation = Kafka -> java-ingest -> frontend API -> SSE -> Angular.**

## Canonical paths

### Transport Repair

```text
data-generator
  -> regional Pulsar
    -> regional pulsar-collector
      -> central Kafka
```

### Ingestion / Presentation

```text
Kafka
  -> java-ingest
    -> frontend API (/api/ingest/events)
      -> SSE (/api/ingest/stream)
        -> Angular IngestEventStreamService
```

### Lakehouse

```text
Kafka
  -> Bronze
    -> Silver / quarantine
      -> Gold
        -> query / diagnostics / analytical consumers
```

### Parallel paths that remain distinct

- `Kafka | Pulsar | RabbitMQ -> java-governance` — governance/broker comparison fan-in.
- `RabbitMQ -> control consumers` — control commands.
- `data-generator -> file sink -> SSR telemetry` — disk-derived stress telemetry.

These are not one linear chain and must never be drawn as one.

## Event identity and provenance contract

Every repaired-path event has one immutable identity:

1. The generator's Pulsar sink creates UUID-v4 `event-id` once.
2. The regional collector preserves the source payload byte-for-byte.
3. The collector copies `event-id` into Kafka headers unchanged and adds:
   - `collector-region`
   - `collector-pulsar-message-id`
   - `collector-forwarded-at`
   - `collector-kafka-topic`
4. `java-ingest` reads those headers and projects them into the frontend envelope.
5. For structured JSON payloads, `java-ingest` also adds `eventId` to the projected payload so SSE/Angular consumers do not depend on Kafka headers.
6. `source` remains source payload data and must not be replaced by collector region.

The acceptance invariant is:

```text
same eventId + same source + collector region survives
Generator -> Pulsar -> Collector -> Kafka -> Java -> API -> SSE -> Angular
```

## Delivery, retry, DLT, and duplicate contract

### Generator -> Pulsar

- Publish blocks until the Pulsar broker acknowledges.
- Failed publishes are not counted as delivered throughput.

### Pulsar -> collector -> Kafka

- Semantics: **at-least-once**.
- Collector ACKs Pulsar only after Kafka accepts the message.
- Kafka-forward failure causes Pulsar negative-ack/redelivery.
- A crash around the Kafka-success/Pulsar-ACK boundary may create a duplicate Kafka record; that is expected at-least-once behavior.

### Kafka -> java-ingest -> frontend API

- Kafka remains the durable system of record.
- HTTP forwarding is bounded by timeout.
- Forward failures are thrown into **non-blocking Kafka retry topics** so the main consumer partition is not held by an unavailable frontend API.
- Retry exhaustion terminates in a dedicated `.forward-dlt` topic.
- DLT delivery is measured with `java_ingest_forward_dlt_total`.

### Duplicate handling

- `eventId` is the canonical idempotency key.
- `java-ingest` keeps a bounded process-local delivered-ID cache and suppresses duplicates after a successful frontend projection.
- Angular also suppresses replay duplicates by `eventId` within its bounded presentation history.
- This is **not global exactly-once**. A service restart can clear process-local dedupe state; durable downstream stores must remain replay-safe/idempotent by `eventId`.

## Confidence contract

Confidence describes **evidence provenance and freshness**, never a hardcoded node name.

| State      | Meaning                                                          | Confidence |
| ---------- | ---------------------------------------------------------------- | ---------- |
| `measured` | A live scrape provided this link's throughput within the window  | high       |
| `stale`    | A real measurement exists but is older than the freshness window | reduced    |
| `derived`  | Computed from a real measurement on an adjacent link             | moderate   |
| `declared` | The link exists in architecture but nothing measures it          | none       |
| `mock`     | Demo/mock mode                                                   | none       |

Rules:

- A `declared` or `mock` link must not report a numeric confidence that renders as "High confidence".
- Throughput for an unmeasured link is unavailable, not synthesized.
- The measurement source must be named.
- Prometheus is the measurement source for generator, collector, Kafka/RabbitMQ/Redis exporter, and Java metrics where a real series exists.
- Unmeasured links remain visible but visually distinct (for example dimmed/dashed).

## Implementation plan and status

### Stage 1 — collector tier

- [x] Add a Pulsar sink to the Go data generator.
- [x] Stop counting undelivered records as produced throughput.
- [x] Build `pulsar-collector` and negative-ack failed Kafka forwards.
- [x] Preserve regional attribution without rewriting the payload.
- [x] Add immutable generator `event-id` and propagate it to Kafka unchanged.
- [x] Add collector unit/static-analysis coverage.
- [~] Run collector integration coverage inside the compose network. The test exists and validates payload fidelity, region, event ID, Pulsar message ID, and canonical Kafka topic; host execution remains blocked by Kafka's advertised in-network listener.
- [x] Manually prove a regional generator -> Pulsar -> collector -> Kafka chain.
- [x] Wire three independent Pulsar clusters and three collectors through the opt-in geo compose profile.

### Stage 2 — complete and harden the presentation chain

- [x] Make `java-ingest` forward consumed Kafka events to the frontend API.
- [x] Add event-backed SSE channel `/api/ingest/stream` with bounded replay buffer.
- [x] Preserve `eventId`, collector region, Pulsar message ID, source, and canonical Kafka topic through Java projection.
- [x] Replace best-effort-only forwarding with Kafka retry-topic -> DLT semantics after bounded HTTP attempts.
- [x] Add process-local duplicate suppression in `java-ingest` keyed by immutable `eventId`.
- [x] Add Angular `IngestEventStreamService` for the dedicated repaired ingest SSE contract and presentation replay dedupe.
- [x] Add cross-layer contract tests for identity/provenance preservation.
- [x] Add runtime acceptance probe: `node scripts/verify-ingest-e2e.mjs`.
- [~] Execute the runtime probe against the full geo compose stack and retain one passing event as PR evidence before merge.

### Stage 3 — honest topology visualization

- [ ] Represent the collector tier and per-region Pulsar clusters as nodes.
- [ ] Add `java-ingest -> server API -> SSE -> Angular` edges.
- [ ] Keep governance/RabbitMQ fan-in visually distinct from the collector chain.
- [ ] Replace name-list provenance logic with measured/stale/derived/declared/mock states.
- [ ] Remove index-derived throughput.
- [ ] Remove constant client confidence fallback.
- [ ] Source measured throughput from Prometheus where a real metric exists.
- [ ] Add tests asserting an unmeasured link never renders as high confidence.

### Stage 4 — documentation alignment

- [x] `documentation/architecture/ARCHITECTURE.md` — canonical three-path architecture and reliability contract.
- [x] `documentation/architecture/DECISIONS.md` — ADR-006 broker roles, event identity, retry/DLT, dedupe, and lakehouse boundary.
- [x] `documentation/architecture/TOPOLOGY_DATA_PATH_REPAIR.md` — implementation/evidence source of truth.
- [x] `documentation/BROKER_SAFETY_RUNBOOK.md` — repaired-path retry/DLT/replay rules.
- [x] `documentation/development/coding-standards/07-messaging.md` — broker roles and event identity rules.
- [ ] `documentation/frontend/features/TOPOLOGY.md` — visualization/evidence presentation details when Stage 3 lands.
- [ ] `documentation/DIAGNOSTICS.md` — final operator presentation once the repaired stream is bound into a visible diagnostics surface.
- [ ] `documentation/cosmic-forge/DOCKER_ENVIRONMENT.md` — geo-profile operational instructions if not already covered by compose comments.
- [ ] `documentation/data/DATA_ARCHITECTURE.md` — broader ngVLA lifecycle cleanup; current document contains older three-broker ingest wording and should be updated as a follow-on docs-only cleanup rather than silently rewritten inside the PR41 lakehouse proof.
- [ ] `ROADMAP.md` — roll collector tier into phase planning after PR41 acceptance evidence is captured.
- [x] PR41 description — expanded scope, decision, reliability semantics, acceptance evidence, and remaining boundary.

## Runtime acceptance probe

With the geo profile, `java-ingest`, and frontend server running:

```bash
node scripts/verify-ingest-e2e.mjs
```

Optional overrides:

```bash
INGEST_SSE_URL=http://127.0.0.1:4000/api/ingest/stream \
INGEST_E2E_TIMEOUT_MS=30000 \
node scripts/verify-ingest-e2e.mjs
```

The probe does not manufacture an API event. It waits for a real repaired-path SSE event and passes only when:

- `broker === "kafka"`
- `collectorRegion` is present
- `source` is present
- `payload.eventId` is present

A passing event is the PR41 acceptance artifact for the transport/presentation repair.

## Evidence boundary

The transport and reliability code can be implemented without claiming the topology visualization is already evidence-backed. Until Stage 3 lands, synthetic confidence/throughput in the existing visualization remains a known defect and must not be cited as measured architecture evidence.

Likewise, the new runtime acceptance probe is committed but is not considered executed evidence until a passing full-stack run is captured. The Lakehouse PR41 MVP remains a local reference proof; production Spark/Databricks streaming remains later scope.
