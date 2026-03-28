# Coding Standards v2 Remediation Plan

Snapshot date: 2026-03-12

This document summarizes:

1. The intent of the new standards in `documentation/development/coding-standards/`
2. The current codebase posture by area
3. A pragmatic remediation plan to align the repository with the new standards

The assessment is based on the current Nx workspace, Angular frontend, Nest SSR server, Spring Boot services, Go tooling, Docker assets, CI workflows, and supporting scripts.

## Executive Summary

The repository already has meaningful quality and architecture controls in place:

- Nx project structure exists and CI already runs dependency-graph checks.
- CodeQL, Semgrep, golangci-lint, unit tests, integration tests, coverage checks, E2E, and OpenAPI validation are present.
- The Java governance service already exposes health/metrics, uses DTOs, has messaging listeners, and includes request tracing and audit-oriented flows.
- The Go data generator already uses `signal.NotifyContext`, explicit `ServeMux`, `/metrics`, `/health`, and Prometheus counters.

The main gap is not absence of standards work. The main gap is inconsistency:

- Workspace governance rules are only partially encoded.
- TypeScript/Angular discipline is weaker than the new standard requires.
- Java code uses a mixed DI/configuration style.
- Security and container hardening are uneven.
- Some standards are documented but not yet represented in code or CI.

## Standards Summary

The new standards establish twelve enforcement areas:

- Cross-cutting engineering rules
- Static analysis and security toolchain
- TypeScript / Angular / NestJS
- Java / Spring Boot
- Go
- Python
- Messaging
- Docker and containers
- Observability
- Security
- Database and persistence
- Naming and file conventions

The standards are strongest in four themes:

- Explicit boundaries and contracts
- Deterministic quality gates in CI
- Runtime safety: observability, auth, retries, idempotency, timeouts
- Predictable project structure and naming

## Codebase Areas Reviewed

The repository currently breaks down into these primary areas:

- Nx workspace and root tooling
- Angular frontend app in `apps/frontend`
- Nest-based SSR and API/dev proxy in `apps/frontend/server.nest.ts`
- Cypress/Playwright E2E in `apps/frontend-e2e` and `tools/playwright`
- Angular library `libs/ui-theme`
- Java governance service in `apps/java-governance`
- Java ingest utility in `tools/java-ingest`
- Go data generator in `tools/data-generator`
- Docker compose and service images in `docker/` and service Dockerfiles
- Scripts and CI workflows in `scripts/` and `.github/workflows/`

No substantial Python service/package structure was found. Database migration tooling also appears absent; persistence is primarily Redis, MinIO, temp spool files, and in-memory state.

## Findings By Standard Area

### 1. Cross-Cutting Rules

Status: partial alignment

What already aligns:

- CI runs broad validation through `ci.yml`, `codeql.yml`, lint/test scripts, coverage, and E2E.
- OpenAPI validation is present.
- Messaging, metrics, health, and README scaffolding exist in multiple areas.

Gaps:

- Root README is too thin for the documented README standard. It does not list ports, env vars, dependencies, health endpoints, metrics endpoints, or per-service run/test commands.
- Nx boundaries are only weakly enforced because project tags are effectively empty and the module-boundary rule allows any tag to depend on any tag.
- The standards call for capability-based shared libraries and explicit library types; the workspace has not been classified that way yet.
- Injectable clock abstractions are not a visible cross-repo pattern yet.

Remediation:

- Introduce tags for app/lib role and domain, then tighten `@nx/enforce-module-boundaries`.
- Expand service READMEs and the root README to the required operational format.
- Add a lightweight architectural classification table for apps/libs.

### 2. Static Analysis & Security Toolchain

Status: mostly aligned, but incomplete

What already aligns:

- CodeQL workflow exists for TypeScript, Java, and Go.
- CI runs Semgrep.
- CI runs golangci-lint for the Go tool.
- Nx dependency graph scan exists in CI via `scripts/check-dep-graph.sh`.

Gaps:

- No evidence of Trivy/Grype image scanning in CI.
- No evidence of SBOM/provenance generation in CI.
- No evidence of secret scanning such as gitleaks/trufflehog in CI.
- Some local lint scripts intentionally skip when tools are missing, which is acceptable for local development but should not be the only enforcement story.

