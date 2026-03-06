# Testing scaffold and migration plan for governance integration tests

## Goal

Provide a stable, maintainable integration test framework for `apps/java-governance` that:

- Uses Testcontainers to start only the services required by tests (Kafka, Redis)
- Favors small, deterministic tests over large flaky suites
- Includes an end-to-end `provenance` test that exercises the full job lifecycle
- Emits surefire reports for CI and local debugging

## Scaffold outline

1. Testcontainers base class (Java)

   - Create a reusable `TestcontainersConfig` that starts a Kafka container and a Redis container.
   - Provide helper methods to create topics, seed Redis, and wait for readiness.

2. Lightweight integration tests

   - Replace existing large suites with focused tests:
     - `KafkaIngestListenerIntegrationTest` -> only verifies DLQ behavior for singular invalid message (Kafka path is implemented)
     - `SimulatorLifecycleTest` -> verify state transitions using seeded Redis + mocked executors
   - **Future work:** add similar `RabbitIngestListenerIntegrationTest` and `PulsarIngestListenerIntegrationTest` once the corresponding listeners are implemented. These classes exist already as disabled placeholders.

3. Provenance E2E test (new)

   - An integration test that:
     - Submits a job via the ingest API or producer
     - Waits for the job to be processed (observe Redis + DB entries)
     - Asserts that a provenance record was created containing expected lifecycle events

4. CI & local considerations
   - Run tests in parallel containers using Docker Maven image (already used by scripts)
   - Use host mappings carefully to avoid localhost resolution issues on Windows. Prefer Testcontainers' host-address features.
   - Make the full governance integration suite opt-in (use environment flag `SKIP_GOV_TESTS=0` to run).

## Next steps (implementation)

1. Add `TestcontainersConfig.java` and `ProvenanceE2ETest.java` skeletons under `src/test/java/com/cosmic/governance/`.
2. Update `pom.xml` (if needed) to add `testcontainers`, `testcontainers-kafka`, and `testcontainers-redis` dependencies in the `test` scope.
3. Replace large flaky tests by migrating assertions into smaller focused tests.
4. Re-enable governance tests in `start-all-reset.sh` once stable; keep the skip flag until then.

Example Testcontainers snippet (for reference)

```java
// pseudo-code
@Testcontainers
public abstract class TestcontainersConfig {
  static KafkaContainer kafka = new KafkaContainer(DockerImageName.parse("confluentinc/cp-kafka:7.4.0"));
  static GenericContainer<?> redis = new GenericContainer<>("redis:7").withExposedPorts(6379);

  @BeforeAll
  static void startContainers() {
    kafka.start();
    redis.start();
    // create topics using AdminClient connected to kafka.getBootstrapServers()
  }
}
```

## Provenance test steps

1. Start only Kafka and Redis via Testcontainers.
2. Produce a well-formed ingest event to `phase2-events` (use AdminClient/Producer).
3. Wait for the governance service to process the event (observe Redis keys or HTTP health endpoints).
4. Query the provenance store (DB or an in-memory test store) and assert lifecycle entries exist.

Keep this file as the living design doc for test migration.
