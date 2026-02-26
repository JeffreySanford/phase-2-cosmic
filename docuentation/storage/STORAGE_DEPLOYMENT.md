# Storage Deployment & Operational Guidance

This document provides practical deployment guidance for the hybrid storage architecture.

Recommended topology

- Ingest Tier (SOC): local cluster with NVMe or parallel FS; runs the ingest buffer, validators, and transfer agents.
- HPC Archive: primary archive colocated with national HPC compute; can be federated across multiple centers for redundancy.
- Cold Archive: deep object/tape systems with lifecycle connectors to the HPC Archive.
- Distribution: cloud object stores + CDN for derived products.

Compute-near-data patterns

- Schedule calibration, imaging, and AI jobs on nodes local to the warm archive to avoid large-scale transfers.
- Use container image registries with immutable digests and store image digests in provenance bundles.

Operational controls and testing

- Contract tests: validate dataset registration and location updates under load.
- Load tests: simulate ingest rates and large-scale transfers to warm archive.
- Disaster recovery: rehearsed playbooks for archive replication and restore using catalog-driven location mapping.

Security and compliance

- Network segmentation: separate ingest, archive, and distribution networks with controlled gateways.
- Encryption: in-transit via mTLS; at-rest using provider-managed or hardware-based keys.
- Signing: governance plane issues signed manifests; use HSM or KMS for private key protection.

Monitoring & SLOs

- Ingest Tier: sustained write throughput, buffer occupancy, lost-packet rates.
- HPC Archive: data durability, replication lag, parallel read/write throughput.
- Distribution Tier: cache hit ratios, egress metrics, authentication latency.

Cost modeling

- Model warm vs cold storage costs with expected access frequency and retention windows.
- Include network egress for distribution tier and cross-site replication costs for federation.

Example operational commands (transfer agent)

```bash
# register dataset
curl -X POST https://governance.example.org/api/v1/datasets -d @dataset-metadata.json

# transfer to archive (initiates transfer agent)
transfer-agent --src /mnt/ingest/vis0001 --dst s3://hpc-warm/vis0001 --metadata dataset-metadata.json
```
