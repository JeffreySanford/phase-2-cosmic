# Lakehouse Implementation TODO

This file tracks staged delivery for the complete Lakehouse Initiative.
**PR40** owns the architecture and public-source evidence scaffold.
**PR41** starts the MVP medallion implementation.
**PR42** plans the Databricks production-runtime integration path.

Cross-PR documentation guidance lives in [`docs/PR40_PR42_ROADMAP.md`](./docs/PR40_PR42_ROADMAP.md).

The goal is to progress from architecture and a live public-data evidence scaffold to a real, evidence-backed Bronze/Silver/Gold pipeline without changing the authoritative storage, governance, or scientific-processing boundaries already defined by Phase 2.

## Current state

### Stage 1 — architecture baseline

- [x] Define the Lakehouse as an Analytical Data Plane rather than a replacement for existing runtime planes.
- [x] Keep MinIO/S3 authoritative for large scientific objects.
- [x] Keep Java Governance authoritative for application-level job, policy, dataset-registration, provenance, and audit semantics.
- [x] Define Bronze/Silver/Gold analytical responsibilities.
- [x] Document topology and storage boundaries.
- [x] Isolate Lakehouse documentation and reusable Mermaid source files under `documentation/lakehouse/`.
- [x] Clarify that RAW/CAL/SCI/DRV scientific processing levels are independent from Bronze/Silver/Gold analytical refinement levels.
- [x] Clarify Broker DLQ vs science-object quarantine vs Silver analytical quarantine.

### Stage 2 — live source and evidence scaffold

- [x] Select a real public metadata source for the first working provider profile: ESO TAP / ObsCore.
- [x] Add a live ESO ObsCore metadata fetch to the PR #40 proof path.
- [x] Add a Lakehouse summary/evidence service with Postgres persistence and in-memory test support.
- [x] Surface the proof summary in the existing frontend.
- [x] Add unit/Storybook/e2e coverage around the evidence surface.
- [x] Keep the long-term ingestion architecture provider-neutral even though ESO is the first working profile.
- [x] Make `GET /api/v1/lakehouse/metrics` the active evidence endpoint and keep live/stale/unavailable source state explicit.
- [x] Keep Bronze/Silver/Gold completion percentages at `0` / `Not implemented` until runnable Delta evidence exists.
- [x] Validate a live ESO ObsCore proof response locally with real upstream row count and non-stale freshness while medallion implementation remains zero.
- [x] Validate the local Postgres evidence-persistence connection path without treating Postgres persistence as a Lakehouse-stage implementation claim.
- [x] Replace or clearly distinguish illustrative/static visualization values from measured Lakehouse runtime evidence. `visualizations/eso-proof-slice-dashboard.html` and `sample-metrics.json` are now explicitly design/sample fixtures only.
- [x] Capture a dated scan of additional public archive/catalog sources that can support future development bundles without assuming academic-only live records.
- [x] Document a PR40 plan for source registry activation states, include/exclude controls, and active-record policy.

> Stage 2 proves that real public astronomy metadata can reach a tested operator evidence surface and that evidence persistence/startup behavior is operational locally. It does **not** prove that Bronze, Silver, or Gold Delta tables exist.

## Stage 3 — first real Lakehouse vertical slice

