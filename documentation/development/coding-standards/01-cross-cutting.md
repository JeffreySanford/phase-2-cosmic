# 1. Cross-Cutting Rules

These rules apply to every language and service in the repository. Consistency across services keeps a
polyglot platform understandable and prevents integration from turning into archaeology.

- **Testing** – unit, integration, and E2E as described in the original v1 document.
- **Metrics & observability** – `/metrics` endpoint, `_total` counters, bounded labels, received/processed/failure
  counters on each inbound event.
- **Configuration** – no hardcoded environment values; secrets never logged.
- **Logging** – structured output; appropriate severity levels.
- **Code review gate** – lint/tests/`pnpm run quality:ci`; no TODOs without tracked issue.

## Repository architecture boundaries

- Respect Nx project boundaries; import only through public APIs.
- ESLint rule `@nx/enforce-module-boundaries` enforces this; see `eslint.config.js`.
- Run `pnpm nx dep-graph --scan` in CI to fail on new cycles.
- Shared libraries must be capability-based; avoid generic "common" dumps.

### API & contract discipline

- External APIs require explicit OpenAPI/AsyncAPI/typed DTO spec.
- Breaking changes need versioning and changelog entry.
- DTOs are boundary contracts, not domain models; no persistence entities.
- Use ISO 8601 UTC timestamps; stable, explicit IDs.

### Idempotency & retries

- Assume at-least-once delivery on Kafka/Rabbit/Pulsar.
- Design consumers/endpoints to be idempotent or dedup-protected.
- Never assume single delivery in business logic.

### Time, clocks, scheduling

- Injectable clock abstraction for deterministic tests.
- Document job cadence, timeout, overlap, failure policy.
- Keep timezone conversion at boundaries; internal logic uses UTC.

### Data handling

- Validate at boundaries and normalise once.
- Treat all external inputs as untrusted until validated.
- Classify PII/secrets in comments/contracts.
- Prefer enums/constants over stringly logic.

### Performance & resilience

- Every outbound call has an explicit timeout.
- Define retry/backoff/circuit-break for cross-service calls.
- Use bulkheads around slow/failure-prone integrations.
- Call out any code path that can amplify downstream load in review.

### Documentation & ADRs

- Big architectural decisions need an ADR.
- Service READMEs must list purpose, run commands, env vars,
  ports, dependencies, health/metrics endpoints, test commands.
- Temporary decisions must include an expiry condition.

---

### Checklist

- [ ] Automated dependency-graph check exists for new libs
- [ ] Lint rule configured for module boundaries
- [ ] ADR or README update created for significant change
- [ ] All new APIs have an OpenAPI/AsyncAPI spec or typed DTOs
- [ ] Retry/idempotency considerations documented
