# PR41 Lakehouse Diagnostic View Plan

> Label: **Lakehouse Initiative / PR41**
> Scope: diagnostic UI/API contract for local MVP state, profile state, evidence state, and operational readiness.
> Implementation: PR41 now includes the first read-only diagnostics tab backed by the Lakehouse metrics payload.

The Lakehouse needs a diagnostic view that explains what the platform is actually using, what evidence exists, which runtime path produced it, and which operations are safe. This view should plug into the existing frontend diagnostics area instead of creating a separate operational surface.

## 1. Purpose

The diagnostic view should help a developer or operator answer:

- Is the Lakehouse unavailable, proof-only, local-MVP verified, stale, or Databricks-backed?
- Which scale profile is active?
- Where are the active artifacts stored?
- Which Bronze/Silver/Gold layers exist?
- Which verifier or quality gate last passed?
- Are large-profile guards enabled?
- Are we looking at real public-source evidence, generated local stress evidence, or managed Databricks evidence?
- What action should be taken next when a state is degraded?

## 2. Placement

Recommended PR41 placement:

- add a Lakehouse diagnostics section inside the existing `/diagnostics` feature,
- link from the existing Lakehouse evidence panel to the diagnostic section,
- keep PR41 controls read-only except for copyable reproduction commands.

Recommended PR42+ placement:

- add Databricks workspace/job/table status to the same section,
- add run-history and validation-state panels once real Databricks jobs exist,
- add write controls only after local-only safeguards and confirmation states are implemented.

## 3. Diagnostic State Model

The UI should render these states explicitly:

| State                  | Meaning                                                                  | Initial source             |
| ---------------------- | ------------------------------------------------------------------------ | -------------------------- |
| `unavailable`          | No usable evidence source is reachable.                                  | API fallback               |
| `proof_only_live`      | PR40 public-source proof is live, but medallion tables are not verified. | ESO/public evidence path   |
| `proof_only_stale`     | Last public-source proof exists but is stale.                            | persisted evidence         |
| `local_mvp_verified`   | PR41 local manifest and table artifacts verified successfully.           | PR41 manifest/verifier     |
| `local_mvp_incomplete` | PR41 manifest exists but one or more tables/checks are missing or stale. | PR41 manifest/verifier     |
| `generated_stress`     | Large local generated profile evidence exists and is labeled as stress.  | guarded profile manifest   |
| `databricks_planned`   | Databricks is documented but not configured or verified.                 | PR42 config state          |
| `databricks_connected` | Databricks config and workspace connectivity are verified.               | future PR42/PR43 validator |
| `databricks_verified`  | Databricks tables/jobs have repeatable verified evidence.                | future Databricks evidence |

The diagnostic UI must not collapse these states into a single "healthy" label. A live PR40 proof is useful, but it is not the same as verified PR41 Bronze/Silver/Gold output.

## 4. Read-Only Payload Contract

The first API payload can extend or wrap the existing Lakehouse metrics response:

```json
{
  "state": "local_mvp_verified",
  "evidenceSource": "pr41-local-manifest",
  "activeProfile": "tiny",
  "artifactRoot": "tmp/lakehouse/pr41-delta",
  "generatedAt": "2026-08-09T00:00:00.000Z",
  "stale": false,
  "largeProfilesAllowed": false,
  "reproductionCommand": "pnpm nx run lakehouse-mvp:test",
  "qualityGate": {
    "lastKnownCommand": "pnpm nx run lakehouse-mvp:test",
    "lastKnownStatus": "passed"
  },
  "medallionLayers": {
    "bronze": {
      "exists": true,
      "verified": true,
      "rows": 5,
      "bytes": 1048576
    },
    "silver": {
      "exists": true,
      "verified": true,
      "rows": 3,
      "bytes": 1048576
    },
    "quarantine": {
      "exists": true,
      "verified": true,
      "rows": 2,
      "bytes": 1048576
    },
    "gold": {
      "exists": true,
      "verified": true,
      "rows": 3,
      "bytes": 1048576
    }
  },
  "warnings": [
    "PR41 local artifacts are not Databricks evidence.",
    "Generated stress profiles are not real public-source evidence."
  ]
}
```

Byte fields may be `null` until the byte-aware manifest work lands.

## 5. UI Sections

The view should use compact operational sections:

- **Evidence State**: current state, source, freshness, last generated time.
- **Active Profile**: selected profile, guard status, artifact root, reproduction command.
- **Medallion Layers**: Bronze/Silver/quarantine/Gold existence, row counts, bytes, verifier status.
- **Quality Gate**: last known local commands, status, and relevant test targets.
- **Runtime Ladder**: Databricks -> PR41 local MVP -> PR40 public proof -> unavailable.
- **Warnings**: stale data, generated stress evidence, missing manifest, missing tables, Databricks not configured.
- **Next Action**: one or two concrete commands or remediation notes.

Avoid a marketing-style page. This should be a dense diagnostic panel built for scanning and repeated use.

## 6. Safe Operations Policy

PR41 should be read-only in the browser.

Allowed in PR41:

- display current state,
- display artifact root,
- display profile guard status,
- display verifier status,
- display copyable commands,
- link to documentation.

Not allowed in PR41:

- browser-triggered `10gb`, `100gb`, or `1tb` generation,
- browser-triggered deletion of lakehouse artifacts,
- changing production data locations,
- storing secrets,
- running Databricks jobs.

Future write controls require:

- explicit local-only API guard,
- confirmation state,
- profile guard validation,
- free-space preflight,
- audit/event logging,
- disabled state in CI and hosted environments.

## 7. Testing Expectations

The diagnostic view should be tested with fixtures for:

- no manifest,
- PR40 proof-only evidence,
- PR41 verified `tiny` manifest,
- PR41 incomplete manifest,
- guarded large-profile stress manifest,
- stale manifest,
- Databricks planned/not configured,
- future Databricks connected/verified states.

Tests should assert that the UI never labels proof-only or generated stress evidence as production Lakehouse completion.

## 8. PR41 Definition Of Done Addendum

PR41 planning is sufficient when:

- the diagnostic state model is documented,
- the read-only payload contract is documented,
- the `/diagnostics` placement is identified,
- safe operation boundaries are explicit,
- test fixtures for the diagnostic states are planned.

PR41 implementation now starts with the API/service state model and a compact read-only UI section. Databricks operations and browser-triggered large-profile generation stay out of scope until later PRs.
