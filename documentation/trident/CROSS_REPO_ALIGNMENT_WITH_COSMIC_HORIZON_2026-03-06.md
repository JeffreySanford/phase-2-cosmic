<!-- markdownlint-disable MD013 -->

# Cross-Repo Alignment with `JeffreySanford/cosmic-horizon`

Date: 2026-03-06

## Purpose

Capture the documentation from the external `JeffreySanford/cosmic-horizon` repository that is worth carrying into this repo's Trident work, without copying unrelated legacy or prototype material wholesale.

## Recommendation

Yes, some of that repo's documentation is worth including here, but only in curated form.

What should be reused:

- execution-layer event patterns
- tri-broker role boundaries
- remote-compute gateway API shape ideas
- deterministic orchestration and audit expectations

What should not be copied as-is:

- generic product-charter material
- legacy sprint bookkeeping
- implementation details tied to the other repo's module names or feature history
- claims that are not specific to this repo's ngVLA/Trident direction

## External Repo Documents Reviewed

The following documents were reviewed from `C:\Users\Sanford\AppData\Local\Temp\cosmic-horizon-doc-source`:

1. `documentation/architecture/integration/COSMICAI-INTEGRATION-OVERLAY.MD`
2. `documentation/architecture/brokers/NGVLA-TRI-BROKER-REFERENCE-ARCHITECTURE.MD`
3. `documentation/architecture/core/EVENT-SCHEMA-DEFINITIONS.MD`
4. `documentation/api/remote-compute-gateway.openapi.yaml`

## What Is Worth Importing

### 1. Tri-broker role partitioning

The external repo had a clean and reusable split:

- RabbitMQ for control-plane orchestration
- Kafka for durable and replayable scientific events
- Pulsar for federated or multi-tenant workflows

This maps well to Trident integration in this repo:

- RabbitMQ: timed control actions, hardware apply/ack, operator escalation
- Kafka: durable execution history, provenance, replayable planning and status
- Pulsar: commensal or partner-facing downstream product streams

### 2. Stable event-envelope discipline

The external repo's event-schema doc used a consistent base event shape with:

- `event_id`
- `event_type`
- `timestamp`
- `correlation_id`
- `schema_version`
- `payload`
- optional idempotency and parent-link metadata

This should be adopted for Trident-style execution events in this repo because:

- resource allocation and timed apply operations need replay-safe identifiers
- backend product fan-out needs correlation across multiple systems
- provenance is materially stronger when every step shares one envelope

### 3. Remote-compute gateway API framing

The external repo's OpenAPI sketch was intentionally small:

- capability query
- submit operation
- status lookup

That minimal shape is useful here, but Trident integration needs richer semantics than generic job submission. The interface pattern is still valuable:

- a capabilities endpoint for current Trident/FSP capacity
- a submit/apply endpoint for validated execution plans
- a status endpoint for applied configuration and downstream backend state

### 4. Deterministic orchestration before AI or advanced automation

The CosmicAI integration overlay emphasized preparing stable orchestration points before docking more advanced agent logic. That is a strong fit here. Trident simulation should first establish:

- stable payloads
- deterministic control transitions
- replayable status traces
- explicit human override and audit events

Only after that should this repo add more autonomous planning logic.

## What I Added to This Repo Because of That Review

This cross-repo review resulted in the following local documents:

- `TRIDENT_EXECUTION_EVENTS_AND_API_SKETCH_2026-03-06.md`
- the earlier Trident research notes in this folder

These local docs are better than copying the other repo verbatim because they:

- keep ngVLA/Trident scope explicit
- remove unrelated prototype terminology
- map the patterns directly into this workspace's current documentation set

## Suggested Ongoing Import Rule

When material from the external `cosmic-horizon` repo is useful, import it by translation rather than by copy-paste:

1. identify the reusable idea
2. restate it in current repo terminology
3. attach source provenance
4. mark any assumptions or changed semantics

That keeps this repo coherent while still preserving the value of prior work.

<!-- markdownlint-enable MD013 -->
