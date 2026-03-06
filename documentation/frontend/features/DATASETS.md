# Datasets

Alignment anchors

- Frontend UX source of truth: [../../FRONTEND_UI.md](/docuentation/frontend/FRONTEND_UI.md)
- Viewer source contract: [../../viewer/VIEWER_SOURCE_CONTRACT.md](/docuentation/viewer/VIEWER_SOURCE_CONTRACT.md)
- Public data inventory: [../../../documentation/public-data/PUBLIC_DATA_RESOURCES.md](/documentation/public-data/PUBLIC_DATA_RESOURCES.md)
- Execution backlog: [../../../TODO.md](/TODO.md)
- Delivery plan: [../../../ROADMAP.md](/ROADMAP.md)

Status: `in-progress` (baseline route + CRUD scaffold implemented; operational model pending)

## Purpose

The Datasets page provides discoverability and operational readiness visibility for data assets used by orchestration workflows.

## Primary user outcomes

1. Find a dataset quickly by id, source, or state.
2. Understand whether a dataset is ready for processing.
3. Navigate from dataset context to related jobs and provenance.

## Required layout

- Top filter bar
- Main dataset table
- Right-side details panel (or modal on small screens)

## Dataset table contract

Minimum columns:

- dataset id
- source
- size
- ingest status
- updated at
- related jobs count

Filters:

- status
- source
- date range
- free-text search

## Dataset detail panel

Sections:

- Metadata summary
- Readiness checks
- Related jobs
- Provenance links
- Source attribution
- Artifact references

Actions:

- “Create job from this dataset” (prefills Jobs submit form)
- “Open provenance view”

Source-attribution rule:

- If a dataset is derived from an external/public source, show source name and link as subdued small text in the detail panel.
- Preserve authoritative `citationUrl`, provider, source/dataset identifier, and access timestamp when available.
- Use the same attribution vocabulary as the Viewer (`live`, `fallback`, `cached`, `stale`, `mock`) where source state is meaningful.

## UI state requirements

Must render:

- loading
- empty
- stale
- partial
- error
- recovered

## Backend dependency (target)

Implemented baseline APIs:

- `GET /api/v1/datasets`
- `POST /api/v1/datasets`
- `GET /api/v1/datasets/{id}`

Required next APIs:

- `GET /api/v1/datasets/{id}/jobs`
- `GET /api/v1/datasets/{id}/provenance`

Planned contract enrichment:

- dataset detail payload should expose source-attribution metadata for externally sourced datasets
- dataset list payload may expose compact `sourceName` / `providerName` fields for filters and chips

Near-term UX note:

- current page is CRUD scaffold and must evolve to readiness/provenance-focused view before considered production-grade.

## Testing requirements

Unit:

- filter and table state logic

Integration:

- dataset list + detail retrieval

E2E:

- select dataset -> open detail -> navigate to jobs/provenance
- external-source citation renders in dataset detail when present
