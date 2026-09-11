# PR 1 Readiness Note

Status: proposed

Date: 2026-09-11

## Summary

The mobile-first Census frontend planning package is ready to become PR 1 as a documentation-only change. The current workspace configuration supports the proposed direction: the existing Angular app already has an isolated serve target, a known development port, and a proxy configuration that the new mobile app can mirror.

## Repo Facts Verified From Source

| Area | Current Finding | Source |
| --- | --- | --- |
| Existing app project | `frontend` | `apps/frontend/project.json` |
| Existing app source root | `apps/frontend/src` | `apps/frontend/project.json` |
| Existing app serve port | `4200` | `apps/frontend/project.json` |
| Existing app proxy config | `apps/frontend/proxy.conf.cjs` | `apps/frontend/project.json` |
| Existing `/api` proxy target | `http://127.0.0.1:${PORT || FRONTEND_PORT || 4000}` | `apps/frontend/proxy.conf.cjs` |
| Existing build executor | `@angular-devkit/build-angular:application` | `apps/frontend/project.json` |
| Existing style language | `scss` | `apps/frontend/project.json`, `nx.json` |
| Existing unit test pattern | Jest via repo script | `apps/frontend/project.json`, `package.json` |
| Workspace app generator defaults | SCSS, Jest, ESLint, Cypress | `nx.json` |
| Existing Nx wrapper | `pnpm run nx-no-cloud -- ...` | `package.json` |
| Package manager | `pnpm@10.32.1` | `package.json` |

## Proposed New App Facts

| Area | Proposed Value | Reason |
| --- | --- | --- |
| App name | `census-mobile-frontend` | Clear, specific, and separate from existing app |
| App path | `apps/census-mobile-frontend` | Matches Nx app layout |
| Serve port | `4300` | Avoids collision with existing `4200` app |
| API proxy | Mirror current `/api` proxy shape | Reuses existing backend path |
| Styling | SCSS | Matches workspace generator defaults |
| Unit tests | Jest | Matches workspace generator defaults |
| E2E | Cypress initially | Matches current generator defaults; Playwright can remain browser evidence path where useful |
| Storybook | Use port `6006` | Dedicated responsive component review surface |

## Environment Status From This Codex Session

This Codex session still cannot see `node_modules` at the workspace root, so Nx commands fail here with `nx is not recognized`.

Observed from this session:

```text
Test-Path node_modules -> False
Test-Path node_modules/.bin/nx -> False
pnpm --version -> 10.32.1
node --version -> v22.23.1
pnpm run nx-no-cloud -- show projects -> fails because nx is unavailable
```

The user has reported running `pnpm install`, `approve-builds`, and `start:all` locally. Before PR 2 scaffolding, confirm that the install was run from:

```text
C:\Users\Sanford\OneDrive\Documents\Playground
```

and that this command succeeds in the local shell:

```bash
pnpm run nx-no-cloud -- show projects
```

## Branch Status

This Codex session sees the current branch as:

```text
codex/repo-analysis...origin/main [behind 1]
```

Before opening PR 1, either update from `origin/main` or record why the PR is intentionally based on the current branch.

## PR 1 Is Ready When

- The planning docs are committed.
- The PR description includes the baseline checks from `pr1-baseline-checklist.md`.
- The PR notes the current environment gap if Nx still cannot be run from the working shell.
- No runtime application or backend files are changed.

## PR 2 Gate

Do not scaffold `apps/census-mobile-frontend` until these are true:

- `pnpm run nx-no-cloud -- show projects` succeeds.
- Existing `frontend` target is visible.
- Existing app behavior on `4200` is confirmed or intentionally deferred with a reason.
- The branch is updated or divergence from `origin/main` is understood.
