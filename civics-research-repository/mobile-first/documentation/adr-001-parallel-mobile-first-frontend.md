# ADR-001: Parallel Mobile-First Census Frontend

Status: proposed

Date: 2026-09-11

## Context

The project needs a mobile-first Census/Civics research discovery experience. The existing Angular app should remain functional while this new UX is explored and validated.

The desired mobile experience has different priorities from the current desktop-oriented application:

- 320px-first layout
- mobile filter drawer
- federal accessibility evidence
- Storybook viewport matrix
- focused search/results flow
- clean portfolio narrative around real API reuse

At the same time, the search API and repository backend should remain authoritative. Creating a new backend would add avoidable complexity and weaken the architecture story.

## Decision

Create a new Angular app under `apps/` for the mobile-first Census frontend while keeping the existing Angular app intact.

Suggested app name:

```text
apps/census-mobile-frontend
```

Suggested local ports:

```text
apps/frontend                 4200
apps/census-mobile-frontend   4300
storybook                     6006
```

The new app will consume the existing API and shared contract libraries. Reusable API models, fixtures, generated clients, or presentation components may be promoted to `libs/` when reuse is real.

## Consequences

Positive:

- The existing app remains stable.
- Mobile-first work can proceed without broad regression risk.
- The Census frontend can have a clean information architecture.
- Storybook and accessibility evidence can be developed around focused components.
- The backend remains the single source of search truth.

Tradeoffs:

- Two frontend apps must be maintained.
- Shared contracts need discipline to avoid copy/paste drift.
- Design-system decisions must be explicit so the apps do not diverge accidentally.
- E2E coverage needs to cover both the current app and the mobile-first app.

## Alternatives Considered

### Enhance the Existing `/discovery` Route Only

This is architecturally elegant when an existing Discovery route already exists and is safe to refactor. It reduces duplication but increases risk if the current app is still needed as-is.

This remains a future convergence option.

### Create a Separate Backend

Rejected. The backend should continue to own search semantics, facets, pagination, provenance, and authorization behavior.

### Build a Static Demo

Rejected. The goal is a credible repository extension, not a throwaway prototype.

## Acceptance Criteria

- Existing Angular app still serves on its current port.
- New Angular app serves independently on a separate port.
- New app can call the existing API through local proxy configuration.
- No new search backend is introduced.
- Shared API types/fixtures are not duplicated ad hoc across apps.
- First vertical slice works at 320px with no horizontal document scroll.