Remediation:

- Add image and filesystem scanning in CI for all Dockerfiles and lockfiles.
- Add secret scanning on push/PR.
- Add SBOM generation and artifact retention for release-quality builds.

### 3. TypeScript / Angular / NestJS

Status: partial alignment with several direct violations

What already aligns:

- `pnpm` is the package manager.
- Most Angular components use external templates and SCSS files.
- Components are predominantly `standalone: false`.
- Component unit tests are common and E2E coverage exists.
- The SSR server includes meaningful metrics and proxy instrumentation.

Gaps:

- `tsconfig.base.json` does not enable strict mode.
- Angular module boundaries are not meaningfully constrained because tags are empty.
- Inline styles are still present in several Angular components.
- One component, `apps/frontend/src/app/features/telemetry/infra-tabs.component.ts`, is `standalone: true`, which conflicts with the stated workspace rule.
- OnPush adoption is minimal relative to component count.
- The SSR/Nest file is too large and mixes bootstrap, mock APIs, proxying, metrics, stateful runtime orchestration, and dev-only behavior into one file.
- Explicit `any` remains in bootstrap and typing shims.
- Four Angular components appear to be missing unit tests:
  - `apps/frontend/src/app/base/environment/environment.component.ts`
  - `apps/frontend/src/app/shared/external-sources/external-sources.component.ts`
  - `apps/frontend/src/app/features/settings/settings-dialog.component.ts`
  - `apps/frontend/src/app/features/telemetry/pulsar-status/pulsar-status.component.ts`

Remediation:

- Turn on strict TypeScript in a staged migration.
- Remove inline styles/templates from production components.
- Convert the one standalone component back to NgModule architecture or explicitly revise the standard.
- Increase OnPush usage where components are mostly input-driven or observable-backed.
- Break `server.nest.ts` into modules/services/controllers with explicit boundaries:
  - bootstrap/app module wiring
  - metrics exposition
  - governance proxy
  - embedded dev-mock APIs
  - runtime load orchestration
  - Redis cache support
- Replace bootstrap `any` usage where practical with narrow interfaces.

### 4. Java / Spring Boot

Status: moderate alignment, inconsistent implementation style

What already aligns:

- Java services use controller/service-oriented layering.
- DTO classes are present and OpenAPI exists for governance.
- Messaging listeners and integration tests are present.
- Metrics and correlation/request ID support exist.
- Most controllers use `/api/v1` paths.

Gaps:

- Field injection and `@Autowired` are still present in multiple classes, despite the standard requiring constructor injection only.
- `@Value` is heavily used instead of typed `@ConfigurationProperties`.
- `tools/java-ingest` still uses `System.out.println` in production code.
- Some constructors include `@Autowired` annotations on parameters, which is unnecessary and inconsistent with the desired style.
- Public API Javadoc coverage is uneven.

Remediation:

- Replace field injection and parameter-level `@Autowired` with constructor injection everywhere.
- Consolidate scattered `@Value` properties into typed configuration records/properties classes:
  - messaging
  - Pulsar
  - RabbitMQ
  - MinIO/object store
  - Prometheus URLs
- Replace `System.out.println` in `tools/java-ingest` with SLF4J logging.
- Add a Java style sweep focused on public API Javadoc and configuration consistency.

### 5. Go

Status: good alignment for the existing Go footprint

What already aligns:

- `tools/data-generator` follows a `cmd/<service>` structure.
- Graceful shutdown uses `signal.NotifyContext`.
- HTTP uses an explicit `ServeMux`.
- `/metrics` and `/health` are exposed.
- Prometheus counters are registered in `init()`.
- golangci-lint config is present and CI uses it.
- Tests exist.

Gaps:

- The HTTP server currently does not set explicit `ReadTimeout`, `WriteTimeout`, or `IdleTimeout`.
- Logging uses `log`; the standard prefers `log/slog` for new multi-subsystem services.
- The service still runs as root in its runtime container.

Remediation:

- Add server timeouts.
- Decide whether to keep `log` intentionally because this is a small binary, or move to `slog`.
- Harden the runtime Docker image with a non-root user.

