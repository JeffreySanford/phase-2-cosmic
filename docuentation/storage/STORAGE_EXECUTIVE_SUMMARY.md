# Executive Summary — Cosmic Horizon Storage Architecture (Phase 2)

Overview

The Cosmic Horizon storage architecture delivers a hybrid, tiered, and federated model purpose-built for exascale radio astronomy operations such as the ngVLA. It recognizes that sustained ingest at 7.5–8 GB/s, annual archive growth in the hundreds of petabytes, and multi-decade reproducibility requirements cannot be satisfied by a single monolithic system. Instead, the architecture separates physical storage from logical governance, combining localized high-speed ingest buffers, national HPC archives for primary storage and processing, and cloud-based distribution tiers for global access. A centralized metadata control plane—implemented in the Governance & Orchestration Control Plane—provides dataset identity, lineage, and policy enforcement.

Key design goals

- Sustain continuous high-bandwidth ingest without losing operational visibility.
- Enable efficient, compute-near-data processing at national HPC centers.
- Preserve data integrity and provable lineage for reproducibility across decades.
- Provide a distribution layer tuned for global, low-latency access to derived products.
- Ensure economic sustainability through tiered lifecycle policies and federated storage placement.

Core architectural principles

1. Separation of Storage and Governance

The physical storage layer focuses on efficient data placement and retrieval; the governance layer maintains dataset identity, provenance, access control, and lifecycle orchestration. This separation enables storage heterogeneity (object stores, parallel filesystems, deep-archive media) while preserving a single logical view for scientists and operators.

2. Tiered Lifecycle

Data flows through a lifecycle of specialized tiers: an ingest/hot tier for continuous writes and short retention; an HPC warm archive for primary scientific processing; a cold archive tier for economical long-term preservation; and a cloud distribution tier for global access to derived products. Each tier is optimized for the workload and cost profile appropriate to its lifecycle stage.

3. Compute-Near-Data

Because moving petabyte-scale datasets is expensive, compute (calibration, imaging, AI analysis) is co-located with the primary archive. National HPC facilities provide both durable storage and the compute fabric necessary for large-scale processing.

Storage lifecycle (concise)

- Ingest Tier (Science Operations Center): continuous high-bandwidth buffering, integrity checks, temporary retention.
- HPC Archive (national HPC): authoritative storage for raw visibilities, calibrated intermediates, and derived products; warm and cold subdivisions inside the archive.
- Derived Product Generation: pipelines run in-place against the archive, producing SRDPs that are cataloged with full provenance.
- Distribution Tier (Cloud): scaled read-optimized distribution for derived products; raw visibilities are not publicly mirrored here.
- Governance & Catalog Layer: centralized metadata control plane that records identifiers, storage locations, lineage, processing history, and policies.

Governance and data trust

The governance layer is the primary trust anchor. Metadata management includes structural, administrative, and provenance metadata. Every SRDP must be associated with a provenance bundle and an auditable manifest; the Governance API enforces minimal provenance checklists before datasets are promoted for broader distribution.

Economic and operational trade-offs

Tiering balances cost and performance: hot storage is expensive but short-lived; warm archive supports frequent processing; cold archive minimizes long-term cost. Federation and lifecycle policies allow the observatory to keep frequently used datasets accessible while cost-effectively preserving the permanent scientific record.

Strategic impact

This architecture transforms the observatory archive into an active scientific infrastructure: reproducible, discoverable, and scalable. It enables AI-driven agents and HPC workflows to operate efficiently while preserving institutional trust and auditability over decades.

Next steps (Phase 2)

1. Publish a storage contract v1.0 including identifiers, minimal metadata schema, and lifecycle transition APIs.
2. Build a contract test harness that simulates ingest velocity and validates Governance API interactions.
3. Prototype a compute-near-data pipeline at TACC or an equivalent national HPC center to validate in-place processing patterns.
4. Define retention and economic models for warm vs cold data across realistic mission timelines.
