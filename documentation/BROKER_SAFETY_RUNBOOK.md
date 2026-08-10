# Broker Safety Runbook

## Overview

Cosmic Horizon uses Pulsar, Kafka, and RabbitMQ for distinct responsibilities. Mixing those roles creates ambiguous failure and replay semantics, so broker role assignment is an operational safety rule, not merely a diagramming preference.

ADR-006 and `documentation/architecture/ARCHITECTURE.md` are authoritative for the repaired path.

## Broker role assignments

| Broker | Primary role | Durable replay role | Inline in repaired event path? |
| --- | --- | --- | --- |
| Pulsar | Regional/edge event ingestion | Regional redelivery / DLQ policy | Yes, before the collector |
| Kafka | Central durable streaming backbone | Canonical repaired-path replay source | Yes, after the collector |
| RabbitMQ | Control commands + explicit governance/comparison flows | Control DLX/DLQ only | **No** |

Canonical event path:

```text
data-generator
  -> regional Pulsar
    -> regional pulsar-collector
      -> central Kafka
        -> java-ingest
          -> frontend API
            -> SSE
              -> Angular
```

Lakehouse boundary:

```text
Kafka -> Bronze -> Silver/quarantine -> Gold
```

RabbitMQ is not inserted between Pulsar and Kafka.

## Event identity and attribution

Every repaired-path event has an immutable `event-id` created once by the generator's Pulsar sink.

Required propagation:

```text
generator event-id
  -> Pulsar property event-id
    -> Kafka header event-id
      -> java-ingest eventId
        -> frontend API idempotency key
          -> payload.eventId / SSE
            -> Angular idempotency key
```

Collector transport attribution also includes:

- `collector-region`
- `collector-pulsar-message-id`
- `collector-forwarded-at`
- `collector-kafka-topic`

`source` remains payload provenance and must not be replaced by collector region.

## Delivery semantics

### Generator -> Pulsar

- Publishing blocks for broker acknowledgement.
- Failed writes are recorded as failures and are not counted as delivered throughput.

### Pulsar -> collector -> Kafka

- Semantics: **at-least-once**.
- A new collector subscription begins at the earliest retained Pulsar position so startup ordering does not silently skip regional backlog.
- Collector ACKs the Pulsar message only after Kafka accepts the forwarded record.
- Kafka-forward failure causes `Nack`, allowing Pulsar redelivery.
- A collector/process failure after Kafka acceptance but before Pulsar ACK can produce a duplicate Kafka event.
- Duplicate behavior is therefore expected and downstream consumers must be replay-safe by `eventId`.

### Kafka -> java-ingest -> frontend API

- Kafka remains the durable record.
- Forwarding defaults on. `ingest.forward.enabled=true` with an empty `ingest.forward.url` is a startup configuration error; use `ingest.forward.enabled=false` only for an intentional Kafka-only/metrics mode.
- HTTP forwarding has a bounded timeout.
- A failed frontend API projection raises an ingest failure into Kafka non-blocking retry topics.
- Spring retry-topic infrastructure is explicitly enabled and must be verified by container-backed tests, not inferred from annotations alone.
- Retry exhaustion terminates in the `.forward-dlt` topic associated with the source topic.
- `java_ingest_forward_failures_total` counts HTTP forwarding attempts that fail.
- `java_ingest_forward_dlt_total` counts records that exhaust retry delivery and reach the forward DLT.

### Invalid data -> validation DLT

Poison/contract-invalid records are not transient dependency failures and do **not** spend HTTP retry attempts.

Current minimum invalid conditions:

- blank/missing payload -> `missing_payload`
- blank/missing immutable `event-id` -> `missing_event_id`

They are copied to:

```text
phase2-events.validation-dlt
```

with the original key/value and transport headers preserved, plus:

- `validation-reason`
- `validation-original-topic`

`java_ingest_validation_dlt_total` measures successful validation quarantine. If the validation-DLT write itself fails, the listener throws instead of acknowledging away the source record.

### Duplicate suppression

- `java-ingest` suppresses already-delivered `eventId` values using a bounded process-local cache.
- The frontend ingest API requires `eventId` and suppresses repeated accepted identity before repeating the SSE side effect.
- `frontend_ingest_duplicates_suppressed_total` exposes receiver-side suppression.
- Angular suppresses replay duplicates within its bounded presentation history.
- These mechanisms do not constitute global exactly-once delivery. Kafka remains the durable replay source and durable stores must use `eventId` as an idempotency key where duplicate effects would be unsafe.

## Failure handling

### Pulsar regional edge unavailable

