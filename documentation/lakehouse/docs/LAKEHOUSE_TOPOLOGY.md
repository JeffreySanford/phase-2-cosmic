# Lakehouse Topology

> Status: **mixed implemented proof scaffold + planned full Lakehouse topology**
> PR scope: **all stages remain under PR #40**.
> This document preserves the current runtime architecture while making a clear distinction between what the branch already proves and what still requires Kafka/Spark/Delta evidence.

Standalone Mermaid sources are maintained in [`../diagrams/`](../diagrams/README.md).

## 1. Concept overview

The Lakehouse adds a governed analytical plane around structured events, metadata, quality, lineage, and derived tabular products. Authoritative science objects remain in object storage.

```mermaid
flowchart TB
  SRC[Scientific metadata / events]
  OBJ[Authoritative science objects]
  BR[Bronze\nsource-faithful analytical ingest]
  SI[Silver\ncanonical entities + analytical quarantine]
  GO[Gold\nconsumer-optimized analytics]
  CONS[Consumers\nAPI / UI / analytics / AI]

  SRC --> BR
  OBJ --> BR
  BR --> SI
  SI --> GO
  GO --> CONS

  OBJ -. authoritative storage boundary .-> BR
  SI -. governance / quality rules .-> GO
```

Mermaid source: [`concept-overview.mmd`](../diagrams/concept-overview.mmd)

## 2. Current PR #40 proof scaffold — implemented

PR #40 now contains a runnable real-public-data precursor to the Lakehouse pipeline:

```mermaid
flowchart LR
  ESO[ESO TAP / ObsCore\nreal public metadata]
  FETCH[Frontend server\nlive bounded fetch]
  METRICS[LakehouseMetricsService\nsummary/evidence state]
  STORE[(Postgres\nor in-memory test repository)]
  API[Lakehouse API / summary]
  UI[Operator Lakehouse panel]

  ESO --> FETCH --> METRICS
  METRICS --> STORE
  STORE --> API --> UI

  TARGET[Kafka / Spark / Delta\nBronze -> Silver -> Gold]
  FETCH -. next full Lakehouse stage .-> TARGET
```

Mermaid source: [`current-proof-scaffold.mmd`](../diagrams/current-proof-scaffold.mmd)

This path proves:

- live public astronomy metadata connectivity,
- server-side integration,
- persisted/fallback proof-state handling,
- tested API/UI evidence presentation.

It does **not** yet prove:

- Kafka-to-Spark ingestion,
- persisted Bronze Delta source tables,
- Silver canonicalization/deduplication/quarantine tables,
- persisted Gold aggregates with table lineage.

The current evidence panel is therefore an implemented **proof scaffold**, not a claim that the full Lakehouse Analytical Plane already exists.

The standalone HTML visualization under `../visualizations/` remains an illustrative artifact; sample JSON values are explicitly labeled as non-measured fixtures.

## 3. Integrated target topology — planned where noted

The target Lakehouse is an **Analytical Data Plane** connected to the existing streaming, governance, storage, and consumption responsibilities.

```mermaid
flowchart LR
  subgraph SRC[Scientific Data Sources]
    VLA[Public VLA / VLASS Data]
    SIM[ngVLA Simulation Output]
    GEN[Go Generator / Replay Engine]
    VLA --> GEN
    SIM --> GEN
  end

  subgraph STREAM[Operational Streaming Plane]
    K[Kafka]
    P[Pulsar]
    R[RabbitMQ]
    GEN --> K
    GEN --> P
    GEN --> R
  end

  subgraph GOV[Governance Plane]
    API[Java Governance API]
    ING[Java Ingest Service]
    META[Dataset / Job / Provenance Metadata]
    API --> ING
    API --> META
  end

  subgraph OBJ[Object Storage Plane]
    MINIO[MinIO / S3]
    RAW[RAW objects]
    CAL[CAL objects]
    SCI[SCI objects]
    ARC[Archive objects]
    MINIO --> RAW
    MINIO --> CAL
    MINIO --> SCI
    MINIO --> ARC
  end

  subgraph LAKE[Lakehouse Analytical Plane]
    DBX[Databricks / Spark]
    BR[Bronze Delta]
    SI[Silver Delta]
    GO[Gold Delta]
    DBX --> BR --> SI --> GO
  end

  subgraph CONSUME[Consumption Plane]
    UI[Cosmic Horizon Console]
    SQL[Analytics / SQL]
    AI[Future AI-ready Consumers]
  end

  K --> ING
  P --> ING
  R --> API

  ING --> MINIO
  META -. policy / lineage .-> MINIO

  K --> DBX
  P -. planned comparison .-> DBX
  MINIO --> DBX
  META -. metadata / lineage refs .-> DBX

  GO --> SQL
  GO --> UI
  GO --> AI
```

