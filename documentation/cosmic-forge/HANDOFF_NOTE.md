# Forge Handoff Note

Alignment anchors

- PI tracker: [./PI_EXECUTION_PLAN.md](./PI_EXECUTION_PLAN.md)
- Runbook: [./RUNBOOK.md](./RUNBOOK.md)
- Persistence plan: [./PERSISTENCE_PLAN.md](./PERSISTENCE_PLAN.md)
- GraphQL contract: [./GRAPHQL_CONTRACT_DRAFT.md](./GRAPHQL_CONTRACT_DRAFT.md)

Status: `implemented`

## Current branch state

The Forge branch is now a bounded, demonstrable PI deliverable with:

- a live `/forge` workbench
- SSR-scoped `/api/forge/*` routing
- a typed Forge API and worker
- persisted local queue state
- live adapter paths for `Legacy Surveys`, `AllWISE`, `Pan-STARRS`, and multiple `SkyView`-derived presets
- composite previews, diagnostics, retry/cancel, caching, provenance, FITS prerendering, and viewer handoff

## What remains post-PI

- move persistence from the current file-backed repository to PostgreSQL
- add GraphQL subscriptions if polling/read-refresh becomes insufficient
- add a live ESASky preview/discovery adapter if the PI expands
- add archive-native `IRSA / 2MASS` if the product needs a non-derived 2MASS path beyond the current SkyView quick-look presets
- add stronger artifact/rendering refinement for more advanced visualization workflows
- add broker-backed scaling only if the bounded worker runtime demonstrably becomes the bottleneck

## Deliberate non-goals of this PI

- broker-backed Forge execution with Kafka, RabbitMQ, or Pulsar
- replacing the governance API surface with Forge semantics
- pretending SkyView/HiPS-derived products are science-ready archive-native cutouts
- broad adapter proliferation before the current adapters are operationally stable

## Recommended next implementation order

1. PostgreSQL-backed repository implementation behind the current state seam.
2. Subscription-capable GraphQL updates without contract churn.
3. ESASky preview adapter if discovery breadth is the next product priority.
4. Archive-native `IRSA / 2MASS` or broker-backed scaling, depending on whether product breadth or runtime pressure is the next constraint.

## Review guidance

If a reviewer is new to the branch, start here:

1. [README.md](./README.md)
2. [RUNBOOK.md](./RUNBOOK.md)
3. [DEMO_CHECKLIST.md](./DEMO_CHECKLIST.md)
4. [PI_EXECUTION_PLAN.md](./PI_EXECUTION_PLAN.md)

That path is intended to be enough to operate and review the branch without a verbal walkthrough.
