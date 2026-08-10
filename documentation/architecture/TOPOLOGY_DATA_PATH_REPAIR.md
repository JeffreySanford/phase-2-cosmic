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
9. A duplicate could repeat the frontend SSE side effect if Java retried after the API had already accepted the event.
10. Invalid records and transient frontend outages shared no explicit failure-domain separation.
11. Forwarding could be enabled without a usable endpoint and silently degrade into a non-forwarding consumer.
12. Retry/DLT behavior existed as annotation intent but lacked a real Kafka-backed proof that the retry listener topology actually bootstrapped and delivered to the DLT.

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
          -> hydrated Angular application
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
6. The frontend ingest API requires `eventId` before it can perform the SSE side effect and suppresses repeated accepted identity at that boundary.
7. `source` remains source payload data and must not be replaced by collector region.

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
- Collector subscriptions start at the earliest retained position when first created so collector startup order cannot silently discard retained regional events.
- Collector ACKs Pulsar only after Kafka accepts the message.
- Kafka-forward failure causes Pulsar negative-ack/redelivery.
- A crash around the Kafka-success/Pulsar-ACK boundary may create a duplicate Kafka record; that is expected at-least-once behavior.

### Kafka -> java-ingest -> frontend API

- Kafka remains the durable system of record.
- Forwarding defaults to enabled and **fails application startup** when `ingest.forward.url` is empty. Kafka-only/metrics mode must be selected explicitly with `ingest.forward.enabled=false`.
- HTTP forwarding is bounded by timeout.
- Transient forward failures are thrown into **non-blocking Kafka retry topics** so the main consumer partition is not held by an unavailable frontend API.
- Retry exhaustion terminates in a dedicated `.forward-dlt` topic.
- `@EnableKafkaRetryTopic` activates the retry topology and the listener explicitly names the Boot-managed `kafkaTemplate`.
- DLT delivery is measured with `java_ingest_forward_dlt_total`.

### Invalid data -> validation DLT

Invalid data does not spend transient HTTP retry attempts:

```text
Kafka record
  -> java-ingest validation
    -> invalid
      -> phase2-events.validation-dlt
```

Current repaired-path minimum contract rejects/quarantines:

- missing/blank payload -> `missing_payload`
- missing/blank immutable `event-id` -> `missing_event_id`

The quarantine copy preserves the original key/value and transport headers and adds:

- `validation-reason`
- `validation-original-topic`

`java_ingest_validation_dlt_total` measures successful validation quarantine. A validation-DLT publish failure is thrown rather than acknowledging away the source record.

### Duplicate handling

- `eventId` is the canonical idempotency key.
- `java-ingest` keeps a bounded process-local delivered-ID cache and suppresses common bridge/retry duplicates after a successful frontend projection.
- The frontend `/api/ingest/events` boundary requires `eventId` and suppresses duplicate API deliveries before repeating the SSE side effect; `frontend_ingest_duplicates_suppressed_total` exposes that behavior.
- Angular also suppresses replay duplicates by `eventId` within its bounded presentation history.
- This is **not global exactly-once**. Kafka remains the durable replay source, bounded caches/leases remain implementation aids, and durable downstream stores must remain replay-safe/idempotent by `eventId`.

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

## Delivery packaging

PR41 began as the lakehouse local medallion MVP and absorbed a platform topology
repair. It now spans four separable bodies of work:

| Body of work                                              | State                                      | Depends on        |
| --------------------------------------------------------- | ------------------------------------------ | ----------------- |
| Lakehouse PR41 MVP (medallion, live source, guards, gate) | complete and green                         | nothing here      |
| Go module gate coverage                                   | complete and green                         | nothing here      |
| Collector tier and reliability contract (Stages 1–2)      | implemented, one runtime probe outstanding | geo profile       |
| Topology visualization honesty (Stage 3)                  | not started                                | Stage 1–2 metrics |

**Recommendation: merge the lakehouse MVP and Go gate coverage first.** They are
independently valuable, independently verified, and gate-green today. Holding
them behind the topology repair couples a finished deliverable to work that has
an open stage and an unexecuted runtime probe.

The collector tier and Stage 3 can then continue on a follow-on branch without a
reviewer needing to hold all four contexts at once. If the work stays in one PR,
this table is the reviewer's map of what is finished versus in flight.

## Implementation plan and status

### Stage 1 — collector tier