Mermaid source: [`integrated-target-topology.mmd`](../diagrams/integrated-target-topology.mmd)

### Interpretation

- Existing Phase 2 services/brokers/object storage remain authoritative for their documented responsibilities.
- Spark/Delta medallion nodes are target components until runnable table evidence exists.
- Pulsar-to-Lakehouse edges remain comparison paths until the Kafka baseline is stable and measured.
- The Lakehouse does not replace astronomy-specific calibration/imaging or the RAW/CAL/SCI/DRV scientific lifecycle.

## 4. Provider-neutral public-source entry

The current live source happens to be ESO ObsCore, but provider identity should stop at the adapter/source-attribution boundary.

```text
ESO / NRAO / CADC / future archive
              |
              v
      provider profile / adapter
              |
              v
canonical event + source attribution
              |
              v
             Kafka
              |
              v
        Lakehouse pipeline
```

Provider-specific fields remain source payload/mapping concerns. Silver should normalize into existing Cosmic observation/dataset/provenance semantics.

## 5. Repository-anchored runtime responsibility view

```mermaid
flowchart LR
  GEN[Go Data Generator / Replay Processors]
  K[Kafka]
  P[Pulsar]
  R[RabbitMQ]
  GOV[Java Governance API]
  ING[Java Ingest Service]
  OBJ[MinIO / S3]
  TELE[Prometheus / Grafana]
  LAKE[Lakehouse Analytical Plane]

  GEN --> K
  GEN --> P
  GEN --> R
  K --> ING
  P --> ING
  R --> GOV
  GOV --> OBJ
  ING --> OBJ
  GOV --> TELE
  ING --> TELE
  K --> LAKE
  OBJ --> LAKE
  GOV -. metadata / lineage refs .-> LAKE
```

Mermaid source: [`repository-anchors.mmd`](../diagrams/repository-anchors.mmd)

The Go generator/broker fabric remains an operational producer layer; Java Governance and Java Ingest retain their existing authority; MinIO/S3 remains the authoritative object tier; the Lakehouse is an analytical projection/processing plane around structured data.

## 6. Physical/runtime responsibility view

```mermaid
flowchart TB
  subgraph HOST[Existing Runtime]
    GEN[Go Replay / Generator]
    K[Kafka]
    P[Pulsar]
    R[RabbitMQ]
    JG[Java Governance]
    JI[Java Ingest]
    M[MinIO / S3]
  end

  subgraph ANALYTICS[Planned Full Analytical Runtime]
    SS[Spark Structured Streaming]
    D[Delta Lake]
    C[Catalog / Access / Lineage Integration]
  end

  GEN --> K
  GEN --> P
  GEN --> R
  K --> JI
  P --> JI
  R --> JG
  JG --> M
  JI --> M

  K --> SS
  P -. evaluation path .-> SS
  M --> SS
  SS --> D
  D --> C
```

Mermaid source: [`runtime-responsibility.mmd`](../diagrams/runtime-responsibility.mmd)

Platform-native catalog/permission/lineage features must integrate with existing application governance rather than silently redefining system-of-record ownership.

## 7. Logical data-flow view

