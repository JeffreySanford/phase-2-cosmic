# Mobile-First Census Frontend Validation Plan

Status: proposed

## Validation Goals

The new frontend should prove four things:

1. The existing app still works.
2. The new app can run independently.
3. The new app uses the existing API.
4. The mobile-first UI is accessible and responsive from 320px upward.

## Baseline Validation

Before scaffolding:

```bash
pnpm install
pnpm run nx-no-cloud -- run frontend:build
pnpm run nx-no-cloud -- run frontend:test -- --runInBand
```

If the workspace uses another current validation path, prefer the repo-standard script over direct tooling.

## New App Validation

After scaffolding:

```bash
pnpm run nx-no-cloud -- run census-mobile-frontend:build
pnpm run nx-no-cloud -- run census-mobile-frontend:test -- --runInBand
```

When the mobile app gains E2E coverage:

```bash
pnpm run nx-no-cloud -- run census-mobile-frontend-e2e:e2e-ci
```

Exact target names should be confirmed after generation.

## Port Validation

Expected local behavior:

| Check | Expected |
| --- | --- |
| Existing app | `http://localhost:4200` |
| Mobile app | `http://localhost:4300` |
| Storybook | `http://localhost:6006` |
| `/api` proxy | same backend target as existing app |

Both apps should be able to run at the same time.

## Responsive Validation

Required viewport checks:

| Width | Purpose |
| ---: | --- |
| 320px | WCAG reflow minimum |
| 390px | common phone |
| 430px | large phone |
| 768px | tablet portrait |
| 1024px | tablet landscape |
| 1440px | desktop |

Assertions:

- no document-level horizontal scrolling at 320px
- search field remains operable
- filter trigger remains visible
- drawer content remains reachable
- result cards wrap long content cleanly
- pagination controls remain reachable and named

## Accessibility Validation

Automated:

- axe checks in Storybook or E2E where practical
- keyboard interaction tests for filter drawer
- focus restoration tests after drawer close
- focus movement after pagination/page replacement
- accessible names for filter removal controls

Manual:

- keyboard-only walkthrough
- browser zoom at 200% and 400%
- forced-colors mode
- reduced-motion mode
- screen-reader smoke test with NVDA or equivalent

## API Validation

The mobile app should prove that search behavior remains server-owned.

Checks:

- query text serializes into API request parameters
- selected facets serialize into API request parameters
- paging uses server-provided result metadata
- facet counts come from the response
- provenance renders from the response
- no full-corpus filtering occurs in the browser

## Evidence to Capture

Each implementation PR should capture:

- command output summary
- screenshots or Storybook links for affected viewports
- known limitations
- accessibility checks completed
- any API contract assumptions
