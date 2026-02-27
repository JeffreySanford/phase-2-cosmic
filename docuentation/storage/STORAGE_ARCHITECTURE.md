# Storage Architecture Overview

This document describes the hybrid tiered storage topology and its interactions with the Governance Plane and compute fabric.

Architecture diagram

```mermaid

```

mermaid
flowchart LR
  subgraph INGEST
    A[Telescopes]
    B[Ingest Buffer / Parallel FS]
    A --> B
    B --> C[Validator & Registrar]
  end

  subgraph HPC
    C --> D[Warm Archive: Parallel FS / Object + Compute Nodes]
    D --> E[Cold Archive: Deep Object / Tape]
  end

  subgraph GOV
    G[Governance API & Catalog]
    G -.-> D
    G -.-> E
    G --> C
  end

  subgraph DIST
    F[Cloud Distribution / CDN]
    D --> F
    F --> U[Researchers]
  end

  style INGEST fill:#e6f7ff,stroke:#2b8bd6
  style HPC fill:#f0fff4,stroke:#20a86a
  style GOV fill:#fff6e6,stroke:#d18b2b
  style DIST fill:#fff3f3,stroke:#d12b2b
  %% Legend
  subgraph Legend[Legend]
    L_ingest[Ingest]
    L_processing[Processing]
    L_storage[Storage]
    L_gov[Governance]
    L_dist[Distribution]
  end

  style L_ingest fill:#1f78b4,stroke:#0b3a66
  style L_processing fill:#33a02c,stroke:#1b5e20
  style L_storage fill:#ff7f00,stroke:#b35400
  style L_gov fill:#6a3d9a,stroke:#3b1f4d
  style L_dist fill:#ffcc00,stroke:#b88600

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
