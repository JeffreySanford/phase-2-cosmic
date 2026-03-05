# ngVLA Data Architecture Specification

<!-- markdownlint-disable MD040 MD060 -->

> Status: living document — updated 2026-03-03  
> Owner: Data Architect (Req #109 alignment)  
> Relates to: `ROADMAP.md` Phase 6, `TODO.md` section 5D, `NGVLA_MISSION_ALIGNMENT.md`

---

## 1. Purpose and Scope

This document defines the data architecture for the **Cosmic Horizon** platform as it evolves to support the ngVLA Computing and Software System (CSS) mission. It covers:

- The full data lifecycle from raw telescope observations to community-archive science products
- Storage tiers, object key layout, and naming conventions
- The canonical data model and dataset manifest schema
- Metadata standards and data quality enforcement at each ETL stage
- Provenance, lineage, and audit requirements
- Security, access control, and encryption policies
- Observability, monitoring, and capacity planning
- Technology recommendations and evaluation criteria

## 2. Data Lifecycle

The ngVLA produces data at every stage of the observing pipeline. The platform must track and preserve fidelity at each transition.

```
Telescope Array
  │  raw visibilities (~10 TB/hr per configuration)
  ▼
Ingest Layer  ──── Kafka topics ──── java-governance (JobService)
  │  validated, checksummed raw data
  ▼
Calibration Pipeline
  │  calibrated visibility data, flagging tables
  ▼
Science Product Assembly
  │  images, cubes, catalogs, source tables
  ▼
Community Archive  ──── Dataset Catalog  ──── Data Access API
```

### Processing Levels

| Level           | Code | Description                                    | Typical size         |
| --------------- | ---- | ---------------------------------------------- | -------------------- |
| Raw             | RAW  | Uncalibrated visibilities off the correlator   | 100 GB – 10 TB / obs |
| Calibrated      | CAL  | Flagged, calibrated visibility data            | 50–500 GB / obs      |
| Science product | SCI  | Images, cubes, catalogs                        | 1–100 GB / dataset   |
| Derived         | DRV  | Higher-order products (mosaics, stacked cubes) | variable             |

## 3. Storage Architecture

### 3.1 Tiered Object Store Layout

All persistent data is stored in MinIO (dev) / S3-compatible cloud storage (production) using a deterministic path layout.

```
{bucket}/
  raw/
    {obs-id}/
      {timestamp}/
        visibilities.bin
        metadata.json
        checksum.sha256
  cal/
    {obs-id}/
      calibrated.ms/          (CASA Measurement Set layout or equivalent)
      flagging-tables/
      pipeline-run-{jobId}.json
  sci/
    {dataset-id}/
      manifest.json           (canonical dataset manifest)
      image.fits
      catalog.vo              (optional VO table)
      provenance.json
  archive/
    {year}/
      {dataset-id}.tar.gz     (deep archive tier)
```

**Path construction rules** (enforced by `StoragePathHelper`):

- `obs-id`: UUID generated when the observation is registered in the Job store.
- `timestamp`: ISO-8601 UTC at ingest start, truncated to minute: `2026-03-03T18:30Z`.
- `dataset-id`: UUID from `DatasetService.create(...)`; always a `v4` UUID.
- All keys use lowercase, hyphens only — no spaces or underscores in path segments.

### 3.2 Storage Class Policy

| Tier    | Storage class     | Retention         | Access pattern         |
| ------- | ----------------- | ----------------- | ---------------------- |
| RAW     | Standard / hot    | 90 days (rolling) | Write-once, rare read  |
| CAL     | Standard / warm   | 1 year            | Pipeline re-run access |
| SCI     | Infrequent access | Indefinite        | Community download     |
| Archive | Glacier / deep    | Indefinite        | Research on demand     |

### 3.3 Current implementation

- **dev**: MinIO container (`docker/dev-compose.yml`), bucket `cosmic-dev`
- **staging/production**: S3-compatible endpoint; credentials in K8s secret `aws-storage-creds`
- **tools/data-generator**: must write synthetic payloads to `raw/{obs-id}/{timestamp}/` (DA-4 task)

## 4. Canonical Data Model

### 4.1 Entity-Relationship Overview

```
Observation ─┬──< JobRecord  ─── ArtifactsManifest ─┬──< StorageObject
             │                                        └──< LineageRef
             └──< Dataset ──< Manifest
                               └── ProvenanceRecord ──< AuditEvent
```

### 4.2 Core Entities

#### Observation

```json
{
  "observationId": "uuid",
  "arraySegment": "Main | Long Baseline | SBA",
  "antennaClass": "18m | 6m",
  "frequencyBandGHz": { "low": 1.2, "high": 116.0 },
  "startTime": "ISO-8601",
  "durationSeconds": 300,
  "pointing": { "ra": 123.45, "dec": -23.45 },
  "correlatorMode": "full | narrow | wide",
  "registeredAt": "ISO-8601",
  "status": "PLANNED | EXECUTING | COMPLETE | FAILED"
}
```

#### Dataset Manifest (schema: `schemas/manifest/dataset-manifest.schema.json`)

```json
{
  "manifestVersion": "1.0",
  "datasetId": "uuid",
  "observationId": "uuid",
  "arraySegment": "Main | Long Baseline | SBA",
  "frequencyBandGHz": { "low": 1.2, "high": 116.0 },
  "processingLevel": "RAW | CAL | SCI | DRV",
  "workflow": "ingest | calibrate | image | catalog",
  "jobId": "uuid",
  "storageUri": "s3://bucket/sci/{dataset-id}/manifest.json",
  "checksum": "sha256:<hex>",
  "sizeBytes": 1073741824,
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601",
  "lineageRefs": ["uuid:jobId", "uuid:datasetId"],
  "qualityFlags": { "flaggedFraction": 0.03, "rmsNoise": 0.00012 },
  "accessPolicy": "PUBLIC | PROPRIETARY | RESTRICTED",
  "embargo": { "until": "ISO-8601" }
}
```

#### JobRecord (existing — extensions for DA-2)

Add fields to `apps/java-governance/.../model/JobRecord.java`:

```
artifactsManifest : List<Map<String,Object>>   // serialized dataset manifests
lineageRefs       : List<String>               // parent job/dataset UUIDs
checksumVerified  : Boolean                    // true once manifest SHA-256 verified
```

#### ProvenanceRecord

```json
{
  "provenanceId": "uuid",
  "subjectId": "uuid",
  "subjectType": "job | dataset",
  "producerId": "uuid (jobId that produced this subject)",
  "inputs": ["uuid (jobId or datasetId)"],
  "algorithm": "calibrator-v2.1.3",
  "softwareVersion": "java-governance-1.4.0",
  "executionHost": "hostname",
  "startedAt": "ISO-8601",
  "completedAt": "ISO-8601",
  "parameters": {},
  "checksum": "sha256:<hex>",
  "auditEvents": [
    {
      "at": "ISO-8601",
      "actor": "principal",
      "action": "SUBMITTED|TRANSITIONED|DELETED"
    }
  ]
}
```

### 4.3 Metadata Quality Rules

The `ETLStageValidator` enforces these rules at stage transition:

| Stage          | Required fields                                                    | Quality check                         |
| -------------- | ------------------------------------------------------------------ | ------------------------------------- |
| RAW ingest     | `observationId`, `arraySegment`, `frequencyBandGHz`, `checksum`    | checksum match, non-empty payload     |
| CAL transition | all RAW fields + `calibrationVersion`, `flaggedFraction < 0.5`     | calibration algorithm version present |
| SCI assembly   | all CAL fields + `rmsNoise`, `imageFitsUri`, `processingLevel=SCI` | FITS header completeness check        |

Violations at any stage return `HTTP 400` with structured error (code: `etl_quality_gate_failed`).

## 5. ETL Process Design

### 5.1 Pipeline Stages

```
Stage 1 – Ingest (RAW)
  Source:   ngVLA correlator → Kafka topic `ngvla.raw.visibilities`
  Consumer: java-governance KafkaIngestListener
  Actions:  validate ArraySegment + frequency, checksum, write to raw/ on MinIO
  Output:   JobRecord (workflow=ingest, state=COMPLETED), DatasetManifest (processingLevel=RAW)

Stage 2 – Calibration (CAL)
  Trigger:  operator or scheduler submits JobRecord (workflow=calibrate)
  Actions:  read raw/ visibilities, run calibration executor, write cal/ output, verify checksum
  Output:   JobRecord (workflow=calibrate, state=COMPLETED), DatasetManifest (processingLevel=CAL)

Stage 3 – Science Product Assembly (SCI)
  Trigger:  downstream pipeline submits JobRecord (workflow=image | catalog)
  Actions:  read cal/ products, run imaging/cataloging, write sci/ + manifest.json
  Output:   DatasetManifest (processingLevel=SCI), ProvenanceRecord

Stage 4 – Archive
  Trigger:  science products pass quality gate + embargo period
  Actions:  move sci/ objects to archive/ tier, update catalog, publish VO services
```

### 5.2 Backpressure and Error Handling

- Kafka consumer lag > 10 000 messages → alert via Alertmanager.
- Failed ingest jobs trigger DLQ topic (`ngvla.raw.dlq`); operatr review required before retry.
- Checksum mismatch → job is failed with `checksum_mismatch` error; raw object is quarantined.
- ETL stage validator failure → job is failed; retry allowed after metadata correction.

## 6. Metadata Catalog and Search

### 6.1 API Design

Extends `GET /api/v1/datasets` with query parameters:

| Parameter         | Type     | Example      | Description                  |
| ----------------- | -------- | ------------ | ---------------------------- |
| `processingLevel` | enum     | `CAL`        | Filter by processing level   |
| `arraySegment`    | string   | `Main`       | Filter by array segment      |
| `workflow`        | string   | `image`      | Filter by producing workflow |
| `startAfter`      | ISO-8601 | `2026-01-01` | Observation start after      |
| `startBefore`     | ISO-8601 | `2026-06-01` | Observation start before     |
| `minFreqGHz`      | float    | `1.2`        | Minimum frequency band       |
| `maxFreqGHz`      | float    | `50.0`       | Maximum frequency band       |
| `q`               | string   | `M31`        | Full-text search on metadata |
| `page` / `size`   | int      | `0` / `20`   | Pagination                   |

### 6.2 Search backend options (evaluation)

| Option                       | Pros                                 | Cons                       | Recommendation        |
| ---------------------------- | ------------------------------------ | -------------------------- | --------------------- |
| Redis Hash index             | Zero new deps                        | No FTS, poor range queries | Dev only              |
| PostgreSQL JSONB + GIN index | SQL, FTS, good range                 | Adds PostgreSQL dep        | **Short-term target** |
| Elasticsearch                | FTS, spatial, astronomy use          | Heavy; separate infra      | Long-term / staging   |
| Apache Solr                  | Astronomy community use (NED/VizieR) | Dated API                  | Evaluate post-PI      |

**Recommendation**: PostgreSQL JSONB + GIN for sprint 2; Elasticsearch evaluation document in sprint 4.

## 7. Provenance and Lineage

### 7.1 Requirements

- Every science product must be traceable to its source observation(s) and all intermediate jobs.
- Checksums must be stored and verifiable at each stage.
- Audit log must capture who submitted/cancelled/deleted every job, with principal identity.
- Lineage chain must survive service restarts and Redis evictions (persistent store required for production).

### 7.2 Implementation approach

Phase 6 Sprint 2 implementation:

- `POST /api/v1/jobs/{id}/manifest` — attach a `DatasetManifest` JSON body; server verifies SHA-256 checksum and stores in `JobRecord.artifactsManifest`.
- `GET /api/v1/jobs/{id}/lineage` — returns the lineage chain (BFS walk of `lineageRefs`) up to configurable depth.
- `ProvenanceRecord` created and persisted (Redis hash keyed `provenance:{provenanceId}`) when a job reaches `COMPLETED`.

Long-term (Post-PI):

- Graph database (Neo4j or Postgres recursive CTE) for multi-hop lineage queries.
- W3C PROV-DM compatible export for VO interoperability.

## 8. Security and Access Control

### 8.1 Authentication

Target: OIDC via Keycloak (dev) / institutional IdP (production).

- Spring Security `BearerTokenAuthenticationFilter` for all `/api/v1/**` routes.
- Frontend stores access token in memory (not localStorage); refresh token in HttpOnly cookie.

### 8.2 Authorization (RBAC)

| Role             | Permitted actions                                                      |
| ---------------- | ---------------------------------------------------------------------- |
| `ROLE_GUEST`     | `GET /api/v1/datasets`, `GET /api/v1/jobs/{id}` (public datasets only) |
| `ROLE_SCIENTIST` | All reads; `POST /api/v1/datasets` (create own)                        |
| `ROLE_OPERATOR`  | All ROLE_SCIENTIST + submit/cancel/retry jobs; upload manifests        |
| `ROLE_ADMIN`     | All operations including `/api/v1/admin/**`, delete jobs               |

### 8.3 Encryption

- In transit: TLS 1.2+ enforced on all HTTP endpoints (nginx / Ingress controller).
- At rest: MinIO server-side encryption (SSE-KMS) for all buckets.
- Secrets: Kubernetes Secrets + optional Vault sidecar for production credentials.

### 8.4 Audit logging

Every write operation emits a structured audit event (already partially implemented in `JobService`):

```json
{
  "at": "2026-03-03T18:30:00Z",
  "actor": "operator@nrao.edu",
  "action": "JOB_SUBMITTED",
  "subject": "job-uuid",
  "workflow": "ingest",
  "ip": "10.0.1.5"
}
```

Audit events are written to Kafka topic `ngvla.audit.events` and indexed in Loki (already in compose stack).

## 9. Observability and Monitoring

### 9.1 Prometheus Metrics to add (Phase 6)

| Metric                             | Type      | Labels                      | Description                    |
| ---------------------------------- | --------- | --------------------------- | ------------------------------ |
| `ngvla_jobs_submitted_total`       | Counter   | `workflow`, `array_segment` | Jobs submitted                 |
| `ngvla_jobs_completed_total`       | Counter   | `workflow`, `array_segment` | Jobs completed successfully    |
| `ngvla_jobs_failed_total`          | Counter   | `workflow`, `error_code`    | Jobs failed                    |
| `ngvla_etl_stage_duration_seconds` | Histogram | `stage`, `array_segment`    | ETL stage wall time            |
| `ngvla_queue_depth`                | Gauge     | `workflow`                  | Current queued job count       |
| `ngvla_ingest_bytes_total`         | Counter   | `array_segment`             | Total bytes ingested           |
| `ngvla_checksum_failures_total`    | Counter   | `stage`                     | Checksum verification failures |
| `ngvla_storage_used_bytes`         | Gauge     | `tier` (raw/cal/sci)        | Storage used per tier          |

### 9.2 Grafana dashboards to create

- **Pipeline Overview**: job throughput by workflow, ETL stage durations, error rates.
- **Storage Usage**: bytes by tier, growth rate, estimated time to quota.
- **Ingestion Rate**: Kafka consumer lag, bytes/sec by array segment.
- **Provenance Health**: checksum failures, lineage chain depth distribution.

### 9.3 Alertmanager rules to add

- `KafkaConsumerLagHigh`: lag > 10 000 for > 5 minutes.
- `IngestErrorRateHigh`: `ngvla_jobs_failed_total[5m] / ngvla_jobs_submitted_total[5m] > 0.05`.
- `StorageQuotaWarning`: `ngvla_storage_used_bytes / quota_bytes > 0.80`.
- `ChecksumFailuresDetected`: any checksum failure in last 15 minutes.

## 10. Technology Evaluation Summary

The following technologies were evaluated for ngVLA data architecture alignment:

| Function               | Dev baseline          | Short-term target             | Long-term / production                 |
| ---------------------- | --------------------- | ----------------------------- | -------------------------------------- |
| Job & dataset store    | Redis                 | Redis + PostgreSQL (datasets) | PostgreSQL + Elasticsearch             |
| Object storage         | MinIO                 | MinIO                         | AWS S3 / Ceph                          |
| Message bus            | Kafka (local compose) | Kafka (managed)               | Kafka (MSK / Confluent)                |
| Provenance graph       | None (UI panel only)  | Postgres recursive CTE        | Neo4j / Apache Atlas                   |
| Metadata search        | None                  | Postgres JSONB + GIN          | Elasticsearch                          |
| Auth                   | Dev-permissive toggle | Keycloak (dev OIDC)           | Institutional LDAP-backed OIDC         |
| Archive format         | Binary blobs          | FITS + Manifest JSON          | Apache Parquet / Iceberg (evaluation)  |
| Pipeline orchestration | Job scanner (polling) | Kafka-driven state machine    | Apache Airflow or Prefect (evaluation) |

### Emerging technologies to evaluate (DA-8)

- **Apache Iceberg** — open table format for multi-petabyte science archives with cross-tool interoperability.
- **Apache Parquet** — columnar format aligned with NRAO visibility data access patterns.
- **DuckDB** — in-process analytical queries on Parquet/Iceberg files; enables lightweight science tooling.
- **W3C PROV-DM** — provenance interoperability with VO and IVOA standards used across NRAO observatories.
- **IVOA ObsCore** — standard data model for observatory data discovery; aligns with ALMA/VLA VO services.

## 11. Implementation Roadmap (summary)

See `ROADMAP.md` Phase 6 and `TODO.md` section 5D for full sprint breakdown. Sprint summary:

| Sprint  | Focus                          | Key deliverables                                                | LOE |
| ------- | ------------------------------ | --------------------------------------------------------------- | --- |
| 1       | Schema hardening               | Manifest schema, DTO, StoragePathHelper, object layout          | S   |
| 2       | Lineage + catalog              | Manifest API, lineage endpoint, catalog filter, frontend search | M   |
| 3       | ETL quality gates              | ETLStageValidator, DQ standards doc, Prometheus counters        | M   |
| 4       | Auth + dashboards              | OIDC, RBAC, Grafana dashboards, Alertmanager rules              | L   |
| Post-PI | Catalog search + lineage graph | Elasticsearch, Neo4j/Postgres graph, Parquet/Iceberg eval       | L   |

## 12. References

- NRAO ngVLA project overview: <https://ngvla.nrao.edu/>
- ngVLA Computing and Software System design concept (SPIE 2022): <https://doi.org/10.1117/12.2629467>
- ngVLA Science Book: <https://library.nrao.edu/public/memos/ngvla/NGVLA_19.pdf>
- W3C PROV-DM: <https://www.w3.org/TR/prov-dm/>
- IVOA ObsCore: <https://ivoa.net/documents/ObsCore/>
- Apache Iceberg: <https://iceberg.apache.org/>
- Repository reference index: [NGVLA_REFERENCES.md](/docuentation/ngvla/NGVLA_REFERENCES.md)
- Mission alignment: [NGVLA_MISSION_ALIGNMENT.md](/docuentation/ngvla/NGVLA_MISSION_ALIGNMENT.md)
- Existing OpenAPI contract: [../openapi/governance.yaml](/openapi/governance.yaml)
- Existing fixtures: [../schemas/fixtures/](/schemas/fixtures/)
