# Implementation Plan

Alignment anchors

- Architecture: [./ARCHITECTURE.md](./ARCHITECTURE.md)
- Product scope: [./PRODUCT_BLUEPRINT.md](./PRODUCT_BLUEPRINT.md)
- Docker environment: [./DOCKER_ENVIRONMENT.md](./DOCKER_ENVIRONMENT.md)
- Docker/local-dev context: [../infra/INFRA_TOPOLOGY.md](../infra/INFRA_TOPOLOGY.md)
- Program guardrails: [../overview/PROGRAM_DIRECTION.md](../overview/PROGRAM_DIRECTION.md)

Status: `planned`

## Naming

- branch: `feature/cosmic-forge-image-orchestrator`
- app family: `cosmic-forge-ui`, `cosmic-forge-api`
- optional worker: `cosmic-forge-worker`
- Docker environment: `docker/cosmic-forge-compose.yml`
- helper scripts: `scripts/cosmic-forge-up.sh`, `scripts/cosmic-forge-down.sh`

## Local environment decision

Cosmic Forge should use the repository root `.env` for local secrets and settings.

It should have a new Docker environment that can run alongside the existing `docker/dev-compose.yml`, not replace it.

Working rule:

- existing compose stack remains current repo baseline
- Forge compose stack is additive and bounded
- shared infra may be reused where practical
- Forge-specific services must not assume Pulsar/Kafka/RabbitMQ are required for v1

## Recommended Forge Docker shape

Base Forge services:

- `cosmic-forge-api`
- `cosmic-forge-worker`
- `postgres` or lightweight metadata store

Preferred reused services from current environment:

- `minio`
- `redis`
- `prometheus`
- `grafana`

Optional only if needed later:

- `kafka`
- `rabbitmq`
- `pulsar`

## Vertical slices

### Slice 1: scaffold and docs lock

- create branch
- add Forge docs
- define Docker environment and env-loading rules
- freeze GraphQL and NgRx blueprints

Acceptance:

- no unresolved branch/app naming
- no unresolved local-env decision

### Slice 2: API + worker skeleton

- create `cosmic-forge-api`
- create `cosmic-forge-worker`
- implement health endpoints
- wire artifact storage and metadata persistence
- route Forge traffic through SSR with a branch-scoped path

Acceptance:

- Forge services start in side-by-side Docker environment
- root `.env` values are honored
- SSR routing approach is fixed before GraphQL wiring begins

### Slice 3: jobs vertical slice

- create cutout job
- queue and worker execution
- persisted job state
- progress updates

Acceptance:

- end-to-end create/queue/run/fail/complete lifecycle exists

### Slice 4: first survey adapter

- implement one real public survey adapter
- retrieve metadata
- create preview artifact
- store provenance

Acceptance:

- real public-data-backed image result exists

### Slice 5: UI workbench

- target entry
- survey selection
- queue view
- image preview/result detail
- cache-versus-external artifact clarity
- degraded/offline runtime shell states
- user-facing validation for invalid coordinates and empty live-survey selection

Acceptance:

- user can submit a real image job and inspect results
- user can retry, cancel, and cache from the same `/forge` workbench

### Slice 6: composite and hardening

- composite workflow
- retries/cancel
- richer diagnostics
- observability refinement

Acceptance:

- operator-facing queue and diagnostics are credible

## Missing things to watch

- the current SSR/proxy model means Forge routing should be chosen early
- BookKeeper/Pulsar health in the current stack is not strong enough to make it a Forge v1 dependency
- current docs and standards expect stable service names and clearer required-vs-optional compose semantics
