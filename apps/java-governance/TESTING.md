# Running Java Governance tests with Testcontainers

This document explains how to run the `java-governance` module tests that rely on Docker/Testcontainers.

Overview

- The module provides a Maven profile `with-containers` which enables container-style integration tests.
- By default the project excludes tests named `*ContainerIntegrationTest.java` so local `mvn test` runs are quick and safe for developers without Docker.
- When Docker/Testcontainers is available to the JVM, tests will start a Redis container automatically via `AbstractRedisTest` and may spin up additional helpers such as an httpbin stub for the new `ModeRouterContainerIntegrationTest`. If Docker is not available, tests fall back to `localhost:6379` or values from environment variables.

Commands

- Run fast unit tests (default, container tests excluded):

```bash
mvn -f apps/java-governance/pom.xml test -DskipITs
```

- Run full tests including container-enabled integration tests (requires Docker accessible to the JVM):

```bash
mvn -f apps/java-governance/pom.xml test -Pwith-containers
```

The `with-containers` profile now enables the `ModeRouterContainerIntegrationTest`, which starts an httpbin container and verifies backend submission behavior.

Environment

- Docker Desktop (WSL2 or native) is recommended on Windows. Testcontainers must be able to detect and talk to Docker from the JVM process running Maven.
- If Docker is unavailable, set a reachable Redis endpoint using one of these environment variables (used as fallback):
  - `SPRING_REDIS_HOST` (default: `localhost`)
  - `SPRING_REDIS_PORT` (default: `6379`)

Notes

- If you prefer to run tests in a Dockerized Maven container to avoid host Docker detection issues, you can run a Maven image and mount the project workspace.
- The shared test base for Redis is `apps/java-governance/src/test/java/com/cosmic/governance/test/AbstractRedisTest.java`.
