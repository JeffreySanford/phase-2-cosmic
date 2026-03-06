<!-- markdownlint-disable MD013 -->

# Trident Execution Test Matrix

Alignment anchors

- Frontend UX source of truth: [FRONTEND_UI.md](/docuentation/frontend/FRONTEND_UI.md)
- Execution backlog: [../TODO.md](/docuentation/planning/TODO.md)
- Delivery plan: [../ROADMAP.md](/ROADMAP.md)

## Purpose

Define the initial validation matrix for execution-layer features that simulate Trident-style scheduling, allocation, apply, and downstream backend orchestration.

This adapts the spirit of the original repo's remote-compute test matrix to the current mission and control-plane model.

## Test Areas

### 1. Contract validation

- execution plan request accepts valid schedule-block and spectral payloads
- invalid spectral configurations are rejected with actionable errors
- incompatible subarray definitions are rejected
- unsupported observing modes fail deterministically

## 2. Allocation behavior

- valid continuum-style plans allocate non-zoom FSPs
- valid spectral-line plans allocate zoom-enabled FSPs
- mixed subarray demand respects independent FSP configuration rules
- over-capacity requests fail before apply
- degraded-capacity targets produce stable fallback or rejection behavior

## 3. Apply path

- validated plans transition to applied state when capacity is available
- duplicate apply calls are idempotent
- correlation ids remain stable across retries
- operator override paths are audited

## 4. Downstream backend orchestration

- correlation mode creates the expected measurement-set style product plan
- VLBI mode creates the expected beam/stream plan
- pulsar timing mode creates the expected pulsar product plan
- backend startup failure leaves the execution plan in a recoverable state

## 5. Eventing and provenance

- RabbitMQ carries low-latency apply and ack events
- Kafka retains replayable execution history
- provenance records link schedule block, execution block, spectral config, and backend outputs
- event replay does not create duplicate state transitions

## 6. Frontend operator behavior

- capabilities and execution-plan status render degraded states clearly
- validation errors are distinguishable from transport failures
- lineage and provenance surfaces expose execution identifiers and timestamps

## Suggested Automated Coverage

### Unit

- allocator logic
- mode validation
- idempotency helpers
- event-envelope serializers

### Integration

- API validation to service-layer orchestration
- broker publish/consume behavior
- provenance persistence
- backend product-plan creation

### End-to-end

- schedule intent to validated plan
- validated plan to applied state
- applied state to backend startup
- degraded or failed path with operator-visible status

## Minimum Acceptance Gates

- every execution-mode path has at least one successful integration test
- every rejection path emits deterministic error codes
- replay or duplicate delivery does not produce double allocation
- provenance is attached to all successful apply flows

## Proposed Matrix Table

| Area | Scenario | Expected Result | Evidence |
| --- | --- | --- | --- |
| Validation | invalid spectral zoom width | request rejected | API/integration test |
| Allocation | spectral-line request fits capacity | FSP allocation planned | allocator test |
| Allocation | request exceeds target FSP capacity | rejection before apply | allocator test |
| Apply | duplicate apply command | no duplicate side effects | integration test |
| Backend | correlation mode | measurement-set plan created | integration/e2e |
| Backend | pulsar mode | pulsar product plan created | integration/e2e |
| Provenance | successful apply | provenance record emitted | integration/e2e |
| Replay | duplicated Kafka event | state unchanged after dedupe | integration test |

## Source Provenance

Translated from:

- `C:\Users\Sanford\AppData\Local\Temp\cosmic-horizon-doc-source\documentation\testing\remote-compute-test-matrix.md`
- `C:\Users\Sanford\AppData\Local\Temp\cosmic-horizon-doc-source\documentation\architecture\core\EVENT-SCHEMA-DEFINITIONS.MD`

<!-- markdownlint-enable MD013 -->
