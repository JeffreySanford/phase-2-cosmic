# Coding Standards (MVP)

Alignment anchors
- Frontend UX source of truth: [FRONTEND_UI.md](/docuentation/frontend/FRONTEND_UI.md)
- Execution backlog: [../TODO.md](/docuentation/planning/TODO.md)
- Delivery plan: [../ROADMAP.md](/ROADMAP.md)


Status date: 2026-02-07
Canonical scope: `documentation/product/PRODUCT-CHARTER.md` + `SCOPE-LOCK.md`.

## Core Rules

- Nx-first task execution

- Keep TypeScript strict and testable

- Prefer simple module boundaries

- Keep docs consistent with `libs/shared/models` contracts

- Favor RxJS observables (hot/live streams) over ad-hoc Promises for UI + service flows; keep request/stream lifecycles explicit.

- Angular module-mode policy: all `@Component` and `@Directive` declarations must explicitly set `standalone: false` (enforced by `pnpm standalone:check`).

- Testing policy: every UI component must include a unit test (`*.spec.ts`) and key interactive components must have an e2e test covering main interactions (Cypress). Include test stubs when scaffolding new components.

- Unit tests should run via `pnpm nx test <project>` and be part of PR checks.
- E2E tests should run via `pnpm nx e2e <project>-e2e` in CI where a test dev stack is available.

- Dockerized services: all services defined for development or testing (for example `docker/dev-compose.yml`) MUST have automated unit tests and e2e coverage that are runnable from the workspace (`pnpm nx test`, `pnpm nx e2e`) and included in the CI "test all" stage. Use the repository's Docker test-runner and `pnpm` store caching to execute these tests in containerized CI environments.

- Package manager: Node/javascript projects in this workspace MUST use `pnpm` for installs, scripts, and CI. Do not use `npm` or `yarn`.
- Document commands/examples using `pnpm` (e.g. `pnpm install`, `pnpm run lint`).

See the canonical developer run and environment docs for workflow details: [GETTING_STARTED.md](/docuentation/overview/GETTING_STARTED.md) and [ENVIRONMENT.md](/docuentation/infra/ENVIRONMENT.md).

- **No inline templates or styles**: components should reference external HTML/SCSS files to maintain separation of concerns; avoid `template:` or `styles:` literals in decorators.

- Package manager: use `pnpm` for all Node/JavaScript/TypeScript package management. Do not commit or rely on `package-lock.json` or `yarn.lock` files in the repository; CI and developer workflows must use `pnpm install` and `pnpm` scripts. Add `pnpm-lock.yaml` to the repository and ensure CI runners use `pnpm`.

## MVP Boundaries in Code

- Viewer Mode A only

- No Go service integration

- No FITS proxy code paths

- Comments/profile extensions may exist, but Pillar 1/2 behavior and performance gates must remain green

## Deferred Work Handling

## If implementing v1.1/v2 work (comments, [Mode B](/docuentation/viewer/VIEWER_MODEB.md), FITS proxy), gate with explicit roadmap updates first

---

## Cosmic Horizon Development - (c) 2026 Jeffrey Sanford. All rights reserved