> PR41 label: **Lakehouse Initiative / PR41 MVP**.
> See [`docs/PR41_MVP_LAKEHOUSE.md`](./docs/PR41_MVP_LAKEHOUSE.md).
> Definition of Done: [`docs/PR41_MVP_LAKEHOUSE.md#definition-of-done`](./docs/PR41_MVP_LAKEHOUSE.md#definition-of-done).
> Scale/control contract: [`docs/PR41_SCALE_PROFILES_AND_CONTROL_VIEW.md`](./docs/PR41_SCALE_PROFILES_AND_CONTROL_VIEW.md).
> Scale implementation plan: [`docs/PR41_SCALE_IMPLEMENTATION_PLAN.md`](./docs/PR41_SCALE_IMPLEMENTATION_PLAN.md).
> Testing-suite plan: [`docs/PR41_TESTING_SUITE_PLAN.md`](./docs/PR41_TESTING_SUITE_PLAN.md).
> Diagnostic view plan: [`docs/PR41_DIAGNOSTIC_VIEW_PLAN.md`](./docs/PR41_DIAGNOSTIC_VIEW_PLAN.md).

### PR41 MVP local reference runtime

- [x] Add a local MVP runner for Bronze/Silver/Gold medallion artifacts.
- [x] Add a generated artifact root under `tmp/lakehouse/pr41-delta/`.
- [x] Persist Bronze source-faithful observation events as Parquet-backed table artifacts with Delta transaction metadata.
- [x] Persist Silver canonical observations derived from Bronze.
- [x] Persist Silver analytical quarantine with deterministic reason codes.
- [x] Persist one Gold observation summary aggregate with lineage to Bronze event IDs.
- [x] Add an Nx verifier target for the generated medallion artifacts.
- [x] Document all PR41 MVP moving parts under `documentation/lakehouse/docs/PR41_MVP_LAKEHOUSE.md`.
- [x] Define guarded Lakehouse scale profiles for `tiny`, `10gb`, `100gb`, and `1tb`.
- [x] Document the platform control-view contract for selecting and reporting the active Lakehouse data profile.
- [x] Document the large-profile implementation plan, storage budget, verification matrix, and Gold stress boundary.
- [x] Document the PR41 testing-suite plan for unit, integration, contract, API/service, quality-gate, and guarded large-profile validation.
- [x] Document the PR41 diagnostic view plan for evidence state, profile state, medallion layer state, guard state, and safe operation boundaries.
- [x] Add byte-aware PR41 manifest entries and profile-aware verifier contract checks.
- [x] Add PR41 Lakehouse diagnostics state to the metrics payload and existing diagnostics UI.
- [x] Add PR41 diagnostics Storybook fixture coverage.
- [x] Add `lakehouse:pr41:mvp` to the local `quality:ci` gate.
- [ ] Replace the local reference writer with Spark Structured Streaming or another selected Delta-capable runtime.
- [ ] Route the MVP source envelope through Kafka before Bronze.
- [x] Connect one verified Gold output to the existing Lakehouse evidence service when the local PR41 manifest exists.

### Source contract

- [ ] Add a checked-in source-registry example and schema for public archive/catalog profiles.
- [ ] Implement source-bundle selection for `core-proof`, `offline-fixture`, and at least one expanded development bundle.
- [ ] Add deterministic include/exclude precedence rules for active Lakehouse development records.
- [ ] Implement a reusable VO/TAP-style source adapter contract rather than coupling Lakehouse entities to ESO-specific field names.
- [ ] Preserve the current ESO profile as the first working provider implementation.
- [ ] Add an NRAO/VLA/VLASS provider profile when practical so the same contract is validated against the radio-astronomy domain that Cosmic primarily targets.
- [ ] Map source attribution into existing Phase 2 event/manifest/provenance semantics rather than creating a second domain model.

### Kafka and Bronze

- [ ] Route a bounded real/public astronomy extract or replay through Kafka.
- [ ] Consume the Kafka path with Spark Structured Streaming or the selected Delta-capable reference runtime.
- [x] Persist an MVP `bronze.observation_events` representation.
- [ ] Preserve source payload, source attribution, event identifiers, ingest timestamps, object/source references, schema version, and available checksums.
- [ ] Retain malformed/incomplete source truth in Bronze rather than silently dropping records because Silver validation fails.
- [ ] Add deterministic replay/reprocessing for the same source input.
- [x] Capture sample Bronze output as local generated evidence.

### Silver and analytical quarantine

- [x] Implement MVP `silver.observations` derived from Bronze.
- [ ] Normalize provider-specific VO/TAP fields into the existing Cosmic observation/source-attribution model.
- [ ] Add duplicate suppression using stable source/event identifiers.
- [ ] Add explicit late/out-of-order handling.
- [ ] Add controlled schema-version normalization.
- [x] Route records that cannot satisfy the canonical analytical contract to `silver.quarantine` with deterministic reason codes.
- [x] Retain lineage from Silver/quarantine back to Bronze and the authoritative source/object reference in the MVP tables.
- [x] Capture one promoted and one quarantined record as generated local evidence.

### Gold

- [x] Implement MVP `gold.observation_summary`.
- [x] Document the Gold table's consumer, refresh semantics, source Silver tables, and validation expectations.
- [x] Prove Gold -> Silver -> Bronze -> source/object traceability in the local MVP manifest/table data.
- [x] Connect one verified MVP Gold output to the existing operator evidence surface through the Lakehouse metrics service.

## Stage 4 — quality and resilience proof

- [ ] Exercise duplicate events.
- [ ] Exercise late and out-of-order events.
- [ ] Exercise at least one controlled schema-evolution case.
- [ ] Exercise malformed/incomplete source records.
- [ ] Exercise checksum/object-reference failures where the source contract provides those semantics.
- [ ] Demonstrate correction/replay from Silver quarantine.
- [ ] Confirm Broker DLQ, science-object quarantine, and Silver analytical quarantine remain separate failure domains.
- [ ] Record repeatable evidence for each failure scenario.

## Stage 4.5 — PR42 Databricks production-runtime plan

> PR42 label: **Lakehouse Initiative / PR42 Databricks Sprint Plan**.
> See [`docs/PR42_DATABRICKS_SPRINT_PLAN.md`](./docs/PR42_DATABRICKS_SPRINT_PLAN.md).

- [x] Document Databricks as the planned managed Spark/Delta/Unity Catalog runtime.
- [x] Keep Java Governance authoritative for application governance semantics.
- [x] Keep MinIO/S3 authoritative for large science objects and archive packages.
- [x] Map PR41 MVP artifacts to Databricks table names.
- [x] Define Databricks environment variables and secret boundaries.
- [x] Define validation states before implementing Databricks jobs.
- [x] Define the evidence fallback order from Databricks to PR41 local MVP to PR40 public-source proof.
- [x] Sequence follow-on PRs for config validation, Bronze, Silver/quarantine, Gold, Kafka streaming, and Unity Catalog governance review.
- [ ] Implement a Databricks config validator target.
- [ ] Verify a real Databricks workspace connection.
- [ ] Create real Databricks Bronze/Silver/Gold tables.

## Stage 5 — broker comparison

- [ ] Establish a stable Kafka baseline before adding comparison paths.
- [ ] Compare the Kafka baseline with a Pulsar-direct or Pulsar-to-Kafka bridged path.
- [ ] Measure contract differences, backlog/recovery behavior, duplicate behavior, and operational complexity.
- [ ] Decide whether Pulsar should become a second Lakehouse ingest target or remain an edge-buffer/bridge path.

## Stage 6 — performance evidence

- [ ] Record modest-scale ingest throughput and latency.
- [ ] Record restart/recovery behavior and checkpoint semantics.
- [ ] Compare raw/small-file layouts with compacted Delta/Parquet analytical layouts where meaningful.
- [ ] Record query behavior for Bronze, Silver, and Gold use cases.
- [ ] Clearly label all results with dataset size, environment, runtime, and limitations; do not extrapolate a small proof directly to ngVLA production scale.

## Stage 7 — governance and catalog integration

- [ ] Integrate Lakehouse catalog/table permissions with the selected platform without redefining Java Governance ownership.
- [ ] Project existing dataset/provenance identifiers into Lakehouse lineage.
- [ ] Preserve application-level policy and audit authority in existing governance services.
- [ ] Document any platform-native lineage as an analytical/catalog representation unless an explicit architecture decision changes ownership.

## Stage 8 — consumer integration

- [ ] Replace proof-only dashboard summaries with real Gold-backed evidence where appropriate.
- [ ] Expose selected Gold products to operator/scientific API or UI consumers.
- [ ] Add AI-ready/query-ready products only after contracts, quality, provenance, and access controls are proven.

## Done criteria for the first complete Lakehouse proof

The first complete proof is reached when a **real public astronomy source** is reproducibly delivered through:

```text
source -> Kafka -> Bronze Delta -> Silver canonical entity -> Gold aggregate
```

and the repository contains evidence for:

- source attribution,
- replay,
- Bronze source fidelity,
- Silver canonicalization,
- analytical quarantine,
- deduplication,
- schema evolution,
- Gold aggregation,
- end-to-end lineage,
- measured behavior and limitations.

## Status guidance

- RAW/CAL/SCI/DRV describe **scientific processing level**.
- Bronze/Silver/Gold describe **analytical refinement level**.
- Broker DLQ handles transport/consumer failures.
- Science-object quarantine handles object integrity/quality failures.
- Silver quarantine handles analytical contract/quality failures after source truth is retained.
- MinIO/S3 remains authoritative for large scientific objects.
- Java Governance remains authoritative for application-level governance semantics.
- Postgres evidence-summary persistence is not a Bronze/Silver/Gold implementation claim.
- Static/sample visualization fixtures are not measured runtime evidence.
- Lakehouse representations remain analytical projections unless an explicit future architecture decision changes ownership.

## Future product-phase handoff — Cosmic Horizon: Resolution

The Lakehouse stages above belong to **Phase 2 / PR #40**. They are intentionally not the same thing as the future product **Phase 3 — Cosmic Horizon: Resolution**.

Resolution planning is captured under [`../cosmic-horizon-resolution/`](../cosmic-horizon-resolution/). Its proposed Evidence Graph & Scientific Intelligence layer depends on this Lakehouse producing real canonical and lineage-backed evidence first.

The Phase 2 handoff should preserve:

- stable source/event/dataset/job/artifact identities,
- source attribution and citations,
- Gold -> Silver -> Bronze -> source traceability,
- quality/quarantine reason codes,
- measured/stale/unavailable evidence state,
- replayability and deterministic lineage.

Those contracts allow a future Phase 3 graph to be a trustworthy projection rather than a second competing domain model.
