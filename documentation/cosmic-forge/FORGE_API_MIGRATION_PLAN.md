# Cosmic Forge API Migration Plan

## Goal

Replace the placeholder JavaScript `apps/cosmic-forge-api` service with a proper NestJS + TypeScript application without changing the external Forge API contract.

## Why Now

- The current Forge API was built as a fast branch-enablement seam.
- It is already carrying queue logic, GraphQL documents, artifact handling, and adapter behavior.
- Continuing to extend that implementation in plain JavaScript will make the PI harder to stabilize and harder to evolve toward subscriptions, persistence, and worker orchestration.

## Migration Principles

- Preserve the existing HTTP contract:
  - `GET /health`
  - `POST /graphql`
  - `POST /internal/worker/execute-next`
  - `GET /artifacts/:imageId/:kind`
- Move logic into typed Nest services before adding new behavior.
- Keep the current in-memory store only as a temporary runtime mode.
- Remove the old JavaScript implementation as soon as the NestJS + TypeScript path is live.

## Target Shape

- `apps/cosmic-forge-api/src/main.ts`
  Nest bootstrap
- `apps/cosmic-forge-api/src/app.module.ts`
  application wiring
- `apps/cosmic-forge-api/src/controllers/*`
  health, graphql, artifact, and worker controllers
- `apps/cosmic-forge-api/src/state/forge-store.service.ts`
  typed queue and image-product state
- `apps/cosmic-forge-api/src/graphql/forge-graphql.service.ts`
  GraphQL document/runtime execution
- `apps/cosmic-forge-api/src/providers/*`
  adapter contracts and survey registry
- `apps/cosmic-forge-api/src/artifacts/*`
  local artifact cache and binary serving

## Sprinted Migration Steps

- [x] Freeze the JavaScript Forge API as transitional only.
- [x] Define the target NestJS + TypeScript structure.
- [x] Add an Nx project for `cosmic-forge-api` with TypeScript build, serve, and test targets.
- [x] Create the Nest bootstrap and application module.
- [x] Move the Legacy Surveys adapter into typed provider code.
- [x] Move the survey registry into typed provider code.
- [x] Move the in-memory Forge store into a typed Nest service.
- [x] Move the GraphQL runtime into a typed Nest service.
- [x] Move artifact caching into a typed Nest service.
- [x] Recreate the existing REST/GraphQL routes as Nest controllers.
- [x] Rewire local start scripts to launch the Nest TypeScript API.
- [x] Rewire Docker build/runtime for the Nest TypeScript API.
- [x] Convert the Forge API tests to TypeScript.
- [x] Remove old JavaScript source files from `apps/cosmic-forge-api`.
- [x] Remove app-local `node_modules` and package-lock state that came from the temporary standalone JS app.
- [x] Verify frontend proxy, worker execute-next, and Legacy job completion against the new API.

## Immediate Exit Criteria

- `pnpm nx run cosmic-forge-api:build` passes
- `pnpm nx run cosmic-forge-api:test` passes
- `NX_DAEMON=false pnpm nx run cosmic-forge-api:lint` passes
- Forge worker can call `POST /internal/worker/execute-next`
- Frontend Forge bootstrap still loads through `/api/forge/graphql`
- No `.js` source files remain in `apps/cosmic-forge-api`

## Deferred After This Migration

- Replace the in-memory store with persistence
- Add GraphQL subscriptions
- Introduce bounded-concurrency execution inside the worker runtime
- Add second adapter family after Legacy Surveys
