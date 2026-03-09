# Provenance E2E Scaffold

Mission linkage:

- Mission outcome: Reproducible science
- Mission outcome: Institutional trust and audit

This document records the Sprint 1 provenance verification scaffold that exists
today in the workspace. It is intentionally narrow: the goal is to give Sprint 2
and Sprint 3 work a deterministic harness for manifest, lineage, and audit
verification without waiting for the full execution-layer API.

## Scope

The current scaffold covers two complementary paths:

- Backend integration verification through `ProvenanceE2ETest`
- Frontend/operator verification through a dedicated Cypress provenance suite

## Backend path

Java governance already contains a focused integration test:

- `apps/java-governance/src/test/java/com/cosmic/governance/test/ProvenanceE2ETest.java`

Current assertions:

- submit a job containing `manifest` and `lineage`
- verify an audit entry is emitted for that job
- verify `GET /api/v1/jobs/{id}` returns manifest content
- verify `GET /api/v1/jobs/{id}/audit` exposes the recorded audit entry
- verify `GET /api/v1/jobs/{id}/manifest` round-trips manifest updates
- verify `GET /api/v1/jobs/{id}/lineage` exposes submitted lineage metadata

Run it through the standard governance target:

```bash
pnpm nx run java-governance:test
```

## Frontend path

Sprint 1 adds a dedicated Nx target for provenance-focused Cypress coverage:

```bash
pnpm nx run frontend-e2e:e2e-provenance
```

That suite currently runs:

- `apps/frontend-e2e/src/e2e/datasets-provenance.cy.ts`
- `apps/frontend-e2e/src/specs/jobs-lineage.spec.ts`

Current assertions:

- dataset list renders provenance fields from metadata
- manifest payload appears in the provenance panel
- dataset create flow keeps provenance rendering intact
- jobs lineage submission is visible in the Jobs detail UI

## Why this is only scaffolding

Sprint 1 stops short of full execution-layer provenance verification. The
following work is intentionally deferred to later sprints:

- execution-plan endpoints and Trident plan audit verification
- authenticated negative-path provenance checks
- deterministic CI smoke lane selection for the provenance suite
- end-to-end correlation from Trident scheduling blocks into downstream backend
  job templates

## Next handoff

Sprint 3 should extend this scaffold to cover the execution audit path once the
execution endpoints exist. When that lands, this document should link the
execution-plan contract tests and any new audit endpoint coverage.
