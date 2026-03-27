# AI Build Kit

Alignment anchors

- Product scope: [./PRODUCT_BLUEPRINT.md](./PRODUCT_BLUEPRINT.md)
- Architecture: [./ARCHITECTURE.md](./ARCHITECTURE.md)
- GraphQL contract: [./GRAPHQL_CONTRACT_DRAFT.md](./GRAPHQL_CONTRACT_DRAFT.md)
- NgRx state plan: [./NGRX_STATE_BLUEPRINT.md](./NGRX_STATE_BLUEPRINT.md)

Status: `planned`

## Guardrails

- no repo-wide rewrite
- no hidden simulator path for live public-data workflows
- no raw-visibility imaging scope in v1
- keep docs, contracts, and generated code synchronized
- respect the current hybrid local-dev model
- use the root `.env` for local development
- build Forge in its own side-by-side Docker environment

## Copilot use

Use Copilot for:

- boilerplate scaffolding
- Angular module/component setup
- NgRx reducer/action/effect skeletons
- DTO and schema boilerplate
- test skeletons

## Codex use

Use Codex for:

- multi-file vertical slices
- end-to-end wiring across UI/API/worker
- contract-aligned refactors
- Docker environment setup across multiple files

## Prompt pack

### Prompt 1: Docker scaffold

Create a new side-by-side Docker environment for Cosmic Forge in this repository.
Add `docker/cosmic-forge-compose.yml` for `cosmic-forge-api`, `cosmic-forge-worker`,
and a metadata store. Reuse the repository root `.env` for local secrets. Do not
modify the meaning of the existing `docker/dev-compose.yml`. Keep Forge dependencies
minimal for v1 and do not require Kafka, RabbitMQ, or Pulsar unless the implementation
proves they are necessary.

### Prompt 2: GraphQL API scaffold

Create `cosmic-forge-api` with a GraphQL schema matching
`documentation/cosmic-forge/GRAPHQL_CONTRACT_DRAFT.md`. Implement health endpoints
and schema placeholders for surveys, jobs, target resolution, image products, and
provenance. Keep this branch-scoped and do not replace the current Java/OpenAPI
governance APIs.

### Prompt 3: NgRx jobs slice

Implement a Forge jobs feature using NgRx entity state. Use the job shape from
`documentation/cosmic-forge/GRAPHQL_CONTRACT_DRAFT.md` and the state approach in
`documentation/cosmic-forge/NGRX_STATE_BLUEPRINT.md`. Add actions, reducer,
selectors, and effects for create job, cancel job, retry job, and
subscription-driven updates.

### Prompt 4: worker queue

Implement a bounded-concurrency worker queue for Cosmic Forge. Jobs should move through queued, running, completed, failed, or cancelled states. Persist enough metadata for progress reporting and provenance. Keep provider-specific logic behind survey adapters.

### Prompt 5: survey adapter abstraction

Create a survey adapter abstraction with `resolveAvailability`, `requestCutout`, `fetchMetadata`, and `buildPreview`. Implement one mock adapter first, then one real public survey adapter. Preserve authoritative source URL and access time in provenance.

### Prompt 6: workbench page

Build the Forge workbench UI for target entry, survey selection, job submission, queue tracking, and preview/result inspection. Use Angular modules, NgRx selectors, and the branch-scoped GraphQL API. Keep presentation components separate from container components.

## Ready-to-use review checklist

- Does the change preserve the current repo architecture truth?
- Does the change stay within the bounded Forge scope?
- Does the change avoid inventing raw-data imaging requirements?
- Does the change keep local env handling explicit and reproducible?
- Does the change preserve provider attribution and provenance?
