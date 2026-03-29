# Cosmic Forge

Alignment anchors

- Existing viewer groundwork: [../viewer/VIEWER_MODEB.md](../viewer/VIEWER_MODEB.md)
- Public-source inventory: [../public-data/PUBLIC_DATA_RESOURCES.md](../public-data/PUBLIC_DATA_RESOURCES.md)
- Program guardrails: [../overview/PROGRAM_DIRECTION.md](../overview/PROGRAM_DIRECTION.md)
- Current jobs/frontend reality: [../frontend/features/JOBS.md](../frontend/features/JOBS.md)

Status: `implemented`

Cosmic Forge is the proposed bounded-track image orchestration branch inside `phase-2-cosmic`.

It is not a repo split and not a rewrite of the current Cosmic Horizon implementation. The intent is to incubate a new application family alongside the existing stack:

- `cosmic-forge-ui`
- `cosmic-forge-api`
- optional `cosmic-forge-worker`

The bounded-track assumptions are:

- branch-first incubation inside `phase-2-cosmic`
- Angular + NgRx for frontend state orchestration
- GraphQL for Forge-specific orchestration and result delivery
- NestJS + TypeScript for current API and worker orchestration
- a live Go FITS prerenderer for image-processing hotspots, with room for later heavier native acceleration only if justified
- a Forge-specific Docker environment that can run alongside the existing `docker/dev-compose.yml`
- local secret/config loading from the repository root `.env`

Why it belongs here:

- the repo already contains public-data and viewer groundwork for VLASS/HiPS/FITS-adjacent workflows
- the repo already has strong operator-console and provenance language
- the repo does not yet have a disciplined image-orchestration branch; this closes that gap without pretending the whole repo has changed stacks

## Active docs (post-PI)

The following files are the active Cosmic Forge reference set after PI completion:

- [PI_EXECUTION_PLAN.md](./PI_EXECUTION_PLAN.md)
- [RUNBOOK.md](./RUNBOOK.md)
- [DEMO_CHECKLIST.md](./DEMO_CHECKLIST.md)
- [OVERVIEW.md](./OVERVIEW.md)
- [PRODUCT_BLUEPRINT.md](./PRODUCT_BLUEPRINT.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)
- [PERSISTENCE_PLAN.md](./PERSISTENCE_PLAN.md)
- [SSR_PROXY_SPEC.md](./SSR_PROXY_SPEC.md)
- [DOCKER_ENVIRONMENT.md](./DOCKER_ENVIRONMENT.md)
- [RUNBOOK.md](./RUNBOOK.md)
- [ADAPTER_DECISIONS.md](./ADAPTER_DECISIONS.md)
- [ADAPTER_IMPLEMENTATION.md](./ADAPTER_IMPLEMENTATION.md)

These files reflect branch reality and maintenance level guidance; detailed legacy decision drafts have been moved to an archive folder.

## Retired (archived)

Retired files have been moved to `archive/` and are retained for historical traceability only; they are not part of the active reference path.

- `archive/*`

## Current implemented workbench behavior

- validated coordinate entry, live/planned survey states, cutout and composite job creation, queue diagnostics, artifact delivery labels, cache actions, and result/provenance inspection now exist on the single `/forge` route
- [AI_BUILD_KIT.md](./AI_BUILD_KIT.md): Copilot/Codex prompts and guardrails

PI execution state:

- the Forge branch now ships a bounded `/forge` workbench with live `Legacy Surveys`, `AllWISE`, `Pan-STARRS`, and multiple `SkyView`-derived adapter paths
- additional live SkyView-derived presets now include `DSS2 Preview`, `FIRST Preview`, and `2MASS J/H/K Preview`
- bounded worker execution, persisted local state, diagnostics, retry/cancel, caching, composite preview generation, FITS prerendering, and viewer handoff are implemented
- the remaining post-PI items are explicitly limited to GraphQL subscription transport and broker-backed scaling, and are tracked in [HANDOFF_NOTE.md](./HANDOFF_NOTE.md) and the deferred section of [PI_EXECUTION_PLAN.md](./PI_EXECUTION_PLAN.md)

Normal verification workflows:

- `pnpm run unit-test`
- `pnpm run e2e`
- `pnpm nx run frontend:build:development`
- `pnpm nx run cosmic-forge-api:build`
- `pnpm nx run cosmic-forge-worker:build`
- Current implemented workbench behavior:
  validated coordinate entry, live/planned survey states, cutout and composite job creation, queue diagnostics, artifact delivery labels, cache actions, and result/provenance inspection now exist on the single `/forge` route
- [AI_BUILD_KIT.md](./AI_BUILD_KIT.md): Copilot/Codex prompts and guardrails

PI execution state:

- the Forge branch now ships a bounded `/forge` workbench with live `Legacy Surveys`, `AllWISE`, `Pan-STARRS`, and multiple `SkyView`-derived adapter paths
- additional live SkyView-derived presets now include `DSS2 Preview`, `FIRST Preview`, and `2MASS J/H/K Preview`
- bounded worker execution, persisted local state, diagnostics, retry/cancel, caching, composite preview generation, FITS prerendering, and viewer handoff are implemented
- the remaining post-PI items are explicitly limited to GraphQL subscription transport and broker-backed scaling, and are tracked in [HANDOFF_NOTE.md](./HANDOFF_NOTE.md) and the deferred section of [PI_EXECUTION_PLAN.md](./PI_EXECUTION_PLAN.md)

Normal verification workflows:

- `pnpm run unit-test`
- `pnpm run e2e`
- `pnpm nx run frontend:build:development`
- `pnpm nx run cosmic-forge-api:build`
- `pnpm nx run cosmic-forge-worker:build`
