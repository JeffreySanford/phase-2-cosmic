# Lakehouse Initiative

> Status: **active architecture and proof-slice initiative**
> PR scope: **PR40 documents the architecture/evidence scaffold; PR41 starts the MVP medallion implementation; PR42 plans Databricks production-runtime integration**
> Purpose: add a governed analytical data plane without replacing the existing streaming, governance, scientific-processing, or object-storage architecture.

## Repository layout

The Lakehouse Initiative is intentionally self-contained under this directory:

```text
documentation/lakehouse/
├── README.md
├── TODO.md
├── docs/
│   ├── LAKEHOUSE_TOPOLOGY.md
│   ├── MEDALLION_ARCHITECTURE.md
│   ├── STORAGE_RESPONSIBILITIES.md
│   ├── REAL_DATA_SOURCES.md
│   ├── PUBLIC_DATASET_SCAN_2026_08_08.md
│   ├── ACTIVE_DATASET_SELECTION_PLAN.md
│   ├── ESO_PROOF_SLICE_BRIEF.md
│   ├── ESO_INGESTION_ADAPTER_CONTRACT.md
│   ├── PIPELINE_TELEMETRY_EVIDENCE.md
│   ├── PR41_MVP_LAKEHOUSE.md
│   ├── PR41_SCALE_PROFILES_AND_CONTROL_VIEW.md
│   ├── PR41_SCALE_IMPLEMENTATION_PLAN.md
│   ├── PR41_TESTING_SUITE_PLAN.md
│   ├── PR41_DIAGNOSTIC_VIEW_PLAN.md
│   ├── PR42_DATABRICKS_SPRINT_PLAN.md
│   └── PR40_PR42_ROADMAP.md
├── diagrams/
│   ├── README.md
│   ├── concept-overview.mmd
│   ├── current-proof-scaffold.mmd
│   ├── integrated-target-topology.mmd
│   ├── repository-anchors.mmd
│   ├── runtime-responsibility.mmd
│   ├── logical-data-flow.mmd
│   ├── first-vertical-slice.mmd
│   ├── real-science-fault-injection.mmd
│   ├── medallion-overview.mmd
│   ├── processing-vs-medallion.mmd
│   ├── quality-quarantine-flow.mmd
│   ├── failure-routing.mmd
│   ├── storage-responsibility-topology.mmd
│   ├── write-path-boundary.mmd
│   ├── active-dataset-selection.mmd
│   ├── public-dataset-onboarding.mmd
│   ├── pr41-mvp-lakehouse.mmd
│   └── pr42-databricks-sprint-plan.mmd
└── visualizations/
    ├── eso-proof-slice-dashboard.html
    └── sample-metrics.json
```

- `docs/` contains explanatory architecture, proof-slice, and operator-evidence documentation.
- `diagrams/` contains the standalone `.mmd` source for every Mermaid view introduced by the initiative.
- `visualizations/` contains design/proof visualization artifacts. Static/sample values are illustrative fixtures and must never be described as measured Lakehouse runtime evidence.
- Embedded Mermaid and standalone `.mmd` sources should be changed together until automated inclusion/rendering is introduced.

## Current implementation status

PR #40 has progressed beyond documentation-only architecture. The branch contains an **active public-source evidence scaffold**:

- a live ESO TAP / ObsCore metadata fetch,
- a `LakehouseMetricsService` with Postgres persistence and in-memory test support,
- the active operator endpoint `GET /api/v1/lakehouse/metrics`,
- an operator-facing Lakehouse panel and Pipeline Telemetry evidence view,
- Storybook, unit, focused server tests, and e2e coverage around the evidence surface,
- startup hardening that validates the host -> Docker PostgreSQL path before SSR starts.

The active evidence API is deliberately proof-only. A successful public-source response reports real source/freshness evidence while keeping all medallion implementation percentages at zero until runnable Delta work exists.

A locally validated Stage 2 response on PR #40 returned:

```text
source: live
upstream.kind: eso-obscore
upstream.rowCount: 5
bronzePercent: 0
silverPercent: 0
goldPercent: 0
freshness.stale: false
```

The corresponding states explicitly say that Bronze Delta, Silver, and Gold are not implemented.

