# Provenance Model & Lineage

Alignment anchors

- Frontend UX source of truth: [FRONTEND_UI.md](/docuentation/frontend/FRONTEND_UI.md)
- Execution backlog: [../TODO.md](/docuentation/planning/TODO.md)
- Delivery plan: [../ROADMAP.md](/ROADMAP.md)

This document defines provenance concepts and provides examples for constructing verifiable lineage graphs for SRDPs.

Related docs

- [../viewer/VIEWER_SOURCE_CONTRACT.md](/docuentation/viewer/VIEWER_SOURCE_CONTRACT.md)
- [../../documentation/public-data/PUBLIC_DATA_RESOURCES.md](/documentation/public-data/PUBLIC_DATA_RESOURCES.md)

Provenance primitives

- Entity: a dataset, file, or artifact (raw visibility, calibrated table, image)

- Activity: a computational process that transforms entities (calibration job, reconstruction job)

- Agent: an identity or system that submitted or authorized an activity (user, workflow engine)

- Bundle/Manifest: a packaged representation of entities, activities, agents, parameters, and environment metadata used for reproducibility

Lineage example (DAG)

```mermaid
graph LR
  subgraph Raw
    R1[Raw: vis-0001]
    R2[Raw: vis-0002]
  end
  subgraph Compute
    C1[Calibrator v1.4]
    C2[Flagger v2.1]
    RCON[Reconstructor v2.0]
  end
  subgraph Results
    S1[SRDP: image-0001]
  end

  R1 --> C1
  R2 --> C1
  C1 --> C2
  C2 --> RCON
  RCON --> S1
  RCON --> S1

  click S1 "#" "SRDP package contains manifest + hash anchors"

```

Provenance bundle contents (recommended minimum)

- Identifiers and stable URIs for all input entities

- Exact software versions and container digests

- Parameter sets and configuration files (diffable)

- Execution timestamps, resource footprints, and node identifiers

- Signed audit manifest linking the bundle to the governance catalog entry
- External/public source citations where imagery, catalogs, metadata, or calibration references were used

Verification and replay

- Provide tools that can consume a provenance bundle and re-run workflows in a controlled environment.

- Where exact hardware parity is impossible, provide emulation layers or runbooks describing equivalence classes of environments.

## Expanded provenance scope: data types

Provenance spans more than just files — it must describe behavior, custody, and lifecycle across many data classes:

- Raw visibilities: time-series complex samples produced by the correlator. Very large, high-throughput, often sharded across files/objects.

- Calibration products: calibration tables, solutions, and metadata used to correct raw visibilities.

- Intermediate derivates: staged measurement sets, averaged products, and tiled artifacts used during pipelines.

- Science Ready Data Products (SRDPs): images, cubes, catalogs, and final products published to users.

- Telemetry & operational logs: low-latency signals, diagnostics, and system traces (often high-cardinality but smaller per-event).

- Machine learning artifacts: model weights, checkpoints, feature stores, and derived inference outputs.

- Metadata & catalogs: typed records linking entities, checksums, access policies, and storage pointers.

Each class requires different provenance granularity: raw visibilities need object-level identifiers and storage anchors; telemetry may need sampling and aggregated fingerprints; ML artifacts require model lineage (training data, hyperparameters, seed/commit).

## Scale and 50-year horizon

Use the production-rate target (approx. 7.5–8 GB/s) as a baseline for long-term planning. At 7.5 GB/s continuous ingest:

- Annual raw ingest: ~7.5 GB/s \* 31,536,000 s/yr ≈ 236 PB/year (decimal PB = 10^15 bytes).

- 50-year raw accumulation (no deduplication, no tiering): ≈ 11.8 EB (exabytes).

Practical considerations that increase effective storage needs:

- Derived data and intermediate copies: pipelines create multiple derivatives — plan for 2–5x multiplicative overhead depending on retention windows.

- Replication and backups: geo-replication and protection increase aggregate storage by N-way replication (commonly 2–3x).

- Indexes, catalogs, and provenance bundles: small relative to raw bytes but critical for discoverability; expect single-digit percent overhead for indexed metadata stores and catalogs.

