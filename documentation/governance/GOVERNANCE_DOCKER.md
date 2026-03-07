# Governance Docker Container (Detailed)

This document explains in detail what the Governance Docker container provides for the Phase‑2 Cosmic application, how it is configured, runtime behavior, and how to run and debug it locally.

## Purpose

The Governance container runs the `java-governance` Spring Boot application which implements the Governance API used by the frontend and other services. It exposes HTTP endpoints for job submission, dataset management, OpenAPI documentation, and health/metrics endpoints used for monitoring. It also integrates with messaging and storage systems (Redis, Kafka, Pulsar, RabbitMQ, MinIO) to perform audits, job dispatching, and telemetry.

## Image Is Source-of-Truth

The Governance service is now distributed and maintained as a docker image (`phase2/java-governance`). The repository no longer relies on a local `apps/java-governance` module for CI or development builds. CI and local compose stacks should pull/run the published image. If you need to build a local image for development, build it elsewhere and publish or tag it as `phase2/java-governance:dev` so the compose stacks can consume it.

## Core Responsibilities

- Serve the Governance REST API and OpenAPI documentation.
- Accept job submissions and persist audit events.
- Dispatch jobs to execution/ingest systems (via messaging or background dispatchers).
- Provide health and metrics endpoints for orchestration and monitoring (Actuator + Prometheus).
- Integrate with infrastructure: Redis (caching/state), Kafka/Pulsar (messaging), RabbitMQ (audit queue), MinIO (artifact storage).

## Exposed Ports

- `8080` — Application API (default `server.port`).
  - API base: `http://<host>:8080/`.
  - Actuator health: `http://<host>:8080/actuator/health`.
  - Actuator prometheus metrics: `http://<host>:8080/actuator/prometheus` (when enabled).

Note: The container uses the same port for management endpoints by default unless `management.server.port` is configured separately.

## Important Environment Variables

Common variables used by the application:

- `SPRING_REDIS_HOST` (default `redis`) — Redis host used by Spring Data Redis.
- `SPRING_REDIS_PORT` (default `6379`) — Redis port.
- `GOVERNANCE_AUTH_ENABLED` (default `false`) — Toggle lightweight auth filter (enable in production to require Authorization headers).
- `governance.messaging.enabled` — (test/dev toggles) controls message listener activation in tests.
- `governance.redis.enabled` — (test/dev toggles) controls whether Redis-related auto-config is enabled in tests.
- `KAFKA_BROKER`, `RABBITMQ_URL`, `PULSAR_BROKER`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` — infra connection settings used at runtime.
- `JAVA_OPTS` — JVM options for memory, GC, and Java agent (e.g., for JaCoCo in CI).

Set environment variables appropriately when running the container to connect to local or containerized infra.

## Typical Docker Run Examples

Run against services on the same host (local dev):

```bash
docker run --rm \
  -p 8080:8080 \
  -e SPRING_REDIS_HOST=host.docker.internal \
  -e SPRING_REDIS_PORT=6379 \
  -e KAFKA_BROKER=host.docker.internal:9092 \
  --name java-governance \
  <registry>/java-governance:latest
```

Run with Docker Compose (typical CI/dev): include governance service alongside `redis`, `kafka`, `rabbitmq`, `minio`, `pulsar` and `prometheus` services.

## Health and Readiness

- Primary health endpoint: `/actuator/health`.
- The app enables health probes (`management.endpoint.health.probes.enabled=true`) which orchestration systems can use for readiness/liveness.
- Prometheus metrics are exposed at `/actuator/prometheus` or via micrometer if enabled.

## Runtime Behavior & Components

- HTTP REST controllers: implement the Governance API surface (jobs, datasets, openapi, diagnostics).
- `AuditService`: records audit events; may push to RabbitMQ or persist to storage depending on configuration.
- `JobService`: handles job lifecycle state transitions and dispatch to executor components.
- Messaging clients: Kafka, Pulsar producers/consumers and RabbitMQ templates are created when their respective auto-configuration and properties are present.
- Redis: used for caching, marshalling helpers, or light state stores.
- Background tasks: may spin up scheduled tasks or in-memory executors for certain simulation or recovery flows.

## Volumes and Persistence

- The container itself is stateless for core API operations; external systems (Redis, MinIO, databases) provide persistence.
- When running locally with MinIO, mount a host directory if you want to persist stored artifacts between container restarts.

## Logging

- Standard Spring Boot logging to stdout/stderr; container logs can be retrieved with `docker logs -f <container>`.
- Log level and formatting can be controlled via `logback`/`application.properties` or environment-driven logging configuration.

## Troubleshooting

1. Connection refused errors from the frontend or other services:
    - Verify the Governance container is running and listening on the expected port (`docker ps` and `docker logs`).
    - Recommended (preferred) workflow: run Governance as a Docker container for local dev.
    - Start the minimal governance container with the helper compose file: `docker-compose -f docker/infrastructure/docker-compose.dev.yml up --build`.
    - The compose file maps host `8082` -> container `8080`. For frontend dev SSR the default `GOVERNANCE_API_URL` is `http://localhost:8082` so the frontend will proxy to the container.
    - Do not run a local Spring Boot server and the container at the same time (they may conflict on ports). If you previously started a local server, stop it before using the container.
    - Alternate workflow (local server): if you prefer running the Spring Boot app directly (not containerized), set `GOVERNANCE_API_URL=http://127.0.0.1:8080` in your frontend environment so the dev SSR proxies to the local process.
2. Missing dependencies (Redis/Kafka/Rabbit):
   - The app will attempt to create clients if auto-configuration and connection properties are present. For local dev, run required infra (docker-compose) or use test toggles to disable infra wiring for unit tests.
   - For unit tests, use the `governance.*` toggles and the test-only `TestInfrastructureConfig` mocks included in the repo.
3. Testcontainers / CI:
   - CI runs that use Testcontainers require Docker access; ensure the CI runner can start containers. When containers cannot be started, the test suite in this repo falls back to attempting host connections (and unit tests should be configured to mock infra where necessary).
4. Health & Metrics:
   - If `/actuator/health` returns non-`UP`, inspect container logs for stack traces and unresolved bean creation issues.

## Security & Production Notes

- In production, enable `GOVERNANCE_AUTH_ENABLED` and configure a proper auth provider (JWT or OAuth) — the lightweight dev auth is only for convenience.
- Do not expose the management endpoints publicly; configure network controls or a separate management port.

## Development Tips

- For local frontend development, set `GOVERNANCE_API_URL=http://127.0.0.1:8080` (or `http://localhost:8080`) in your shell so the frontend can proxy calls to the running Governance container.
- To run unit tests without Docker, use the test toggles and the test-only `TestInfrastructureConfig` mocks included in the repo.

---

If you want, I can also:

- Create a short `docker-compose` snippet showing governance together with `redis` and `minio` for local development.
- Update the frontend `GOVERNANCE_API_URL` default or dev docs to match `8080` so dev proxying works out-of-the-box.
