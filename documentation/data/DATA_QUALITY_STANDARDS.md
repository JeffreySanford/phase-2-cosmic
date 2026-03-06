# Data Quality Standards

Status: active draft  
Last updated: 2026-03-03  
Owner: Data Architecture / Governance

Related:

- [DATA_ARCHITECTURE.md](/docuentation/data/DATA_ARCHITECTURE.md)
- [PROVENANCE.md](/docuentation/provenance/PROVENANCE.md)
- [storage/STORAGE_GOVERNANCE.md](/docuentation/storage/STORAGE_GOVERNANCE.md)
- [../TODO.md](/docuentation/planning/TODO.md) (`5D`, `DA-5`)

## Mission linkage

- Mission outcome: Institutional trust and audit
- Operator/science impact: Prevents invalid or incomplete datasets from entering catalog and archive paths.
- Validation evidence: ETL gate tests, structured API error responses, and stage-level metrics in Prometheus/Grafana.

## 1. Scope

This document defines minimum data quality requirements for the ngVLA-aligned pipeline path:

`RAW ingest -> CAL calibration -> SCI science-ready product`

These standards apply to:

- Dataset manifests (`DatasetManifest`)
- Job transitions that promote data between processing levels
- Catalog publication eligibility

## 2. Quality dimensions

- Completeness: required metadata fields are present and non-empty.
- Validity: values conform to schema/type/range constraints.
- Consistency: manifest fields match stored objects and job metadata.
- Integrity: payload and artifact checksums are verifiable.
- Traceability: lineage links and provenance fields are present.
- External source citations: when a dataset or manifest references an external/public data source, the citation **must** match an entry returned by the governance service `GET /api/v1/public-sources` registry (see documentation/public-data).  This ensures operators use approved, curated sources.
- Timeliness: stage timestamps are monotonic and within expected windows.

## 3. Required fields by stage

## RAW ingest gate

Required:

- `manifestVersion`
- `datasetId`
- `observationId`
- `processingLevel=RAW`
- `arraySegment`
- `frequencyBandGHz.low`, `frequencyBandGHz.high`
- `storageUri` (must resolve to `raw/{obs-id}/{timestamp}/...`)
- `checksum` (`sha256:<hex>`)
- `createdAt`
- `workflow`
- `jobId`

Checks:

- Checksum matches stored object bytes.
- `frequencyBandGHz.low < frequencyBandGHz.high`.
- `createdAt` is valid ISO-8601 UTC timestamp.

## CAL calibration gate

Required:

- All RAW requirements
- `processingLevel=CAL`
- `lineageRefs` (must include RAW producer job or source dataset)
- `qualityFlags.flaggedFraction`
- Calibration version marker (for example `calibrationVersion`)

Checks:

- `qualityFlags.flaggedFraction` in `[0.0, 1.0]`.
- CAL manifest references a valid RAW ancestor.
- CAL object path is under `cal/{obs-id}/...`.

## SCI science-ready gate

Required:

- All CAL requirements
- `processingLevel=SCI`
- Science artifact URIs (for example FITS/image/cube outputs)
- Publication policy field (`PROPRIETARY|PUBLIC|EMBARGOED`)
- ObsCore-aligned discovery fields:
  - `s_ra`, `s_dec`
  - `t_min`, `t_max`
  - `em_min`, `em_max`
  - `calib_level`
  - `dataproduct_type`

Checks:

- All lineage references resolve.
- SCI object path is under `sci/{dataset-id}/...`.
- For embargoed products, release date must be present and in the future at publication time.

## 4. Standardized failure response

> **Note:** All gates are evaluated by the governance API when a job is promoted to a terminal state (e.g. COMPLETED).  Violations are recorded and the transition is rejected with a `400` response as documented below.

If any gate fails, the API must reject the transition with:

- HTTP `400`
- `error.code = etl_quality_gate_failed`
- `error.details[]` listing each failed rule

Recommended detail fields:

- `ruleId`
- `field`
- `expected`
- `actual`
- `stage`

## 5. Rule identifiers

Use stable rule IDs for auditability and test assertions.

Examples:

- `DQ-RAW-001`: checksum mismatch
- `DQ-RAW-002`: invalid frequency range
- `DQ-CAL-001`: missing lineage reference
- `DQ-CAL-002`: flaggedFraction out of range
- `DQ-SCI-001`: missing ObsCore field
- `DQ-SCI-002`: invalid publication policy transition
- `DQ-TIM-001`: clock offset exceeds timing budget for SCI promotion
- `DQ-RFI-001`: RFI flag severity prohibits SCI promotion (high/critical)

## 6. Metrics and SLO indicators

Expose counters by stage and result:

- `etl_stage_transitions_total{stage,result}`
- `etl_quality_failures_total{stage,ruleId}`
- `etl_checksum_verification_total{result}`

Recommended initial SLO indicators:

- `>= 99%` of stage transitions complete without data-quality failure (rolling 24h).
- `100%` of published SCI datasets contain required lineage and ObsCore fields.

## 7. Enforcement points

- Schema validation at manifest ingest (`POST /api/v1/datasets`, job manifest attach endpoints).
- Transition validation before processing-level promotion.
- Publication validation before catalog visibility changes.

Primary implementation hook:

- `ETLStageValidator` in `apps/java-governance`.

## 8. Test requirements

Minimum automated coverage:

- Unit tests:
  - valid RAW/CAL/SCI manifests pass
  - each rule ID can be triggered deterministically
- Integration tests:
  - manifest attach + checksum verification
  - lineage resolution across at least 2 hops
  - embargo/publication policy access behavior

Evidence artifacts:

- JUnit reports
- API error payload snapshots
- Grafana panel screenshot or exported metrics sample for stage counters

## 9. Change control

Any update to these standards must include:

- Rule/version change note in PR description
- Updates to test fixtures and validation tests
- Confirmation that dashboard/alert mapping still matches metric labels

Approval roles:

- Data Architect (owner)
- Governance technical lead
