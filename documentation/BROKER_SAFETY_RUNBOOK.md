# Broker Safety Runbook

## Overview

The COSMIC Phase-2 platform uses three broker technologies, each with a distinct
role in the event fabric. Mixing roles is a critical misconfiguration. This
document records the partitioning rules, failure modes, escalation procedures,
and operational checks for each broker.

---

## Broker Role Assignments

| Broker   | Role                  | Topic/Queue pattern | Retention | Replay? |
|----------|-----------------------|---------------------|-----------|---------|
| Kafka    | Audit log + replay    | `cosmic.audit.*`    | 7 days    | Yes     |
| RabbitMQ | Control commands      | `cosmic.control.*`  | Transient | No      |
| Pulsar   | Federated delivery    | `cosmic/ngvla/*`    | 24 h      | Via DLQ |

### Kafka — Audit / Replay

Kafka is the **append-only audit backbone**. Every `ExecutionEvent` emitted by
any service MUST also be published to Kafka for durable audit. Kafka messages
are the canonical replay source when a downstream subscriber misses an event.

**Rules:**

- Topic names: `cosmic.audit.<domain>` (e.g. `cosmic.audit.jobs`, `cosmic.audit.alerts`).
- **Never** publish ephemeral control messages to Kafka topics.
- Consumer groups MUST use explicit `group.id`; auto-created groups are forbidden.
- Message keys MUST be `{correlationId}` to enable partition affinity for
  ordered replay.
- Retention: 7 days (configurable via `retention.ms`). Do not reduce below 3 days.
- Schema: All messages MUST use the `ExecutionEvent` canonical envelope
  (schemaVersion ≥ 1.0.0).

**Failure modes:**

- **Broker unavailable:** Services continue processing; audits are queued locally
  and flushed when Kafka recovers. Maximum local queue: 10 000 events per pod.
- **Lag spike:** Alert ops if consumer lag on any audit topic exceeds 5 000 messages.
- **Replay divergence:** If a replayed message produces a different result, escalate
  to Tier-2 immediately — this signals a non-deterministic processor.

---

### RabbitMQ — Control Commands

RabbitMQ carries **low-latency, ephemeral control instructions** between services
(e.g. pause job, trigger calibration, abort observation). Messages are NOT
persisted beyond the TTL; they are fire-and-forget with mandatory ACK.

**Rules:**

- Queue names: `cosmic.control.<service>.<action>` (e.g. `cosmic.control.jobs.pause`).
- **Never** publish domain events or audit data to RabbitMQ.
- All queues MUST be declared with `x-message-ttl: 30000` (30 s) to prevent accumulation.
- Consumers MUST ACK within 10 s or the message is requeed once, then dropped.
- Control messages do NOT require `correlationId` in the routing key, but SHOULD
  include it in the message headers for traceability.
- Dead-letter exchange: `cosmic.control.dlx`; DLQ: `cosmic.control.dead`.

**Failure modes:**

- **Connection refused:** Backend services enter degraded mode; control
  commands are rejected with HTTP 503 until the connection is restored.
- **DLQ accumulation:** If `cosmic.control.dead` depth exceeds 100 messages, alert
  Tier-1 ops. Messages in the DLQ expire after 1 hour and are discarded.
- **Split brain:** If two consumers process the same control command, the idempotency
  key in the header (`X-Idempotency-Key`) MUST be checked. Duplicate commands are
  logged and ignored.

---

### Pulsar — Federated Delivery

Pulsar handles **multi-tenant, geographically federated event delivery** for
cross-site telescope coordination (NGVLA, MeerKAT, SKA). Messages are delivered
with at-least-once semantics via Pulsar's built-in geo-replication.

**Rules:**

- Tenant/namespace: `cosmic/ngvla`, `cosmic/meerkat`, `cosmic/ska`.
- Topic names: `persistent://cosmic/<tenant>/<domain>` (e.g.
   `persistent://cosmic/ngvla/observations`).
