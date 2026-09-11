# Experience and Engagement Strategy

Status: proposed

## Experience Goal

The mobile-first Census frontend should feel like a focused federal research discovery tool: fast, readable, trustworthy, and useful on a phone. It should improve engagement by helping users understand the result set, not by adding decorative charts or dashboard noise.

The core workflow remains:

```text
search -> scan results -> refine filters -> inspect a result -> continue or share
```

## Target Users

| User | Need | Design Implication |
| --- | --- | --- |
| Policy analyst | Find current datasets and publications quickly | Prioritize search, filters, metadata, and provenance |
| Researcher | Compare programs, years, geographies, and source systems | Expose facets and result context clearly |
| Public user | Understand what Census research objects are available | Plain-language labels and guided empty states |
| Accessibility reviewer | Verify operability and semantics | Strong keyboard, screen-reader, reflow, and contrast evidence |
| Portfolio reviewer | See thoughtful Angular/frontend architecture | Storybook states, reusable components, and API-backed behavior |

## First Three Journeys

### Journey 1: Quick Search

User opens the mobile app and searches for `population migration`.

Expected flow:

- search box is first meaningful control
- result count appears quickly
- result cards show title, type, year, program, geography, source, and short summary
- search status is announced politely
- user can page results without losing orientation

Engagement opportunity:

- compact result-set summary showing total results and top facet categories
- no large chart before results

### Journey 2: Refine With Filters

User opens Filters and selects ACS, Census source, and 2025.

Expected flow:

- Filters button shows active count
- drawer opens with focus inside
- facet groups show counts
- selected filters become active chips
- drawer closes and focus returns to trigger
- result count updates from the API

Engagement opportunity:

- small "results changed" summary after filters apply
- optional mini bar indicators inside facet options, if accessible and not visually noisy

### Journey 3: Understand the Result Set

User wants to understand what kind of material the search found before opening individual results.

Expected flow:

- result set summary appears after search
- user can expand a compact "Search summary" panel
- panel shows type mix, top programs, year range, and geography coverage when available
- all chart data is also available as text

Engagement opportunity:

- lightweight data visualization panel below search controls or after the first few results
- chart components are secondary to results and never block the primary search flow

## Information Architecture

Mobile first screen:

```text
App title
Search input
Filters + sort row
Result count and status
Active filter chips
Result cards
Pagination
```

Optional summary placement:

```text
App title
Search input
Filters + sort row
Result count
Compact "Search summary" disclosure
Result cards
```

The summary should default to compact or collapsed on very small screens unless user research shows it improves task completion.

## Content Tone

Use plain federal-service language:

- "Research objects" only when the API/domain requires it.
- Prefer "results", "datasets", "publications", "methods", "programs", "geographies", and "years".
- Empty states should explain what happened and what the user can try next.
- Error states should be specific without exposing implementation details.

## Engagement Principles

- Engagement comes from clarity, speed, and confidence.
- Visualizations should answer immediate user questions.
- Every visualization needs a textual equivalent.
- Avoid chart-first layouts on mobile.
- Avoid decorative illustrations that do not help search or comprehension.
- Use progressive disclosure so detailed context does not crowd the first screen.
- Favor small multiples and compact summaries over large dashboards.

## First-Slice UX Definition

The first implementation slice should include:

- mobile search shell
- realistic fixture result cards
- filter drawer
- active chips
- result count
- loading/empty/error states
- one compact result-set summary component using fixture data

The summary component can initially render text-first with a simple visual treatment, then become a chart once shared data contracts are stable.
