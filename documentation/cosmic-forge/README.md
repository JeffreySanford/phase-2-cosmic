# Cosmic Forge

Alignment anchors

- Existing viewer groundwork: [../viewer/VIEWER_MODEB.md](../viewer/VIEWER_MODEB.md)
- Public-source inventory: [../public-data/PUBLIC_DATA_RESOURCES.md](../public-data/PUBLIC_DATA_RESOURCES.md)
- Program guardrails: [../overview/PROGRAM_DIRECTION.md](../overview/PROGRAM_DIRECTION.md)
- Current jobs/frontend reality: [../frontend/features/JOBS.md](../frontend/features/JOBS.md)

Status: `planned`

Cosmic Forge is the proposed bounded-track image orchestration branch inside `phase-2-cosmic`.

It is not a repo split and not a rewrite of the current Cosmic Horizon implementation. The intent is to incubate a new application family alongside the existing stack:

- `cosmic-forge-ui`
- `cosmic-forge-api`
- optional `cosmic-forge-worker`

The bounded-track assumptions are:

- branch-first incubation inside `phase-2-cosmic`
- Angular + NgRx for frontend state orchestration
- GraphQL for Forge-specific orchestration and result delivery
- .NET for worker orchestration and concurrency
- optional later C++ acceleration for image-processing hotspots
- a Forge-specific Docker environment that can run alongside the existing `docker/dev-compose.yml`
- local secret/config loading from the repository root `.env`

Why it belongs here:

- the repo already contains public-data and viewer groundwork for VLASS/HiPS/FITS-adjacent workflows
- the repo already has strong operator-console and provenance language
- the repo does not yet have a disciplined image-orchestration branch; this closes that gap without pretending the whole repo has changed stacks

Reader guide:

- [OVERVIEW.md](./OVERVIEW.md): verbose rationale, risks, and branch fit
- [PUBLIC_DATA_READINESS.md](./PUBLIC_DATA_READINESS.md): direct answer on whether public data is already enough
- [DATA_SOURCE_COMPARISON_MATRIX.md](./DATA_SOURCE_COMPARISON_MATRIX.md): scored comparison of official archive and agency data sources for adapter prioritization
- [FIRST_ADAPTER_DECISION.md](./FIRST_ADAPTER_DECISION.md): recommended first production adapter and follow-on source order
- [IRSA_ADAPTER_DECISION.md](./IRSA_ADAPTER_DECISION.md): recommended IRSA sequencing, starting with AllWISE and preserving a clean seam for 2MASS
- [IRSA_IMPLEMENTATION_NOTES.md](./IRSA_IMPLEMENTATION_NOTES.md): concrete engineering notes for the first IRSA-backed adapter slice using AllWISE discovery and IBE cutout retrieval
- [SPRINT_5_IMPLEMENTATION_NOTES.md](./SPRINT_5_IMPLEMENTATION_NOTES.md): concrete engineering notes for the first real Legacy Surveys-backed adapter slice
- [PRODUCT_BLUEPRINT.md](./PRODUCT_BLUEPRINT.md): product scope, users, MVP, non-goals
- [ARCHITECTURE.md](./ARCHITECTURE.md): system shape and Mermaid diagrams
- [GRAPHQL_CONTRACT_DRAFT.md](./GRAPHQL_CONTRACT_DRAFT.md): branch-scoped GraphQL contract aligned to the current Forge API shape
- [PERSISTENCE_PLAN.md](./PERSISTENCE_PLAN.md): first durable storage model for jobs, requests, results, provenance, and queue events
- [NGRX_STATE_BLUEPRINT.md](./NGRX_STATE_BLUEPRINT.md): frontend state model
- [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md): vertical slices, Docker environment, acceptance gates
- [PI_EXECUTION_PLAN.md](./PI_EXECUTION_PLAN.md): sprint-by-sprint PI checklist with individual execution steps
- [BRANCH_ENABLEMENT.md](./BRANCH_ENABLEMENT.md): execution checklist for making the branch implementation-ready
- [DOCKER_ENVIRONMENT.md](./DOCKER_ENVIRONMENT.md): side-by-side local Docker environment and root `.env` rules
- [SSR_PROXY_SPEC.md](./SSR_PROXY_SPEC.md): how Forge requests should be proxied through the SSR shim
- [UI_SURFACE_PLAN.md](./UI_SURFACE_PLAN.md): how the future `/forge` UI route should be introduced
- [AI_BUILD_KIT.md](./AI_BUILD_KIT.md): Copilot/Codex prompts and guardrails
