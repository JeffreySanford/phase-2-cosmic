# Lakehouse Implementation TODO

This file tracks staged delivery for the complete Lakehouse Initiative under **PR #40**. The stages below are implementation gates, not separate pull requests.

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

> Stage 2 proves that real public astronomy metadata can reach a tested operator evidence surface and that evidence persistence/startup behavior is operational locally. It does **not** prove that Bronze, Silver, or Gold Delta tables exist.

## Stage 3 — first real Lakehouse vertical slice

### Source contract

- [ ] Implement a reusable VO/TAP-style source adapter contract rather than coupling Lakehouse entities to ESO-specific field names.
- [ ] Preserve the current ESO profile as the first working provider implementation.
- [ ] Add an NRAO/VLA/VLASS provider profile when practical so the same contract is validated against the radio-astronomy domain that Cosmic primarily targets.
- [ ] Map source attribution into existing Phase 2 event/manifest/provenance semantics rather than creating a second domain model.

### Kafka and Bronze

- [ ] Route a bounded real/public astronomy extract or replay through Kafka.
- [ ] Consume the Kafka path with Spark Structured Streaming or the selected Delta-capable reference runtime.
- [ ] Persist a real `bronze.observation_events` representation.
- [ ] Preserve source payload, source attribution, event identifiers, ingest timestamps, object/source references, schema version, and available checksums.
- [ ] Retain malformed/incomplete source truth in Bronze rather than silently dropping records because Silver validation fails.
- [ ] Add deterministic replay/reprocessing for the same source input.
- [ ] Capture sample Bronze output as evidence.

### Silver and analytical quarantine

- [ ] Implement `silver.observations` or one equivalent canonical entity derived from Bronze.
- [ ] Normalize provider-specific VO/TAP fields into the existing Cosmic observation/source-attribution model.
- [ ] Add duplicate suppression using stable source/event identifiers.
- [ ] Add explicit late/out-of-order handling.
- [ ] Add controlled schema-version normalization.
- [ ] Route records that cannot satisfy the canonical analytical contract to `silver.quarantine` with deterministic reason codes.
- [ ] Retain lineage from Silver/quarantine back to Bronze and the authoritative source/object reference.
- [ ] Capture one promoted and one quarantined record as evidence.

### Gold

- [ ] Implement at least one persisted Gold aggregate such as `gold.observation_summary`, `gold.source_coverage`, or `gold.ingest_health`.
- [ ] Document the Gold table's consumer, refresh semantics, source Silver tables, and validation expectations.
- [ ] Prove Gold -> Silver -> Bronze -> source/object traceability.
- [ ] Connect one real Gold output to the existing operator evidence surface.

## Stage 4 — quality and resilience proof

- [ ] Exercise duplicate events.
- [ ] Exercise late and out-of-order events.
- [ ] Exercise at least one controlled schema-evolution case.
- [ ] Exercise malformed/incomplete source records.
- [ ] Exercise checksum/object-reference failures where the source contract provides those semantics.
- [ ] Demonstrate correction/replay from Silver quarantine.
- [ ] Confirm Broker DLQ, science-object quarantine, and Silver analytical quarantine remain separate failure domains.
- [ ] Record repeatable evidence for each failure scenario.

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