Postgres is used here as **evidence-summary persistence**, not as proof that the Lakehouse analytical plane exists. If persistence is unavailable, the active evidence path may still return a successful live ESO proof. Conversely, successful Postgres persistence does not promote Bronze/Silver/Gold into implemented status.

For local development, `pnpm start:all` converges the Postgres sidecar, restricts it to loopback, reconciles the persisted role when necessary, discovers the actual Docker host port, and verifies the host-side `node-postgres` connection before SSR starts. The password is kept out of runtime diagnostic URLs.

This is useful runnable evidence, but it is **not yet the Lakehouse data plane itself**. The branch does not yet prove:

- Kafka -> Spark Structured Streaming ingestion into Delta Bronze tables,
- persisted Silver canonical tables with deduplication/quarantine,
- persisted Gold analytical tables with lineage to Bronze/Silver,
- measured Kafka/Pulsar Lakehouse throughput or recovery behavior.

PR41 introduces the first MVP implementation target for that gap. See [`docs/PR41_MVP_LAKEHOUSE.md`](./docs/PR41_MVP_LAKEHOUSE.md). The PR41 MVP is local-first, creates reproducible Bronze/Silver/Gold table artifacts under `tmp/lakehouse/pr41-delta/`, and lets the Lakehouse evidence service report verified PR41 medallion evidence when the local manifest exists.

The PR41 scale, testing, and diagnostic UI planning lives in [`docs/PR41_SCALE_PROFILES_AND_CONTROL_VIEW.md`](./docs/PR41_SCALE_PROFILES_AND_CONTROL_VIEW.md), [`docs/PR41_SCALE_IMPLEMENTATION_PLAN.md`](./docs/PR41_SCALE_IMPLEMENTATION_PLAN.md), [`docs/PR41_TESTING_SUITE_PLAN.md`](./docs/PR41_TESTING_SUITE_PLAN.md), and [`docs/PR41_DIAGNOSTIC_VIEW_PLAN.md`](./docs/PR41_DIAGNOSTIC_VIEW_PLAN.md).

PR42 defines how the PR41 medallion contract graduates into Databricks. See [`docs/PR42_DATABRICKS_SPRINT_PLAN.md`](./docs/PR42_DATABRICKS_SPRINT_PLAN.md). Databricks is the planned managed Spark/Delta/Unity Catalog runtime for analytical tables and workflows; it does not replace Java Governance or MinIO/S3.

For cross-PR documentation updates, use [`docs/PR40_PR42_ROADMAP.md`](./docs/PR40_PR42_ROADMAP.md) as the coordination guide.

| Artifact                        | Status                            | Notes                                                                                                                                |
| ------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Architecture topology           | Documented                        | Planned analytical-plane boundaries and runtime relationships.                                                                       |
| Medallion contract              | Documented                        | Bronze, Silver, and Gold analytical responsibilities.                                                                                |
| Storage responsibilities        | Documented                        | Object-store authority versus Lakehouse projections.                                                                                 |
| Real-data source strategy       | Documented                        | Provider-neutral VO/TAP approach with ESO as the first working profile.                                                              |
| Public dataset expansion scan   | Documented                        | Dated PR40 scan of additional official public archive/catalog sources and recommended activation defaults.                           |
| Active dataset selection plan   | Documented                        | Planned registry, include/exclude controls, bundle profiles, and active-record policy for development datasets.                      |
| ESO proof-slice fetch           | Implemented on PR #40             | Live public ObsCore metadata is used by the current evidence path.                                                                   |
| Active Lakehouse evidence API   | Implemented and locally validated | `GET /api/v1/lakehouse/metrics`; returns live/stale/unavailable evidence without synthetic medallion readiness.                      |
| Lakehouse evidence persistence  | Implemented on PR #40             | Postgres-backed summary persistence when available; in-memory support for tests. Persistence is not a Delta-stage claim.             |
| Operator evidence surfaces      | Implemented on PR #40             | Dashboard/Lakehouse panel and Pipeline Telemetry use the proof-only contract.                                                        |
| Static visualization artifact   | Illustrative only                 | `visualizations/eso-proof-slice-dashboard.html` and `sample-metrics.json` are design/sample fixtures, not measured runtime evidence. |
| Delta Bronze/Silver/Gold tables | PR41 MVP started                  | Local medallion artifact runner/verifier under `tools/lakehouse-mvp`; Spark/Kafka production runtime remains future work.            |
| Databricks production runtime   | PR42 planned                      | Managed Spark/Delta/Unity Catalog target; no implementation claim until workspace/table/job evidence exists.                         |
| Kafka/Spark streaming path      | Planned                           | Remains the first full Lakehouse pipeline target.                                                                                    |
| Pulsar comparison               | Planned                           | Follows only after the Kafka baseline is real and repeatable.                                                                        |

