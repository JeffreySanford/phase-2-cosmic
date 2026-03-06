# Running Kafka-backed Integration Tests

This document describes how to run the Kafka-backed integration tests locally and how the CI workflow runs them.

Local steps (minimal):

1. Start Zookeeper and Kafka from the repository dev compose file:

```bash
KAFKA_HOST_PORT=9094 docker compose -f docker/dev-compose.yml up -d zookeeper kafka
```

1. Export the environment variables the tests use to connect to the host broker:

```bash
export USE_HOST_KAFKA=true
export HOST_KAFKA_BOOTSTRAP=localhost:9094
```

1. Run the Maven integration profile for the governance app:

```bash
mvn -f apps/java-governance/pom.xml clean verify -Pintegration-tests -DskipTests=false
```

Notes:

- The compose file advertises a host listener at `localhost:${KAFKA_HOST_PORT}` so host JVM processes can resolve and connect to the broker.
- If you modify `KAFKA_HOST_PORT` use the same value for `HOST_KAFKA_BOOTSTRAP`.
- The GitHub Actions workflow `.github/workflows/integration-tests.yml` starts the same compose services, waits for the broker to accept connections, and runs the same Maven profile.
