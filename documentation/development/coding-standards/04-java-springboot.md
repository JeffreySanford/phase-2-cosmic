# 4. Java — Spring Boot

Java services are long‑lived; clear layering, DTO separation, and disciplined testing keep them
predictable and maintainable.

## Project layout

```text
src/main/java/<package>/
  config/       # @Configuration classes only
  controller/   # @RestController boundaries only
  dto/          # request/response records
  service/      # business logic per bounded concern
  repository/   # persistence interfaces
  listener/     # Kafka/RabbitMQ consumers
```

## Dependency injection

- Constructor injection only; avoid `@Autowired` on fields/setters.
- More than four ctor params? Extract a collaborator or config record.

## Controllers

- Boundary adapters mapping HTTP ↔ DTOs.
- Annotate request bodies with `@Valid`.
- Use `@RequestMapping("/api/v1")` at class level.

## Services & business logic

- One service per bounded concern. Services may call other services but not controllers.
- Return `Optional<T>` instead of `null`.

## DTOs

- Prefer Java records. Do not return JPA entities directly.

## Configuration

- Prefer `@ConfigurationProperties` for typed config; use `@Value` sparingly.
- Provide sensible defaults for required properties.

## Messaging

- Listeners record metrics at entry, success, validation failure, and failure.
- Never throw without recording failure.

## Logging

- Use SLF4J; avoid `System.out.println`.

## Testing

- Unit tests with `@ExtendWith(MockitoExtension.class)`.
- Integration tests using Testcontainers 1.19+; name them `*ContainerIntegrationTest`.
- Use `mvn clean verify -Pwith-containers` for container tests.

## Code style

- Four-space indent; no wildcard imports.
- Public API types require class-level Javadoc.

---

### Checklist

- [ ] `@ConfigurationProperties` used where appropriate
- [ ] Messaging listeners emit all required metrics
- [ ] Testcontainers versions are pinned in integration tests
- [ ] No `System.out.println` in source