## 1. Architectural principles

1. **Do not replace the object store.** MinIO/S3 remains authoritative for large scientific objects.
2. **Do not replace the Governance Plane.** Existing governance services remain authoritative for application-level job lifecycle, policy, provenance semantics, audit, and dataset registration.
3. **Do not replace scientific processing levels.** RAW/CAL/SCI/DRV describe scientific processing state; Bronze/Silver/Gold describe analytical refinement. They are orthogonal taxonomies.
4. **Preserve raw truth.** Bronze stores source-faithful records/references before canonicalization.
5. **Make quality explicit.** Silver owns analytical schema enforcement, normalization, deduplication, late-data handling, and analytical quarantine.
6. **Optimize for consumers.** Gold contains purpose-built analytical products and operational/scientific summaries.
7. **Keep failure domains distinct.** Broker DLQ, science-object quarantine, and Silver analytical quarantine solve different problems.
8. **Keep implementation claims honest.** A topology edge or medallion stage becomes implemented only when runnable evidence exists.
9. **Preserve reproducibility.** Derived records must retain sufficient source, event, dataset, checksum/object, and lineage references to trace back to authoritative inputs.
10. **Separate proof from persistence.** A persisted evidence summary is evidence about a proof run; it is not itself a Bronze/Silver/Gold analytical table.

## 2. Relationship to existing planes

The Lakehouse is an **Analytical Data Plane** connected to existing responsibilities:

- **Operational Streaming Plane** — produces and transports events using Kafka, Pulsar, and RabbitMQ according to their documented roles.
- **Governance Plane** — owns application policy, jobs, dataset registration, provenance, and audit semantics.
- **Scientific Processing Lifecycle** — tracks RAW -> CAL -> SCI -> DRV products and workflows.
- **Object Storage Plane** — persists authoritative large scientific objects and archive packages.
- **Lakehouse Analytical Plane** — organizes structured event/metadata history into Bronze, Silver, and Gold analytical tables.
- **Frontend / Consumption Plane** — consumes governed APIs, analytical summaries, evidence, and future AI-ready datasets.

See [`docs/LAKEHOUSE_TOPOLOGY.md`](./docs/LAKEHOUSE_TOPOLOGY.md), [`docs/MEDALLION_ARCHITECTURE.md`](./docs/MEDALLION_ARCHITECTURE.md), and [`docs/PIPELINE_TELEMETRY_EVIDENCE.md`](./docs/PIPELINE_TELEMETRY_EVIDENCE.md).

## 3. Data-source strategy

The ingestion architecture is **provider-neutral**. Public astronomy metadata should enter through a reusable VO/TAP-style source contract rather than making ESO, NRAO, or any other archive part of the Lakehouse domain model.

Current and planned provider profiles are:

| Source/profile                 | Role                                                                      |
| ------------------------------ | ------------------------------------------------------------------------- |
| ESO TAP / ObsCore              | First working public metadata profile and current live proof-slice source |
| NRAO/VLA/VLASS                 | Preferred radio-astronomy-aligned profile for subsequent validation       |
| CADC/CAOM or other VO services | Cross-archive interoperability/profile validation                         |
| ngVLA simulation output        | ngVLA-shaped scientific test data                                         |
| Go generator / broker replay   | Deterministic operational load and fault injection                        |

The expanded public-source catalog and activation model are documented in [`docs/PUBLIC_DATASET_SCAN_2026_08_08.md`](./docs/PUBLIC_DATASET_SCAN_2026_08_08.md) and [`docs/ACTIVE_DATASET_SELECTION_PLAN.md`](./docs/ACTIVE_DATASET_SELECTION_PLAN.md). The intended control model is to keep many public sources in a registry while activating only bounded, documented source bundles for a given development run.

The preferred learning pattern remains **real science + synthetic operational failure**: preserve authentic observational metadata/content while deliberately injecting duplicates, late arrivals, schema variation, missing metadata, invalid checksums, or broker interruptions when needed for engineering tests.

