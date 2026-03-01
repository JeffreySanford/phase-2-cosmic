# Infrastructure Topology & Dev Compose (Phase 2)

Alignment anchors
- Frontend UX source of truth: [FRONTEND_UI.md](FRONTEND_UI.md)
- Execution backlog: [../TODO.md](../TODO.md)
- Delivery plan: [../ROADMAP.md](../ROADMAP.md)


## Overview

This document captures the local dev and high-level production topology for Phase 2, with a focus on the services we will scaffold and run under `docker/dev-compose.yml`.

See the canonical developer quickstart: [GETTING_STARTED.md](GETTING_STARTED.md)

## Services in scope

- `tools/data-generator` (Go) — test producer

- `kafka` (+ `zookeeper` or `kafka` without zookeeper where supported) — streaming broker

- `go-processors` — stream processing consumers (Go, planned)

- `java-governance` — Governance API (Java)
- `java-ingest` — local Kafka ingest consumer used during transition

- `prometheus` — metrics

- `minio` or `s3mock` — object store for Warm/Hot testing

- `tacc-mock` / `cosmicai-mock` — external service stubs (planned)

## Dev Compose topology (mermaid)

```mermaid
flowchart LR
  subgraph Dev Compose
    DG[Data Generator] --> K(Kafka)
    K --> GP[Go Processors]
    GP --> JS[Java Governance]
    JS --> S3[MinIO_S3]
    Prom[Prometheus] --> DG
    Prom --> GP
    Prom --> JS
    DG --> JS
    Mock[TACC_CosmicAI_Mock] --> JS
  end
  %% Legend
    %% Compact Legend (bottom-right)
  subgraph Legend[ ]
    direction TB
    L_dev[Dev]
    L_broker[Broker]
    L_processing[Processing]
    L_storage[Storage]
    L_metrics[Metrics]
  end
    style L_dev fill:#1f78b4,stroke:#0b3a66,color:#ffffff,font-size:10px
    style L_broker fill:#33a02c,stroke:#1b5e20,color:#ffffff,font-size:10px
    style L_processing fill:#ff7f00,stroke:#b35400,color:#ffffff,font-size:10px
    style L_storage fill:#6a3d9a,stroke:#3b1f4d,color:#ffffff,font-size:10px
    style L_metrics fill:#ffcc00,stroke:#b88600,color:#000000,font-size:10px
  classDef legendClass font-size:10px;
  class L_dev,L_broker,L_processing,L_storage,L_metrics legendClass
    L_dev[Dev Service]
    L_broker[Broker]
    L_processing[Processing]
    L_storage[Storage]
    L_metrics[Metrics]
  end

  style L_dev fill:#1f78b4,stroke:#0b3a66
  style L_broker fill:#33a02c,stroke:#1b5e20
  style L_processing fill:#ff7f00,stroke:#b35400
  style L_storage fill:#6a3d9a,stroke:#3b1f4d
  style L_metrics fill:#ffcc00,stroke:#b88600

```

## Docker compose notes

- Provide `depends_on` and healthchecks for service start ordering. Keep Kafka configured with multiple partitions for parallelism tests.

- Current `docker/dev-compose.yml` includes `java-ingest` and `java-governance` side-by-side while governance APIs are migrated.

- Expose ports for Prometheus scrape and the Java `/actuator/prometheus` endpoint.

- Provide a `make dev-up` or `scripts/dev-up.sh` wrapper that composes the environment and waits for readiness.

## Security & Networking

- For local dev: permissive networking and basic plaintext Kafka unless `DEV_TLS=true` is set.

- For staging/prod: enable mTLS and secure Kafka communication; isolate services with network policies.

## Next steps

- Author `docker/dev-compose.yml` with the listed services and healthchecks.

- Add a small `scripts/wait-for.sh` and `scripts/run-smoke.sh` to validate the environment and run the generator in smoke mode.
