<!-- markdownlint-disable MD013 -->

# Execution Layer API Sketch

Alignment anchors

- Frontend UX source of truth: [FRONTEND_UI.md](/docuentation/frontend/FRONTEND_UI.md)
- Execution backlog: [../TODO.md](/docuentation/planning/TODO.md)
- Delivery plan: [../ROADMAP.md](/ROADMAP.md)

## Purpose

Define a minimal API surface for the execution layer that translates schedule intent into validated configuration, allocation, apply, and downstream backend startup actions.

This is an evolution of the original remote-compute gateway idea. The older repo centered on generic compute jobs; this repo needs observatory execution semantics.

## API Design Principles

- prefer typed execution plans over generic job submission
- separate validation from apply
- expose resource-capacity state directly
- keep every apply path correlation-safe and auditable
- return enough state for frontend operator views and backend automation

## Core Resources

- `schedule-block`
- `execution-block`
- `subarray-configuration`
- `spectral-configuration`
- `execution-plan`
- `backend-product-plan`

## Endpoints

### `GET /api/v1/execution/capabilities`

Returns current execution-layer capabilities:

- available tridents or simulated execution targets
- available FSP capacity by target
- supported observing modes
- backend product modes supported by the current environment
- current reservations or degraded states

### `POST /api/v1/execution/plans`

Creates a proposed execution plan from scheduling intent.

Request body should include:

- `scheduleBlockId`
- `executionWindow`
- `subarray`
- `spectralConfiguration`
- `observingMode`
- `priority`

Response should include:

- `executionPlanId`
- validation summary
- capacity decision
- allocation summary
- backend product summary

### `GET /api/v1/execution/plans/{id}`

Returns:

- plan summary
- current lifecycle status
- allocation details
- last apply result
- provenance links

### `POST /api/v1/execution/plans/{id}/validate`

Runs full validation without applying configuration.

Validation should cover:

- spectral compatibility
- subarray constraints
- target capacity
- backend readiness
- mode-specific guardrails

### `POST /api/v1/execution/plans/{id}/apply`

Applies the execution plan.

Request body should include:

- operator identity
- requested apply time
- optional override metadata

Response should include:

- accepted or rejected decision
- correlation id
- apply-state transition summary

### `GET /api/v1/execution/plans/{id}/events`

Returns replayable event history for the plan:

- validation
- capacity checks
- apply attempts
- degraded states
- backend start/finish
- archive handoff

## Example Request Sketch

```json
{
  "scheduleBlockId": "sb-2026-03-06-001",
  "executionWindow": {
    "start": "2026-03-06T12:00:00Z",
    "end": "2026-03-06T12:45:00Z"
  },
  "subarray": {
    "id": "sa-main-01",
    "antennaIds": ["ea001", "ea002", "ea003"]
  },
  "spectralConfiguration": {
    "receiverBand": "band-3",
    "mode": "spectral-line",
    "zoomEnabled": true,
    "channelCount": 16384,
    "targetChannelWidthHz": 220.0
  },
  "observingMode": "correlation"
}
```

## Example Response Sketch

```json
{
  "executionPlanId": "ep-001",
  "status": "VALIDATED",
  "capacityDecision": {
    "accepted": true,
    "target": "trident-2"
  },
  "allocationSummary": {
    "fspCount": 8,
    "zoomEnabled": true
  },
  "backendProductPlan": {
    "products": ["measurement-set"]
  }
}
```

## Evolution Notes

This API intentionally follows the shape of a small remote-compute gateway API from the original repo, but with observatory-specific changes:

- `job submission` becomes `execution plan creation`
- `job status` becomes `execution lifecycle and apply status`
- `capabilities` expands from compute modes to Trident/FSP/backend readiness

## Source Provenance

Translated from:

- `C:\Users\Sanford\AppData\Local\Temp\cosmic-horizon-doc-source\documentation\api\remote-compute-gateway.openapi.yaml`
- `C:\Users\Sanford\AppData\Local\Temp\cosmic-horizon-doc-source\documentation\architecture\core\EVENT-SCHEMA-DEFINITIONS.MD`

<!-- markdownlint-enable MD013 -->