- [x] Add a Pulsar sink to the Go data generator.
- [x] Stop counting undelivered records as produced throughput.
- [x] Build `pulsar-collector` and negative-ack failed Kafka forwards.
- [x] Preserve regional attribution without rewriting the payload.
- [x] Add immutable generator `event-id` and propagate it to Kafka unchanged.
- [x] Start new collector subscriptions from the earliest retained position.
- [x] Add collector unit/static-analysis coverage.
- [x] Make the collector lifecycle context-injectable so integration tests shut down deterministically.
- [x] Make collector integration coverage deterministic with unique Pulsar/Kafka topics and host Kafka listener `localhost:9094`.
- [x] Manually prove a regional generator -> Pulsar -> collector -> Kafka chain.
- [x] Wire three independent Pulsar clusters and three collectors through the opt-in geo compose profile.

### Stage 2 — complete and harden the presentation chain

- [x] Make `java-ingest` forward consumed Kafka events to the frontend API.
- [x] Add event-backed SSE channel `/api/ingest/stream` with bounded replay buffer.
- [x] Preserve `eventId`, collector region, Pulsar message ID, source, and canonical Kafka topic through Java projection.
- [x] Replace best-effort-only forwarding with Kafka retry-topic -> DLT semantics after bounded HTTP attempts.
- [x] Explicitly enable Spring Kafka retry-topic infrastructure and bind it to `kafkaTemplate`.
- [x] Fail startup when forwarding is enabled without a forwarding URL.
- [x] Add a distinct validation DLT so poison records bypass transient HTTP retries.
- [x] Add process-local duplicate suppression in `java-ingest` keyed by immutable `eventId`.
- [x] Enforce `eventId` idempotency at the frontend API side-effect boundary before duplicate SSE broadcast.
- [x] Add Angular `IngestEventStreamService` for the dedicated repaired ingest SSE contract and presentation replay dedupe.
- [x] Activate `IngestEventStreamService` from the root Angular application so the browser subscribes after hydration.
- [x] Add a hidden Angular acceptance marker populated only after the browser consumes a repaired-path event.
- [x] Add cross-layer contract tests for identity/provenance preservation.
- [x] Add Kafka/Testcontainers proof for validation quarantine.
- [x] Add Kafka/Testcontainers proof for retry-topic bootstrap and terminal `.forward-dlt` delivery.
- [x] Add browser runtime acceptance probe: `node scripts/verify-ingest-e2e.mjs`.
- [~] Execute the runtime probe against the full geo compose stack and retain one passing Angular-observed event as PR evidence before merge.

### Stage 3 — honest topology visualization

> This is the defect that started PR41 and it remains **entirely open**. Until it
> lands, the running UI still labels a link "High confidence" because its name
> appears in a hardcoded list, and still prints throughput derived from array
> position. Stages 1 and 2 repaired the runtime path; they did not touch this.

#### 3a. Graph shape — make the drawing match the code

- [ ] Add per-region Pulsar cluster nodes (`pulsar-us`, `pulsar-eu`, `pulsar-apac`)
      and a collector node per region.
- [ ] Replace the direct `pulsar -> kafka` edge with `pulsar-<region> ->
collector-<region> -> kafka`.
- [ ] Add the presentation edges `kafka -> java-ingest -> backend -> frontend`,
      which do not exist in the graph today even though the path now runs.
- [ ] Group governance/RabbitMQ fan-in visually so it does not read as an inline
      hop in the collector chain.
- [ ] Add a contract test asserting every graph edge maps to a real component
      relationship, so a future aspirational edge cannot be drawn silently.

#### 3b. Measurement source — replace fabrication with Prometheus

Metric bindings per edge (all already scraped, so no new exporters are required):

| Edge                                    | Prometheus series                                                          |
| --------------------------------------- | -------------------------------------------------------------------------- |
| `generator -> pulsar-<region>`          | `generator_bytes_produced_total`, `generator_write_failures_total`         |
| `pulsar-<region> -> collector-<region>` | `collector_messages_forwarded_total`, `collector_forward_duration_seconds` |
| `collector-<region> -> kafka`           | `collector_messages_forwarded_total`, `collector_forward_failures_total`   |
| `kafka -> java-ingest`                  | `java_ingest_received_total`, `java_ingest_processed_total`                |
| `java-ingest -> backend`                | `java_ingest_forwarded_total`, `java_ingest_forward_failures_total`        |
| `backend -> frontend`                   | ingest SSE client count and events received                                |

- [ ] Add a server-side resolver that queries Prometheus per edge and returns a
      value plus the series name it came from.
- [ ] Return `null` throughput for any edge with no backing series. Never
      synthesize a number.
