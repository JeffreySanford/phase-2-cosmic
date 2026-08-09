# PR41 Lakehouse Testing Suite Plan

> Label: **Lakehouse Initiative / PR41**
> Scope: testing plan for the local Bronze/Silver/Gold MVP, guarded scale profiles, and the first operator evidence integration.

PR41 should include a real test suite for the local medallion MVP. The suite must prove correctness, guardrails, reproducibility, and evidence integration without requiring every developer or CI runner to generate 10 GB, 100 GB, or 1 TB artifacts.

The diagnostic UI state model and fixture expectations are documented in [`PR41_DIAGNOSTIC_VIEW_PLAN.md`](./PR41_DIAGNOSTIC_VIEW_PLAN.md).

## 1. Testing Goals

PR41 testing should prove:

- the default `tiny` profile can run end to end in CI,
- Bronze retains source-faithful event payloads and lineage fields,
- Silver promotes only canonical records,
- Silver quarantine retains rejected records with deterministic reason codes,
- Gold aggregates can be traced back to Silver and Bronze,
- guarded profiles cannot be started accidentally,
- the manifest/control metadata represents the active run truthfully,
- the existing Lakehouse metrics endpoint reports PR41 local evidence only when verified artifacts exist.

## 2. Test Layers

| Layer            | Required in PR41 | Purpose                                                                  |
| ---------------- | ---------------- | ------------------------------------------------------------------------ |
| Unit             | Yes              | Validate profile resolution, guard checks, transforms, and manifest DTOs |
| Integration      | Yes              | Run `tiny` and inspect generated Bronze/Silver/Gold artifacts            |
| Contract         | Yes              | Validate profile registry, manifest shape, table paths, and reason codes |
| API/service      | Yes              | Verify metrics behavior with and without a PR41 manifest                 |
| E2E/UI           | Existing surface | Confirm the operator evidence surface remains stable                     |
| Large-profile    | Manual/guarded   | Validate `10gb`, `100gb`, and `1tb` only when explicitly requested       |
| Databricks/cloud | Future PR42+     | Validate managed Spark/Delta/Unity Catalog execution                     |

## 3. MVP Automated Suite

The automated PR41 suite should stay `tiny` by default:

```bash
pnpm nx run lakehouse-mvp:test
pnpm nx run frontend:test
pnpm nx run frontend:e2e
```

If the workspace has a single quality-gate command, PR41 should add `lakehouse-mvp:test` to that gate rather than relying on manual invocation.

Minimum automated assertions:

- `tiny` profile is selected by default.
- `lakehouse-mvp:run` creates a fresh local artifact root.
- Bronze, Silver, Silver quarantine, and Gold directories exist.
- Each table has Parquet data and Delta transaction metadata.
- `manifest.json` exists and records the selected scale profile.
- Manifest table entries include row counts and file paths.
- Silver rows retain `bronze_event_id` lineage.
- Quarantine rows retain rejected Bronze lineage and reason codes.
- Gold rows retain lineage back to Silver/Bronze source IDs.
- `lakehouse-mvp:verify` passes after a run.
- Metrics service returns PR41 medallion evidence when a verified manifest exists.
- Metrics service falls back cleanly when the manifest is absent.

## 4. Unit Test Plan

Unit coverage should include:

- profile registry loading,
- default profile resolution,
- explicit profile override,
- environment variable override,
- large-profile guard enforcement,
- invalid profile rejection,
- manifest metadata construction,
- table manifest entry construction,
- Bronze event ID stability,
- event hash determinism,
- Silver acceptance rules,
- duplicate source identifier handling,
- quarantine reason-code assignment,
- Gold summary aggregation,
- path resolution under the configured artifact root.

Negative unit tests are required for:

- missing source identifier,
- missing object/access URI,
- invalid RA,
- invalid Dec,
- duplicate source identifier,
- guarded `10gb`, `100gb`, and `1tb` profile execution without approval.

## 5. Integration Test Plan

The primary integration test should:

1. remove or isolate the previous `tmp/lakehouse/pr41-delta/` test output,
2. run the MVP writer with the default `tiny` profile,
3. run the verifier,
4. inspect the manifest,
5. inspect the generated table metadata,
6. confirm generated artifacts remain outside git-tracked paths.

The integration suite should avoid hard-coded row counts except where the `tiny` profile contract intentionally defines them. Prefer validating lower bounds, table presence, lineage fields, and deterministic reason codes.

## 6. Contract Test Plan

PR41 should treat these files as contracts:

- `tools/lakehouse-mvp/scale-profiles.json`,
- `tmp/lakehouse/pr41-delta/manifest.json`,
- Delta log action shape under each generated table,
- `GET /api/v1/lakehouse/metrics` lakehouse evidence fields.

Contract tests should fail if:

- a required profile is removed,
- `tiny` is no longer the default,
- a large profile no longer requires a guard,
- manifest profile metadata is absent,
- table entries omit required paths or counts,
- reason codes drift without documentation updates,
- API evidence text claims production Lakehouse completion for local MVP artifacts.

## 7. Manual Large-Profile Suite

Large-profile validation should be documented and guarded, not CI-required.

Manual commands:

```bash
LAKEHOUSE_ALLOW_LARGE_SAMPLE=true pnpm nx run lakehouse-mvp:run -- --profile 10gb
pnpm nx run lakehouse-mvp:verify -- --profile 10gb
```

The same pattern applies to `100gb` and `1tb` only after the chunked writer, byte-aware manifest, free-space preflight, and cleanup command exist.

Manual validation should record:

- selected profile,
- machine/storage summary,
- elapsed runtime,
- peak observed memory when available,
- generated bytes per layer,
- file counts,
- row counts,
- verifier result,
- cleanup result,
- known limitations.

## 8. Quality Gate Integration

PR41 should extend the local quality gate with:

- formatting checks for lakehouse docs and JSON,
- YAML lint,
- `git diff --check`,
- `pnpm nx run lakehouse-mvp:test`,
- frontend/server tests that cover the Lakehouse metrics service,
- diagnostics UI tests that cover the read-only Lakehouse diagnostic state,
- existing Storybook additions if the evidence surface changes,
- existing e2e checks for the operator evidence page when affected.

The quality gate should not run `10gb`, `100gb`, or `1tb` profiles by default.

## 9. CI Policy

CI should require:

- the `tiny` profile only,
- no generated artifacts committed,
- no large-profile guard bypass,
- truthful PR evidence language,
- passing lint/test/build gates already required by the repository.

CI should not require:

- physical 10 GB, 100 GB, or 1 TB data generation,
- Spark cluster startup,
- Docker-only Java execution beyond existing gates,
- Databricks connectivity.

## 10. Future PR42+ Testing

Move these tests to PR42 or later:

- Databricks config validation,
- Databricks workspace connectivity,
- Unity Catalog table existence and permissions,
- Spark Structured Streaming checkpoint/recovery tests,
- Kafka-to-Bronze streaming tests,
- cloud object-storage table location tests,
- 100 GB and 1 TB benchmark evidence,
- multi-node or GPU-accelerated execution.

## 11. Definition Of Done Addendum

PR41 testing is done when:

- `lakehouse-mvp:test` is automated and green,
- profile guard negative tests exist,
- manifest/control metadata contracts are covered,
- metrics service fallback and verified-manifest paths are covered,
- diagnostic state fixtures are planned or covered,
- quality gate documentation names the lakehouse checks,
- heavyweight scale/cloud tests are explicitly documented as manual or future scope.
