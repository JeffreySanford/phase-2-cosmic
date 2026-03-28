# 7. Messaging — Kafka, RabbitMQ, Pulsar

These standards matter because asynchronous systems fail in ways that are harder to see and harder to
debug than request/response code. Schema discipline, retry safety, idempotency, dead-letter handling, and
correlation metadata are what prevent message-driven systems from becoming haunted.

## Event design

- Every message declares an explicit event name/type and schema version.
- Payloads must be self-describing; avoid untyped JSON blobs.
- Include trace/correlation identifiers in metadata.

## Delivery semantics

- Producers/consumers document expected semantics: at-most-once, at-least-once, or exactly-once-like.
- Consumers must be replay-safe.
- Ordering assumptions must be explicit; do not rely on global ordering.

## Broker-specific discipline

- Provision topics/exchanges/queues via code or declarative infra, not tribal knowledge.
- Document retention, TTL, dead-letter, retry topics/queues, partitioning strategy per flow.
- Consumer group/subscription naming must follow convention.

## Failure handling

- Define a deterministic path for poison messages (reject, DLQ, quarantine, park).
- Do not retry a bad payload indefinitely.
- Listener code emits structured logs with event type, correlation ID, retry attempt, failure class.

---

### Checklist

- [ ] Message schema versions documented
- [ ] Trace ID propagation implemented in producers/consumers
- [ ] Infra code manages topic/exchange/queue creation
