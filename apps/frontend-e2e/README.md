# Frontend e2e testing

This directory contains the Cypress-based end‑to‑end tests for the
`frontend` application. The suite is run by the `frontend-e2e` project in
Nx and is invoked via workspace scripts.

## Running locally

The easiest way to exercise the smoke lane or the full spec set locally is to
use the package‑level scripts from the repo root:

```bash
# smoke configuration (same as CI)
pnpm run e2e-smoke

# full e2e run (development server + backend services started automatically)
pnpm run e2e:ci

# open interactive Cypress runner
pnpm run e2e
```

Under the hood these commands translate into Nx invocations such as
`pnpm nx run frontend-e2e:e2e-ci` or `:e2e`.

### Troubleshooting

- **Capturing traces**: the CI pipeline already collects Cypress artifacts
  (screenshots/videos) to `dist/cypress`. When reproducing locally you can
  set `CYPRESS_RECORD_KEY` or manually look in `apps/frontend-e2e/dist/cypress`
  for screenshots from the last run.
- **Cache issues**: the test configuration disables cross‑spec caching and sets
  `trashAssetsBeforeRuns: true`, so rerunning should start from a clean state.
  If you hit an intermittent failure, try `rm -rf apps/frontend-e2e/dist/cypress
~/.cache/Cypress` before re-running.

## CI integration

The `e2e:ci` target is invoked by the `quality-ci` workflow with
`pnpm run e2e-smoke` at the smoke stage. The pipeline also sets
`CYPRESS_CACHE_FOLDER=/tmp/nonexistent` to avoid reusing a cache between jobs.

To add new deterministic specs, mark them as part of the smoke lane in
`apps/frontend-e2e/cypress.config.ts` and verify they pass locally with
`pnpm run e2e-smoke` before pushing.
