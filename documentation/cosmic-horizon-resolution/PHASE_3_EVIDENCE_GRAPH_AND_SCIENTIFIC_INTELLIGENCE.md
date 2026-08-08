# Phase 3 — Evidence Graph & Scientific Intelligence

## 1. Purpose

Phase 3 — **Resolution** is the proposed final product phase for Cosmic Horizon.

Its goal is to convert Phase 2's governed operational, scientific, provenance, and Lakehouse evidence into a coherent relationship model that supports:

- end-to-end lineage,
- dependency and impact analysis,
- graph algorithms,
- knowledge-graph retrieval,
- explainable operational reasoning,
- grounded AI questions and answers,
- later graph-machine-learning experiments.

Phase 3 is a **rectification build**: it should reconcile and connect existing Phase 2 responsibilities rather than introduce another disconnected subsystem.

## 2. Product statement

> Cosmic Horizon Resolution transforms operational, scientific, provenance, and analytical evidence into a unified, queryable knowledge fabric capable of explaining not only what the system knows, but where that knowledge came from and how it was produced.

## 3. Preconditions from Phase 2

Phase 3 implementation should not begin until Phase 2 can provide trustworthy source data and boundaries.

Minimum handoff expectations:

- a canonical event/source-attribution contract,
- a real public-source provider path,
- reproducible Kafka ingestion,
- real Bronze Delta persistence,
- canonical Silver entities,
- at least one persisted Gold output,
- replay and deduplication evidence,
- schema-evolution and quarantine evidence,
- traceability from Gold -> Silver -> Bronze -> authoritative source/object reference,
- clear measured/configured/mock/unavailable evidence semantics,
- stable governance identity for jobs, datasets, artifacts, and provenance.

These are Phase 2 responsibilities. Phase 3 consumes them; it does not redefine them.

## 4. Proposed gates

### P3.1 — Canonical Rectification

Create one consistent identity and relationship model spanning:

- Observation,
- Target / sky object when available,
- ExternalSource / Provider,
- Dataset,
- Job,
- Artifact,
- StorageObject,
- ProvenanceRecord,
- QualityResult,
- BrokerEvent,
- Service,
- Broker,
- LakehouseRecord / TableProjection.

Key outcome: the same dataset/job/artifact identity must mean the same thing in APIs, governance, provenance, the Lakehouse, and the graph projection.

### P3.2 — Lakehouse Completion Handoff

Validate that Resolution consumes real analytical evidence rather than proof-only vocabulary:

```text
public source
 -> Kafka
 -> Spark
 -> Bronze Delta
 -> Silver canonical entity / analytical quarantine
 -> Gold aggregate
```

Key outcome: graph projections can cite stable Lakehouse records and source lineage.

### P3.3 — Evidence Graph

Project deterministic relationships into a property graph or equivalent graph representation.

Initial required traversals:

- source -> observation -> dataset,
- dataset -> producing job,
- job -> input/output datasets,
- dataset -> artifact -> storage object,
- Gold -> Silver -> Bronze -> source,
- quality result -> affected record/dataset,
- job -> executing service -> broker dependency,
- dataset/product -> source citation.

Key outcome: multi-hop lineage and impact analysis work without LLM involvement.

### P3.4 — Graph Analytics

Use graph algorithms to expose structure and defects.

Initial candidates:

- shortest path / BFS for provenance tracing,
- connected components for orphan detection,
- degree/centrality for dependency concentration,
- PageRank for structural importance experiments,
- label propagation / community detection for clusters,
- cycle detection for invalid lineage,
- similarity or nearest-neighbor analysis where domain-safe.

Key outcome: the graph produces deterministic, testable engineering insight before AI is added.

### P3.5 — GraphRAG / Ask Cosmic

Add a natural-language consumer over trusted graph and document evidence.

The system should retrieve:

1. canonical graph entities and paths,
2. relevant structured Lakehouse records,
3. optional document/vector context,
4. source citations and provenance.

The LLM explains retrieved evidence; it does not invent the authoritative relationship model.

Key outcome: an answer can render both prose and the evidence path used to support it.

### P3.6 — Evaluation Harness

