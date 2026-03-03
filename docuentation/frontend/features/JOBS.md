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

- Left panel: submit form
- Center panel: job queue table
- Right panel or drawer: selected job details

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
- optimistic insertion into queue table
- confirmation toast with new `jobId`

Validation behavior:
- field-level inline errors
- preserve entered values on failure

## Queue table contract

Minimum columns:
- job id
- workflow
- dataset id
- status
- created at
- updated at
- requested by

Sorting:
- default by `updatedAt desc`

Filter controls:
- status
- workflow
- dataset
- time window

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

## Testing requirements

Unit:
- form validation and state handling

Integration:
- submit flow + status polling

E2E:
- create job -> observe queued state -> open details
- simulate failed job -> verify actionable error UX
