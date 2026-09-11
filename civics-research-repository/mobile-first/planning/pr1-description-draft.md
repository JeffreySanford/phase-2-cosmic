# PR 1 Description Draft

## Summary

This PR documents the planned mobile-first Census/Civics frontend architecture.

It proposes a new Angular app under `apps/census-mobile-frontend` that runs beside the existing Angular app, uses port `4300` locally, and consumes the existing API rather than introducing a second backend. It also defines the first implementation sequence, validation strategy, accessibility expectations, and a visualization/engagement plan for infographics and data visualizations.

No runtime app or backend code changes are included.

## Why

The existing Angular application should remain functional while the mobile-first Census discovery experience is designed, scaffolded, and validated. A parallel frontend app gives the project a clean mobile-first surface without forcing broad changes into the current app.

The new frontend should demonstrate:

- Angular/Nx frontend architecture
- mobile-first responsive design
- federal accessibility expectations
- reusable API contracts and fixtures
- real API-backed search behavior
- Storybook-driven component review
- targeted infographics and visual summaries that improve search comprehension

## What Changed

- Added mobile-first planning index.
- Added architecture plan for a parallel frontend app.
- Added ADR for the parallel mobile-first app decision.
- Added experience and engagement strategy.
- Added infographics and data visualization plan.
- Added implementation plan.
- Added backlog.
- Added validation plan.
- Added PR 1 baseline checklist and readiness note.

## Architecture Decision

Create:

```text
apps/census-mobile-frontend
```

Keep:

```text
apps/frontend
```

Development ports:

```text
apps/frontend                 4200
apps/census-mobile-frontend   4300
storybook                     6006
```

The new app will reuse the existing API. It will not introduce a second search backend, duplicate index, or client-side corpus search.

## Visualization Direction

The plan allows infographics and data visualizations where they support the search workflow:

- result type mix
- top programs
- year range
- geography coverage
- provenance badges
- filter impact summaries

The plan explicitly avoids a dashboard-first mobile layout, decorative infographics, and client-side analysis beyond the bounded API response and server-provided facets.

## Baseline Checks

Record local results before merging:

| Check | Result |
| --- | --- |
| `pnpm install` from workspace root | |
| `pnpm run nx-no-cloud -- show projects` | |
| Existing `frontend` project visible | |
| Existing app serves on `4200` | |
| Existing `/api` proxy shape reviewed | |
| `pnpm start:all` reaches expected running state | |
| Branch updated from `origin/main` or divergence documented | |

## Validation

Documentation-only PR. No build/test run is required for changed files, but local baseline checks should be recorded before moving to PR 2.

## Follow-Up

PR 2 should scaffold `apps/census-mobile-frontend` with:

- Angular app generated through Nx
- SCSS/Jest/ESLint defaults
- serve port `4300`
- `/api` proxy mirroring the existing app
- minimal mobile discovery shell
- baseline unit test
