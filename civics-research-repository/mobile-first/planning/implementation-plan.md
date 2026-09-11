# Mobile-First Census Frontend Implementation Plan

Status: proposed

## Phase 0: Confirm Baseline

Purpose: make sure the workspace can safely accept a second Angular app.

Tasks:

- Install dependencies with `pnpm install` if `node_modules` is absent.
- Sync the local branch with `origin/main`.
- Confirm current `apps/frontend` serve/build/test targets.
- Confirm the backend/API startup path and local API port.
- Decide the generated app name, route title, and npm scope conventions.
- Confirm whether Storybook should be app-local or shared at the workspace level.

Deliverable:

- Baseline note showing existing app still runs before new app work begins.
- PR 1 documentation set covering architecture, UX engagement, visualization strategy, validation, and scaffold readiness.

## Phase 0.5: Experience Blueprint

Purpose: define the first mobile experience deeply enough that scaffolding does not produce an empty shell.

Tasks:

- Define the first three user journeys.
- Decide which information graphics belong in the search flow.
- Decide which data visualizations belong in result inspection or summary surfaces.
- Define which visual elements are fixture-driven for Storybook and which require live API data.
- Identify accessibility and performance constraints for every visualization.

Deliverable:

- Experience and visualization plans are ready before PR 2 scaffolding starts.

## Phase 1: Scaffold the New App

Purpose: create the isolated mobile-first frontend without touching the current app behavior.

Proposed app:

```text
apps/census-mobile-frontend
```

Expected configuration:

- Angular app generated through Nx.
- SCSS styling.
- Jest or the repo-standard unit test setup.
- Serve port set to `4300`.
- Proxy config pointing `/api` to the existing backend path.
- Default route renders the mobile discovery shell.

Deliverable:

- New app boots independently.
- Existing app still boots on `4200`.

## Phase 2: Shared Contracts and Fixtures

Purpose: prevent duplicate search model definitions.

Candidate libraries:

```text
libs/census-api-contracts
libs/census-search-client
```

Initial contents:

- `SearchRequest`
- `SearchResponse`
- `SearchResult`
- `FacetGroup`
- `FacetValue`
- pagination metadata
- provenance metadata
- Storybook-safe fixture responses

The implementation should prefer generated OpenAPI clients if the repository search API already has a durable OpenAPI contract. If no contract exists yet, start with hand-authored TypeScript types and mark them as interim.

Deliverable:

- Mobile app consumes shared models and fixtures.

## Phase 3: Mobile Discovery Vertical Slice

Purpose: build the first real mobile-first workflow.

Scope:

- search field
- result count
- loading state
- active filters
- result cards
- filter trigger
- accessible filter drawer
- facet selection
- pagination controls

First visual target:

```text
320px viewport
search -> results -> filters drawer -> select facet -> active chip -> close drawer
```

Deliverable:

- Search UI renders realistic fixture data at 320px, 390px, 768px, and desktop widths.

## Phase 4: API Integration

Purpose: replace fixture-only behavior with the existing API.

Tasks:

- Implement or reuse a search API client.
- Serialize query text, repeatable filters, page, page size, and cursor parameters.
- Preserve URL query state.
- Add request cancellation for fast query/filter changes.
- Render backend result counts and facet counts without client-side corpus filtering.

Deliverable:

- Mobile app performs real search through the existing backend.

## Phase 5: Storybook Matrix

Purpose: make responsive and accessibility states reviewable without running the whole app.

Viewport presets:

| Name | Width |
| --- | ---: |
| Reflow minimum | 320px |
| Phone | 390px |
| Large phone | 430px |
| Tablet portrait | 768px |
| Tablet landscape | 1024px |
| Desktop | 1440px |

Story coverage:

- `ResearchResultCard`
- `DiscoveryFilters`
- `DiscoveryResults`
- `DiscoveryPagination`
- `DiscoveryShell`
- full mobile discovery composition

Deliverable:

- Storybook demonstrates key mobile/tablet/desktop states.

## Phase 6: Accessibility and Browser Evidence

Purpose: prove the assembled app is operable.

Tasks:

- Keyboard-only search and filter drawer flow.
- Focus trap and focus return.
- Escape-to-close behavior.
- Results heading focus after page replacement.
- Live region announcements for result status.
- 320px reflow test.
- Reduced-motion and forced-colors checks.
- Error/empty/loading journeys.

Deliverable:

- Automated and manual evidence recorded in the validation plan.

## Phase 7: Convergence Decision

Purpose: decide whether the mobile-first app remains a separate product shell or informs a refactor of the existing frontend.

Decision points:

- Does the mobile app duplicate too much route/app-shell logic?
- Are shared contracts stable?
- Does the existing app need the same Discovery route?
- Should components move into a shared `libs/census-ui` library?
- Is there appetite to replace or merge the old discovery surface?

Deliverable:

- Follow-up ADR: keep separate, converge, or promote shared components.