- **Never** use Pulsar for administrative control commands; use RabbitMQ.
- Schema enforcement: Activate `SchemaType.JSON` with Avro backward-compatibility.
- Partitioned topics MUST be used for throughput > 5 000 msg/s per topic.
- Acknowledgement timeout: 60 s. Unacknowledged messages go to the Pulsar DLQ
  topic (`<topic>-DLQ`) after 3 redelivery attempts.

**Failure modes:**

- **Geo-replication lag:** Alert if replication backlog exceeds
  10 000 messages per namespace. This indicates a cross-site network issue.
- **DLQ overflow:** Inspect `<topic>-DLQ` topics daily. Replay via the
  `POST /api/v1/alerts/dlq/replay-all` endpoint after root-cause analysis.
- **Schema incompatibility:** Pulsar will reject messages that violate the registered
  schema. Deployments MUST validate schema compatibility in CI before merging.

---

## Correlation ID Contract

Every `ExecutionEvent` carries a `correlationId` that MUST be propagated:

```text
Producer         →   Kafka audit   →   Audit consumer
     ↓                                         ↓
     └── RabbitMQ control ────────→   Control consumer
     ↓                                         ↓
     └── Pulsar delivery  ────────→   Federated consumer
                                               ↓
                                      TransientAlertService.ingest(correlationId=…)
```

**Invariants:**

1. `correlationId` is generated once (UUID v4) by the originating service.
2. `correlationId` MUST pass unchanged through every hop.
3. Consumers MUST log `correlationId` on every line related to that event.
4. The `CorrelationPropagationTest` integration test enforces these
   invariants in CI.

---

## Escalation Matrix

| Severity | Condition                          | Action              |
|----------|------------------------------------|---------------------|
| P1       | Kafka unavailable > 1 min          | Page on-call SRE    |
| P1       | RabbitMQ DLX depth > 500           | Page on-call SRE    |
| P1       | Pulsar geo-replication lag > 10000 | Isolate site; page  |
| P2       | Kafka consumer lag > 5000          | Alert Tier-1 in 15m |
| P2       | Alert SLO p99 latency > 500 ms     | Alert Tier-1 in 15m |
| P3       | `cosmic.control.dead` depth > 100  | Next business hour  |
| P3       | Alert DLQ depth > 50               | Trigger replay-all  |

---

## Operational Runbook Steps

### Replay alerts from DLQ

```bash
# Check current DLQ depth
curl -s http://localhost:8080/api/v1/alerts/slo | jq '.dlqDepth'

# List DLQ contents
curl -s http://localhost:8080/api/v1/alerts/dlq | jq '.[].eventType'

# Replay all DLQ alerts
curl -s -XPOST http://localhost:8080/api/v1/alerts/dlq/replay-all

# Replay a specific alert by ID
curl -s -XPOST http://localhost:8080/api/v1/alerts/dlq/replay/<alertId>
```

### Drain Kafka audit lag

```bash
# Check consumer group lag
kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
  --group cosmic-audit-consumer --describe

# Reset offset to latest (emergency drain — loses unprocessed events)
# ⚠️ Only do this with Tier-2 approval
kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
  --group cosmic-audit-consumer --reset-offsets --to-latest \
  --topic cosmic.audit.jobs --execute
```

### Inspect RabbitMQ DLQ

```bash
# Via management UI: http://localhost:15672  (guest/guest in dev)
# Via CLI:
rabbitmqadmin list queues name messages
rabbitmqadmin get queue=cosmic.control.dead count=10
```

### Pulsar DLQ inspection

```bash
# List DLQ backlog for ngvla observations
pulsar-admin topics stats \
  persistent://cosmic/ngvla/observations-DLQ

# Replay DLQ via subscription seek
pulsar-admin topics reset-cursor \
  persistent://cosmic/ngvla/observations-DLQ \
  --subscription dlq-consumer --time 1h
```

---

## Change History

| Date       | Author          | Change                                      |
|------------|-----------------|---------------------------------------------|
| 2025-01-01 | Platform Team   | Initial broker role partitioning document   |
