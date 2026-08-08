# Cosmic Horizon Resolution — Architecture

## 1. Architectural intent

Resolution adds a graph-backed intelligence and explanation layer **without replacing** the authoritative systems established in Phase 2.

The central architectural idea is a controlled projection:

```text
Authoritative systems
    -> governed analytical records
    -> canonical graph projection
    -> graph analytics / retrieval
    -> grounded AI explanation
```

Each layer has a distinct responsibility.

## 2. Plane model

### Operational Streaming Plane

Responsibilities:

- event transport,
- broker-specific delivery semantics,
- lag/backlog and delivery evidence,
- DLQ and retry behavior.

Primary technologies already present or evaluated in Phase 2 include Kafka, Pulsar, and RabbitMQ.

### Governance Plane

Responsibilities:

- application job lifecycle,
- dataset registration,
- policy,
- provenance semantics,
- audit,
- canonical application identifiers.

Java Governance remains authoritative for these semantics.

### Scientific Processing Lifecycle

Responsibilities:

- RAW / CAL / SCI / DRV processing levels,
- calibration/imaging/catalog workflows,
- science-object quality and integrity boundaries.

Resolution does not redefine scientific processing levels.

### Object Storage Plane

Responsibilities:

- authoritative large binary products,
- FITS / Measurement Set / archive objects,
- checksums and object references.

MinIO/S3 remains authoritative for these objects.

### Lakehouse Analytical Plane

Responsibilities:

- Bronze source-faithful analytical history,
- Silver canonicalization, deduplication, quality and quarantine,
- Gold consumer-oriented aggregates,
- replayable analytical lineage,
- measured analytical behavior.

Delta/Lakehouse remains the analytical history layer.

### Evidence Graph Plane

Responsibilities:

- canonical entity relationships,
- multi-hop lineage and dependency traversal,
- graph analytics,
- graph-oriented retrieval context,
- relationship-level evidence projection.

The graph is a **projection** of governed records, not a replacement for source authority.

### Scientific Intelligence / Consumption Plane

Responsibilities:

- Ask Cosmic / Evidence Explorer,
- graph + vector retrieval,
- evidence-path visualization,
- grounded answer generation,
- analyst/operator-facing explanation.

AI consumes evidence. It does not establish authority.

## 3. Data flow

```text
ESO / NRAO / VO / simulation / platform events
                    |
                    v
             Canonical adapters
                    |
                    v
                  Kafka
                    |
                    v
          Spark / Lakehouse processing
                    |
        +-----------+-----------+
        |           |           |
        v           v           v
      Bronze      Silver       Gold
                    |
                    | canonical graph projection
                    v
              Evidence Graph
                    |
       +------------+------------+
       |            |            |
       v            v            v
   Traversal     Analytics     GraphRAG
       |            |            |
       +------------+------------+
                    |
                    v
                Ask Cosmic
```

## 4. Projection contract

Graph projection should be deterministic for structured domain records.

Every projected node should retain, when applicable:

- canonical ID,
- entity type,
- source system,
- source record/table reference,
- source attribution,
- created/observed timestamp,
- schema version,
- checksum/object reference,
- evidence state.

Every projected edge should retain, when applicable:

- relationship type,
- source of the relationship,
- relationship timestamp or validity window,
- provenance/source record reference,
- derivation type (`authoritative`, `analytical`, `derived`, `inferred`, `mock/test`).

## 5. Graph storage options

### Property graph database

A property graph such as Neo4j is attractive for:

- Cypher traversal,
- interactive multi-hop lineage,
- developer-friendly graph modeling,
- GraphRAG experiments,
- path visualization.

It should initially be treated as a projection target.

### Spark / GraphFrames

GraphFrames is attractive for:

- distributed graph computation on Spark DataFrames,
- using Lakehouse-derived vertices and edges directly,
- PageRank/centrality experiments,
- connected components,
- label propagation/community analysis,
- shortest-path and structural analysis at larger scale.

### Postgres recursive queries

Postgres recursive CTEs remain useful as a control/baseline for small lineage graphs and can help validate graph projections before a dedicated graph store becomes mandatory.

## 6. Hybrid retrieval

Ask Cosmic should not rely on one retrieval method.

```text
Question
  |
  +-> entity resolution
  |
  +-> graph traversal
  |
  +-> structured Lakehouse lookup
  |
  +-> vector/document retrieval when needed
  |
  v
Evidence bundle
  |
  v
LLM explanation
  |
  v
Answer + evidence path + citations
```

Graph traversal is strongest for explicit relationships. Vector retrieval is strongest for semantically relevant unstructured text. Lakehouse queries are strongest for analytical facts and aggregates.

## 7. Explainable observability

Resolution can connect data lineage to runtime dependency evidence.

Example:

```text
Gold product late
  -> source Silver entity delayed
  -> Bronze ingest delayed
  -> producing job waiting
  -> Java Ingest throughput degraded
  -> Kafka consumer lag elevated
```

This is an engineering explanation path, not an LLM guess. The LLM may summarize it, but the path should come from measured/recorded evidence.

## 8. Failure-domain preservation

Phase 3 must preserve the Phase 2 distinction between:

- broker DLQ,
- science-object quarantine,
- Silver analytical quarantine.

Graph relationships should make those failure domains easier to traverse, not collapse them into a generic `FAILED` state.

## 9. Security and privacy principles

- Do not place secrets in graph node properties.
- Prefer stable logical identifiers over host-local paths.
- Preserve access-policy metadata where datasets are restricted.
- Retrieval must respect source-system and catalog authorization.
- GraphRAG must not bypass dataset access policy because a relationship exists.
- AI-visible context should be a filtered evidence bundle, not unrestricted graph/database dumps.

## 10. Phase boundary

PR #40 may capture this architecture and make Phase 2 decisions compatible with it. It should not claim that the Evidence Graph Plane or Ask Cosmic is implemented until a future Phase 3 build provides runnable evidence.
