# Broker Safety & DLQ/Replay Runbook

Canonical operator runbook: [../BROKER_SAFETY_RUNBOOK.md](../BROKER_SAFETY_RUNBOOK.md)

This messaging-focused copy remains useful for implementation notes, but the
root runbook above is the source of truth for DLQ/replay safety procedures.

This runbook provides operators and developers guidance for maintaining a
resilient streaming-to-governance integration across Kafka, RabbitMQ and
Pulsar. It covers configuration, failure modes, and recovery procedures.

## 1. Queue/Topic Configuration

- Front‑end clients can connect to `/api/v1/broker-events` via SSE to receive a
  live stream of job/control-plane events; ensure this endpoint is reachable in
  the deployment environment and protected by same auth policies as APIs.

- All ingest paths use the topic/queue name `phase2-events`.
- A companion dead-letter queue/topic named `phase2-events-dlq` must exist.
  - **Kafka**: configure `phase2-events` with `message.timeout.ms` and use the
    consumer logic in `KafkaIngestListener` to forward invalid messages.
  - **RabbitMQ**: declare `phase2-events` with `x-dead-letter-exchange` bound to
    `phase2-events-dlq` or rely on the listener to manually forward failures.
  - **Pulsar**: DLQ is handled by `PulsarIngestListener` producer when processing
    errors occur.

## 2. Deployment Safety

- **Consumer resilience**: listeners run with `Shared`/`competing` subscription
  so multiple instances may be started for scale.
- **Interruption handling**:
  - When a broker restarts or network partitions occur, consumers will reconnect
    automatically (Kafka/RabbitAMQ/Pulsar clients handle retry by default).
  - The governance service records the `requestId` parameter and uses it to
    deduplicate incoming jobs; repeated deliveries from reconnection will be
    ignored.

## 3. Replay Procedure

1. Identify the time window and broker type where messages were lost or
   corrupted.
2. If messages are on the DLQ topic/queue:
   - Kafka: use `kafka-console-consumer --topic phase2-events-dlq` to inspect,
     then `kafka-console-producer` to resend corrected records to
     `phase2-events`.
   - RabbitMQ: use `rabbitmqadmin get` to pull messages from `phase2-events-dlq`.
     Resend via `rabbitmqadmin publish` or through the governance API.
   - Pulsar: use `pulsar-client consume --subscription test --topic
phase2-events-dlq` then recreate via `pulsar-client produce`.
3. For large-scale replays, use the ingest API directly with a script or
   `java-ingest` utility rather than pushing through brokers again.

## 4. Monitoring & Alerts

- Ensure metrics for consumer lag, failed message counts, and DLQ depth are
  exposed to Prometheus (`governance.kafka.consumer.lag`,
  `governance.rabbitmq.errors`, `governance.pulsar.deadletter.count`).
- Configure Alertmanager rules to fire when any lag exceeds 10 000 or when DLQ
  depth increases unexpectedly.

## 5. Troubleshooting

- **No jobs created after broker restart**: check consumer logs for connection
  errors; verify `phase2-events` exists and the service URL/host is correct.
- **Duplicate jobs observed**: confirm `requestId` field is unique and that
  deduplication logic in `JobService` is active; inspect job records.
- **DLQ messages accumulate**: review message payloads for schema drift or
  malformed JSON; correct upstream producer or use governance API to ingest.

## 6. Documentation Links

- [DATA_ARCHITECTURE](../data/DATA_ARCHITECTURE.md)
- [ARCHITECTURE](../architecture/ARCHITECTURE.md)
- [TODO](../../TODO.md) and [ROADMAP](../../ROADMAP.md) for development status

---

Generated: March 6 2026\*