## 4. Target Lakehouse path

The target capability remains:

```text
Public astronomy / simulation / platform events
                     |
                     v
              Kafka first
                     |
                     v
         Spark Structured Streaming
                     |
                     v
                  Bronze
                     |
          validate / dedupe / normalize
                     |
                     v
                  Silver
                     |
           aggregate / optimize
                     |
                     v
                   Gold
                     |
                     v
          APIs / UI / analytics / AI
```

Large binary science products such as CASA Measurement Sets, FITS images, calibration artifacts, and archive bundles remain in MinIO/S3-compatible object storage. Delta tables carry structured events, metadata, quality results, provenance references, derived tabular data, and analytical aggregates.

## 5. Staged execution inside PR #40

PR #40 is the umbrella for the complete initiative. The stages are implementation gates, **not separate pull requests**.

1. **Architecture baseline** — topology, storage boundaries, medallion semantics, source strategy, and reusable Mermaid sources.
2. **Live source/evidence scaffold** — prove real public metadata can reach the existing API/UI evidence surface without implying Delta implementation. ESO ObsCore is the first working provider profile.
3. **Real Lakehouse vertical slice** — public astronomy data -> Kafka -> Spark -> Bronze Delta -> Silver canonical entity -> one Gold aggregate.
4. **Quality/resilience proof** — duplicates, late/out-of-order data, schema evolution, malformed records, replay, and deterministic quarantine behavior.
5. **Broker comparison** — compare Kafka baseline with Pulsar direct/bridged paths only after the baseline is stable.
6. **Performance evidence** — measure throughput, recovery, storage behavior, query behavior, and cost/resource observations at modest scale.
7. **Governance integration** — integrate catalog/lineage/access controls without redefining the existing Governance Plane's authority.
8. **Consumer integration** — expose selected real Gold products to operations, scientific views, APIs, and later AI workflows.

The initiative advances when each stage has runnable evidence and clearly stated limitations.

## 6. First full Lakehouse acceptance criteria

The first complete Bronze/Silver/Gold slice should:

- ingest a modest real/public astronomy dataset or metadata extract through the reusable source contract,
- deliver the source through Kafka into a real Bronze Delta representation,
- preserve source attribution, event identifiers, ingest timestamps, object/source references, and available checksums,
- produce at least one Silver canonical entity,
- retain malformed/incomplete Bronze truth while routing analytical contract failures to Silver quarantine,
- demonstrate deduplication and one schema-evolution case,
- produce at least one persisted Gold operational or scientific aggregate,
- retain traceability from Gold -> Silver -> Bronze -> authoritative source/object reference,
- record measured behavior for the small test dataset.

## 7. Initial Lakehouse entity mapping

| Existing concept         | Lakehouse role                                                  |
| ------------------------ | --------------------------------------------------------------- |
| Broker event envelope    | Bronze ingest record/envelope                                   |
| Dataset Manifest         | Bronze reference + Silver canonical dataset input               |
| Observation metadata     | Bronze source payload -> Silver canonical observation           |
| JobRecord                | Silver processing/job dimension or analytical reference         |
| ProvenanceRecord         | Silver/Gold lineage projection                                  |
| ETL/quality results      | Bronze raw result -> Silver quality/quarantine -> Gold rollup   |
| MinIO/S3 object          | URI/checksum authoritative pointer retained in Lakehouse tables |
| Telemetry/broker metrics | Bronze operational events -> Gold operational summaries         |

## 8. Technology direction

The reference implementation evaluates:

- Databricks / Apache Spark Structured Streaming,
- Delta Lake,
- Bronze / Silver / Gold medallion organization,
- Kafka ingestion first,
- Pulsar direct/bridge comparison after the baseline,
- MinIO/S3-compatible object references,
- catalog, access-control, and lineage integration appropriate to the selected environment.

Technology-specific topology edges remain **planned** until code, repeatable execution, observable artifacts, and failure-path evidence exist.

## 9. Non-goals

- Replacing CASA or astronomy-specific calibration/imaging pipelines.
- Treating Bronze/Silver/Gold as synonyms for RAW/CAL/SCI/DRV.
- Moving all Measurement Set/FITS binary content into Delta tables.
- Claiming ngVLA production throughput from a small proof slice.
- Replacing MinIO/S3 with Databricks-managed storage.
- Replacing Java Governance semantics with Lakehouse tables.
- Implementing all broker paths before establishing a Kafka baseline.
- Treating illustrative dashboard values as measured Lakehouse performance.
- Treating evidence-summary persistence as implementation of the Lakehouse data plane.
- Building production AI/RAG before data contracts, quality, and lineage are proven.

