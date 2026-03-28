# phase-2-cosmic

## Local Setup

- Use `pnpm`.
- Supported Node versions for Angular 21 in this workspace include `^20.19.0`, `^22.12.0`, and `^24.0.0`.
- Recommended local Node version: `20.20.1`.
- `20.20.1` is within Angular 21's supported `^20.19.0` range and is a good default choice for local development.

## Start The Stack

```bash
pnpm install
pnpm start:all
```

## Running Nx Tasks (Avoid Nx Cloud login prompts)

This workspace includes a helper script that runs `nx` with the cloud/remote cache disabled. To avoid seeing Nx Cloud authentication errors, run Nx via one of these:

```bash
pnpm run nx-no-cloud -- test frontend -- --runInBand
pnpm run unit-test
```

Running `pnpm nx ...` directly may attempt to connect to Nx Cloud and surface login/credential errors even when the build itself succeeds.