### 6. Python

Status: not currently applicable, but standards are not operationalized

What was found:

- No Python service/package structure matching the standard was found.
- There is a local `scripts/lint-python.sh`, but no visible Python project using `pyproject.toml` and `requirements.lock`.

Remediation:

- Treat Python as a future-ready standard.
- If Python tooling is introduced later, require the standardized package layout from the start.
- Do not create Python CI steps beyond repo-level lint helpers until an actual Python package exists.

### 7. Messaging

Status: moderate alignment

What already aligns:

- Kafka, RabbitMQ, and Pulsar concepts are represented in code and Docker.
- Governance includes audit flows, correlation/request IDs, and typed DTO/model usage.
- RabbitMQ provisioning is done via configuration code.
- Messaging listeners have tests.

Gaps:

- Event naming/versioning conventions are not consistently surfaced as an explicit schema/version discipline.
- Some listener failure handling is coarse. For example, Kafka listener failure records a metric and throws a generic runtime exception without a clearer poison-message/DLQ policy narrative.
- Broker naming conventions and retention/DLQ/retry topology are not documented in one place.
- The standards want explicit semantics and replay-safety documentation for each flow.

Remediation:

- Create a messaging contract matrix covering:
  - topic/queue/exchange name
  - producer
  - consumer
  - schema/version
  - delivery semantics
  - retry behavior
  - DLQ/quarantine path
  - correlation metadata
- Refactor listeners so validation failure, duplicate handling, retryability, and DLQ behavior are explicit and testable.

### 8. Docker & Containers

Status: partial alignment

What already aligns:

- Service Dockerfiles use multi-stage builds.
- Compose defines many healthchecks.
- Runtime logs are generally routed to stdout/stderr.

Gaps:

- Several compose images use floating tags such as `latest`.
- Runtime images do not appear to switch to non-root users.
- `docker/dev-compose.yml` does not clearly distinguish required services from optional conveniences.
- The container/readme documentation is thin relative to the standard.
- Some services rely on defaults that are acceptable for local dev but weak for hardened environments.

Remediation:

- Pin all base and service image versions explicitly.
- Add non-root users to service images where feasible.
- Annotate compose services as required vs optional and group them operationally.
- Add Dockerfile review gates for `USER`, pinned base versions, and healthcheck expectations.

### 9. Observability

Status: mostly aligned, with maturity gaps

What already aligns:

- Prometheus/Grafana/Loki/Alertmanager are in the local stack.
- Governance and SSR include metrics and request instrumentation.
- Trace/request ID propagation exists in Java governance.
- The Go tool exposes Prometheus metrics and health.

Gaps:

- The standard asks for a dashboard model with five required panels; there is no evidence that every service dashboard meets that template.
- Alerts are present in tooling, but alert review/documentation is not clearly standardized.
- Distributed tracing across HTTP and messaging boundaries is only partially realized.

Remediation:

- Create a shared dashboard checklist for all service dashboards.
- Add documentation for alert ownership, thresholds, and actionability.
- Extend correlation/trace propagation consistently across frontend SSR, governance, ingest, and broker flows.

### 10. Security

Status: partial alignment with some notable risks

What already aligns:

- CodeQL and Semgrep are present.
- Governance has an auth filter, request ID handling, and audit-style events.
- Secrets are mostly environment-driven.

Gaps:

- Development defaults still embed weak secret defaults such as `minio123`.
- Auth enforcement appears lightweight and optional rather than centered on verified identity/authorization rules.
- Secret scanning is not visible in CI.
- Audit behavior exists, but privileged-action audit completeness should be reviewed against the standard, especially for admin/transition endpoints.

Remediation:

- Remove insecure default secret values from Java properties and require explicit environment provisioning.
- Harden the auth boundary beyond presence-of-header checks where production paths exist.
- Add CI secret scanning.
- Build an endpoint-by-endpoint privileged action audit checklist.

### 11. Database & Persistence

Status: limited applicability today, but standards gap remains

What was found:

- No Flyway/Liquibase migration setup was found.
- Persistence appears centered on Redis, MinIO, temp spool files, and in-memory state rather than a traditional relational schema.

