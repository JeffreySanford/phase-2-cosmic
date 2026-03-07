# Test stability fixes — disable external infra during unit tests

Summary

- Add test-only configuration to avoid starting real messaging/Redis during unit tests.
- Provide `TestInfrastructureConfig` to inject Mockito mocks for `Redis`, `Rabbit`, `Kafka`, and `AuditService` during tests.
- Update `AuthFilterTest` to disable messaging/redis auto-config when enabling `governance.auth.enabled`.
- Annotate `JobService` constructor with `@Autowired` to ensure deterministic wiring in tests.
- Add `governance.*` test properties in `apps/java-governance/src/test/resources/application.properties`.

Why

- Local developer experience: makes the unit test suite runnable without Docker or broker services.
- Prevents ApplicationContext startup failures from listeners/passive queue declarations and missing `RedisConnectionFactory`.

Files changed (high level)

- `apps/java-governance/src/test/java/.../AuthFilterTest.java` (test properties updated)
- `apps/java-governance/src/test/java/.../config/TestInfrastructureConfig.java` (new)
- `apps/java-governance/src/test/resources/application.properties` (test toggles)
- `apps/java-governance/src/main/java/.../service/JobService.java` (constructor annotation)

Testing

- Ran `mvn -f apps/java-governance/pom.xml test` — all unit tests passed locally.
- Ran frontend unit tests via Nx/Jest — frontend suites passed.

Notes for reviewers

- These changes are intended for tests only; production behavior is unchanged unless the `governance.*` properties are set.
- Review `TestInfrastructureConfig` to ensure mocks align with production bean contracts.
- If CI requires integration tests with Testcontainers, run `mvn -f apps/java-governance/pom.xml -Pwith-containers verify` in an environment with Docker.

Suggested PR title

- "tests: stabilize unit tests by disabling external infra and providing test mocks"

Suggested reviewers

- @frontend-team, @backend-governance
