# API Contract Status (Current vs Target)

Alignment anchors

- Frontend UX source of truth: [FRONTEND_UI.md](FRONTEND_UI.md)
- Execution backlog: [../TODO.md](../TODO.md)
- Delivery plan: [../ROADMAP.md](../ROADMAP.md)

This document is the contract drift guardrail between implemented backend endpoints and frontend expectations.

## 1. Governance jobs endpoints

Implemented:

- `GET /api/v1/jobs` — with pagination and filtering support ✅
- `POST /api/v1/jobs` — job submission ✅
- `POST /api/v1/jobs/validate` — validate job definition without submission ✅
- `GET /api/v1/jobs/{id}` — retrieve job details ✅
- `POST /api/v1/jobs/{id}/transition` — generic state transition ✅
- `POST /api/v1/jobs/{id}/cancel` — explicit cancel action ✅
- `POST /api/v1/jobs/{id}/retry` — explicit retry action ✅
- `GET /api/v1/jobs/types` — list available job types ✅
- `GET /api/v1/jobs/{id}/logs` — retrieve job logs ✅
- `GET /api/v1/jobs/{id}/artifacts` — list job artifacts ✅
- `GET /api/v1/jobs/{id}/artifacts/{name}` — download specific artifact ✅

**Contract decisions finalized:**

- ✅ Both generic (`/transition`) and explicit action endpoints (`/cancel`, `/retry`) are available
- ✅ Canonical field naming: `jobId`, `workflow`, `status` (implemented across backend and frontend)

## 2. Governance dataset endpoints

Implemented:

- `GET /api/v1/datasets` — list datasets ✅
- `POST /api/v1/datasets` — create dataset ✅
- `GET /api/v1/datasets/{id}` — retrieve dataset details ✅

Extended dataset model (Phase 1C):

- ✅ `workflow`, `jobId`, `sourceDatasetId` provenance fields added to Dataset interface
- ✅ `processingTimestamp`, `parameters` for workflow metadata
- ✅ `ngvlaParams` with `arraySegment`, `antennaClass`, `frequencyBandGHz` for radio telescope configuration

Target (Phase 2):

- `GET /api/v1/datasets/{id}/jobs` — list jobs associated with dataset
- `GET /api/v1/datasets/{id}/provenance` — retrieve dataset provenance chain

## 3. OpenAPI coverage status

Current OpenAPI file:

- `openapi/governance.yaml`

Coverage notes:

- core jobs endpoints are represented
- dataset and extended jobs endpoints must be reflected when stabilized

## 4. Frontend dependency status

Jobs route:

- ✅ Implemented with full submit/status/transition/cancel workflow
- ✅ Wired to all current governance job endpoints
- ✅ Shared page-state components for loading/error/empty states

Datasets route:

- ✅ Implemented as CRUD scaffold with create/list/detail flows
- ✅ Provenance linkage panel showing workflow/jobId/sourceDatasetId/ngvlaParams
- ✅ NGVLA array segment metadata display
- 🔄 Pending operational model enrichment:
  - Job association views (list associated jobs)
  - Full provenance chain retrieval

App shell:

- ✅ Global status/freshness band component integrated

## 5. Required contract decisions (next)

**Completed decisions:**

1. ✅ State transition contract:
   - **Decision**: Support both generic `/transition` AND explicit action endpoints (`/cancel`, `/retry`)
   - **Rationale**: Provides flexibility for UI-driven operations and automation
   - **Status**: Implemented in `GovernanceController.java`

2. ✅ Field naming conventions:
   - **Decision**: `jobId`, `workflow`, `status` as canonical response fields
   - **Status**: Implemented consistently across backend DTOs and frontend models
   - **Legacy cleanup**: Remove parallel legacy shapes (`id/type/state`) from all new code

**Pending decisions (Phase 2):**

1. ✅ NGVLA domain model extensions: (COMPLETED in Phase 1C)
   - Added `NgvlaObservationParams` schema to OpenAPI governance.yaml with `arraySegment` (enum: Main/Long Baseline/SBA), `antennaClass` (18m/6m), `frequencyBandGHz` range
   - Created NGVLA array configuration fixtures: `ngvla-main-array.json`, `ngvla-long-baseline.json`, `ngvla-short-baseline.json`
   - Extended Dataset interface with provenance and ngvlaParams fields

2. 🔄 Contract testing strategy:
   - Add automated contract tests for: jobs submit/list/get/transition/cancel
   - Add automated contract tests for: datasets create/list/get
   - Integrate fixture compatibility validation in CI

## 6. Related docs

- [JAVA_GOVERNANCE_SPEC.md](JAVA_GOVERNANCE_SPEC.md)
- [frontend/features/JOBS.md](frontend/features/JOBS.md)
- [frontend/features/DATASETS.md](frontend/features/DATASETS.md)
- [TESTING_REQUIREMENTS.md](TESTING_REQUIREMENTS.md)
