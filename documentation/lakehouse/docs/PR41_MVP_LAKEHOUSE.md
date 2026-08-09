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

Install the pinned runner dependency once per environment:

```bash
python -m pip install -r tools/lakehouse-mvp/requirements.txt
```

Nx targets invoke Python through `scripts/run-python.cjs` rather than a bare `python`. The resolver scans every `python3`/`python` on `PATH` (plus the Windows `py -3` launcher) and selects the first interpreter that can import `pyarrow`, so a workstation with several interpreters does not need `PATH` reordering. Set `LAKEHOUSE_PYTHON` to force a specific interpreter. When no interpreter has `pyarrow`, the resolver fails with the install command instead of a bare `ModuleNotFoundError`.

The default run uses the guarded `tiny` scale profile. Larger profiles are registered but require explicit local approval. See [`PR41_SCALE_PROFILES_AND_CONTROL_VIEW.md`](./PR41_SCALE_PROFILES_AND_CONTROL_VIEW.md).

The large-profile implementation plan is documented in [`PR41_SCALE_IMPLEMENTATION_PLAN.md`](./PR41_SCALE_IMPLEMENTATION_PLAN.md).

The PR41 testing-suite plan is documented in [`PR41_TESTING_SUITE_PLAN.md`](./PR41_TESTING_SUITE_PLAN.md).

The PR41 diagnostic UI plan is documented in [`PR41_DIAGNOSTIC_VIEW_PLAN.md`](./PR41_DIAGNOSTIC_VIEW_PLAN.md).

## Moving Parts

| Part              | File or path                                                      | Responsibility                                                                                                                                   |
| ----------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| MVP runner        | `tools/lakehouse-mvp/pr41_lakehouse_mvp.py`                       | Builds source rows, writes Parquet table files, writes Delta transaction metadata, and emits `manifest.json`.                                    |
| MVP verifier      | `tools/lakehouse-mvp/verify-pr41-mvp.mjs`                         | Confirms each medallion table has a manifest entry, Parquet file, and Delta log actions.                                                         |
| Scale registry    | `tools/lakehouse-mvp/scale-profiles.json`                         | Defines `tiny`, `10gb`, `100gb`, and `1tb` profiles and large-profile guard requirements.                                                        |
| Source registry   | `tools/lakehouse-mvp/source-registry.example.json`                | Defines PR41 source profiles, the adapter contract, and the `live-default`, `offline-fixture`, `core-proof`, and `expanded-development` bundles. |
| Source schema     | `tools/lakehouse-mvp/source-registry.schema.json`                 | Validates the checked-in source registry shape.                                                                                                  |
| Source fixtures   | `tools/lakehouse-mvp/fixtures/`                                   | Offline rows per provider profile, used in CI and whenever a live query is unavailable.                                                          |
| Nx project        | `tools/lakehouse-mvp/project.json`                                | Provides `run`, `verify`, and `test` targets.                                                                                                    |
| Runner deps       | `tools/lakehouse-mvp/requirements.txt`                            | Pins the `pyarrow` version the local reference runtime is validated against.                                                                     |
| Python resolver   | `scripts/run-python.cjs`                                          | Selects a `pyarrow`-capable interpreter so Nx targets do not depend on `PATH` ordering.                                                          |
| Generated root    | `tmp/lakehouse/pr41-delta/`                                       | Local artifact root for PR41 MVP output.                                                                                                         |
| Evidence service  | `apps/frontend/src/server/lakehouse/lakehouse-metrics.service.ts` | Reads the PR41 manifest when present and returns verified medallion evidence through the existing Lakehouse metrics path.                        |
| Diagnostics view  | `apps/frontend/src/app/features/diagnostics/`                     | Displays read-only Lakehouse evidence state, active profile, artifact root, medallion layer state, and guard warnings.                           |
| Bronze table      | `bronze/observation_events`                                       | Source-faithful event rows with provider, schema version, event hash, source payload, and ingest run metadata.                                   |
| Silver table      | `silver/observations`                                             | Canonical observation rows accepted from Bronze.                                                                                                 |
| Silver quarantine | `silver/quarantine`                                               | Records retained in Bronze but rejected by Silver validation with deterministic reason codes.                                                    |
| Gold table        | `gold/observation_summary`                                        | Consumer aggregate grouped by collection with lineage back to Bronze event IDs.                                                                  |

## Source Adapter Contract

Lakehouse entities are not coupled to any single archive's column names. The registry declares one adapter contract, `vo-tap-obscore.v1`, with six canonical fields:

```text
sourceIdentifier, collection, dataProductType, ra, dec, accessUri
```

Every active source profile maps its own provider vocabulary onto those canonical fields:

| Canonical field    | ESO / ObsCore profiles | NRAO VLASS profile |
| ------------------ | ---------------------- | ------------------ |
| `sourceIdentifier` | `obs_publisher_did`    | `product_id`       |
| `collection`       | `obs_collection`       | `collection_name`  |
| `dataProductType`  | `dataproduct_type`     | `product_type`     |
| `ra`               | `s_ra`                 | `ra_deg`           |
| `dec`              | `s_dec`                | `dec_deg`          |
| `accessUri`        | `access_url`           | `download_url`     |

Silver canonicalization and quarantine validation read the field map rather than provider-specific column names, so adding a provider means adding a profile and a fixture — not editing the transform. The NRAO profile deliberately uses a non-ObsCore vocabulary so the contract is proven against a second provider shape rather than assumed.

