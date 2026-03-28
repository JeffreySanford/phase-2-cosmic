# Forge Runbook

Alignment anchors

- PI tracker: [./PI_EXECUTION_PLAN.md](./PI_EXECUTION_PLAN.md)
- Docker environment: [./DOCKER_ENVIRONMENT.md](./DOCKER_ENVIRONMENT.md)
- Worker execution: [./WORKER_EXECUTION_SPEC.md](./WORKER_EXECUTION_SPEC.md)
- GraphQL contract: [./GRAPHQL_CONTRACT_DRAFT.md](./GRAPHQL_CONTRACT_DRAFT.md)

Status: `implemented`

## Purpose

This runbook is the operator/developer path for starting, stopping, validating, and debugging the current Forge branch without relying on tribal context.

## Normal local startup

1. Start the full local runtime:
   - `pnpm run start:all`
2. Wait for these local endpoints:
   - frontend dev server: `http://127.0.0.1:4200`
   - SSR shell: `http://127.0.0.1:4000`
   - Forge API: `http://127.0.0.1:4101`
   - Forge worker: `http://127.0.0.1:4102`
3. Open `/forge` through the frontend:
   - `http://127.0.0.1:4200/forge`

## Forge-only startup

Use this when the repo-wide `start:all` path is not needed.

1. Start the bounded Forge Docker stack:
   - `sh ./scripts/cosmic-forge-up.sh`
2. Start the frontend SSR shell:
   - `pnpm run serve:ssr`
3. Start the frontend dev server:
   - `pnpm nx run frontend:serve --host=127.0.0.1`

## Shutdown

1. Stop the bounded Forge Docker stack:
   - `sh ./scripts/cosmic-forge-down.sh`
2. Stop local SSR/dev server terminals if they were started separately.

## Health verification

Direct runtime health:

- Forge API:
  - `http://127.0.0.1:4101/health`
- Forge worker:
  - `http://127.0.0.1:4102/health`

SSR/branch-scoped health:

- Forge through SSR:
  - `http://127.0.0.1:4000/api/forge/health`

GraphQL read-model verification:

- `POST http://127.0.0.1:4000/api/forge/graphql`
- operation:
  - `ForgeWorkbenchBootstrap`

Expected current contract:

- `serviceInfo.contractVersion = forge-workbench.v1`
- live surveys include:
  - `legacy`
  - `allwise`
  - `skyview`
  - `panstarrs`
- planned survey examples include:
  - `esasky`

## Demo-ready smoke path

1. Open `/forge`.
2. Confirm the runtime banner says Forge is available.
3. Create a cutout job against `Legacy Surveys` or `AllWISE`.
4. Confirm the job progresses to a visible result.
5. Inspect provenance and external source links.
6. Use `open in viewer` from a selected result and confirm the viewer route opens with target, coordinates, FOV, and survey context preserved.
7. Create a composite job with `Legacy Surveys` + `AllWISE`.
8. Confirm diagnostics and recent job events update.

Detailed demo steps live in [DEMO_CHECKLIST.md](./DEMO_CHECKLIST.md).

## Debugging guide

### If `/forge` loads but shows the runtime offline banner

Check:

- `http://127.0.0.1:4101/health`
- `http://127.0.0.1:4000/api/forge/health`
- `POST /api/forge/graphql`

Likely causes:

- Forge API not running
- SSR proxy cannot reach `4101`
- stale local process or port collision

### If preview artifacts fail

Check:

- selected result `previewUrl`
- `GET /api/forge/artifacts/:imageId/preview`
- provider-specific upstream availability

Current known behavior:

- IRSA may fail with normalized upstream timeout/unavailable/bad-response codes
- SkyView is preview-only and should be treated as a derived quick-look output

### If start-up logs look noisy

Current `start-all.sh` behavior intentionally:

- clears stale listeners on `4000`, `4101`, `4102`, `4200`, and `24678`
- appends to `logs/start-all.log`
- writes a per-run session log under `logs/start-all-*.log`

An old Nx process can print a failure banner while being intentionally terminated. That is expected cleanup noise if the new listeners come up successfully afterward.

## Normal test workflows

Repo-level package-manager workflows:

- unit tests:
  - `pnpm run unit-test`
- e2e:
  - `pnpm run e2e`

Useful Nx-target workflows:

- frontend unit tests:
  - `pnpm nx test frontend --configuration=ci`
- Forge e2e:
  - `pnpm nx run frontend-e2e:e2e`
- frontend build:
  - `pnpm nx run frontend:build:development`
- Forge API build:
  - `pnpm nx run cosmic-forge-api:build`
- Forge worker build:
  - `pnpm nx run cosmic-forge-worker:build`

## Known runtime gaps and deliberate non-goals

- PostgreSQL-backed persistence remains post-PI; current authoritative local state is repository-backed and file-persisted
- GraphQL subscriptions remain deferred; the current branch uses bootstrap/read refresh semantics
- ESASky remains planned, not live
- Pan-STARRS is now live as an archive-native comparison adapter, but it is not the primary optical path
- SkyView is intentionally a derived-preview path, not an archive-native science-cutout source