Example sizing scenarios (rounded):

- Conservative: store raw + one replica + essential intermediates = 236 PB \* (1 + 1 + 0.5) ≈ 590 PB/year.

- Aggressive (long-term research retention): include full intermediate sets and ML artifacts = 236 PB \* (1 + 2 + 1) ≈ 944 PB/year.

Over 50 years these translate into multi-exabyte footprints; practical operations will rely on tiering, aggressive lifecycle policies, and archival anchors to control costs.

## Provenance actions across lifecycle

Provenance must record actions at each lifecycle stage:

- Ingest: record producer, capture timestamp, checksum, storage location, and access policy.

- Processing: record job id, code/container digest, parameters, compute footprint, and input->output mappings.

- Publication: record dataset identifiers, access controls, derived product relationships, and human-readable abstracts.

External/public-source requirement:

- When data is derived from or linked to public external sources, preserve `sourceName`, `providerName`, `citationUrl`, source/dataset identifier, and retrieval/access timestamp where available.
- Treat source citation as provenance-grade metadata, not as a presentation-only field.

### Audit log & governance service

The governance API emits structured audit entries for every job submission and state transition. These entries are persisted in the runtime log and (during testing) also captured in an in-memory audit store that can be queried by integration tests. The `ProvenanceE2ETest` exercises this store by submitting a job (including a manifest parameter) and polling for the expected audit record, providing a lightweight deterministic verification of the full control-plane flow. In addition to the in-memory log, HTTP query endpoints were added for easy introspection of the recorded messages and metadata:

- `GET /api/v1/jobs/{id}/audit` returns the textual audit log entries for a job
- `GET /api/v1/jobs/{id}/lineage` returns any stored lineage metadata (parent/ancestor identifiers) associated with a job, supporting traceability across workflows

  The platform UI reflects provenance metadata stored on datasets: metadata keys are flattened into the dataset model so the provenance panel can display workflow, job identifiers, ngVLA parameters, and arbitrary processing parameters such as the submitted manifest. A front‑end e2e test now verifies that a dataset created via the API containing a manifest appears correctly in the panel.

- Retention & deletion: record lifecycle transitions, TTLs, legal holds, and an immutable deletion record when objects are destroyed.

- In-flight security: record encryption-in-transit/mTLS parameters, key identifiers, and token/evidence of integrity checks executed during transfer.

## Auditability & long-term verification

- Signed manifests: every published SRDP should be anchored by a signed audit manifest containing stable URIs and cryptographic hashes.

- Anchors: consider blockchain-like anchoring or periodic Merkle anchoring to an external, immutable store to strengthen long-term verifiability.

- Reproducibility bundles: provide a machine-readable bundle that includes inputs, exact code versions, container digests, and a runnable recipe for replay.

## Mermaid: provenance & lifecycle overview

```mermaid
flowchart LR
  ingest[Ingest Gateway]
  ingest --> hot[Hot Store (NVMe/SSD)]
  hot --> processing[Processing / Pipelines]
  processing --> warm[Warm Object Store]
  warm --> cold[Cold Storage]
  cold --> archive[Archive / Deep Cold]

  processing -.-> provenance[Provenance Bundle Creator]
  provenance --> catalog[Metadata Catalog]
  catalog --> audit[Signed Audit Manifest]
  audit --> anchor[External Anchor / Merkle]
```

## Recommendations

- Treat provenance metadata as first-class: ingest it atomically with data when possible, and replicate metadata more widely than raw bytes.
- Preserve authoritative external source citations end-to-end so viewer and dataset surfaces can link back to the origin without inventing metadata at render time.

- Use compact fingerprints for high-rate telemetry (sampling + aggregated provenance) and full bundles for SRDPs.

- Design lifecycle policies that keep minimal intermediates in Hot/Warm and push bulk raw visibilities to Cold/Archive with strong provenance anchors.

- Budget for multi-exabyte archives over multi-decade horizons and implement automated lifecycle tests that verify provenance bundles remain resolvable.