Gaps:

- If persistent storage expands, migration/versioning discipline is not ready yet.
- Some in-memory or temp-file persistence patterns may need stronger explicit lifecycle and durability rules.

Remediation:

- Document the current persistence model clearly.
- If relational persistence is introduced, adopt Flyway or Liquibase from day one.
- Add explicit retention/lifecycle guidance for temp spool/object-store artifacts.

### 12. Naming & File Conventions

Status: mixed

What already aligns:

- Much of the repo uses business-oriented names.
- Event/audit concepts are expressed with reasonable clarity.

Gaps:

- Workspace library naming/classification is not systematic yet.
- Some mixed patterns remain between app code, tooling code, and generated artifacts living near source.
- Generated and build outputs are present in the working tree in some areas, which weakens navigability.

Remediation:

- Establish naming conventions for:
  - Nx tags
  - apps vs tools vs libs
  - brokers/topics/queues
  - generated output locations
- Keep build/test artifacts out of source-oriented discovery paths where possible.

## Priority Remediation Workstreams

### Priority 0: Governance And Safety Baseline

- Tighten Nx tags and module-boundary rules.
- Expand root/service READMEs to the standard operational template.
- Remove insecure default secrets.
- Add CI secret scanning and container vulnerability scanning.
- Decide whether the Angular `standalone: false` rule is truly required; if yes, enforce it consistently.

### Priority 1: Frontend / TypeScript Discipline

- Enable strict TypeScript incrementally.
- Remove inline styles from Angular components.
- Add the missing component unit tests.
- Increase OnPush adoption.
- Break `apps/frontend/server.nest.ts` into bounded modules/services/controllers.

### Priority 2: Java Consistency

- Eliminate field injection and parameter-level `@Autowired`.
- Replace scattered `@Value` usage with `@ConfigurationProperties`.
- Replace `System.out.println` in `tools/java-ingest`.
- Document and test messaging failure/DLQ semantics explicitly.

### Priority 3: Platform Hardening

- Add server timeouts in the Go HTTP server.
- Add non-root users to runtime images.
- Pin floating image tags in compose.
- Document required vs optional compose services.
- Add SBOM generation if release provenance matters for this project.

### Priority 4: Future-Ready Standards

- Prepare a persistence strategy if relational storage is introduced.
- Keep Python standards dormant until a real package/service exists.
- Standardize dashboard and alert templates across services.

## Recommended Delivery Sequence

### Phase 1: Standards Encoding

- Encode rules in lint/CI first where possible.
- Update README and architecture documentation.
- Remove obvious direct violations.

### Phase 2: Frontend And SSR Refactor

- Strict TS migration
- Angular component cleanup
- SSR server decomposition

### Phase 3: Java Configuration And DI Refactor

- Constructor injection only
- Typed config
- logging cleanup
- explicit listener failure policy

### Phase 4: Runtime Hardening

- Docker non-root and version pinning
- Go timeouts
- scanning/SBOM/secrets pipeline additions

## Suggested Acceptance Criteria

The repository should be considered materially aligned with Coding Standards v2 when all of the following are true:

- Nx module boundaries are tag-based and restrictive rather than permissive.
- TypeScript strict mode is enabled, with only documented temporary exceptions.
- No production Angular component uses inline styles/templates.
- All Angular components have unit tests, with critical flows also covered by E2E.
- Java services use constructor injection and typed configuration properties.
- Production Java code contains no `System.out.println`.
- CI includes CodeQL, Semgrep, golangci-lint, secret scanning, and container scanning.
- Runtime Docker images run as non-root where feasible.
- Service READMEs document run commands, ports, env vars, dependencies, health endpoints, metrics endpoints, and tests.
- Messaging semantics, schema/versioning, retry, and DLQ behavior are documented per flow.

## Immediate Next Actions

Recommended first change set:

1. Tighten Nx tags and ESLint boundary rules
2. Add missing Angular component tests
3. Remove inline styles and the `standalone: true` exception
4. Replace insecure default secrets
5. Add CI secret and container scanning
6. Start splitting `apps/frontend/server.nest.ts`

This sequence gives the highest standards coverage per unit of effort while reducing long-term architecture risk.
