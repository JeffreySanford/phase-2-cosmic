# Lakehouse Initiative PR41 MVP

> Status: **new PR41 implementation target**
> Scope: local MVP for a real Bronze/Silver/Gold medallion artifact path.
> Label: **Lakehouse Initiative / PR41**

PR41 creates the first runnable medallion proof that is separate from the PR40 public-source evidence scaffold. It is intentionally small: one bounded observation extract, one Bronze table, one Silver canonical table, one Silver quarantine table, and one Gold aggregate.

## Goal

Prove this path locally:

```text
provider extract
  -> Bronze observation events
  -> Silver canonical observations
  -> Silver analytical quarantine
  -> Gold observation summary
```

The MVP writes generated artifacts under:

```text
tmp/lakehouse/pr41-delta/
```

Runtime data stays out of git. The committed source and docs define how to recreate and verify it.

## Commands

```bash
pnpm nx run lakehouse-mvp:run
pnpm nx run lakehouse-mvp:verify
pnpm nx run lakehouse-mvp:test
pnpm nx run lakehouse-mvp:validate-source-registry
```

The runner requires Python with `pyarrow` available. It does not require Spark for the MVP.

The default run uses the guarded `tiny` scale profile. Larger profiles are registered but require explicit local approval. See [`PR41_SCALE_PROFILES_AND_CONTROL_VIEW.md`](./PR41_SCALE_PROFILES_AND_CONTROL_VIEW.md).

The large-profile implementation plan is documented in [`PR41_SCALE_IMPLEMENTATION_PLAN.md`](./PR41_SCALE_IMPLEMENTATION_PLAN.md).

The PR41 testing-suite plan is documented in [`PR41_TESTING_SUITE_PLAN.md`](./PR41_TESTING_SUITE_PLAN.md).

The PR41 diagnostic UI plan is documented in [`PR41_DIAGNOSTIC_VIEW_PLAN.md`](./PR41_DIAGNOSTIC_VIEW_PLAN.md).

## Moving Parts

| Part              | File or path                                                      | Responsibility                                                                                                            |
| ----------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| MVP runner        | `tools/lakehouse-mvp/pr41_lakehouse_mvp.py`                       | Builds source rows, writes Parquet table files, writes Delta transaction metadata, and emits `manifest.json`.             |
| MVP verifier      | `tools/lakehouse-mvp/verify-pr41-mvp.mjs`                         | Confirms each medallion table has a manifest entry, Parquet file, and Delta log actions.                                  |
| Scale registry    | `tools/lakehouse-mvp/scale-profiles.json`                         | Defines `tiny`, `10gb`, `100gb`, and `1tb` profiles and large-profile guard requirements.                                 |
| Source registry   | `tools/lakehouse-mvp/source-registry.example.json`                | Defines PR41 source profiles and `offline-fixture`, `core-proof`, and `expanded-development` bundles.                     |
| Source schema     | `tools/lakehouse-mvp/source-registry.schema.json`                 | Validates the checked-in source registry shape.                                                                           |
| Nx project        | `tools/lakehouse-mvp/project.json`                                | Provides `run`, `verify`, and `test` targets.                                                                             |
| Generated root    | `tmp/lakehouse/pr41-delta/`                                       | Local artifact root for PR41 MVP output.                                                                                  |
| Evidence service  | `apps/frontend/src/server/lakehouse/lakehouse-metrics.service.ts` | Reads the PR41 manifest when present and returns verified medallion evidence through the existing Lakehouse metrics path. |
| Diagnostics view  | `apps/frontend/src/app/features/diagnostics/`                     | Displays read-only Lakehouse evidence state, active profile, artifact root, medallion layer state, and guard warnings.    |
| Bronze table      | `bronze/observation_events`                                       | Source-faithful event rows with provider, schema version, event hash, source payload, and ingest run metadata.            |
| Silver table      | `silver/observations`                                             | Canonical observation rows accepted from Bronze.                                                                          |
| Silver quarantine | `silver/quarantine`                                               | Records retained in Bronze but rejected by Silver validation with deterministic reason codes.                             |
| Gold table        | `gold/observation_summary`                                        | Consumer aggregate grouped by collection with lineage back to Bronze event IDs.                                           |

## MVP Table Contract

### Bronze: `bronze.observation_events`

Bronze preserves source truth before canonicalization:

- `bronze_event_id`
- `source_provider`
- `source_profile`
- `schema_version`
- `source_identifier`
- `event_hash`
- `ingest_run_id`
- `ingested_at`
- `source_payload_json`

Bronze retains incomplete or malformed source records so later correction/replay is possible.

### Silver: `silver.observations`

Silver contains canonical observations that satisfy the MVP analytical contract:

- stable source identifier,
- valid RA/Dec,
- object/access URI,
- source provider and collection,
- data product type,
- lineage to `bronze_event_id`.

Duplicate source identifiers are not promoted into the canonical table.

### Silver Quarantine: `silver.quarantine`

Quarantine stores records that were safely retained in Bronze but failed Silver rules. Initial deterministic reason codes include:

- `missing_source_identifier`
- `missing_object_or_access_uri`
- `invalid_ra`
- `invalid_dec`
- `duplicate_source_identifier`