- [ ] Delete the index-derived `currentMBps` expression outright.
- [ ] Delete the `provenance === "admin" ? 92 : 74` name-list rule outright.
- [ ] Replace the constant client fallback (`mock ? 24 : 48`) with the same
      evidence states used server-side.

#### 3c. Confidence semantics

- [ ] Derive state from measurement age: `measured` inside the freshness window,
      `stale` beyond it, `declared` when no series exists, `mock` in mock mode.
- [ ] Carry `measurementSource` (the Prometheus series name) and
      `measuredAt` on every link so a reader can verify the claim.
- [ ] Make `confidenceLabel()` render absence as absence — an unmeasured link
      shows "No measurement", never a percentage.

#### 3d. Presentation

- [ ] Render unmeasured links dimmed/dashed per the decision above.
- [ ] Show the series name and measurement age in the link dialog.
- [ ] Add a legend distinguishing measured / stale / declared.

#### 3e. Tests that pin honesty

- [ ] An unmeasured link never renders as high confidence.
- [ ] An edge with no Prometheus series reports `null` throughput rather than 0
      or a synthesized value.
- [ ] A stale measurement degrades the state rather than keeping the last value
      at full confidence.
- [ ] Mock mode is labeled mock and never reports `measured`.

### Stage 4 — documentation alignment

- [x] `documentation/architecture/ARCHITECTURE.md` — canonical three-path architecture and reliability contract.
- [x] `documentation/architecture/DECISIONS.md` — ADR-006 broker roles, event identity, fail-closed config, split DLTs, retry proof, dedupe, and lakehouse boundary.
- [x] `documentation/architecture/TOPOLOGY_DATA_PATH_REPAIR.md` — implementation/evidence source of truth.
- [x] `documentation/BROKER_SAFETY_RUNBOOK.md` — repaired-path retry/DLT/replay rules.
- [x] `documentation/development/coding-standards/07-messaging.md` — broker roles and event identity rules.
- [ ] `documentation/frontend/features/TOPOLOGY.md` — visualization/evidence presentation details when Stage 3 lands.
- [ ] `documentation/DIAGNOSTICS.md` — final operator presentation once the repaired stream is bound into a visible diagnostics surface.
- [ ] `documentation/cosmic-forge/DOCKER_ENVIRONMENT.md` — geo-profile operational instructions if not already covered by compose comments.
- [ ] `documentation/data/DATA_ARCHITECTURE.md` — broader ngVLA lifecycle cleanup; current document contains older three-broker ingest wording and should be updated as a follow-on docs-only cleanup rather than silently rewritten inside the PR41 lakehouse proof.
- [ ] `ROADMAP.md` — roll collector tier into phase planning after PR41 acceptance evidence is captured.
- [x] PR41 description — expanded scope, decision, reliability semantics, acceptance evidence, and remaining boundary.

## Reliability integration proofs

Run the Java container-backed reliability tests with:

```bash
pnpm run test:java:ingest:it
```

The PR41 reliability gate now includes two distinct Kafka-backed proofs:

1. invalid record -> `phase2-events.validation-dlt`, preserving identity and reason;
2. valid record + unreachable frontend -> Spring retry-topic listener topology -> `.forward-dlt`.

These are separate because poison data and transient dependency outages require different operator actions.

## Runtime acceptance probe

With the geo profile, `java-ingest`, frontend server, and Angular application running:

```bash
node scripts/verify-ingest-e2e.mjs
```

Optional overrides:

```bash
INGEST_APP_URL=http://127.0.0.1:4000/ \
INGEST_E2E_TIMEOUT_MS=45000 \
node scripts/verify-ingest-e2e.mjs
```

The probe does not manufacture an API event. It opens the real application with Playwright and waits for Angular's `IngestEventStreamService` to consume a repaired-path SSE event. It passes only when the hydrated Angular application exposes:

- `broker === "kafka"`
- non-empty `eventId`
- non-empty collector region
- non-empty source

A passing browser-observed event is the PR41 acceptance artifact for the transport/presentation repair.

## Evidence boundary

The transport and reliability code can be implemented without claiming the topology visualization is already evidence-backed. Until Stage 3 lands, synthetic confidence/throughput in the existing visualization remains a known defect and must not be cited as measured architecture evidence.

Likewise, the browser runtime acceptance probe and Kafka-backed reliability tests are committed but must not be described as passing runtime evidence until the associated executions are green. The Lakehouse PR41 MVP remains a local reference proof; production Spark/Databricks streaming remains later scope.
