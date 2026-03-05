# RabbitMQ Messaging Plan (Phase 2)

Alignment anchors

- Frontend UX source of truth: [../FRONTEND_UI.md](/docuentation/frontend/FRONTEND_UI.md)
- Execution backlog: [../../TODO.md](/docuentation/planning/TODO.md)
- Delivery plan: [../../ROADMAP.md](/ROADMAP.md)

## Role in platform

- RabbitMQ handles control-plane command patterns (submit/cancel/retry/orchestration events).
- RabbitMQ is for command/control reliability and routing, not bulk telemetry throughput.
- Critical control events are mirrored to Kafka audit topics for traceability.

## Queueing model (accepted)

- Dynamic queue provisioning per workflow.
- Naming convention: `workflow.<workflowId>.commands`.
- Include queue lifecycle policy for cleanup/expiry of inactive workflow queues.

Related decision records:

- [DECISIONS.md](/docuentation/architecture/DECISIONS.md) (`ADR-003`, `ADR-004`)

## Runtime behavior

- Enabled by default in local normal Docker deployment.
- Must participate in global footer stress profile scaling (`10%`, `25%`, `50%`, `100%`).
- `100%` runs as bounded burst for 3 minutes and auto-reverts to `10%`.

## Required tests

Unit:

- queue naming/routing-key generation
- dynamic provisioning and cleanup policy logic
- profile scaling behavior for command flow rates

Integration:

- publish command to RabbitMQ -> governance transition applied
- mirror path verified in Kafka audit topic
- broker restart/recovery behavior for in-flight commands

E2E:

- Topology view renders RabbitMQ node and queue-depth/ack metrics
- Visualization view renders RabbitMQ queue depth, delivery/ack/nack, and consumer utilization
- source-state labels shown correctly for RabbitMQ-backed cards
