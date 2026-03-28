# Worker Execution Spec

Alignment anchors

- API contract: [./GRAPHQL_CONTRACT_DRAFT.md](./GRAPHQL_CONTRACT_DRAFT.md)
- Persistence model: [./PERSISTENCE_PLAN.md](./PERSISTENCE_PLAN.md)
- Architecture: [./ARCHITECTURE.md](./ARCHITECTURE.md)
- PI execution plan: [./PI_EXECUTION_PLAN.md](./PI_EXECUTION_PLAN.md)

Status: `implemented`

## Purpose

This document describes the Forge worker execution seam that turns the queue from a timer placeholder into a bounded-concurrency execution loop.

## Current worker contract

Internal worker endpoints:

- `POST /internal/worker/claim-next`
- `POST /internal/worker/jobs/:jobId/execute`
- `POST /internal/worker/execute-next`

Current contract version:

- `forge-worker.v1`

`execute-next` remains as a compatibility seam, but the primary worker flow is now:

1. claim the next queued job
2. mark it `RUNNING`
3. execute the adapter path
4. publish either `COMPLETED`, `FAILED`, or preserved `CANCELLED`

## Queue lifecycle semantics

Forge queue states remain:

- `QUEUED`
- `RUNNING`
- `COMPLETED`
- `FAILED`
- `CANCELLED`

The worker/API pair now treat those states as explicit lifecycle transitions rather than placeholder progress ticks.

## Progress semantics

Progress is now phase-oriented:

- `10%`
  - worker claimed the job
- `45%`
  - provider execution started
- `70%`
  - derived preview generation started
- `85%`
  - artifact persistence/cache retention started
- `100%`
  - terminal success

Composite jobs extend those phases with:

- `35%`
  - multi-input preparation started
- `70%`
  - composite assembly started
- `100%`
  - composite preview artifact published

This is intentionally coarse-grained. It gives the UI meaningful queue movement without pretending to expose sub-provider internals that Forge does not control.

## Failure classification

The worker path now distinguishes:

- `FORGE_VALIDATION_ERROR`
- `FORGE_UPSTREAM_UNAVAILABLE`
- `FORGE_UPSTREAM_TIMEOUT`
- `FORGE_UPSTREAM_BAD_RESPONSE`
- `FORGE_INTERNAL_ERROR`

This keeps retry behavior and operator diagnosis aligned with the actual failure mode.

## Retry and cancellation

Retry:

- allowed from `FAILED` and `CANCELLED`
- clears error state
- rebuilds the normalized request
- preserves auditability through persisted job events

Cancellation:

- guaranteed for `QUEUED`
- cooperative for `RUNNING`
- if a running job is cancelled, the worker does not publish completion artifacts after cancellation is recorded

## Worker health expectations

The worker health response now includes more than `ok`:

- `workerId`
- `contractVersion`
- `forgeApiUrl`
- `pollIntervalMs`
- `maxConcurrency`
- `activeJobIds`
- `activeExecutionCount`
- `lastExecutionAt`
- `lastExecutionDurationMs`
- `lastClaimAt`
- `lastClaimedJobId`
- `totalClaims`
- `totalCompletions`
- `totalFailures`
- `lastExecutionError`

## Current persistence posture

The worker does not keep authoritative queue state in process memory.

Authoritative state is persisted through the Forge state repository, which currently uses a file-backed local store as the Sprint 3 and Sprint 4 baseline. That is still a local-development persistence seam, not the final multi-process production store.

## Test posture

Current automated coverage includes:

- API/store unit coverage for claim -> execute -> complete
- API/store unit coverage for fail -> retry
- API/store unit coverage for running-job cancellation preserving `CANCELLED`
- worker unit coverage for bounded-concurrency health details
- Forge e2e coverage for cancel and retry from the UI shell
- API/store coverage for composite creation and completion
- GraphQL contract coverage for diagnostics, metrics, and composite mutation behavior