## 10. Documents and diagrams

### Documentation

- [`docs/LAKEHOUSE_TOPOLOGY.md`](./docs/LAKEHOUSE_TOPOLOGY.md) — physical/logical topology and data-flow views.
- [`docs/MEDALLION_ARCHITECTURE.md`](./docs/MEDALLION_ARCHITECTURE.md) — Bronze/Silver/Gold responsibilities, scientific-level crosswalk, and failure-routing semantics.
- [`docs/STORAGE_RESPONSIBILITIES.md`](./docs/STORAGE_RESPONSIBILITIES.md) — authoritative object storage versus Lakehouse table responsibilities.
- [`docs/REAL_DATA_SOURCES.md`](./docs/REAL_DATA_SOURCES.md) — VO/TAP source strategy and archive/provider profiles.
- [`docs/PUBLIC_DATASET_SCAN_2026_08_08.md`](./docs/PUBLIC_DATASET_SCAN_2026_08_08.md) — dated scan of additional public archive/catalog sources not yet active in the Lakehouse plan.
- [`docs/ACTIVE_DATASET_SELECTION_PLAN.md`](./docs/ACTIVE_DATASET_SELECTION_PLAN.md) — PR40 plan for source registry, include/exclude states, development bundles, and active-record controls.
- [`docs/ESO_PROOF_SLICE_BRIEF.md`](./docs/ESO_PROOF_SLICE_BRIEF.md) — first implemented provider profile and path toward the full Lakehouse slice.
- [`docs/ESO_INGESTION_ADAPTER_CONTRACT.md`](./docs/ESO_INGESTION_ADAPTER_CONTRACT.md) — provider-neutral source-to-Bronze contract documented using the ESO profile.
- [`docs/PIPELINE_TELEMETRY_EVIDENCE.md`](./docs/PIPELINE_TELEMETRY_EVIDENCE.md) — operator evidence semantics, active API paths, source labels, and the Lakehouse implementation claim boundary.
- [`docs/PR41_MVP_LAKEHOUSE.md`](./docs/PR41_MVP_LAKEHOUSE.md) — PR41 local medallion MVP moving parts and acceptance criteria.
- [`docs/PR41_SCALE_PROFILES_AND_CONTROL_VIEW.md`](./docs/PR41_SCALE_PROFILES_AND_CONTROL_VIEW.md) — guarded local scale profiles and platform control-view contract.
- [`docs/PR41_SCALE_IMPLEMENTATION_PLAN.md`](./docs/PR41_SCALE_IMPLEMENTATION_PLAN.md) — large-profile generation, storage, and verification plan.
- [`docs/PR41_TESTING_SUITE_PLAN.md`](./docs/PR41_TESTING_SUITE_PLAN.md) — PR41 MVP testing-suite and quality-gate plan.
- [`docs/PR41_DIAGNOSTIC_VIEW_PLAN.md`](./docs/PR41_DIAGNOSTIC_VIEW_PLAN.md) — PR41 diagnostic view state model, read-only payload, and UI placement plan.
- [`docs/PR42_DATABRICKS_SPRINT_PLAN.md`](./docs/PR42_DATABRICKS_SPRINT_PLAN.md) — Databricks production-runtime sprint plan and PR43+ implementation sequence.

### Mermaid sources

- [`diagrams/README.md`](./diagrams/README.md) — diagram catalog and synchronization rules.
- `diagrams/*.mmd` — standalone source for every Mermaid view introduced by this initiative.

Existing canonical documents remain authoritative for their domains:

- [../architecture/ARCHITECTURE.md](../architecture/ARCHITECTURE.md)
- [../data/DATA_ARCHITECTURE.md](../data/DATA_ARCHITECTURE.md)
- [../storage/STORAGE_ARCHITECTURE.md](../storage/STORAGE_ARCHITECTURE.md)
- [../provenance/PROVENANCE.md](../provenance/PROVENANCE.md)

Execution progress is tracked in [`TODO.md`](./TODO.md).
