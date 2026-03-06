<!-- markdownlint-disable MD013 -->

# Event Envelope and Broker Roles

Alignment anchors

- Frontend UX source of truth: [FRONTEND_UI.md](/docuentation/frontend/FRONTEND_UI.md)
- Execution backlog: [../TODO.md](/docuentation/planning/TODO.md)
- Delivery plan: [../ROADMAP.md](/ROADMAP.md)

## Purpose

Define a stable event envelope and clear broker role boundaries for Cosmic Horizon as it evolves toward an ngVLA-aligned execution layer with Trident-style control flows.

This document translates useful patterns from the original `JeffreySanford/cosmic-horizon` repo into the terminology and scope of this workspace.

## Event Envelope

All cross-service events should use one common envelope regardless of whether the payload is transported by RabbitMQ, Kafka, or Pulsar.

```json
{
  "event_id": "uuid",
  "event_type": "string",
  "timestamp": "2026-03-06T12:00:00Z",
  "correlation_id": "uuid",
  "schema_version": 1,
  "source": "service-name",
  "payload": {},
  "idempotency_key": "optional-string",
  "parent_event_id": "optional-uuid",
  "tags": ["optional", "labels"]
}
```

## Required Fields

- `event_id`
  - unique identifier for dedupe, replay tracking, and audit joins
- `event_type`
  - contract discriminator used for routing and consumer handling
- `timestamp`
  - canonical event creation time in ISO 8601 UTC
- `correlation_id`
  - ties scheduling, execution, backend, and archive steps together
- `schema_version`
  - allows additive evolution and compatibility checks
- `source`
  - producing service identity
- `payload`
  - event-specific object

## Optional Fields

- `idempotency_key`
  - producer-side duplicate suppression and consumer reconciliation
- `parent_event_id`
  - explicit lineage across chained state transitions
- `tags`
  - labels for priority, subarray, observing mode, or operator workflow

## Broker Role Partitioning

### RabbitMQ

Use RabbitMQ for low-latency control-plane interactions:

- execution triggers
- apply and ack loops
- operator commands
- bounded retries
- urgent control feedback

Typical event examples:

- `execution-block.created`
- `trident-routing.requested`
- `trident-configuration.applied`
- `operator-override.recorded`

### Kafka

Use Kafka for durable and replayable observatory event history:

- planning decisions
- state transitions
- provenance events
- audit streams
- downstream analytics inputs

Typical event examples:

- `spectral-configuration.validated`
- `fsp-allocation.planned`
- `backend-product-plan.created`
- `provenance-record.materialized`

### Pulsar

Use Pulsar for federated, commensal, or mixed queue/stream workflows:

- shared science-team products
- external-consumer namespaces
- cross-site subscription isolation
- hybrid queue and stream delivery

Typical event examples:

- downstream partner subscriptions
- commensal observing products
- product delivery feeds needing tenant isolation

## Control Rules

- Do not let one event bounce cyclically across all brokers.
- RabbitMQ should favor immediacy over long retention.
- Kafka should remain the replay baseline for critical execution and provenance history.
- Pulsar use should stay bounded to workflows that actually benefit from tenant or hybrid semantics.

## Compatibility Rules

- New event versions must be additive unless a migration plan is documented.
- Consumers must reject unknown mandatory payload fields only when strict validation is explicitly required.
- All mission-critical events should carry `correlation_id`.
- All side-effecting consumers should use `event_id` or `idempotency_key` to prevent duplicate state changes.

## Initial Event Families

- scheduling
  - `schedule-block.accepted`
  - `execution-block.created`
- spectral and routing
  - `spectral-configuration.validated`
  - `trident-routing.requested`
  - `trident-routing.applied`
- allocation
  - `trident-capacity.checked`
  - `fsp-allocation.planned`
  - `fsp-allocation.rejected`
- backend and archive
  - `backend-product-plan.created`
  - `cbe-processing.started`
  - `archive-staging.completed`
- reliability and governance
  - `execution-degraded.detected`
  - `execution-replay.requested`
  - `operator-override.recorded`

## Why This Matters

This repo is moving from prototype orchestration toward a more realistic observatory execution model. That requires:

- deterministic routing semantics
- replay-safe lifecycle tracking
- provenance across configuration and backend processing
- explicit broker ownership boundaries

Without that, Trident-inspired execution work will become a set of isolated job handlers rather than a coherent control plane.

## Source Provenance

Translated from patterns reviewed in:

- `C:\Users\Sanford\AppData\Local\Temp\cosmic-horizon-doc-source\documentation\architecture\core\EVENT-SCHEMA-DEFINITIONS.MD`
- `C:\Users\Sanford\AppData\Local\Temp\cosmic-horizon-doc-source\documentation\architecture\brokers\NGVLA-TRI-BROKER-REFERENCE-ARCHITECTURE.MD`
- `C:\Users\Sanford\AppData\Local\Temp\cosmic-horizon-doc-source\documentation\architecture\integration\COSMICAI-INTEGRATION-OVERLAY.MD`

<!-- markdownlint-enable MD013 -->
