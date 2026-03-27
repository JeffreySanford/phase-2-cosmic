# Branch Enablement

Alignment anchors

- Overview: [./OVERVIEW.md](./OVERVIEW.md)
- Implementation plan: [./IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)
- Docker environment: [./DOCKER_ENVIRONMENT.md](./DOCKER_ENVIRONMENT.md)
- SSR proxy: [./SSR_PROXY_SPEC.md](./SSR_PROXY_SPEC.md)
- AI prompts: [./AI_BUILD_KIT.md](./AI_BUILD_KIT.md)

Status: `planned`

## Purpose

This document converts the Cosmic Forge branch from "good idea with architecture docs" into an executable branch-enablement package.

It answers one practical question:

What must exist before the `feature/cosmic-forge-image-orchestrator` branch can move from documentation into active implementation?

## Branch contract

Cosmic Forge is enabled only if all of the following remain true:

- it stays inside `phase-2-cosmic`
- it remains a bounded branch track
- it does not rewrite the current Java/OpenAPI governance truth
- it uses the root `.env` for local development
- it uses the Forge-specific Docker environment for Forge runtime work
- it treats GraphQL, NgRx, and .NET as branch-scoped choices

## Required docs present

The following docs must exist and remain current:

- `README.md`
- `OVERVIEW.md`
- `PUBLIC_DATA_READINESS.md`
- `PRODUCT_BLUEPRINT.md`
- `ARCHITECTURE.md`
- `GRAPHQL_CONTRACT_DRAFT.md`
- `NGRX_STATE_BLUEPRINT.md`
- `IMPLEMENTATION_PLAN.md`
- `DOCKER_ENVIRONMENT.md`
- `SSR_PROXY_SPEC.md`
- `AI_BUILD_KIT.md`

## Required local runtime baseline

These are now present and should remain the baseline:

- Forge compose file: `docker/cosmic-forge-compose.yml`
- Forge helper scripts:
  - `scripts/cosmic-forge-up.sh`
  - `scripts/cosmic-forge-down.sh`
- Placeholder runtime services:
  - `apps/cosmic-forge-api`
  - `apps/cosmic-forge-worker`

## Required next implementation gates

### Gate 1: branch hygiene

- create and use `feature/cosmic-forge-image-orchestrator`
- keep Forge changes isolated from unrelated repo cleanup
- do not silently alter `docker/dev-compose.yml` semantics

### Gate 2: SSR routing

- add Forge base URL env handling
- proxy `/api/forge/*` through the SSR shim
- keep Forge metrics separate from governance proxy metrics

### Gate 3: UI route reservation

- reserve `/forge` route in Angular
- add a placeholder or shell view
- keep Forge UX isolated from current jobs/datasets routes

### Gate 4: API replacement

- replace placeholder API with real GraphQL service
- keep contract aligned with `GRAPHQL_CONTRACT_DRAFT.md`

### Gate 5: worker replacement

- replace placeholder worker with bounded-concurrency execution
- keep provenance and source attribution mandatory

## Acceptance checklist

- Forge stack starts without stopping the main Phase 2 stack
- Forge API health endpoint is reachable
- Forge worker health endpoint is reachable
- SSR proxy design is documented before GraphQL wiring begins
- a future `/forge` view is accounted for in docs before UI implementation starts
- branch-scoped stack and repo-wide stack are clearly distinguished in docs

## Failure modes to avoid

- adding Forge routes under `/api/v1/*`
- making Pulsar/Kafka/RabbitMQ implicit Forge requirements
- letting Forge container naming collide with the main compose project
- replacing current governance semantics without an explicit decision record
