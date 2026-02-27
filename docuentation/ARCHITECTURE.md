# Cosmic Horizon — Hybrid Control Plane Architecture

This document summarizes the Phase 2 architecture and includes diagrams that clarify the separation and integration of the two planes.

High-level architecture

```mermaid
flowchart LR
  subgraph OP [Operational Streaming Plane (Go)]
    A[Telescopes & Sensors] -->|Telemetry| B[Message Broker (Kafka/Pulsar/RabbitMQ)]
    B --> C[Go Gateway: Triage & Aggregation]
    C --> D[Operational Dashboards & Alerts]
    C --> E[Curated Events -> Governance API]
    C -->|Backpressure| BP[Backpressure Controller]
  end

  subgraph GOV [Governance & Orchestration Control Plane (Java)]
    E2[Governance API] --> F[Archive Catalog]
    F --> G[Lineage / Provenance Graph]
    G --> H[Job Orchestration / Workflows]
    H --> I[Audit Manifests & Policy Engine]
  end

  D -->|Operational Context| G
  BP -.->|Degrade Signals| I
  A -.->|Raw science data (kept in HPC archive)| HPC[HPC Archive]

  style OP fill:#99d6ff,stroke:#2b7bb9
  style GOV fill:#ffe0c9,stroke:#b97b2b
  %% Legend
    %% Compact Legend (bottom-right)
  subgraph Legend[ ]
    direction TB
    OP[OP]
    GOV[GOV]
    L_edge[Edge]
    L_broker[Broker]
    L_processing[Processing]
    L_gov[Gov]
  end
    style OP fill:#99d6ff,stroke:#2b7bb9,color:#000000,font-size:10px
    style GOV fill:#ffe0c9,stroke:#b97b2b,color:#000000,font-size:10px
    style L_edge fill:#1f78b4,stroke:#0b3a66,color:#ffffff,font-size:10px
    style L_broker fill:#33a02c,stroke:#1b5e20,color:#ffffff,font-size:10px
    style L_processing fill:#ff7f00,stroke:#b35400,color:#ffffff,font-size:10px
    style L_gov fill:#6a3d9a,stroke:#3b1f4d,color:#ffffff,font-size:10px
  classDef legendClass font-size:10px;
  class OP,GOV,L_edge,L_broker,L_processing,L_gov legendClass
    L_edge[Edge: Telescopes]
    L_broker[Broker]
    L_processing[Processing]
    L_gov[Governance]
  end

  style L_edge fill:#1f78b4,stroke:#0b3a66
  style L_broker fill:#33a02c,stroke:#1b5e20
  style L_processing fill:#ff7f00,stroke:#b35400
  style L_gov fill:#6a3d9a,stroke:#3b1f4d

```

Key integration points

- Message schemas and contract v1.0 — defines the minimal event shapes that the streaming plane may forward to the governance plane.

- Governance API — a versioned HTTP/gRPC surface the streaming plane uses to create authoritative catalog entries and provenance bundles.

- Signed audit manifests — governance plane issues signed manifests anchoring provenance into long-term archives.

Deployment note

The two planes can be deployed independently, sized according to distinct SLAs: the streaming plane prioritizes low latency and high concurrency; the governance plane prioritizes data integrity, transactional semantics, and long-term retention.
