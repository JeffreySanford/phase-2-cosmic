# Governance & Orchestration Control Plane (Java)

Purpose

The Governance Plane is the authoritative system of record. It stores structural metadata, access and lifecycle policies, job orchestration definitions and the provenance graph that links SRDPs to raw inputs, code versions, and execution environments.

Core services

- Archive Catalog — typed relational models for datasets and products

- Provenance Graph — directed graph of inputs, transforms, parameters, and outputs

- Job Orchestration — definitions, retries, and recorded execution traces

- Policy & Access Control — RBAC/ABAC models with policy versioning

- Audit & Signing — signed manifests and retention rules

Workflow: creating a cataloged SRDP

```mermaid
flowchart TD
  R[Request_Create_Job] --> AC[Access Control Check]
  AC --> OR[Orchestration Engine]
  OR --> EX[Execution Record]
  EX --> PG[Provenance Graph Update]
  PG --> CAT[Archive Catalog Entry]
  CAT --> AM[Audit Manifest - signed]
  AM --> LTO[Long-Term Object Store]

  style PG fill:#99cc99,stroke:#2b8f3b
  style OR fill:#ffd6da,stroke:#c92c2c
  %% Compact vertical legend (colors match nodes)
    %% Compact Legend (bottom-right)
  subgraph Legend[ ]
    direction TB
    PG[PG]
    OR[OR]
    L_ingest[Ingest]
    L_processing[Processing]
    L_storage[Storage]
    L_gov[Gov]
  end
    style PG fill:#99cc99,stroke:#2b8f3b,color:#000000,font-size:10px
    style OR fill:#ffd6da,stroke:#c92c2c,color:#000000,font-size:10px
    style L_ingest fill:#ffd199,stroke:#0b3a66,color:#ffffff,font-size:10px
    style L_processing fill:#33a02c,stroke:#1b5e20,color:#000000,font-size:10px
    style L_storage fill:#ff7f00,stroke:#b35400,color:#000000,font-size:10px
    style L_gov fill:#ffd199,stroke:#3b1f4d,color:#000000,font-size:10px
  classDef legendClass font-size:10px;
  class PG,OR,L_ingest,L_processing,L_storage,L_gov legendClass

  style L_ingest fill:#1f78b4,stroke:#0b3a66,color:#fff,font-size:10px
  style L_processing fill:#33a02c,stroke:#1b5e20,color:#000,font-size:10px
  style L_storage fill:#ff7f00,stroke:#b35400,color:#000,font-size:10px
  style L_gov fill:#6a3d9a,stroke:#3b1f4d,color:#fff,font-size:10px
  classDef legendClass font-size:10px;
  class L_ingest,L_processing,L_storage,L_gov legendClass

```

Key guarantees

- ACID transactions for catalog updates where necessary, or well-defined eventual consistency patterns for high-volume updates.

- Immutable audit manifests with cryptographic anchoring available for long-term verification.

- Human and machine-readable policy evaluation traces for post-hoc review.

Integration

- The Governance Plane exposes a versioned API (REST/gRPC) for the streaming plane to create or annotate durable entries. Contracts must be stable across minor versions; breaking changes require coordinated migrations.
