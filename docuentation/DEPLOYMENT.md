# Deployment & Operational Considerations

This document provides deployment guidance for Phase 2. It focuses on operational separation, scaling, and security.

Suggested deployment topology

- Streaming Plane (stateless, horizontally scalable)
  - Language: Go
  - Components: Ingestors, Gateway (triage & aggregation), Backpressure controller
  - Infrastructure: Kubernetes with HPA, Kafka/Pulsar clusters, Prometheus, Grafana

- Governance Plane (stateful, durable)
  - Language: Java (Spring/Quarkus)
  - Components: Governance API, Catalog DB (ACID), Provenance Store (graph DB or relational), Job Orchestrator
  - Infrastructure: Kubernetes StatefulSets, Postgres (or CockroachDB for geo-redundancy), Neo4j/JanusGraph (optional), object storage for manifests (S3-compatible)

Security & isolation

- Network segmentation: place streaming plane and governance plane in distinct network zones with a restricted API gateway between them.
- Authentication: mTLS between services; JWTs or signed tokens for user-facing requests.
- Authorization: RBAC backed by a central policy engine (OPA or similar) integrated with the Governance API.

Operational testing

- Contract tests: automated tests that validate event schemas and Governance API interactions.
- Load tests: simulate production telemetry volume to validate gateway degradation policies.
- Chaos tests: validate graceful degradation and recovery from broker outages and extreme load.

Monitoring & SLOs

- Streaming Plane: P95 latency < 1s for aggregated operational signals; error ratio < 0.1%.
- Governance Plane: catalog write latency within committed SLA; provenance consistency checks succeed on each ingest.

Storage lifecycle

- Short-term: high-throughput object store for intermediate artifacts.
- Long-term: immutable, signed manifests and hash anchors stored in an archival store with replication and retention policies.
