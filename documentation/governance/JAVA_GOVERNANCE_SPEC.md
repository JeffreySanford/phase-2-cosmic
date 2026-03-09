# Java Governance API Specification

Alignment anchors

- Frontend UX source of truth: [FRONTEND_UI.md](/docuentation/frontend/FRONTEND_UI.md)
- Execution backlog: [../TODO.md](/docuentation/planning/TODO.md)
- Delivery plan: [../ROADMAP.md](/ROADMAP.md)

Status: Baseline implemented (Phase 2)

## Overview

This document describes the Governance API service implemented in Java Spring Boot (OpenAPI-first). The Java service is intended as the canonical control-plane runtime for metadata, job submission, and governance operations.

## Goals & Rationale

- Provide a stable, strongly-typed OpenAPI contract for governance operations (ingest control, job orchestration, metadata management).

- Use Java 21 and Spring Boot for enterprise-grade stability, existing ecosystem support (JaCoCo, Spring Actuator), and easy OpenAPI generation/validation.

- Keep the existing NestJS API as a compatibility shim until the Java service is production-ready.

## Requirements

- Language/runtime: Java 21 (LTS)

- Build: Maven

- OpenAPI: `openapi/governance.yaml` is the source of truth; generate server and client stubs as needed

- Endpoints (baseline implemented):

  - `GET /api/v1/health` (implemented)

  - `POST /api/v1/ingest` — ingest metadata/events (implemented)

  - `POST /api/v1/jobs` — submit processing jobs (implemented)

  - `GET /api/v1/jobs/{id}` — job status (implemented)

- Observability: Spring Actuator endpoints, Prometheus metrics (micrometer), structured logs

- Security: mTLS or OAuth2 token introspection in production; for local dev support a permissive mode

## Implemented Telemetry Scope

`java-governance` now acts as the canonical telemetry bridge for the Angular telemetry and topology views.

Implemented telemetry areas include:

- Prometheus-backed infrastructure telemetry for Redis, Kafka, RabbitMQ, MinIO, Pulsar, Nest SSR, NGINX, Grafana, Loki, and Alertmanager when the local exporters are available.
- Governance-native runtime telemetry for job submissions, dispatch, state transitions, queue pressure, terminal outcomes, queue wait time, runtime duration, artifact and object writes, Redis operations, and control-plane publish activity.
- Broker ingest telemetry for Kafka, RabbitMQ, and Pulsar including receive, duplicate, validation-failure, DLQ, payload, and latency behavior.
- Governance-owned Kafka audit/control publish telemetry via `AuditService`.
- Dataset, manifest, lineage, operator read, Archive DR, transient-alert replay, and curation telemetry.
- Governance HTTP route-family metrics and operator read route-family metrics.
- Executor and adapter telemetry for `simulator`, `vo`, and `tacc`.
- Canonical topology metrics that feed the `/topology` experience with truthful provenance, confidence, and measured link pressure where first-party metrics exist.

Primary implementation tracking now lives in [JAVA_GOVERNANCE_TELEMETRY_PLAN.md](/docuentation/governance/JAVA_GOVERNANCE_TELEMETRY_PLAN.md).

## API contract & validation

- Keep the OpenAPI file `openapi/governance.yaml` in-sync with server implementations. CI must run an `openapi-validate` job that:
  1. Lints the spec
  1. Generates a mock server and posts `schemas/fixtures/` to validate responses

## Mermaid: Interaction overview

```mermaid
sequenceDiagram
  participant G as Generator (Go)
  participant K as Kafka
  participant S as Go Streaming Processors
  participant J as Java Governance
  participant DL as Data Lake

  G->>K: produce events
  K->>S: deliver to consumers
  S->>J: report metadata / checkpoint
  J->>DL: request storage / lifecycle action
  J-->>G: control messages (optional)

```

## Operational concerns

- Transactionality: avoid long synchronous operations on ingest paths; prefer async handoff with acknowledgement.

- Backpressure: surface broker/backpressure state in endpoints and emit metrics to Prometheus.

- Schema evolution: host `schemas/` and provide versioned endpoints and migration runbooks.

## CI & Testing

- Unit tests (Maven surefire) and JaCoCo coverage.

- Integration tests: spin up an in-memory Kafka (or testcontainers) and run key flows.

- Contract tests: validate OpenAPI fixtures in `schemas/fixtures/`.

### Current telemetry coverage

- Contract coverage exists for `/api/v1/telemetry/infrastructure` in `InfrastructureTelemetryControllerTest`.
- Unit coverage exists for new governance runtime metric emission paths, including governance Kafka publish metrics.
- Integration coverage exists for:
  - `RabbitIngestListener`, including accepted, duplicate, and error-path behavior
  - `PulsarIngestListener` live-broker acceptance behavior
  - `GovernanceObjectStoreService`, including the local fallback path when MinIO is unavailable
- Frontend rendering coverage exists for the expanded telemetry and topology UI surfaces.

### Telemetry validation in e2e

The recommended e2e pattern for telemetry is:

1. run a deterministic workload scenario
2. query `/api/v1/telemetry/infrastructure` before and after
3. assert that the expected counters/rates moved for the scenario under test
4. optionally assert that `/api/v1/metrics/topology` reflects the same path activation

The repo now includes supporting scripts for this:

- `scripts/generate-governance-telemetry-traffic.ps1`
- `scripts/test-governance-telemetry-smoke.ps1`
- `scripts/run-governance-telemetry-scenarios.ps1`
- `scripts/capture-governance-telemetry-examples.ps1`

## Deployment & Docker

- Provide a multi-stage `Dockerfile` (see `apps/java-governance/Dockerfile`) and a `build:docker` Nx target.

- Ensure the image exposes `/actuator/prometheus` for metrics and `/actuator/health` for readiness checks.

## Why Java + Spring Boot?

- Enterprise patterns for long-running control plane services, mature observability and security integrations, OpenAPI tooling, and wide familiarity across infra teams.

## Next work

- Add authentication and RBAC to all `/api/v1/*` routes.
- Replace in-memory job tracking with durable storage (Redis or relational DB).
- Add integration tests with Kafka/Testcontainers for ingest and job lifecycle flows.

## Telemetry Follow-Up Checklist

- [x] Add initial unit test coverage for new telemetry features in `java-governance`.
- [x] Add integration test coverage for RabbitMQ and Pulsar ingest listeners.
- [x] Add integration test coverage for MinIO object store service, including fallback behavior.
- [ ] Incorporate telemetry validation into e2e tests.
- [ ] Run linting across the codebase.
- [x] Update the main Java governance markdown document to reflect implemented telemetry features.
