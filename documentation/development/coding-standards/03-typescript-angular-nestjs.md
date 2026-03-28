# 3. TypeScript / Angular / NestJS

Frontend and API layers change often; this section captures the workspace conventions that keep them
maintainable.

See also: [GETTING_STARTED.md](../overview/GETTING_STARTED.md) and
[ENVIRONMENT.md](../infra/ENVIRONMENT.md).

## Workspace & library design

- Each Nx library has a single type: UI, feature, data-access, util, or contract.
- UI libraries may not depend on feature libraries.
- NestJS apps follow controller → service → repository/client layering.
- Contract libraries must not import framework runtime code.

## Tooling enforcement

- ESLint (`@nx/enforce-module-boundaries`) prevents illegal cross-lib imports.
- `pnpm nx dep-graph --scan` used in CI to catch cycles.

## Package manager

- Use `pnpm` exclusively; commit `pnpm-lock.yaml`.

## TypeScript discipline

- Strict mode enabled (`tsconfig.base.json`).
- Prefer `unknown` over `any` and use discriminated unions.
- Avoid boolean flags; prefer option objects.
- Consistent async return style per layer.
- Use `readonly` for DTOs/config/immutable state.
- Shared models live in `libs/shared/models`.

## Angular rules

- `standalone: false` on all components/directives.
- No inline templates/styles; SCSS only.
- No inline CSS in templates; use directives/custom properties.
- Signals disallowed by default.
- Prefer `ChangeDetectionStrategy.OnPush`.
- Thin components; business logic in services.
- Initial render must be lifecycle-safe (see earlier NG0100 discussion).
- Avoid raw DOM; use Angular helpers or inject `DOCUMENT`.

## NestJS rules

- Constructor injection only.
- Validate DTOs; throw `BadRequestException` on invalid input.
- Modules declare providers/imports/exports explicitly; avoid `global: true` except for core.

---

### Testing

- Every component has a unit test; key interactive ones get Cypress e2e.
- Stubs included when scaffolding new components.
- Guard/interceptor/pipe/validator unit tests required.

### Checklist

- [ ] ESLint module boundaries and dep-graph scan configured
- [ ] `tsconfig.base.json` strict mode on
- [ ] Angular components use OnPush where appropriate
- [ ] DTO/contract libraries contain no framework imports
