# PR 1 Baseline Checklist

Status: proposed

## Purpose

PR 1 should establish the planning foundation for the mobile-first Census frontend without changing runtime behavior. It should be easy to review, safe to merge, and clear enough that PR 2 can scaffold the new app without reopening the architecture discussion.

## Scope

PR 1 is documentation-only.

Included:

- architecture decision for a parallel mobile-first Angular app
- target workspace shape
- local port plan
- implementation sequence
- UX engagement strategy
- infographics and data visualization plan
- validation plan
- baseline readiness checklist

Excluded:

- no generated Angular app
- no app routing changes
- no backend changes
- no shared library generation
- no Storybook setup yet

## Baseline Checks to Record

Before opening PR 1, record the result of each check in the PR description.

| Check | Expected Result | Notes |
| --- | --- | --- |
| Dependencies installed | `node_modules` exists at workspace root | Run `pnpm install` from `C:\Users\Sanford\OneDrive\Documents\Playground` |
| Existing app target visible | Nx can show the `frontend` project | Use repo-standard Nx wrapper if available |
| Existing app port | `apps/frontend` serves on `4200` | Confirm from `apps/frontend/project.json` |
| Existing proxy shape | `/api` proxy is understood | Confirm current backend target behavior |
| Local stack starts | `pnpm start:all` completes or reaches expected long-running state | Capture any expected warnings |
| Git baseline | branch is up to date or known divergence is documented | Current branch should not hide unmerged runtime changes |
| New app name | `census-mobile-frontend` | Document before generation |
| New app port | `4300` | Avoids collision with existing frontend |
| Storybook port | `6006` | Used for responsive component review |

## Suggested PR 1 Description

```text
This PR documents the planned mobile-first Census/Civics frontend architecture.

It proposes a new Angular app under apps/census-mobile-frontend that runs beside the existing Angular app, uses port 4300 locally, and consumes the existing API rather than introducing a second backend. It also defines the first implementation sequence, validation strategy, accessibility expectations, and a visualization/engagement plan for infographics and data visualizations.

No runtime app or backend code changes are included.
```

## PR 1 Acceptance Criteria

- Documentation explains why a parallel app is being created.
- Documentation names the app and development ports.
- Documentation preserves the existing backend as the single source of search truth.
- Documentation describes where infographics and visualizations belong.
- Documentation includes a phased implementation backlog.
- Existing runtime code is not modified.

## Risks to Call Out

- The current local checkout may be behind `origin/main`.
- Dependency installation must be confirmed from the workspace root.
- If the existing API contract is not available as OpenAPI, initial shared TypeScript models may be interim.
- The visualization plan depends on response fields such as facets, result counts, provenance, geography, and vintage year being available from the existing API.
