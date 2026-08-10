# PR41 Scale Profiles And Control View

> Label: **Lakehouse Initiative / PR41**
> Scope: guarded local scale profiles and the platform control contract for choosing the active Lakehouse data profile.

PR41 needs two separate concepts:

- **Scale profile** — the intended data volume for generated local Lakehouse artifacts.
- **Control view** — the operator/developer-facing surface that shows and eventually changes which profile the platform is using.

The control view must be conservative. It should make the active profile visible across the platform, but it must not generate large data or switch the whole runtime to a large profile without explicit approval.

The implementation sequence, storage budget, and profile verification matrix are defined in [`PR41_SCALE_IMPLEMENTATION_PLAN.md`](./PR41_SCALE_IMPLEMENTATION_PLAN.md).

The diagnostic UI state model for this control contract is defined in [`PR41_DIAGNOSTIC_VIEW_PLAN.md`](./PR41_DIAGNOSTIC_VIEW_PLAN.md).

## Scale Profiles

The source of truth is:

```text
tools/lakehouse-mvp/scale-profiles.json
```

| Profile | Target per medallion layer | Default runnable | Guard                               | Intended use                                                 |
| ------- | -------------------------- | ---------------- | ----------------------------------- | ------------------------------------------------------------ |
| `tiny`  | ~1 MB                      | Yes              | none                                | CI, documentation, tests, smoke validation                   |
| `10gb`  | 10 GB                      | No               | `LAKEHOUSE_ALLOW_LARGE_SAMPLE=true` | Local development scale test                                 |
| `100gb` | 100 GB                     | No               | `LAKEHOUSE_ALLOW_LARGE_SAMPLE=true` | Workstation throughput, partitioning, file sizing validation |
| `1tb`   | 1 TB                       | No               | `LAKEHOUSE_ALLOW_LARGE_SAMPLE=true` | Explicit large-run validation only                           |

The target is **per medallion layer**, not total workspace size. A `1tb` run can require several TB of free disk after Bronze, Silver, Gold, Delta logs, temp files, checkpoints, and failed-run cleanup are included.

## Runtime Selection

The active profile resolution order should be:

1. CLI argument: `--profile`.
2. Environment: `LAKEHOUSE_SCALE_PROFILE`.
3. Registry default: `tiny`.

Large profiles must require one of:

```bash
LAKEHOUSE_ALLOW_LARGE_SAMPLE=true
```

or an explicit local command flag such as:

```bash
python tools/lakehouse-mvp/pr41_lakehouse_mvp.py --profile 10gb --allow-large
```

The PR41 default command remains small and CI-safe:

```bash
pnpm nx run lakehouse-mvp:test
```

## Control View Contract

The control view should answer:

- Which Lakehouse scale profile is active?
- Which artifact root is active?
- Is the active data generated, measured, stale, unavailable, or verified?
- Which medallion layers exist for the active profile?
- Are large-profile guards enabled?
- What command would reproduce the active artifacts?

The control view should not initially:

- trigger `10gb`, `100gb`, or `1tb` generation from a browser button,
- delete existing large artifacts,
- change production data locations,
- imply that PR41 local evidence is Databricks, Spark, or Kafka evidence,
- promote a generated stress profile into a real public-source evidence claim.

## Platform Control Shape

The future API/UI payload should use a shape like:

```json
{
  "activeProfile": "tiny",
  "availableProfiles": ["tiny", "10gb", "100gb", "1tb"],
  "artifactRoot": "tmp/lakehouse/pr41-delta",
  "largeProfilesAllowed": false,
  "evidenceState": "verified-local-mvp",
  "medallionLayers": {
    "bronze": { "exists": true, "rows": 5 },
    "silver": { "exists": true, "rows": 3 },
    "quarantine": { "exists": true, "rows": 2 },
    "gold": { "exists": true, "rows": 3 }
  }
}
```

This can be surfaced as a Lakehouse control panel in the existing app shell, but the first PR41 implementation can stay read-only. Write controls should be added only after the API has explicit local-only guards and clear confirmation states.

## Hardware Guidance

An i9 workstation with 64 GB RAM can process these profiles only when the writer and transforms are chunked, partitioned, and disk-backed. The GPU does not help the current PR41 MVP unless a future Spark/RAPIDS path is explicitly introduced.

Recommended progression:

1. `tiny` for PR/CI correctness.
2. `10gb` for first local scale validation.
3. `100gb` for workstation throughput and layout testing.
4. `1tb` only after partition sizes, cleanup, and disk capacity are proven.

## Definition Of Done Impact

PR41 should be considered done when:

- the profile registry exists,
- `tiny` is the default safe profile,
- large profiles are named but guarded,
- the MVP manifest records the selected profile,
- the evidence/control documentation makes the active profile visible,
- generated large artifacts remain outside git.

Actual generation of full `10gb`, `100gb`, or `1tb` artifacts is a follow-on scale-validation task unless PR41 scope is deliberately expanded.
