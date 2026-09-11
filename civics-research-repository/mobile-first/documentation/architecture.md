# Mobile-First Census Frontend Architecture

Status: proposed

## Summary

The mobile-first Census frontend should be a new Angular application in the Nx workspace, located at `apps/census-mobile-frontend`. It should run independently from the existing `apps/frontend` application while consuming the same backend API and shared contract libraries.

This gives the project a clean experimental surface for mobile-first federal search UX while preserving the existing application.

## Target Workspace Shape

```text
apps/
  frontend/
    Existing Angular application.

  census-mobile-frontend/
    New mobile-first Census/Civics discovery app.

libs/
  census-api-contracts/
    Shared TypeScript interfaces, search request/response models, and fixtures.

  census-search-client/
    Angular service layer for the existing search API.

  census-ui/
    Shared presentational components if they become useful across apps.

  ui-theme/
    Existing theme library, reused only where it supports the mobile design.
```

The exact library names can change during implementation, but the boundary should remain:

- apps own routing, page composition, and product-specific UX
- libs own reusable API contracts, clients, fixtures, and neutral UI building blocks
- backend owns search semantics, filtering, pagination, provenance, and result counts

## Runtime Model

```text
Existing app on 4200
        |
        | /api/*
        v
Existing backend/API
        ^
        | /api/*
        |
Mobile-first app on 4300
```

Both frontends should be able to run at the same time in development.

The new app should have its own proxy configuration, but that proxy should point to the same backend target used by the existing application. If the backend runs behind a Nest SSR compatibility layer in local development, the mobile app should reuse that route rather than creating a separate gateway.

## Search Boundary

The mobile app should send search intent to the existing API:

```text
q=population migration
program=ACS
sourceSystem=CENSUS
vintageYear=2025
page=0
pageSize=25
```

The API remains authoritative for:

- query parsing
- facet counts
- paging and cursors
- provenance
- source system behavior
- result totals
- authorization or restricted-result handling

The mobile app is responsible for:

- search form UX
- active filter display
- mobile filter drawer
- result cards
- loading, empty, and error states
- accessible focus behavior
- URL query state
- responsive layout

## State Management

Use the same state-management split described in the project notes:

| Concern | Recommended Tool |
| --- | --- |
| HTTP search requests | NgRx effects or RxJS service orchestration |
| Search result state | NgRx store if the workflow grows beyond one page |
| URL query synchronization | Router + NgRx/RxJS |
| Local drawer state | Angular signals |
| Display mode and ephemeral UI | Angular signals |
| Layout responsiveness | CSS first; CDK BreakpointObserver only for behavior changes |

The new app does not need to copy the full existing app state architecture on day one. Start with the smallest maintainable state model, then promote to NgRx if URL state, facets, pagination, and cancellation become easier to reason about centrally.

## Component Model

Initial components:

| Component | Responsibility |
| --- | --- |
| `MobileDiscoveryPage` | Route container, query coordination, search state |
| `DiscoverySearchBarComponent` | Search input, submit, clear |
| `DiscoveryFilterTriggerComponent` | Mobile filter button and active count |
| `DiscoveryFiltersComponent` | Facet groups and selected facet state |
| `DiscoveryActiveFiltersComponent` | Removable selected-filter chips |
| `DiscoveryResultsHeaderComponent` | Result count, range, loading status |
| `ResearchResultCardComponent` | One accessible research result |
| `DiscoveryResultsComponent` | Result collection and empty/error/loading states |
| `DiscoveryPaginationComponent` | Previous/current/next controls and focus behavior |
| `DiscoveryShellComponent` | Drawer/sidebar layout composition |

Keep these components mostly presentational where possible so Storybook can render them without booting the entire search workflow.

## Responsive Behavior

The design target is mobile-first:

- 320px: complete reflow without horizontal document scrolling
- 390px/430px: primary phone widths
- 768px: tablet portrait
- 1024px: tablet landscape and possible persistent filters
- 1440px: desktop review

The filter experience should start as an accessible drawer on phones. At larger widths it can progressively become a persistent side panel using the same facet component.

## Accessibility Architecture

Accessibility should be built into the component contracts:

- filter drawer traps focus while open
- Escape closes the drawer
- focus returns to the Filters button on close
- search status uses a polite live region
- search errors use alert semantics
- active filter remove controls have descriptive accessible names
- pagination is wrapped in a named navigation landmark
- page/result replacement moves focus to the results heading when appropriate
- selected facets use checkbox semantics or a documented equivalent
- touch controls meet target-size expectations
- forced colors do not rely on color-only states
- reduced motion is honored

## Storybook Role

Storybook should be the main workspace for mobile-first component design.

Recommended story groups:

- result card: normal, long title, long metadata, restricted, external source, missing optional metadata
- filters: no selection, one selection, multiple selections, long facet names, large counts, empty facets
- results: loading, populated, empty, failure, one result, many results
- full shell: 320px, phone, tablet, desktop, filters open

Storybook should prove component states. Browser E2E should prove the assembled app.

## Non-Goals

- No second backend.
- No duplicate index.
- No client-side scanning/filtering of the full corpus.
- No separate mobile-only data model unless the API already supports a deliberate projection.
- No rewrite of the existing Angular app as a prerequisite.
