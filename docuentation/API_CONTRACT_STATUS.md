# API Contract Status (Current vs Target)

Alignment anchors
- Frontend UX source of truth: [FRONTEND_UI.md](FRONTEND_UI.md)
- Execution backlog: [../TODO.md](../TODO.md)
- Delivery plan: [../ROADMAP.md](../ROADMAP.md)

This document is the contract drift guardrail between implemented backend endpoints and frontend expectations.

## 1. Governance jobs endpoints

Implemented:
- `GET /api/v1/jobs`
- `POST /api/v1/jobs`
- `GET /api/v1/jobs/{id}`
- `POST /api/v1/jobs/{id}/transition`
- `GET /api/v1/jobs/types`
- `GET /api/v1/jobs/{id}/logs`
- `GET /api/v1/jobs/{id}/artifacts`
- `GET /api/v1/jobs/{id}/artifacts/{name}`

In discussion / target:
- `POST /api/v1/jobs/{id}/cancel` (explicit cancel endpoint)
- filtered and paginated list contract on `GET /api/v1/jobs`

## 2. Governance dataset endpoints

Implemented:
- `GET /api/v1/datasets`
- `POST /api/v1/datasets`
- `GET /api/v1/datasets/{id}`

Target:
- `GET /api/v1/datasets/{id}/jobs`
- `GET /api/v1/datasets/{id}/provenance`

## 3. OpenAPI coverage status

Current OpenAPI file:
- `openapi/governance.yaml`

Coverage notes:
- core jobs endpoints are represented
- dataset and extended jobs endpoints must be reflected when stabilized

## 4. Frontend dependency status

Jobs route:
- implemented in baseline form and wired to current endpoints

Datasets route:
- implemented as CRUD scaffold; pending operational model enrichment

## 5. Required contract decisions (next)

1. Decide between:
- generic state transition endpoint
- explicit action endpoints (cancel/retry/etc)

2. Freeze naming conventions:
- `jobId/workflow/status` as canonical response fields
- avoid parallel legacy shapes (`id/type/state`) in frontend/backend interfaces

3. Add contract tests for:
- jobs submit/list/get/transition
- datasets create/list/get

## 6. Related docs

- [JAVA_GOVERNANCE_SPEC.md](JAVA_GOVERNANCE_SPEC.md)
- [frontend/features/JOBS.md](frontend/features/JOBS.md)
- [frontend/features/DATASETS.md](frontend/features/DATASETS.md)
- [TESTING_REQUIREMENTS.md](TESTING_REQUIREMENTS.md)
