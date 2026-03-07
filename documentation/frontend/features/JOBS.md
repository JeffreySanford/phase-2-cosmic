# Jobs

Alignment anchors

- Frontend UX source of truth: [../../FRONTEND_UI.md](/docuentation/frontend/FRONTEND_UI.md)
- Execution backlog: [../../../TODO.md](/docuentation/planning/TODO.md)
- Delivery plan: [../../../ROADMAP.md](/ROADMAP.md)

Status: `in-progress` (route/page implemented in baseline form; UX/data contract hardening in progress)

## Purpose

The Jobs page is the operational orchestration surface for:

- submitting jobs
- tracking lifecycle transitions
- diagnosing failed or stalled runs

## Primary user outcomes

1. Submit a job with clear parameter validation.
2. Observe status changes without leaving the page.
3. Access enough context to decide retry/cancel/escalate actions.

## Required layout

- Top toolbar: submit, refresh, deferred-release, and filter actions
- Main stage: compact job card grid/list
- Detail experience: inline expansion on card click rather than a permanently open second table or drawer

Mobile:

- stacked sections with expandable detail cards

## Submit form contract

Fields:

- workflow (required)
- dataset id (required)
- parameters (key/value)
- requestedBy (optional but recommended)

Action:

- `POST /api/v1/jobs`

Success behavior:

- optimistic insertion into the compact jobs list
- confirmation toast with new `jobId`

Validation behavior:

- field-level inline errors
- preserve entered values on failure
- newly submitted jobs should appear as `QUEUED` first, then transition through `RUNNING`, then a terminal state such as `COMPLETED`

Implementation direction:

- use Angular reactive forms as the primary submit mechanism
- avoid making raw JSON text the default authoring path for structured workflows
- allow a generated JSON preview for advanced users, but keep it secondary

### VO-specific submit mode

When the selected workflow is a VO job type, the form must switch from generic key/value entry to a typed VO form.

Supported VO workflow family:

- `vo.cone-search`
- `vo.adql.query`
- `vo.obscore.search`
- `vo.votable.fetch`
- `vo.datalink.resolve`
- `vo.product.fetch`
- `vo.soda.cutout`
- `vo.preview.fetch`

VO form requirements:

- dynamic subform by selected VO workflow
- provider selector populated from configured public VO providers
- URL validation for TAP, DataLink, SODA, and product URLs
- conditional validators for target name vs RA/Dec entry
- range validation for radius and optional spectral/time bounds
- explicit live-source labeling; VO jobs should default to live public data, not simulator mode
- pre-submit validation through `POST /api/v1/jobs/validate`

VO artifact expectations:

- discovery jobs return parsed tables and provenance metadata
- DataLink jobs return resolved product links
- product fetch and cutout jobs may return binary artifacts such as `fits`, `jpg`, or `png`

VO execution rule:

- if the UI offers a VO workflow, the backend executor path for that workflow must be a live VO executor or an explicitly labeled fallback mode
- hidden simulator behavior is not acceptable for operator-facing VO submissions

## Queue table contract

The page should no longer render both a card list and a duplicate table of the same jobs.

List/card requirements:

- jobs are collapsed by default so more records fit on screen
- each card shows workflow, job id, dataset id, status, and recent update time
- deferred jobs are visually marked
- clicking `Details` expands inline detail content for exactly one job at a time
- expanded content contains parameters, lineage editing, logs, artifacts, and external-source detail where available

Sorting:

- default by `updatedAt desc`

Filter controls:

- status
- workflow
- dataset
- time window

Deferred-job control:

- provide a visible release action for queued cached/deferred jobs
- release action should trigger backend deferred-job release and then refresh the job list

## Job detail contract

Tabs:

- Summary
- Parameters
- Timeline
- Errors/Logs
- Artifacts (placeholder until backend support exists)

Data source:

- `GET /api/v1/jobs/{id}`

Polling behavior:

- poll while state in `QUEUED|RUNNING`
- stop polling in terminal states

## UI state requirements

Must render:

- loading
- empty
- stale
- partial
- error
- recovered

Error copy rule:

- include cause and next action
- no generic “something went wrong”

## API dependencies

Baseline implemented:

- `GET /api/v1/jobs`
- `POST /api/v1/jobs`
- `GET /api/v1/jobs/{id}`
- `POST /api/v1/jobs/{id}/transition` (current control action path)
- `GET /api/v1/jobs/types`

Required next:

- `GET /api/v1/jobs` filtering/pagination parameters
- dedicated cancellation endpoint (`POST /api/v1/jobs/{id}/cancel`) or explicit decision to keep generic transition API
- typed workflow schemas for the VO workflow family
- provider/capability metadata endpoint sufficient to drive VO form options
- live VO executor contract that returns source-state metadata (`live`, `cached`, `fallback`, `failed`)

## Testing requirements

Unit:

- form validation and state handling

Integration:

- submit flow + status polling

E2E:

- create job -> observe queued state -> open details
- simulate failed job -> verify actionable error UX
