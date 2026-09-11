# Mobile-First Census Frontend Backlog

Status: proposed

## PR 1: Planning and Workspace Baseline

Goal: document the architectural choice and confirm the current app remains stable.

Tasks:

- Add mobile-first planning docs.
- Add PR 1 baseline checklist.
- Add PR 1 readiness note with repo-verified app/proxy/generator facts.
- Add experience and engagement strategy.
- Add infographics and data visualization plan.
- Confirm current frontend port and serve target.
- Confirm API proxy shape.
- Record open dependency/tooling risks.
- Record the intended app name, port, Storybook role, and first vertical slice.

Acceptance:

- Docs explain why a second app exists.
- Docs explain how infographics and data visualizations support search without becoming a separate analytics product.
- PR 1 has a concrete baseline checklist for the existing app, API, and future mobile app scaffold.
- PR 1 records any local environment gaps that must be resolved before scaffolding.
- Existing app is not modified by the planning PR.

## PR 2: Scaffold `census-mobile-frontend`

Goal: create the new Angular app under `apps/`.

Tasks:

- Generate the app through Nx.
- Configure serve port `4300`.
- Add proxy config for `/api`.
- Add minimal home/discovery route.
- Add baseline unit test.

Acceptance:

- `apps/frontend` can still serve on `4200`.
- `apps/census-mobile-frontend` can serve on `4300`.
- No backend changes are required.

## PR 3: Shared Search Types and Fixtures

Goal: establish a clean contract boundary.

Tasks:

- Create shared TypeScript search models.
- Add realistic fixture response data.
- Add serialization helpers if needed.
- Add tests for query serialization.

Acceptance:

- Mobile app uses shared types.
- Fixture data covers facets, pagination, provenance, missing optional fields, and restricted/external results.

## PR 4: Result Card and Results List

Goal: render accessible research result cards.

Tasks:

- Build `ResearchResultCardComponent`.
- Build `DiscoveryResultsComponent`.
- Handle long titles, metadata wrapping, missing fields, and external source labels.
- Add Storybook stories.

Acceptance:

- Cards work at 320px without horizontal overflow.
- Result title/link semantics are screen-reader friendly.

## PR 5: Search Bar and Results Header

Goal: support the primary search workflow.

Tasks:

- Build `DiscoverySearchBarComponent`.
- Build `DiscoveryResultsHeaderComponent`.
- Add loading, empty, and error states.
- Add live-region text for search status.

Acceptance:

- Search form is keyboard operable.
- Status changes are announced politely.

## PR 6: Mobile Filters Drawer

Goal: implement the core mobile facet workflow.

Tasks:

- Build `DiscoveryFilterTriggerComponent`.
- Build `DiscoveryFiltersComponent`.
- Build `DiscoveryActiveFiltersComponent`.
- Add drawer shell with focus trap and Escape behavior.
- Return focus to trigger on close.

Acceptance:

- Filter drawer is fully keyboard operable.
- Active filter count updates.
- Selected filters are removable.

## PR 7: API Client Integration

Goal: connect the UI to the existing search API.

Tasks:

- Add search client service or generated client.
- Serialize query and filters into API parameters.
- Add request cancellation.
- Map backend responses into view models.
- Preserve URL query state.

Acceptance:

- Search results come from the existing backend.
- No client-side filtering of the corpus is introduced.

## PR 8: Storybook Responsive Matrix

Goal: make mobile/tablet/desktop states reviewable.

Tasks:

- Add viewport presets.
- Add stories for result card, filters, results, pagination, and shell.
- Add stories for loading, empty, error, long content, restricted, and federated results.

Acceptance:

- Reviewers can inspect 320px, 390px, 430px, 768px, 1024px, and 1440px states.

## PR 9: Browser Accessibility Evidence

Goal: validate the assembled app.

Tasks:

- Add E2E coverage for search, filters drawer, pagination, and URL state.
- Add 320px reflow assertion.
- Add keyboard flow assertions.
- Add focus restoration assertions.
- Record manual forced-colors/reduced-motion checks.

Acceptance:

- Mobile discovery workflow has automated and manual accessibility evidence.