Bundle selection changes real data. Each bundle produces the rows of its active profiles and records the contributing providers in the manifest:

| Bundle                 | Active providers        | Bronze rows |
| ---------------------- | ----------------------- | ----------- |
| `live-default`         | ESO, PR41 fixture       | 10          |
| `offline-fixture`      | PR41 fixture            | 5           |
| `core-proof`           | ESO                     | 5           |
| `expanded-development` | ESO, NRAO, PR41 fixture | 15          |

### Source modes: live by default, fixtures in CI

Live data is the normal local posture. The runner resolves a source mode per run:

| Mode      | Behavior                                                                                               |
| --------- | ------------------------------------------------------------------------------------------------------ |
| `auto`    | Default. Queries live on a developer machine; falls back to fixtures in CI or when a live query fails. |
| `live`    | Requires a successful query for every live-capable profile; fails rather than degrading silently.      |
| `fixture` | Never touches the network.                                                                             |

```bash
pnpm nx run lakehouse-mvp:run                      # auto: live locally
pnpm nx run lakehouse-mvp:run -- --source-mode live
pnpm nx run lakehouse-mvp:run -- --source-mode fixture
```

`LAKEHOUSE_SOURCE_MODE` sets the same value. Live queries use a bounded VO/TAP sync request through the Python standard library, so the MVP gains no HTTP dependency.

CI resolves to fixtures automatically because GitHub Actions sets `CI=true`. The verifier **fails a CI run that reports live rows**, so the hermetic guarantee is enforced rather than assumed.

### Evidence boundary for sources

The manifest records how every profile's rows were actually obtained — `live`, `fixture`, or `fixture-fallback` with the reason — under `sourceBundle.resolvedProfiles`, plus a `hasLiveRows` flag the verifier cross-checks. A bundle may legitimately mix live and fixture rows; the manifest never implies live data that was not fetched.

A profile's `endpoint` and `query` describe the upstream contract. When a profile resolves to `fixture`, running it is **not** evidence of a live query against that archive. Profiles that are not ready for use stay `planned` and carry no adapter, so they cannot silently become active — `nrao-tap-live` holds that boundary explicitly.

The default `live-default` bundle deliberately pairs the live ESO profile with the deterministic fixture. A live archive can return entirely clean records, which would leave the quarantine layer empty and make the duplicate/invalid-coordinate contracts unprovable. An empty layer is written as a valid typed table rather than failing the run, and the verifier then fails on missing quarantine evidence — the evidence criteria are enforced, not bypassed.

## MVP Table Contract

### Bronze: `bronze.observation_events`

Bronze preserves source truth before canonicalization:

- `bronze_event_id`
- `source_provider` (from the profile that produced the row)
- `source_profile` (the registry profile ref)
- `source_bundle` (the bundle selected for the run)
- `adapter_contract`
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
- The runner defaults to a live VO/TAP query locally and falls back to fixtures in CI, recording the resolved mode and reason per source profile.
- Every Go module in the workspace runs unit tests, `go vet`, golangci-lint, and CodeQL in CI.
- The existing diagnostics UI includes a read-only Lakehouse section for PR41 evidence/profile/layer/guard state.

### Required verification

- `pnpm nx run lakehouse-mvp:test` passes.
- `pnpm nx run lakehouse-mvp:verify` passes against artifacts produced by the runner. The gate runs it with `--require-fresh` so a manifest left over from a previous run fails instead of passing silently; standalone `verify` stays lenient for inspecting existing artifacts.
- `pnpm nx run lakehouse-mvp:validate-source-registry` passes.
- Relevant frontend/server tests for `GET /api/v1/lakehouse/metrics` pass with and without a PR41 manifest.
- Relevant diagnostics UI tests cover the PR41 read-only evidence/profile/layer state.
- `bash scripts/test-go.sh` passes for every Go module, including the FITS renderer.
- A CI run resolves every source profile to a fixture; the verifier fails a CI run that reports live rows.
- Generated runtime artifacts remain out of git.
- Documentation lint and formatting checks pass.
- The PR CI quality gate is green before merge. The `Lakehouse PR41 MVP` job in `.github/workflows/ci.yml` installs the pinned runner dependency, runs `pnpm run lakehouse:pr41:mvp` on the `tiny` profile, and fails if the run leaves generated artifacts tracked by git.

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

PR41 scope was intentionally expanded to include a live source path and Go test coverage. These items remain out of scope:

- Spark Structured Streaming production jobs.
- Kafka-to-Bronze streaming ingestion.
- Databricks workspace connectivity, Unity Catalog tables, or scheduled Databricks jobs.
- Production object-storage table locations.
- Large-scale throughput, recovery, compaction, or checkpoint benchmarks.
- Full source-registry bundle management beyond the local MVP input used by the runner.
- A live NRAO/VLASS extract. `nrao-tap-live` stays `planned` until its query contract is validated against the real endpoint.
- Projecting source attribution into Phase 2 provenance records. Bronze carries the attribution fields, but the mapping into existing provenance semantics is later work.

## Boundary

This MVP is not a production Spark deployment. It is a local, inspectable medallion reference runtime that proves the table contracts and transformation behavior before adding Spark Structured Streaming, Kafka consumption, catalog integration, and production storage.

The eventual Spark/Delta implementation should preserve these contracts while replacing the local writer with the selected Delta-capable runtime.