Build a repeatable benchmark that validates:

- identity resolution,
- lineage path correctness,
- graph completeness,
- orphan/cycle detection,
- source-citation coverage,
- GraphRAG retrieval precision,
- answer-to-evidence consistency,
- replay determinism,
- behavior under deliberate failure injection.

Key outcome: Phase 3 quality can be measured without requiring an academic astronomy claim.

### P3.7 — Optional Graph ML / GNN Research

Only after P3.1-P3.6 are stable, evaluate graph machine learning against engineering labels the project can control.

Candidate tasks:

- job-failure node classification,
- anomalous-dependency edge classification,
- provenance defect detection,
- missing-link prediction for intentionally removed lineage edges,
- operational graph anomaly detection.

This gate is optional and experimental. It must not be used to imply astrophysical discovery without appropriate domain validation.

## 5. Two graphs, one evidence fabric

Phase 3 should explicitly connect two graph views.

### Scientific / data graph

```text
Provider -> Source -> Observation -> Dataset -> Product
                         |             |
                         |             +-> Artifact -> StorageObject
                         |
                         +-> Target

Dataset -> Provenance -> Parent Dataset / Job
Dataset -> QualityResult
```

### Operational graph

```text
Generator -> Broker -> Ingest -> Governance -> Storage / Lakehouse
                         |
                         +-> Metrics / Alerts / Failures
```

### Resolution

The connection between them is where the new capability appears:

```text
Dataset / Product
      |
      | produced-by
      v
     Job
      |
      | executed-on
      v
   Service
      |
      | depends-on
      v
    Broker
      |
      | observed-by
      v
 Telemetry / Alert
```

This supports questions such as:

- Why is this product late?
- Which products depend on the currently degraded service?
- What source and processing path produced this artifact?
- Which records became quarantined because of this schema version?

## 6. Proposed flagship experience — Ask Cosmic: Evidence Explorer

A user asks:

> Why is this M87/JVLA dataset related to this Gold product?

The UI returns an answer and renders the supporting path:

```text
NRAO / ObsCore
  -> Observation
  -> Bronze event
  -> Silver observation
  -> Gold product
```

A second expandable path can show execution context:

```text
Bronze event
  -> Kafka
  -> Java Ingest
  -> Governance
  -> Lakehouse commit
```

Each node should expose available evidence such as:

- canonical ID,
- provider/source,
- timestamps,
- schema version,
- checksum/object reference,
- producing job,
- quality result,
- source citation,
- original/raw reference.

## 7. Technology direction, not lock-in

Candidate technologies include:

- **Delta Lake / Spark** for analytical history and transformation,
- **GraphFrames** for distributed graph analytics over Spark DataFrames,
- **Neo4j** for property-graph traversal, Cypher, and GraphRAG experimentation,
- **Microsoft GraphRAG** for document-oriented graph retrieval experiments,
- **vector indexes** for semantic retrieval where graph traversal alone is insufficient,
- **PyTorch Geometric** for later GNN experiments.

The architecture should be contract-first. No graph vendor becomes authoritative for domain semantics merely because it hosts a projection.

## 8. Responsibility boundaries

```text
MinIO / S3
  authoritative large science objects

Java Governance
  application jobs, policy, provenance semantics, audit, dataset registration

Lakehouse / Delta
  analytical history, canonicalized projections, quality and aggregate tables

Evidence Graph
  relationship projection, traversal, graph analytics, reasoning context

AI / GraphRAG
  consumer and explainer of governed evidence
```

## 9. Definition of done for Resolution

A credible Phase 3 demonstration should be able to:

1. start from a real/public source record,
2. traverse its Phase 2 analytical lineage,
3. traverse producing jobs/artifacts/storage references,
4. show relevant operational dependencies,
5. run at least three deterministic graph analyses,
6. answer natural-language questions using graph-grounded retrieval,
7. render the evidence path and citations behind the answer,
8. detect deliberately injected lineage/quality defects,
9. distinguish authoritative evidence from derived inference,
10. reproduce the same result from the same bounded test data.

That would make Resolution a coherent final product phase rather than an AI feature bolted onto Phase 2.
