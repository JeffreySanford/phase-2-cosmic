# Storage Architecture Overview

This document describes the hybrid tiered storage topology and its interactions with the Governance Plane and compute fabric.

Architecture diagram

```mermaid
flowchart LR
  subgraph INGEST [Ingest / Hot Tier]
    A[Telescopes] -->|7.5-8 GB/s| B[Ingest Buffer / Parallel FS]
    B --> C[Validator & Registrar]
  end

  subgraph HPC [HPC Archive Tier]
    C --> D[Warm Archive: Parallel FS / Object + Compute Nodes]
    D --> E[Cold Archive: Deep Object / Tape]
  end

  subgraph GOV [Governance & Catalog]
    G[Governance API & Catalog] -.-> D
    G -.-> E
    G <-->|Catalog Writes| C
  end

  subgraph DIST [Distribution Tier]
    F[Cloud Distribution / CDN] -->|Read-optimized| U[Researchers]
    D --> F
  end

  style INGEST fill:#e6f7ff,stroke:#2b8bd6
  style HPC fill:#f0fff4,stroke:#20a86a
  style GOV fill:#fff6e6,stroke:#d18b2b
  style DIST fill:#fff3f3,stroke:#d12b2b
```

Key interfaces

- Ingest -> Governance: dataset registration API call assigns persistent identifiers and initial metadata.
- Governance -> Archive: cataloged locations and retention policies drive lifecycle transitions.
- Archive -> Distribution: derived products are exported or mirrored to distribution tier under governance rules.

Data placement and federation

- Localized ingest buffers accept raw visibilities and provide short-term fault-tolerant storage to absorb bursts and network disruptions.
- The HPC Archive is the authoritative store; it may be federated across multiple national centers for redundancy and geolocation.
- The Distribution Tier holds derived products and indexed subsets optimized for global retrieval.

Observability and operational controls

- Each transition emits events consumed by the Operational Streaming Plane for monitoring and SLO enforcement.
- The Governance Plane supports audits, retention enforcement, and provenance validation hooks triggered during transitions.