### Gold: `gold.observation_summary`

Gold provides one consumer-ready aggregate:

- collection,
- accepted observation count,
- total quarantined record count,
- source Silver table,
- Bronze lineage IDs,
- refresh timestamp.

## Evidence Criteria

PR41 MVP evidence is valid when:

- Bronze contains source-faithful records.
- Silver contains at least one canonical observation.
- Silver quarantine contains at least one rejected record with a deterministic reason.
- Gold contains at least one aggregate.
- Gold rows retain lineage to Bronze event IDs.
- `pnpm nx run lakehouse-mvp:test` passes.
- `GET /api/v1/lakehouse/metrics` can read the local manifest and report the PR41 MVP as verified medallion evidence when `tmp/lakehouse/pr41-delta/manifest.json` exists.

The manifest root can be overridden for local testing:

```bash
LAKEHOUSE_MVP_ROOT=/path/to/pr41-delta pnpm nx run frontend:test
```

## Definition of Done

PR41 is done only when the repository proves a reproducible local medallion MVP and clearly labels the remaining production-runtime work as future scope.

### Required implementation

- A committed Nx project exposes `lakehouse-mvp:run`, `lakehouse-mvp:verify`, and `lakehouse-mvp:test`.
- A committed scale-profile registry defines `tiny`, `10gb`, `100gb`, and `1tb`, with `tiny` as the safe default.
- Large profiles require explicit local approval before artifact generation.
- `pnpm nx run lakehouse-mvp:run` creates a fresh local artifact root under `tmp/lakehouse/pr41-delta/`.
- The generated artifact root contains Bronze, Silver, Silver quarantine, and Gold table directories.
- Each MVP table has Parquet-backed data and Delta transaction metadata sufficient for the verifier to inspect.
- Bronze preserves source-faithful observation event payloads, source attribution, schema version, event hashes, ingest run metadata, and stable Bronze event IDs.
- Silver promotes at least one canonical observation derived from Bronze and retains lineage to the source Bronze event.
- Silver quarantine retains at least one Bronze-retained record that failed the canonical analytical contract and records a deterministic reason code.
- Gold produces at least one observation summary aggregate with lineage back to Silver and Bronze.
- The existing Lakehouse evidence service reports verified PR41 medallion evidence when `tmp/lakehouse/pr41-delta/manifest.json` exists.
- The generated manifest records the selected scale profile.
- The generated manifest records the selected source bundle.
- The existing diagnostics UI includes a read-only Lakehouse section for PR41 evidence/profile/layer/guard state.

### Required verification

- `pnpm nx run lakehouse-mvp:test` passes.
- `pnpm nx run lakehouse-mvp:verify` passes against artifacts produced by the runner.
- `pnpm nx run lakehouse-mvp:validate-source-registry` passes.
- Relevant frontend/server tests for `GET /api/v1/lakehouse/metrics` pass with and without a PR41 manifest.
- Relevant diagnostics UI tests cover the PR41 read-only evidence/profile/layer state.
- Generated runtime artifacts remain out of git.
- Documentation lint and formatting checks pass.
- The PR CI quality gate is green before merge.

### Required documentation

- This document remains the authoritative PR41 moving-parts guide.
- [`PR41_SCALE_PROFILES_AND_CONTROL_VIEW.md`](./PR41_SCALE_PROFILES_AND_CONTROL_VIEW.md) remains the authoritative PR41 profile/control-view contract.
- [`PR41_SCALE_IMPLEMENTATION_PLAN.md`](./PR41_SCALE_IMPLEMENTATION_PLAN.md) remains the authoritative PR41 large-profile implementation plan.
- [`PR41_TESTING_SUITE_PLAN.md`](./PR41_TESTING_SUITE_PLAN.md) remains the authoritative PR41 MVP testing-suite plan.
- [`PR41_DIAGNOSTIC_VIEW_PLAN.md`](./PR41_DIAGNOSTIC_VIEW_PLAN.md) remains the authoritative PR41 diagnostic view plan.
- `documentation/lakehouse/TODO.md` reflects which PR41 MVP items are complete and which items move to later PRs.
- The PR description states that PR41 is a **local reference MVP**, not a production Spark/Kafka/Databricks implementation.
- Any dashboard, metric, or evidence text distinguishes PR41 verified local medallion evidence from PR40 public-source proof and PR42 Databricks planning.

### Explicitly Out Of Scope For PR41

These items are not required for PR41 merge unless the PR scope is intentionally expanded:

- Spark Structured Streaming production jobs.
- Kafka-to-Bronze streaming ingestion.
- Databricks workspace connectivity, Unity Catalog tables, or scheduled Databricks jobs.
- Production object-storage table locations.
- Large-scale throughput, recovery, compaction, or checkpoint benchmarks.
- Full source-registry bundle management beyond the local MVP input used by the runner.

## Boundary

This MVP is not a production Spark deployment. It is a local, inspectable medallion reference runtime that proves the table contracts and transformation behavior before adding Spark Structured Streaming, Kafka consumption, catalog integration, and production storage.

The eventual Spark/Delta implementation should preserve these contracts while replacing the local writer with the selected Delta-capable runtime.
