# phase-2-cosmic

## Local Setup

- Use `pnpm`.
- Supported Node versions for Angular 21 in this workspace include `^20.19.0`, `^22.12.0`, and `^24.0.0`.
- Recommended local Node version: `20.20.1`.
- `20.20.1` is within Angular 21's supported `^20.19.0` range and is a good default choice for local development.
- Create a private repository-root `.env` from `.env.sample` for local credentials and overrides. `.env` is gitignored and must not be committed.

## Start The Stack

```bash
pnpm install
pnpm start:all
```

`pnpm start:all` is the supported local entrypoint. It runs `scripts/start-all-local.sh`, which performs a development preflight before launching the existing stack:

1. Normalizes CRLF line endings in the private `.env` when necessary so shell tools, Docker Compose, and Windows-native Node receive the same credential bytes.
2. Converges the Cosmic Forge PostgreSQL sidecar on the current Compose configuration while preserving its named data volume.
3. Keeps the PostgreSQL host binding loopback-only and discovers the actual Docker-published host port.
4. Reconciles the persisted `cosmic_forge` role with the configured local password when needed.
5. Verifies the real host -> Docker PostgreSQL path with `node-postgres`. If that host path rejects the password, startup performs one controlled role-password reset through the container-local admin path and retries without deleting the data volume.
6. Keeps the PostgreSQL password out of `FORGE_POSTGRES_URL` and diagnostic/log output.
7. Launches the normal Docker, Nest SSR, worker, allocator, Redis precache, and Angular development stack.

A successful PostgreSQL preflight includes a line similar to:

```text
[forge-postgres] host-side node-postgres connection verified (127.0.0.1:55432/cosmic_forge as cosmic_forge)
```

The exact host port is discovered from the running Docker binding rather than assumed.

For targeted troubleshooting, `pnpm postgres:reconcile` remains available, but normal local startup should not require a separate manual reconciliation step.

## Running Nx Tasks (Avoid Nx Cloud login prompts)

This workspace includes a helper script that runs `nx` with the cloud/remote cache disabled. To avoid seeing Nx Cloud authentication errors, run Nx via one of these:

```bash
pnpm run nx-no-cloud -- test frontend -- --runInBand
pnpm run unit-test
```

Running `pnpm nx ...` directly may attempt to connect to Nx Cloud and surface login/credential errors even when the build itself succeeds.

## Storybook and component-level validation

Use Storybook for visual regression checks on reusable UI surfaces such as the Lakehouse panel, topology cards, and dashboard widgets. The workflow is:

1. Run `pnpm exec nx run frontend:storybook --smoke-test` to verify the Angular Storybook builder path.
2. Use `pnpm exec nx run frontend:storybook` for a local interactive session when you want to inspect a component in isolation.
3. Pair Storybook with Jest unit tests and Cypress e2e coverage for layered validation: unit tests for logic, Storybook for presentational review, and Cypress for full-page behavior.
