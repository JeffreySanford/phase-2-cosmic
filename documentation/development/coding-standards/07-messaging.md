# 7. Messaging — Kafka, RabbitMQ, Pulsar

Asynchronous systems require explicit ownership of identity, durability, retry, replay, and broker roles. A broker diagram is not sufficient: every production path must state what happens when a process crashes before or after acknowledgement and how a duplicate is recognized.

The current platform role assignment is defined by ADR-006 in `documentation/architecture/DECISIONS.md`.

## Broker roles

| Broker   | Platform role                                             | Primary durability/recovery behavior                      |
| -------- | --------------------------------------------------------- | --------------------------------------------------------- |
| Pulsar   | Regional/edge event ingestion                             | Redelivery when a regional collector does not acknowledge |
| Kafka    | Central durable streaming backbone and lakehouse boundary | Replay, retry topics, DLT/DLQ, consumer offsets           |
| RabbitMQ | Parallel control/governance/comparison flows              | Queue ACK/requeue/DLX according to the control contract   |

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
        -> frontend API idempotency key
          -> API/SSE payload.eventId
            -> Angular idempotency key
```

Standards:

- `eventId` / `event-id` is immutable. A retry or replay must not create a new ID.
- `traceId` or `correlationId` is observability/workflow context and does not replace the event idempotency key.
- Broker/transport metadata such as collector region, Pulsar message ID, Kafka topic/partition/offset, and retry attempt should remain metadata rather than silently replacing source payload fields.
- Source provenance and transport provenance are separate concerns and both must survive where required by the consumer contract.
- Any API or service that performs a duplicate-sensitive side effect from an event must enforce idempotency at that side-effect boundary; upstream dedupe alone is insufficient.

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
- A new regional collector subscription starts at the earliest retained Pulsar position so collector startup order cannot silently skip retained backlog.
- Collector -> Kafka ACKs Pulsar only after Kafka acceptance; failed forwarding is negative-acked.
- A crash after Kafka acceptance but before Pulsar ACK can create a duplicate Kafka record.
- `java-ingest`, the frontend ingest API, and Angular suppress duplicate projection using immutable `eventId`.
- Bounded caches/leases do not provide global exactly-once behavior across all restarts or failure boundaries.
- Durable downstream writes must therefore remain idempotent by `eventId` when duplicate effects are unsafe.

Ordering assumptions must be explicit. Never assume global ordering across partitions, topics, regions, or retry topics.

## Retry and dead-letter handling

Retries must have a deterministic terminal state, and **transient dependency failure must be separated from invalid-data failure**.

### Transient presentation delivery failure

For `Kafka -> java-ingest -> frontend API`:

1. Forwarding configuration fails startup when enabled without a usable endpoint.
2. The HTTP forward attempt is bounded by connect/read timeout.
3. A transient forwarding failure is raised to Kafka non-blocking retry topics rather than blocking the main consumer partition indefinitely.
4. Retry attempts use bounded backoff.
5. Retry exhaustion terminates in the `.forward-dlt` path.
6. Replay from the DLT preserves `eventId` and original/canonical topic attribution.
7. Retry infrastructure must have executable integration evidence; annotations alone do not prove the retry listener topology was bootstrapped.

### Invalid/poison data

Invalid records do not consume transient HTTP retry attempts.

For the repaired `java-ingest` path:

- missing/blank payload -> validation DLT
- missing/blank immutable `event-id` -> validation DLT
- validation quarantine preserves the source record and transport headers and adds a deterministic reason
- failure to write the validation DLT must fail the listener rather than silently discard the original record

Validation DLT and forward DLT represent different operator actions and must not be collapsed into one queue/topic.

### Pulsar -> collector -> Kafka

- Kafka forwarding failure means the Pulsar record is not acknowledged.
- The collector negative-acks the record so Pulsar redelivery remains authoritative.
- Operators must expect possible duplicates around the Kafka-success/Pulsar-ACK boundary.

### RabbitMQ control flows

- Control messages follow their queue TTL, ACK/requeue, and DLX/DLQ contract.
- Never blindly replay destructive or time-sensitive commands.

## Broker-specific discipline

- Provision topics/exchanges/queues through code or declarative infrastructure, not tribal knowledge.
- Document retention, TTL, retry topics/queues, DLT/DLQ, partitioning strategy, and consumer group/subscription naming per flow.
- Kafka retry/DLT and validation-DLT topics are part of the delivery contract and must be observable.
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
- validation/quarantine reason
- failure class

Avoid high-cardinality metric labels for raw event IDs. Use event IDs in structured logs/traces and counters for aggregate duplicate/retry/DLT behavior.

## Acceptance testing

A transport change is incomplete until one event can be followed across the intended boundary and the failure paths are executable.

The PR41 repaired-path acceptance contract is:

```text
generator eventId X
  -> regional Pulsar
    -> collector(region R)
      -> Kafka(event-id X)
        -> java-ingest
          -> frontend API
            -> SSE
              -> hydrated Angular eventId X, region R, source S
```

The runtime browser probe is:

```bash
node scripts/verify-ingest-e2e.mjs
```

A pass requires the hydrated Angular application to observe `broker=kafka`, non-empty `collectorRegion`, non-empty `source`, and non-empty `eventId` from the repaired path.

Failure-path integration coverage must additionally prove:

```text
invalid event -> validation DLT
transient frontend outage -> retry topic(s) -> forward DLT
repeated API eventId -> one SSE side effect
```

---

### Checklist

- [ ] Broker role matches ADR-006
- [ ] Immutable event identity is generated once and propagated unchanged
- [ ] Trace/correlation metadata is propagated separately from event identity
- [ ] Delivery semantics are explicitly documented
- [ ] Duplicate-sensitive side-effect boundaries enforce idempotency
- [ ] Consumers and durable stores are replay-safe/idempotent where required
- [ ] Transient failures and invalid-data failures have separate terminal paths
- [ ] Retry policy is bounded and has a DLT/DLQ/quarantine terminal state
- [ ] Forwarding configuration fails closed when required dependencies are missing
- [ ] Replay preserves the original `eventId`
- [ ] Topics/exchanges/queues are managed as infrastructure
- [ ] Metrics/logging expose retry, duplicate, validation, and terminal failure behavior
- [ ] Retry/DLT behavior has executable integration evidence
- [ ] One-event end-to-end acceptance evidence exists for topology changes