```mermaid
flowchart LR
  SOURCE[Source Observation / Simulation]
  OBJECT[Authoritative Science Object]
  EVENT[Broker Event / Envelope]
  BR[Bronze]
  VALIDATE[Validate / Dedupe / Normalize]
  SI[Silver]
  AGG[Aggregate / Enrich / Optimize]
  GO[Gold]
  CONSUMER[Analytics / API / UI / AI-ready Dataset]

  SOURCE --> OBJECT
  SOURCE --> EVENT
  OBJECT --> BR
  EVENT --> BR
  BR --> VALIDATE --> SI --> AGG --> GO --> CONSUMER
  GO -. source URI / lineage .-> OBJECT
```

Mermaid source: [`logical-data-flow.mmd`](../diagrams/logical-data-flow.mmd)

Bronze must preserve enough source/event/object context to trace derived table rows back to authoritative inputs.

## 8. First complete Lakehouse vertical slice

The first full Lakehouse proof remains intentionally small:

```mermaid
flowchart LR
  DATA[Small Real/Public Dataset]
  REPLAY[Provider Adapter / Replay]
  K[Kafka]
  SPARK[Spark Structured Streaming]
  BR[Bronze Delta]
  SI[Silver Canonical Tables]
  GO[One Gold Aggregate]
  QUERY[Measured Evidence / UI]

  DATA --> REPLAY --> K --> SPARK --> BR --> SI --> GO --> QUERY
```

Mermaid source: [`first-vertical-slice.mmd`](../diagrams/first-vertical-slice.mmd)

### Why Kafka first

Kafka already participates in the current ingest architecture and gives the initiative one stable baseline to prove before broker comparison. Pulsar remains important, but direct/bridged Pulsar ingestion should be measured after the Kafka path is repeatable.

## 9. Real science + synthetic operational failure

```mermaid
flowchart TB
  REAL[Real VLA / VLASS Records]
  SIM[ngVLA Simulation Records]
  REPLAY[Replay Engine]
  FAULT[Fault Injection]
  BROKER[Kafka / Pulsar]

  REAL --> REPLAY
  SIM --> REPLAY
  REPLAY --> FAULT --> BROKER

  FAULT --> DUP[Duplicate Events]
  FAULT --> LATE[Late / Out-of-order Events]
  FAULT --> SCHEMA[Schema Variation]
  FAULT --> BAD[Missing Metadata / Bad Checksum]
```

Mermaid source: [`real-science-fault-injection.mmd`](../diagrams/real-science-fault-injection.mmd)

Authentic scientific content can remain intact while engineering failures are introduced deterministically for validation.

## 10. Topology ownership rules

| Plane/domain          | Owns                                                                              | Does not own                                      |
| --------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------- |
| Operational Streaming | transport, buffering, replay, broker-specific delivery                            | canonical science catalog                         |
| Governance            | jobs, application policy, dataset registration, provenance/audit semantics        | bulk analytical table execution                   |
| Scientific Processing | RAW/CAL/SCI/DRV scientific workflows/products                                     | Bronze/Silver/Gold analytical trust semantics     |
| Object Storage        | authoritative large science objects and lifecycle tiers                           | analytical table semantics                        |
| Lakehouse Analytical  | structured ingestion, medallion transforms, analytical tables, query optimization | raw science-object replacement or CASA processing |
| Consumption           | operator/scientist interaction and downstream use                                 | authoritative storage/transformation ownership    |

Failure routing is documented separately in [`MEDALLION_ARCHITECTURE.md`](./MEDALLION_ARCHITECTURE.md): broker DLQ, object quarantine, and Silver analytical quarantine are distinct mechanisms.

## 11. Evidence expectations

A topology edge moves from **planned** to **implemented** only when there is evidence such as:

- source/configuration for the integration,
- repeatable local or CI execution,
- observable input/output artifacts,
- failure-path behavior,
- tests or validation results,
- explicit environment/dataset limitations for performance claims.

The live ESO evidence path meets that bar for public-source connectivity and UI/evidence integration. The Kafka/Spark/Delta Bronze/Silver/Gold path does not meet it yet and remains the next major implementation gate.
