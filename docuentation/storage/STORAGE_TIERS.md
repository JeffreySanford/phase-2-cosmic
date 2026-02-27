# Storage Tiers & Lifecycle

This file describes the roles and characteristics of each storage tier.

1. Ingest / Hot Tier

- Location: Science Operations Center

- Purpose: continuous high-bandwidth ingest and short-term buffering

- Characteristics: parallel filesystems or NVMe-backed object caches; very low-latency writes; short retention (hours to days)

- Functions: integrity checks, preliminary metadata extraction, dataset registration with Governance API

1. HPC Archive Tier

- Location: National HPC center(s)

- Purpose: authoritative archive and primary processing environment

- Subdivisions:

  - Warm Archive: object store + parallel filesystem for active processing; frequent access

  - Cold Archive: deep object or tape storage for long-term retention; infrequent access

- Characteristics: high capacity, high throughput, reliability, replication

1. Derived Product Generation

- Purpose: compute in-place against warm archive to produce SRDPs

- Characteristics: pipelines execute on HPC compute nodes; artifacts are registered with the Governance Plane and stored in the archive or distribution tier

1. Cloud Distribution Tier

- Purpose: global, read-optimized access to derived products

- Characteristics: CDN-backed object stores, indexes and metadata caches, authentication proxies

- Notes: raw visibilities are typically not mirrored to this tier to control cost and exposure

Lifecycle transitions

- Ingest -> Warm Archive: dataset is validated and transferred; Governance API records location and PID

- Warm -> Cold: lifecycle policy triggers migration based on retention rules and access patterns

- Warm -> Distribution: derived products are exported under governance rules and optionally cached in the distribution tier

Performance and cost tradeoffs

- Keep transient, frequently-accessed data in warm storage.

- Archive cold data on deep media to minimize cost while preserving provenance and accessibility for long-term science.
