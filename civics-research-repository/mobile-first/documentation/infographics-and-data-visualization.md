# Infographics and Data Visualization Plan

Status: proposed

## Purpose

Infographics and data visualizations should help users understand search context, result composition, and research provenance. They should not compete with the primary search/results workflow.

The visual layer should be evidence-driven:

- use API response metadata where available
- use Storybook fixtures before live integration
- provide text equivalents for every chart
- preserve performance on mobile
- remain useful at 320px

## Visualization Candidates

| Visualization | User Question | Data Needed | Placement | Priority |
| --- | --- | --- | --- | --- |
| Result type mix | What kinds of results did I find? | content type facet counts | Compact search summary | High |
| Top programs | Which Census programs dominate this query? | program facet counts | Compact search summary or filter drawer | High |
| Year distribution | Are results current or historical? | vintage year facets | Expandable summary | Medium |
| Geography coverage | Which geographies appear most? | geography facets | Expandable summary | Medium |
| Source/provenance summary | Where are these records coming from? | source system/provenance counts | Result summary and card badges | Medium |
| Filter impact summary | How did my filters narrow results? | total before/after, active filters | After filter apply | Medium |
| Query empty-state guidance | Why did I get no results? | zero result response and available facets if returned | Empty state | Medium |
| Individual result metadata strip | What is this result at a glance? | type, program, year, geography, source | Result card | High |

## Recommended First Visuals

### 1. Result Type Mix

Small horizontal bars or segmented list showing dataset/publication/methodology counts.

Mobile behavior:

- text labels first
- bars are secondary
- no legend-only meaning
- counts are visible in text

Example:

```text
Result types
Datasets        928
Publications    174
Methods          52
```

### 2. Top Programs

Compact ranked list with counts and optional mini bars.

Example:

```text
Top programs
ACS             416
LODES           208
TIGER/Line      117
```

This can also improve the filter drawer by making the most useful refinements easier to scan.

### 3. Year Range

Simple range summary before attempting a full histogram.

Example:

```text
Years covered
2016-2026, strongest in 2024 and 2025
```

Later enhancement:

- small sparkline or compact bar distribution, only if vintage facets are stable and numerous enough.

### 4. Provenance Badges

Use result cards and summary panels to show source/provenance, not as decoration but as trust context.

Example:

```text
Census API
External repository
Federated source
Restricted metadata
```

## Visual Design Rules

- Keep charts compact on mobile.
- Do not put a large dashboard above search results.
- Every chart must have visible labels and counts.
- Do not rely on color alone.
- Avoid hover-only interactions.
- Avoid canvas-only charts unless accessibility fallback is strong.
- Prefer semantic HTML/SVG for simple charts.
- Use tables or lists when they communicate better than charts.
- Keep animation optional and disabled under reduced motion.

## Technical Approach

Start with HTML/CSS/SVG for the first visualizations:

- ranked facet bars
- segmented summaries
- metadata strips
- compact count cards

Defer chart libraries until there is a clear need. If a charting library becomes necessary, evaluate it against:

- accessibility support
- bundle size
- Angular compatibility
- SSR behavior
- responsiveness at 320px
- testability in Storybook and E2E

## Data Contracts

The visualizations should use the same response data as the filters and results.

Candidate fields:

```text
totalResults
facets.contentType
facets.program
facets.publisher
facets.sourceSystem
facets.geography
facets.vintageYear
results[].contentType
results[].program
results[].sourceSystem
results[].geography
results[].vintageYear
results[].provenance
```

If the existing API does not expose a visualization-ready field, prefer adapting the presentation from existing response fields before requesting backend changes.

## Accessibility Requirements

Each visualization must provide:

- visible title
- visible labels
- visible values
- text equivalent
- logical reading order
- keyboard access for any interactive control
- non-color selected state
- forced-colors support
- reduced-motion support

Example pattern:

```text
Heading: Result types
Text: 928 datasets, 174 publications, 52 methodologies
Visual: proportional bars with the same labels and counts
```

## Storybook Coverage

Stories should include:

- normal facet counts
- one dominant category
- many small categories
- zero/empty data
- long labels
- very large counts
- forced-colors-friendly rendering
- 320px width

## E2E Coverage

Browser tests should confirm:

- summary does not cause horizontal scrolling at 320px
- visual labels remain visible
- text equivalent is present
- collapsing/expanding summary works by keyboard
- reduced-motion preference does not block understanding

## Non-Goals

- No analytics dashboard in the first release.
- No map-heavy experience before geography data shape is proven.
- No decorative infographics without task value.
- No client-side corpus analysis beyond the bounded response and facet metadata returned by the API.
