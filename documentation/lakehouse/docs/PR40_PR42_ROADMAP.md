# Lakehouse Initiative PR40-PR42 Roadmap

> Status: **cross-PR documentation guide**
> Scope: how to update PR40, PR41, and PR42 documentation without blurring implementation claims.

This document is the coordination point for Lakehouse Initiative documentation updates across PR40, PR41, and PR42.

## PR Boundaries

| PR   | Label                                            | Owns                                                                                                                                                                             | Does not claim                                                                                    |
| ---- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| PR40 | Architecture and public-source evidence scaffold | Lakehouse topology, storage responsibilities, medallion contract, ESO public-source proof, proof-only evidence API, Postgres evidence-summary persistence.                       | Real Bronze/Silver/Gold Delta tables, Spark/Kafka Lakehouse ingestion, Databricks implementation. |
| PR41 | Local medallion MVP                              | Local reproducible Bronze/Silver/Gold table artifacts, Silver quarantine, Gold summary, local manifest verification, evidence service integration for verified local MVP output. | Production Spark runtime, Kafka streaming, Databricks workspace/table/job implementation.         |
| PR42 | Databricks sprint plan                           | Databricks target architecture, Unity Catalog and table naming plan, secret/env boundaries, validation states, PR43+ implementation sequence.                                    | Real Databricks tables, jobs, workspace connectivity, production evidence.                        |

## Update Rules

Use these rules when changing any Lakehouse documentation:

1. Keep the implementation status explicit.
2. Do not promote a planned topology edge to implemented without repeatable evidence.
3. Keep PR41 local MVP evidence separate from Databricks production evidence.
4. Keep Databricks analytical ownership separate from Java Governance application ownership.
5. Keep MinIO/S3 authoritative for large science objects unless a future architecture decision explicitly changes that.
6. Update standalone Mermaid source files when changing embedded topology diagrams.
7. Link new PR-specific docs from `documentation/lakehouse/README.md` and `documentation/lakehouse/TODO.md`.

## Documentation Inventory

| File                                           | Primary PR | Purpose                                                                                         |
| ---------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------- |
| `README.md`                                    | Cross-PR   | Landing page, status table, and repository layout.                                              |
| `TODO.md`                                      | Cross-PR   | Staged checklist and remaining implementation work.                                             |
| `docs/LAKEHOUSE_TOPOLOGY.md`                   | PR40       | Target topology and evidence boundary.                                                          |
| `docs/MEDALLION_ARCHITECTURE.md`               | PR40       | Bronze/Silver/Gold responsibilities and failure routing.                                        |
| `docs/STORAGE_RESPONSIBILITIES.md`             | PR40       | Object-store authority versus analytical table responsibilities.                                |
| `docs/REAL_DATA_SOURCES.md`                    | PR40       | Provider-neutral public-source strategy.                                                        |
| `docs/PUBLIC_DATASET_SCAN_2026_08_08.md`       | PR40       | Dated scan of additional public archive/catalog candidates.                                     |
| `docs/ACTIVE_DATASET_SELECTION_PLAN.md`        | PR40/PR41  | Source registry, activation states, include/exclude controls.                                   |
| `docs/ESO_PROOF_SLICE_BRIEF.md`                | PR40       | ESO proof scaffold and first complete slice criteria.                                           |
| `docs/ESO_INGESTION_ADAPTER_CONTRACT.md`       | PR40       | Provider adapter contract.                                                                      |
| `docs/PIPELINE_TELEMETRY_EVIDENCE.md`          | PR40/PR41  | Operator evidence labels and claim boundaries.                                                  |
| `docs/PR41_MVP_LAKEHOUSE.md`                   | PR41       | Local medallion MVP moving parts and acceptance criteria.                                       |
| `docs/PR41_SCALE_PROFILES_AND_CONTROL_VIEW.md` | PR41       | Guarded local scale profiles and platform control-view contract.                                |
| `docs/PR41_SCALE_IMPLEMENTATION_PLAN.md`       | PR41       | Large-profile generation, storage, and verification plan.                                       |
| `docs/PR41_TESTING_SUITE_PLAN.md`              | PR41       | MVP unit/integration/contract/API/e2e and quality-gate testing plan.                            |
| `docs/PR41_DIAGNOSTIC_VIEW_PLAN.md`            | PR41/PR42  | Diagnostics UI state model, read-only payload contract, and future Databricks status placement. |
| `docs/PR42_DATABRICKS_SPRINT_PLAN.md`          | PR42       | Databricks production-runtime sprint plan.                                                      |
| `docs/PR40_PR42_ROADMAP.md`                    | Cross-PR   | Coordination guide for PR40-PR42 updates.                                                       |

## Current Evidence Ladder

The evidence path should be interpreted in this order:

```text
Verified Databricks evidence
  -> verified PR41 local MVP manifest evidence
  -> PR40 public-source proof
  -> explicit unavailable fallback
```

Only the second and third tiers exist in the current repository work. The Databricks tier remains planned until a real workspace/table/job/query is verified.

## Recommended Next Documentation Updates

Good candidates for follow-up documentation work:

- Add a source-registry example and schema after the activation-state fields stabilize.
- Add PR43 Databricks config-validator design once implementation begins.
- Add explicit Databricks SQL query examples after schema names stabilize.
- Add a migration note showing how PR41 local artifact fields map into Spark DataFrame schemas.
- Add evidence screenshots or command output only after the source is repeatable and secrets are redacted.
- Add ADRs only when ownership or platform decisions become durable enough to require formal approval.

## Review Checklist

Before merging Lakehouse docs, confirm:

- The doc states whether the feature is implemented, MVP-local, planned, or unavailable.
- Any generated/sample data is labeled as such.
- Object storage and governance boundaries are preserved.
- Diagrams and Markdown agree.
- Follow-on work is assigned to the correct PR stage.
