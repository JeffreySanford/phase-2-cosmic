# Developer Guide: Simulator & Deterministic E2E

This document collects the essential commands and tips for working with the
allocator simulator and the deterministic Cypress e2e suite locally.

## Simulator Harness

The allocator simulator lives in `tools/trident-allocator`. It has its own
`package.json` and Vitest config.

```bash
# run unit tests on the simulator
pnpm run test:trident-allocator

# start the HTTP server (default 3000)
node tools/trident-allocator/index.js

# evaluate a scheduling block manually
curl -s -XPOST http://localhost:3000/allocate \
  -H 'Content-Type: application/json' \
  -d '{"subarrayId":"SUB01","spectralConfig":{...}}'
```

The server is intentionally minimal and can be embedded in integration tests.
Make sure any changes are covered by new Vitest cases before merging.

## Running the deterministic E2E suite

The smoke lane is designed to be fast and reliable; it is the gate in CI.

```bash
# smoke run (same as CI); requires Docker for the embedded backend
pnpm run e2e-smoke

# full local run including video/artifacts
pnpm run e2e:ci

# open interactive runner for development/debugging
pnpm run e2e
```

If you hit intermittent failures:

1. Ensure the backend services are clean: `pnpm nx reset` or restart local
   Redis instance.
2. Clear Cypress cache:
   `rm -rf ~/.cache/Cypress apps/frontend-e2e/dist/cypress`.
3. Re-run smoke only (`pnpm run e2e-smoke`) to confirm deterministic specs.

Tests are authored in `apps/frontend-e2e/src/specs`; add new smoke specs there
and confirm locally before opening a PR. The smoke suite is run automatically
on every PR by the `quality-ci` workflow.