1. Confirm the affected region and cluster.
2. Do not route the regional generator directly to RabbitMQ as an emergency substitute.
3. If an approved failover exists, route to another Pulsar edge or pause generation according to the active runbook.
4. Check regional Pulsar backlog/DLQ before resuming normal flow.

### Collector cannot reach Kafka

1. Verify `collector_forward_failures_total{region="..."}`.
2. Confirm Kafka health and advertised listeners.
3. Leave the Pulsar message unacknowledged/negative-acked so redelivery remains authoritative.
4. Do not manually ACK Pulsar to clear backlog unless event loss has been explicitly accepted.
5. After recovery, watch for duplicate `eventId` values and verify downstream suppression.

### Frontend API unavailable from java-ingest

1. Verify `java_ingest_forward_failures_total` is increasing.
2. Inspect Kafka `.forward-retry` topics for the affected source topic.
3. If retry attempts exhaust, inspect the `.forward-dlt` topic.
4. Restore the frontend API before replaying DLT records.
5. Replay in a controlled batch and verify `eventId` remains unchanged.
6. Confirm the browser acceptance probe receives the replayed event or an expected receiver/Angular duplicate-suppression metric increments.

### Invalid record / validation DLT

1. Inspect `java_ingest_validation_dlt_total` and the `phase2-events.validation-dlt` record.
2. Capture `validation-reason`, original topic, `event-id` when present, collector region, and source payload.
3. Correct the producer/schema defect before replay. Do not replay unchanged poison data into the normal topic.
4. If an `event-id` was missing, determine the authoritative source identity; do not casually mint a new identity unless the event is intentionally being treated as a new logical event.
5. Replay a corrected record in a controlled batch and verify it does not return to validation DLT.

### Forward DLT replay

Before replay:

- capture `event-id`
- capture original/canonical Kafka topic
- capture collector region and Pulsar message ID
- confirm the frontend API is healthy
- confirm the failure was transient rather than a payload/schema defect

Replay must preserve `event-id`; generating a new identity turns one event into a different event and defeats idempotency.

## RabbitMQ control safety

RabbitMQ carries low-latency control/governance messages where explicitly configured.

Rules:

- Do not place RabbitMQ inline in the repaired data delivery chain.
- Control messages must use explicit idempotency/correlation metadata where duplicate execution would be unsafe.
- Dead-letter control commands require operator review before replay.
- Never blindly replay destructive or time-sensitive commands from a DLQ.

## Kafka lakehouse safety

Kafka is the boundary into the lakehouse.

- Bronze ingestion should preserve `eventId`, source payload, topic/partition/offset where available, and collector attribution needed for lineage.
- Silver deduplication/quarantine must not mutate the immutable event identity.
- Gold products must retain traceability back to Bronze identities.
- Pulsar/RabbitMQ operational details should not leak into lakehouse transformations unless required as explicit source attribution.

## Reliability verification

Java Kafka-backed reliability tests:

```bash
pnpm run test:java:ingest:it
```

The relevant PR41 proofs are:

- invalid record -> validation DLT with reason and identity preserved;
- valid record + unreachable frontend -> non-blocking retry topology -> `.forward-dlt`.

## Runtime acceptance

With the repaired geo path, `java-ingest`, frontend server, and Angular application running:

```bash
node scripts/verify-ingest-e2e.mjs
```

A pass requires the hydrated Angular application to observe one real event containing:

- `broker = kafka`
- `collectorRegion`
- `source`
- `eventId`

This is the preferred full-path smoke test after broker or forwarding recovery.

## Operator checklist

- [ ] Correct broker role confirmed before intervention
- [ ] `eventId` captured before replay
- [ ] Regional collector attribution captured
- [ ] Failure classified as transient delivery vs invalid data
- [ ] Kafka retry/forward-DLT state checked for frontend delivery failures
- [ ] Validation DLT checked for poison/contract-invalid data
- [ ] RabbitMQ confirmed to be parallel, not inline
- [ ] Replay performed in a small controlled batch first
- [ ] Browser acceptance probe or downstream idempotency evidence verified after replay

## Change history

| Date | Change |
| --- | --- |
| 2025-01-01 | Initial broker role partitioning document |
| 2026-03-09 | Added DLQ/replay baseline guardrails |
| 2026-08-09 | Aligned Pulsar edge, Kafka backbone, RabbitMQ parallel role, event identity, retry/DLT, dedupe, and PR41 acceptance probe |
| 2026-08-09 | Added fail-closed forwarding, receiver idempotency, validation DLT separation, and executable retry/DLT verification |
