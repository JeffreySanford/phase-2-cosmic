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

  style OP fill:#e8f5ff,stroke:#2b7bb9
  style GOV fill:#fff5e6,stroke:#b97b2b
```

Key integration points

- Message schemas and contract v1.0 — defines the minimal event shapes that the streaming plane may forward to the governance plane.
- Governance API — a versioned HTTP/gRPC surface the streaming plane uses to create authoritative catalog entries and provenance bundles.
- Signed audit manifests — governance plane issues signed manifests anchoring provenance into long-term archives.

Deployment note

The two planes can be deployed independently, sized according to distinct SLAs: the streaming plane prioritizes low latency and high concurrency; the governance plane prioritizes data integrity, transactional semantics, and long-term retention.
