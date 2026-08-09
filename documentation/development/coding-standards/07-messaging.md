# 7. Messaging — Kafka, RabbitMQ, Pulsar

Asynchronous systems require explicit ownership of identity, durability, retry, replay, and broker roles. A broker diagram is not sufficient: every production path must state what happens when a process crashes before or after acknowledgement and how a duplicate is recognized.

The current platform role assignment is defined by ADR-006 in `documentation/architecture/DECISIONS.md`.

## Broker roles

| Broker | Platform role | Primary durability/recovery behavior |
| --- | --- | --- |
| Pulsar | Regional/edge event ingestion | Redelivery when a regional collector does not acknowledge |
| Kafka | Central durable streaming backbone and lakehouse boundary | Replay, retry topics, DLT/DLQ, consumer offsets |
| RabbitMQ | Parallel control/governance/comparison flows | Queue ACK/requeue/DLX according to the control contract |

Rules:

- Do not place RabbitMQ inline between Pulsar and Kafka in the repaired event path.
- Regional Pulsar events reach Kafka through the colocated `pulsar-collector` tier.
- Kafka is the source boundary for `java-ingest` presentation projection and Bronze analytical ingestion.
- Any deviation from these roles requires an accepted architecture decision and updated topology evidence.

## Event identity

Every durable event flow must have an immutable event identity generated once at the origin.

For the repaired path:

```text
data-generator event-id
  -> Pulsar property event-id
    -> Kafka header event-id
      -> java-ingest eventId
        -> API/SSE payload.eventId
          -> Angular idempotency key
```

Standards:

- `eventId` / `event-id` is immutable. A retry or replay must not create a new ID.
- `traceId` or `correlationId` is observability/workflow context and does not replace the event idempotency key.
- Broker/transport metadata such as collector region, Pulsar message ID, Kafka topic/partition/offset, and retry attempt should remain metadata rather than silently replacing source payload fields.
- Source provenance and transport provenance are separate concerns and both must survive where required by the consumer contract.

## Event design

- Every message declares an explicit event name/type and schema version where the domain contract requires one.
- Payloads should be self-describing; avoid undocumented untyped JSON blobs.
- Include immutable event identity plus trace/correlation identifiers.
- Schema evolution rules must be documented for durable topics.
- Consumers must tolerate broker redelivery without producing unsafe duplicate effects.

## Delivery semantics

Every producer/consumer pair documents one of the following honestly:

- at-most-once
- at-least-once
- exactly-once-like within a specifically named transactional boundary

Do not use “exactly once” as a general description of the repaired platform path.

The PR41 repaired path is **at-least-once plus idempotency/deduplication**:

- Generator -> Pulsar waits for broker acknowledgement.
- Collector -> Kafka ACKs Pulsar only after Kafka acceptance; failed forwarding is negative-acked.
- A crash after Kafka acceptance but before Pulsar ACK can create a duplicate Kafka record.
- `java-ingest` and Angular suppress known replay duplicates using `eventId`, but process-local caches do not provide global exactly-once behavior across restarts.
- Durable downstream writes must therefore remain idempotent by `eventId` when duplicate effects are unsafe.

Ordering assumptions must be explicit. Never assume global ordering across partitions, topics, regions, or retry topics.

## Retry and dead-letter handling

Retries must have a deterministic terminal state.

For `Kafka -> java-ingest -> frontend API`:

1. The HTTP forward attempt is bounded by connect/read timeout.
2. A transient forwarding failure is raised to Kafka non-blocking retry topics rather than blocking the main consumer partition indefinitely.
3. Retry attempts use bounded backoff.
4. Retry exhaustion terminates in the `.forward-dlt` path.
5. Replay from the DLT preserves `eventId` and original/canonical topic attribution.
6. Poison payloads are diagnosed before replay; do not retry an invalid event forever.

For Pulsar -> collector -> Kafka:

- Kafka forwarding failure means the Pulsar record is not acknowledged.
- The collector negative-acks the record so Pulsar redelivery remains authoritative.
- Operators must expect possible duplicates around the Kafka-success/Pulsar-ACK boundary.

For RabbitMQ control flows:

- Control messages follow their queue TTL, ACK/requeue, and DLX/DLQ contract.
- Never blindly replay destructive or time-sensitive commands.

## Broker-specific discipline

- Provision topics/exchanges/queues through code or declarative infrastructure, not tribal knowledge.
- Document retention, TTL, retry topics/queues, DLT/DLQ, partitioning strategy, and consumer group/subscription naming per flow.
- Kafka retry/DLT topics are part of the delivery contract and must be observable.
- Pulsar subscriptions used by regional collectors must remain unique/intentional for the deployment topology.
- Broker role changes require architecture and runbook updates in the same change set.

## Observability and logging

Listener/bridge code should emit or expose enough evidence to reconstruct one event path without logging entire sensitive payloads.

At minimum where available:

- `eventId`
- event type
- trace/correlation ID
- collector region
- source/canonical topic
- retry attempt or terminal DLT/DLQ state
- failure class

Avoid high-cardinality metric labels for raw event IDs. Use event IDs in structured logs/traces and counters for aggregate duplicate/retry/DLT behavior.

## Acceptance testing

A transport change is incomplete until one event can be followed across the intended boundary.

The PR41 repaired-path acceptance contract is:

```text
generator eventId X
  -> regional Pulsar
    -> collector(region R)
      -> Kafka(event-id X)
        -> java-ingest
          -> frontend API
            -> SSE
              -> Angular eventId X, region R, source S
```

The runtime smoke probe is:

```bash
node scripts/verify-ingest-e2e.mjs
```

A pass requires a real Angular-facing SSE event with `broker=kafka`, non-empty `collectorRegion`, non-empty `source`, and non-empty `payload.eventId`.

---

### Checklist

- [ ] Broker role matches ADR-006
- [ ] Immutable event identity is generated once and propagated unchanged
- [ ] Trace/correlation metadata is propagated separately from event identity
- [ ] Delivery semantics are explicitly documented
- [ ] Consumers are replay-safe/idempotent where required
- [ ] Retry policy is bounded and has a DLT/DLQ/quarantine terminal state
- [ ] Replay preserves the original `eventId`
- [ ] Topics/exchanges/queues are managed as infrastructure
- [ ] Metrics/logging expose retry, duplicate, and terminal failure behavior
- [ ] One-event end-to-end acceptance evidence exists for topology changes
