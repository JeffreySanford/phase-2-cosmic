# Infrastructure Docker (Detailed)

This document explains what the "infrastructure" Docker composition provides for the Phase‑2 Cosmic application, how the containers interact with the `java-governance` app and the frontend, recommended environment settings for development, and troubleshooting tips.

Overview

The infrastructure composition groups the supporting services the system expects in development and CI. Typical services:

- Redis: caching, lightweight state, and marshalling helpers used by the Java services.
- Kafka: event bus used for streaming and cross-service events.
- Pulsar: alternative messaging layer used by some ingestion and event consumers.
- RabbitMQ: used for audit/event queues and some synchronous work dispatch.
- MinIO: S3-compatible object store for artifacts, manifests, and test data.
- Prometheus: metrics scraping for services exposing Prometheus endpoints.
- Grafana: visualization dashboard for Prometheus metrics.
- Loki: logs aggregation for quick local troubleshooting.
- Alertmanager: alert routing for Prometheus alerts.

Why run infrastructure in Docker

- Provides a consistent local environment that mirrors CI and staging services.
- Makes it easy to start all dependencies with one command (`docker-compose up`).
- Isolates services from host system versions and avoids polluting the developer machine.

How governance interacts with infra

- `java-governance` (the Governance container) connects to these services via environment variables and Spring Boot properties:
  - Redis: `spring.data.redis.host`/`spring.data.redis.port` (defaults: `redis:6379`)
  - Kafka: `KAFKA_BROKER` (e.g., `broker:9092`)
  - RabbitMQ: `RABBITMQ_URL` (e.g., `rabbitmq:5672`)
  - Pulsar: `PULSAR_BROKER` (e.g., `pulsar:6650`)
  - MinIO: `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` and HTTP endpoint for S3 operations

- The frontend (dev SSR) communicates with the Governance API using `GOVERNANCE_API_URL` — ensure this points to the host/port where the Governance container is reachable (commonly `http://127.0.0.1:8080` when running the Java container on the host).

Exposed ports (common mapping in a dev compose)

- `6379` — Redis
- `9092` — Kafka broker
- `6650` — Pulsar broker
- `5672` / `15672` — RabbitMQ (AMQP / Management)
- `9000` — MinIO (console) and `9001` for alternative mapping
- `9090` — Prometheus
- `3000` — Grafana
- `3100` — Loki
- `9093` — Alertmanager

Recommended docker-compose snippet (dev)

```yaml
version: '3.8'
services:
  redis:
    image: redis:7-alpine
    ports:
      - 6379:6379

  minio:
    image: minio/minio:latest
    environment:
      MINIO_ROOT_USER: minio
      MINIO_ROOT_PASSWORD: minio123
    command: server /data
    ports:
      - 9000:9000

  rabbitmq:
    image: rabbitmq:3-management
    ports:
      - 5672:5672
      - 15672:15672

  kafka:
    image: confluentinc/cp-kafka:latest
    environment:
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://broker:9092
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
    ports:
      - 9092:9092

  pulsar:
    image: apachepulsar/pulsar:latest
    command: bin/pulsar standalone
    ports:
      - 6650:6650
      - 8080:8080

  prometheus:
    image: prom/prometheus:latest
    ports:
      - 9090:9090

  grafana:
    image: grafana/grafana:latest
    ports:
      - 3000:3000

  loki:
    image: grafana/loki:2.8.2
    ports:
      - 3100:3100

  alertmanager:
    image: prom/alertmanager:latest
    ports:
      - 9093:9093

# Optionally: governance service can be added to this compose in dev flows
# governance:
#   image: <registry>/java-governance:dev
#   environment:
#     SPRING_REDIS_HOST: redis
#     KAFKA_BROKER: broker:9092
#     RABBITMQ_URL: rabbitmq:5672
#     MINIO_ROOT_USER: minio
#     MINIO_ROOT_PASSWORD: minio123
#   ports:
#     - 8080:8080

```

Health checks and readiness

- Each service exposes some readiness or health endpoint; the frontend dev SSR server uses these endpoints (or TCP checks) when populating the topology/diagnostics page.
- The SSR dev server has `docker-services` diagnostics that try primary DNS names (service names) first, then fall back to `127.0.0.1` to support host-mode development (see `apps/frontend/server.nest.ts`).

Environment and networking considerations (Windows / Docker Desktop)

- Docker Desktop on Windows may run Linux containers in WSL2; when running services in Docker and your app on the host, use `host.docker.internal` (or `127.0.0.1` for published ports) for container-to-host connectivity depending on mapping.
- Testcontainers (used in some integration tests) needs Docker access; if Testcontainers can't detect Docker (named pipe or DOCKER_HOST), containers will not start and tests fall back to host addresses.

Troubleshooting common issues

1. ECONNREFUSED from frontend when proxying to Governance
   - Confirm the Governance container is running and listening on the mapped port.
   - Confirm `GOVERNANCE_API_URL` or the frontend dev proxy uses the correct host:port.

2. Testcontainers cannot find Docker
   - On Windows, ensure Docker Desktop is running and WSL2 integration is configured, or expose the Docker daemon via `tcp://localhost:2375` (insecure) and set `DOCKER_HOST` in the test runner environment.

3. Services unreachable by service name in compose
   - Ensure services are on the same Docker network; service names are resolved by Docker DNS only within the same network.

4. Persistence and volumes
   - If MinIO or Kafka logs are lost between restarts, mount host volumes for persistence in the compose file.

Security note

- Do not expose management endpoints (Prometheus, RabbitMQ management, etc.) to public networks. Use local port mappings for dev only and secure production endpoints behind internal networks or auth proxies.

Next steps (optional)

- I can add this compose snippet into `infrastructure/docker-compose.dev.yml` and update `README.md` with `docker-compose up` instructions.
- I can also add a short `MAKE` target or npm script to bring up the minimal infra needed for frontend dev.
