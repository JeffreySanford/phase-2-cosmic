# PR41 Scale Implementation Plan

> Label: **Lakehouse Initiative / PR41**
> Scope: implementation plan for guarded `tiny`, `10gb`, `100gb`, and `1tb` local Lakehouse scale profiles.

This plan expands PR41 beyond the tiny medallion MVP by defining how larger local Bronze/Silver/Gold datasets can be generated, controlled, verified, and cleaned up without exhausting a workstation or confusing generated stress evidence with real public-source evidence.

The PR41 testing-suite plan is documented separately in [`PR41_TESTING_SUITE_PLAN.md`](./PR41_TESTING_SUITE_PLAN.md).

## 1. Profile Goals

| Profile | Role                                     | Merge requirement | Expected operator         |
| ------- | ---------------------------------------- | ----------------- | ------------------------- |
| `tiny`  | CI-safe medallion correctness proof      | Required          | CI and every developer    |
| `10gb`  | first local scale-validation profile     | Optional/manual   | developer workstation     |
| `100gb` | workstation stress and layout validation | Optional/manual   | developer workstation     |
| `1tb`   | explicit large-run validation            | Optional/manual   | prepared workstation only |

PR41 should merge with `tiny` fully automated. The larger profiles should be defined, guarded, and documented; actual large artifact generation should remain manual unless PR41 scope is deliberately expanded.

## 2. Generator Architecture

The large-profile writer should be chunked and disk-backed from the start.

Required design:

- Stream source-like rows instead of materializing the full dataset in memory.
- Write partitioned Parquet files in batches.
- Keep target Parquet file sizes in the 128-512 MB range.
- Write Delta transaction metadata incrementally per table.
- Track actual bytes written, row counts, partition counts, and file counts in `manifest.json`.
- Generate Bronze first, then derive Silver/quarantine from Bronze partitions, then derive Gold from Silver summaries.
- Treat Gold as a realistic aggregate by default; use a separate Gold stress mode only if large Gold query testing is required.

Avoid:

- collecting all Bronze rows into Python lists,
- writing one huge Parquet file,
- requiring a browser action to create large files,
- using generated large files as evidence of real source ingestion.

## 3. Chunk And File Sizing

Initial defaults:

| Setting                           | Default                             |
| --------------------------------- | ----------------------------------- |
| Target Parquet file size          | 256 MB                              |
| Minimum file size before rollover | 128 MB                              |
| Maximum file size before rollover | 512 MB                              |
| Bronze partition columns          | `source_provider`, `ingest_date`    |
| Silver partition columns          | `collection`, `canonicalized_date`  |
| Quarantine partition columns      | `reason_family`, `quarantined_date` |
| Gold partition columns            | `collection`, `refreshed_date`      |

The writer should stop when each target layer reaches the configured byte target, not when a fixed row count is reached. Row counts are hardware- and payload-shape-dependent evidence, not the primary profile definition.

## 4. Storage Budget

The target size is per medallion layer. Disk requirements must include Parquet output, Delta logs, temp files, checkpoints, failed-run residue, and filesystem overhead.

| Profile | Nominal output target | Recommended free disk before run |
| ------- | --------------------- | -------------------------------- |
| `tiny`  | ~1 MB per layer       | 1 GB                             |
| `10gb`  | 10 GB per layer       | 100 GB                           |
| `100gb` | 100 GB per layer      | 1 TB                             |
| `1tb`   | 1 TB per layer        | 6 TB                             |

The 1 TB profile should refuse to run unless the writer can confirm a safe free-space floor. A first implementation can document the floor; a follow-on implementation should enforce it programmatically.

## 5. Safety Guards

Large profiles require all of:

- `LAKEHOUSE_ALLOW_LARGE_SAMPLE=true` or `--allow-large`.
- An explicit profile: `--profile 10gb`, `--profile 100gb`, or `--profile 1tb`.
- Output path under `tmp/lakehouse/`.
- Generated artifacts excluded from git.
- Manifest stating the selected profile and that the run is generated local stress evidence.

