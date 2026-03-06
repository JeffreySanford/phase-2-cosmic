<!-- markdownlint-disable MD013 -->

# Trident Execution Events and API Sketch

Date: 2026-03-06

## Purpose

Adapt useful orchestration patterns from the external `JeffreySanford/cosmic-horizon` repository into a Trident-specific execution model for this repo.

This note is informed by:

- `EVENT-SCHEMA-DEFINITIONS.MD`
- `NGVLA-TRI-BROKER-REFERENCE-ARCHITECTURE.MD`
- `COSMICAI-INTEGRATION-OVERLAY.MD`
- `remote-compute-gateway.openapi.yaml`

It is also grounded in the Trident research already added in this folder.

## Design Goal

Move from generic "submit a job" semantics to a typed execution layer that can:

- validate schedule-block intent
- construct spectral configuration
- allocate VCC/FSP resources
- apply configuration to a Trident-like backend
- start the right downstream backend processing path
- retain replayable provenance from plan to archive staging

## Recommended Event Envelope

Use one envelope shape for RabbitMQ, Kafka, and Pulsar payloads:

```json
{
  "event_id": "uuid",
  "event_type": "string",
  "timestamp": "2026-03-06T12:00:00Z",
  "correlation_id": "uuid",
  "schema_version": 1,
  "source": "governance.execution-layer",
  "payload": {},
  "idempotency_key": "optional-string",
  "parent_event_id": "optional-uuid",
  "tags": ["optional", "labels"]
}
```

## Recommended Broker Roles

- RabbitMQ
  - low-latency control actions
  - configuration apply and ack loops
  - operator escalation and retry triggers
- Kafka
  - durable execution history
  - replayable status changes
  - provenance and audit timeline
- Pulsar
  - commensal or cross-team downstream products
  - hybrid queue/stream delivery for external consumers

## Event Set

### Planning and validation

- `schedule-block.accepted`
- `execution-block.created`
- `subarray-configuration.proposed`
- `spectral-configuration.validated`
- `trident-capacity.checked`
- `fsp-allocation.planned`
- `fsp-allocation.rejected`

### Apply path

- `trident-routing.requested`
- `trident-routing.applied`
- `trident-configuration.requested`
- `trident-configuration.applied`
- `trident-configuration.failed`

### Downstream path

- `backend-product-plan.created`
- `cbe-processing.requested`
- `cbe-processing.started`
- `cbe-processing.failed`
- `archive-staging.requested`
- `archive-staging.completed`

### Governance and audit

- `operator-override.recorded`
- `execution-degraded.detected`
- `execution-replay.requested`
- `provenance-record.materialized`

## Example Payload Sketches

### `spectral-configuration.validated`

```json
{
  "event_type": "spectral-configuration.validated",
  "payload": {
    "schedule_block_id": "sb-001",
    "execution_block_id": "eb-001",
    "subarray_id": "sa-main-01",
    "receiver_band": "band-3",
    "mode": "spectral-line",
    "zoom_enabled": true,
    "slice_count": 8,
    "slice_ids": ["s01", "s02", "s03", "s04", "s05", "s06", "s07", "s08"],
    "channel_count": 16384,
    "target_channel_width_hz": 220.0
  }
}
```

### `fsp-allocation.planned`

```json
{
  "event_type": "fsp-allocation.planned",
  "payload": {
    "execution_block_id": "eb-001",
    "trident_id": "trident-2",
    "mode": "spectral-line",
    "allocation": [
      {
        "fsp_id": "fsp-021",
        "slice_id": "s01",
        "subarray_id": "sa-main-01",
        "zoom_enabled": true
      },
      {
        "fsp_id": "fsp-022",
        "slice_id": "s02",
        "subarray_id": "sa-main-01",
        "zoom_enabled": true
      }
    ]
  }
}
```

### `backend-product-plan.created`

```json
{
  "event_type": "backend-product-plan.created",
  "payload": {
    "execution_block_id": "eb-001",
    "products": [
      {
        "type": "measurement-set",
        "mode": "spectral-line",
        "destination": "cbe-cluster-a"
      },
      {
        "type": "psrfits",
        "mode": "pulsar-timing",
        "destination": "cbe-cluster-b"
      }
    ]
  }
}
```

## API Sketch

The external repo's remote-compute gateway API shape is a good starting pattern. For Trident integration, adapt it like this:

### `GET /api/v1/trident/capabilities`

Return:

- available tridents
- FSP capacity by trident
- supported modes
- current reservations
- current spectral-configuration constraints

### `POST /api/v1/trident/execution-plans`

Accept:

- schedule-block reference
- execution timing
- subarray membership
- spectral configuration
- requested observing mode

Return:

- execution plan id
- validation result
- capacity decision
- downstream product-plan summary

### `GET /api/v1/trident/execution-plans/{id}`

Return:

- current status
- last applied routing/configuration step
- allocator decision summary
- backend startup state
- provenance links

### `POST /api/v1/trident/execution-plans/{id}/apply`

Accept:

- operator identity
- optional override flags
- apply time

Return:

- accepted or rejected
- generated correlation id
- apply-state transition summary

## Why This Belongs in This Repo

These patterns came from the external repo, but they fit this workspace better when rewritten around:

- schedule blocks and execution blocks
- spectral configuration
- VCC/FSP allocation
- Trident routing
- CBE and archive fan-out

That turns prior generic orchestration work into a Trident-specific execution-layer design artifact.

## Source Provenance

External repo source location used for this translation:

- `C:\Users\Sanford\AppData\Local\Temp\cosmic-horizon-doc-source`

Specific files reviewed:

- `documentation/architecture/integration/COSMICAI-INTEGRATION-OVERLAY.MD`
- `documentation/architecture/brokers/NGVLA-TRI-BROKER-REFERENCE-ARCHITECTURE.MD`
- `documentation/architecture/core/EVENT-SCHEMA-DEFINITIONS.MD`
- `documentation/api/remote-compute-gateway.openapi.yaml`

<!-- markdownlint-enable MD013 -->
