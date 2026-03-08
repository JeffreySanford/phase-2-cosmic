# MG-5 Archive Disaster Recovery Policy

**Status:** active  
**Owner:** Storage · Governance · SRE  
**Mission Gate:** MG-5  
**Related backlog:** `TODO.md` · `ROADMAP.md`

---

## 1. Objectives

| Metric | Target |
| --- | --- |
| Recovery Point Objective (RPO) | ≤ 1 hour for science/cal datasets; ≤ 24 hours for raw data |
| Recovery Time Objective (RTO) | ≤ 4 hours for priority-1 datasets; ≤ 24 hours for archive tier |
| Replication lag threshold | ≤ 5 minutes continuous replication; alert at 15 minutes |
| Minimum replica count | 2 geographic replicas for all science-grade data |
| Restore-drill frequency | Monthly for science tier; quarterly for archive tier |

---

## 2. Dataset Tier Classification

| Tier | Examples | Retention | Replicas | Region |
| --- | --- | --- | --- | --- |
| **science** | calibrated visibilities, images, spectra | 365 days | 3 | primary + 2 DR |
| **calibration** | bandpass, flux, pointing models | 730 days | 2 | primary + 1 DR |
| **raw** | raw correlator dumps | 90 days | 2 | primary + 1 DR |
| **provenance** | audit manifests, lineage chains | indefinite | 3 | primary + 2 DR |
| **catalog** | dataset index, VO registry entries | indefinite | 2 | primary + 1 DR |

---

## 3. Replication Policy Model

Replication policies are managed by `ArchiveDrService` and stored in Redis under the key prefix `dr:policy:{id}`.

Each policy record carries:

- `id` — UUID assigned at creation
- `name` — human-readable policy name matching the tier label
- `retentionDays` — number of days datasets under this policy are retained (0 = indefinite)
- `targetRegion` — the DR region identifier (e.g. `us-southwest-1`, `eu-central-1`)
- `replicaCount` — number of replicas that must be confirmed before a restore drill passes
- `createdAt` — ISO-8601 timestamp

---

## 4. Restore Drill Procedure

### 4.1 Automated drill (via `ArchiveDrService.drillRestore`)

1. Retrieve the replication policy by `policyId`.
2. Verify `replicaCount > 0` and `retentionDays > 0` (or indefinite = -1 override).
3. Record `drillId`, `datasetId`, `policyId`, `restoredAt`, `durationMs`, and pass/fail `notes`.
4. A drill result with `success: true` constitutes evidence for the restore-drill gate.

### 4.2 Manual operator runbook

```text
1. Identify the dataset(s) requiring restore (by job lineage or catalog id).
2. Locate the active replication policy for the dataset tier.
3. Initiate restore from the DR region via:
     POST /api/v1/dr/restore   (future endpoint — see Sprint 4)
   or directly via storage backend CLI.
4. Verify restored dataset integrity:
   a. Hash comparison against stored manifest.
   b. Provenance chain completeness check (all lineage nodes present).
   c. Schema validation against original ingest schema.
5. Record drill result with timestamp, dataset id, policy id, operator id.
6. Escalate to mission operations if restore exceeds RTO threshold.
```

### 4.3 Drill schedule

| Tier | Frequency | Owner | Evidence artifact |
| --- | --- | --- | --- |
| science | Monthly (first Monday) | SRE on-call | `restore-drill-{yyyyMM}.json` |
| calibration | Quarterly | SRE + QA | `restore-drill-cal-{yyyyQn}.json` |
| raw | Quarterly | SRE | `restore-drill-raw-{yyyyQn}.json` |
| provenance | Semi-annual | Governance + SRE | `restore-drill-prov-{yyyy}H{n}.json` |
| catalog | Semi-annual | Governance | `restore-drill-cat-{yyyy}H{n}.json` |

---

## 5. Alerting and Monitoring

| Alert | Condition | Severity | Action |
| --- | --- | --- | --- |
| `replication_lag_high` | lag > 15 min on any science-tier dataset | P2 | Page SRE; investigate replication health |
| `replica_count_low` | active replicas < policy `replicaCount` | P1 | Immediate escalation; halt new ingests |
| `restore_drill_overdue` | last successful drill > 2× scheduled interval | P2 | Schedule emergency drill; notify mission ops |
| `rto_breach_risk` | predicted restore time > 50% of RTO | P2 | Begin pre-restore staging |

Prometheus counters (planned, Sprint 4+):

- `archive_dr_drill_total{tier, result}` — total drills by tier and pass/fail
- `archive_replication_lag_seconds{tier, region}` — current replication lag gauge

---

## 6. Acceptance Criteria (MG-5 Gate)

- [x] `ArchiveDrService` implements `createPolicy`, `getPolicy`, `listPolicies`, `drillRestore`
- [x] `ArchiveDrRestoreDrillTest` passes: create, get, list, drill success, drill unknown-policy failure
- [x] This policy document published under `documentation/mission-closure/`
- [ ] Prometheus replication-lag metrics scraping (Sprint 4)
- [ ] REST endpoint `POST /api/v1/dr/restore` for operator-triggered restores (Sprint 4)
- [ ] Restore evidence artifacts automatically uploaded to audit log (Sprint 4)

---

## 7. Cross-References

- `documentation/mission-closure/ARCHIVE_DR_REPLICATION_PLAN.md` — engineering plan
- `ROADMAP.md` Sprint 3 — MG-5 implementation scope
- `apps/java-governance/src/main/java/com/cosmic/governance/api/service/ArchiveDrService.java`
- `apps/java-governance/src/test/java/com/cosmic/governance/api/ArchiveDrRestoreDrillTest.java`