Recommended future guard additions:

- free-space preflight,
- estimated runtime warning,
- resume/overwrite confirmation,
- max-temp-directory size,
- post-run cleanup command,
- refuse `1tb` unless `LAKEHOUSE_CONFIRM_1TB=true`.

## 6. Verification Matrix

| Verification                    | `tiny`                 | `10gb`   | `100gb`     | `1tb`                            |
| ------------------------------- | ---------------------- | -------- | ----------- | -------------------------------- |
| Runner creates artifacts        | automated              | manual   | manual      | manual                           |
| Verifier checks table existence | automated              | manual   | manual      | manual                           |
| Verifier checks row counts      | automated              | manual   | manual      | manual                           |
| Verifier checks byte targets    | planned                | required | required    | required                         |
| Manifest records profile        | automated              | manual   | manual      | manual                           |
| Frontend/server evidence tests  | automated using `tiny` | optional | optional    | optional                         |
| CI requirement                  | yes                    | no       | no          | no                               |
| Runtime benchmark               | no                     | optional | recommended | required before trusting results |

The verifier should gain a profile-aware mode:

```bash
pnpm nx run lakehouse-mvp:verify -- --profile tiny
pnpm nx run lakehouse-mvp:verify -- --profile 10gb
```

Until that exists, the default verifier intentionally accepts only `tiny`.

## 7. Bronze, Silver, Gold Byte Targets

Default interpretation:

- Bronze target bytes are source-faithful generated event bytes.
- Silver target bytes are canonical accepted observations plus quarantine bytes.
- Gold target bytes are realistic aggregates and may be much smaller than Bronze/Silver.

If the goal is exactly "1 TB each", Gold should use an explicit `goldStressMode` flag in the manifest because a 1 TB aggregate is not typical consumer-oriented Gold modeling. That distinction prevents PR41 from teaching the wrong medallion habit.

Recommended implementation:

- `targetBytesPerMedallionLayer` controls Bronze and Silver output.
- Gold produces realistic aggregates by default.
- A future `LAKEHOUSE_GOLD_STRESS=true` can create a large query-stress Gold artifact when needed.

## 8. Control View Plan

The first platform control view should be read-only.

Required fields:

- active profile,
- artifact root,
- guard status,
- manifest generated timestamp,
- medallion layer existence,
- row counts,
- byte counts when available,
- evidence state,
- reproduction command,
- warnings for generated stress evidence.

Write controls can follow later, but only for local-only commands and only after adding explicit confirmation and guard checks.

## 9. Hardware Requirements

For an i9 workstation with 64 GB RAM:

- `tiny`: safe.
- `10gb`: expected to be practical.
- `100gb`: practical if written in chunks to fast NVMe storage.
- `1tb`: possible only with several TB of free fast storage and long runtimes.

The GPU is not relevant for the current PR41 PyArrow path. GPU acceleration belongs to a future Spark/RAPIDS investigation and should not be assumed in PR41.

## 10. Implementation Sequence

1. Keep `tiny` automated and green.
2. Add byte-aware manifest fields.
3. Add chunked Bronze writer.
4. Add partitioned Silver/quarantine transform.
5. Add realistic Gold aggregate plus optional Gold stress mode.
6. Add profile-aware verifier checks.
7. Add free-space preflight and cleanup command.
8. Add read-only control API/view.
9. Validate `10gb`.
10. Validate `100gb`.
11. Attempt `1tb` only after the previous profiles produce stable manifests and cleanup behavior.

## 11. PR41 Done Boundary

PR41 planning is sufficient when:

- guarded profiles are documented and committed,
- large-run generation is not accidental,
- `tiny` stays CI-safe,
- scale profile state is visible in the manifest,
- the control view contract is documented,
- the chunked writer path is sequenced before any 1 TB run.

PR41 implementation is sufficient when the `tiny` MVP plus profile/control scaffolding are green. Large physical data generation can be a follow-on manual validation task unless the PR scope is intentionally expanded.
