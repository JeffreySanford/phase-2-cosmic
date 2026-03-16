# Coding Standards

> **Note:** this document represents _v1_ of the coding standards. A modular v2 version has been
> created under `documentation/development/coding-standards/` with separate topic files and
> automated checklists. New edits should target the v2 files; this file is retained for
> compatibility.

Alignment anchors

- Frontend UX source of truth: [FRONTEND_UI.md](/documentation/frontend/FRONTEND_UI.md)
- Execution backlog: [../TODO.md](/documentation/planning/TODO.md)
- Delivery plan: [../ROADMAP.md](/ROADMAP.md)

Status date: 2026-03-09
Canonical scope: `documentation/product/PRODUCT-CHARTER.md` + `SCOPE-LOCK.md`.

## Why These Standards Exist

These standards exist to keep a multi-language, multi-service repository maintainable, testable, secure, and
operable as it grows. In this workspace Angular, NestJS, Java, Go, Python, Docker, Kafka, RabbitMQ, Pulsar,
Prometheus, and Grafana are not isolated technologies; they form a single delivery system. Small inconsistencies at
one boundary become expensive failures at another. A weak DTO contract becomes a broken consumer. A missing
timeout becomes a stuck container. A bad metric name becomes an invisible outage. A casual shortcut in one service
becomes tribal knowledge for the entire repo.

These rules are intended to:

- reduce regression risk during rapid delivery
- make failures easier to detect, diagnose, and recover from
- keep service boundaries explicit and stable
- prevent architecture drift in a large Nx monorepo
- support safe onboarding of new developers across multiple stacks
- improve CI reliability and release confidence
- preserve observability, auditability, and security as first-class engineering concerns

The goal is not ceremony for its own sake. The goal is to make correct implementation the default, make bad
patterns obvious early, and keep the codebase from slowly turning into a distributed landfill with dashboards.

---

## Table of Contents

1. [Cross-Cutting Rules](#1-cross-cutting-rules)
2. [Static Analysis & Security Toolchain](#2-static-analysis--security-toolchain)
3. [TypeScript — Angular & NestJS](#3-typescript--angular--nestjs)
4. [Java — Spring Boot](#4-java--spring-boot)
5. [Go](#5-go)
6. [Python](#6-python)
7. [MVP Boundaries in Code](#7-mvp-boundaries-in-code)
8. [Deferred Work Handling](#8-deferred-work-handling)
9. [Messaging — Kafka, RabbitMQ, Pulsar](#9-messaging--kafka-rabbitmq-pulsar)
10. [Docker & Containers](#10-docker--containers)
11. [Observability — Prometheus, Grafana, Tracing](#11-observability--prometheus-grafana-tracing)
12. [Security](#12-security)
13. [Database & Persistence](#13-database--persistence)
14. [Naming & File Conventions](#14-naming--file-conventions)

---

## 1. Cross-Cutting Rules

These rules apply to every language and service in the repository.

These rules matter because consistency across services is what keeps a polyglot platform
understandable. Without shared expectations for testing, logging, configuration, and review, each
service becomes its own tiny kingdom with its own weird customs, and then integration becomes
archaeology.

### Testing

- Every service has automated unit tests that run in CI via `pnpm run test:java`, `pnpm run test:go`, or `pnpm nx test <project>` as appropriate.
- Every dockerised service defined in `docker/dev-compose.yml` MUST have automated unit tests AND integration tests included in the CI "test all" stage. Use the repository Docker test-runner and `pnpm` store caching to execute these tests in containerised CI environments.
- Integration tests that require live containers are gated behind a dedicated profile/flag so the default `mvn verify` / `go test` / `pytest` run completes without Docker.
- E2E tests run via `pnpm nx e2e <project>-e2e` in CI where a test dev stack is available.

#### Metrics & Observability

- Every service exposes a Prometheus-compatible `/metrics` endpoint (or registers with Micrometer for JVM services).
- Counters use `_total` suffix. Labels must be bounded in cardinality — never use raw user-supplied strings as label values.
- Every inbound event (Kafka message, HTTP request, queue message) must record: received, processed, and failure counters.

#### Configuration

- No hardcoded hostnames, ports, credentials, or environment-specific values in source files. Use environment variables or externalised config (Spring `application.yml`, Go `flag`, Python `os.environ`).
- Secrets never appear in logs, metrics labels, or error messages.

#### Logging

- Use structured logging. Avoid `System.out.println`, `fmt.Println`, `print()` in production code paths.
- Log at the correct severity: `DEBUG` for tracing, `INFO` for significant state transitions, `WARN` for recoverable issues, `ERROR` for failures requiring attention.

#### Code review gate

- All PRs must pass lint, unit tests, and the full `pnpm run quality:ci` pipeline before merge.
- No new `TODO` comments without a linked issue ID.

### Repository architecture boundaries

All code must respect Nx project boundaries. Cross-project imports must occur only through declared public APIs
(`index.ts`, exported interfaces, or explicitly documented module boundaries).

> **Automated check:** ESLint enforces this via the `@nx/enforce-module-boundaries` rule (see
> `eslint.config.js`). CI also runs `pnpm nx dep-graph --scan` and will fail on any newly introduced
> cycles.

Do not import from another library’s internal file paths (for example `libs/foo/src/lib/internal/...`). Import only
from the library root or documented public subpaths.

Shared libraries must be capability-based, not dumping grounds. Avoid generic libraries named `shared-utils`,
`common`, or `helpers` unless they contain strongly cohesive functionality.

Circular dependencies between Nx projects are forbidden. CI must fail on newly introduced circular dependency graphs — the
`pnpm nx dep-graph --scan` command is run in the build pipeline to detect them automatically.

Each app or service must own its bounded domain. If two services need the same behavior, extract a shared contract or
utility library rather than copy‑pasting logic.

### API and contract discipline

Every externally consumed API must have an explicit contract: OpenAPI for HTTP services, AsyncAPI or equivalent
schema documentation for messaging flows, and typed DTO/event definitions for internal consumers.

Breaking contract changes require a versioning decision and changelog entry before merge.

Request and response DTOs are boundary contracts, not internal domain models. Do not leak persistence entities or
transport-specific payloads into business logic.

All timestamps crossing service boundaries must use ISO 8601 UTC unless a contract explicitly requires otherwise.

IDs must be stable and explicit. Do not overload display names, labels, or user-entered text as technical identifiers.

### Idempotency and retries

All message consumers and mutating API endpoints must be designed with retry behavior in mind.

At-least-once delivery must be assumed for Kafka, RabbitMQ, and Pulsar consumers unless explicitly documented
otherwise.

Operations that may be retried must be idempotent or protected by deduplication keys, transactional guards, or
equivalent replay-safe logic.

Never assume “message received once” in business logic.

### Time, clocks, and scheduling

Do not call system time directly in business logic if deterministic testing matters. Use an injectable clock/provider
abstraction in TypeScript, Java, Go, and Python where appropriate.

Scheduled jobs must document cadence, timeout, overlap behavior, and failure policy.

Timezone conversions belong at the boundary layer. Internal service logic should prefer UTC.

### Data handling

Validate early at service boundaries and normalize once. Do not repeatedly sanitize the same payload across layers.

Any field that originates from user input, queue payloads, or external APIs must be treated as untrusted until
validated.

PII, secrets, access tokens, and regulated data must be explicitly classified in code comments or contract docs where
they cross service boundaries.

Avoid “stringly typed” business logic for enums, statuses, event names, and command names. Use explicit
enums/constants/value objects.

### Performance and resilience

All outbound network calls must define explicit timeouts. No default infinite waits.

All cross-service calls must define retry policy, backoff policy, and circuit-breaking strategy where failure
fan-out is possible.

Bulkheads should be used around slow or failure-prone integrations where operationally relevant.

Any code path that can amplify load across multiple downstream systems must be called out in code review.

### Documentation and ADRs

Significant architectural decisions require an ADR before or alongside implementation. Examples include
introducing a new broker, changing auth flow, adopting a new persistence model, or adding a new cross-cutting
library.

README files for services must include: purpose, local run commands, key environment variables, ports,
dependencies, health endpoints, metrics endpoint, and test commands.

If a decision is temporary, the expiry condition must be documented. “Temporary” without a removal trigger is just
architecture debt wearing a mustache.

---

## 2. Static Analysis & Security Toolchain

The repository enforces code quality and security rules through three complementary free/open-source tools. All three run automatically in CI on every push and PR.

These tools matter because humans miss things, especially in large repos. Static analysis catches
classes of defects early, enforces baseline quality automatically, and reduces the chance that obvious
security issues survive into production because someone was tired, rushed, or feeling unusually optimistic.

### CodeQL (Security SAST)

- **What it is**: GitHub's static application security testing engine. Detects OWASP Top 10 vulnerabilities, CWE-classified bugs, and code quality issues.
- **Languages covered**: TypeScript/JavaScript, Java, Go.
- **Cost**: Free for all repositories. On public repos, results appear in the GitHub Security tab automatically. On private repos the scan still runs; the Security tab integration requires GitHub Advanced Security.
- **How it runs**: `.github/workflows/codeql.yml` — on every push/PR to `main` and on a weekly schedule (Monday 03:00 UTC) to catch newly disclosed vulnerabilities.
- **Queries used**: `security-extended` (OWASP/CWE focus) + `security-and-quality` (null dereferences, unused code, etc.).

### golangci-lint (Go Code Quality)

- **What it is**: The standard Go linter aggregator. Runs `errcheck`, `govet`, `staticcheck`, `gosimple`, `unused`, `ineffassign`, `gofmt`, `goimports`, `bodyclose`, `nilerr`, and `gosec` in a single pass.
- **Config**: `tools/data-generator/.golangci.yml` — tuned to the Go standards in §5.
- **CI**: `golangci/golangci-lint-action@v6` runs in `build-and-test` after unit tests.
- **Local**: `pnpm run lint:go` — gracefully skips if golangci-lint is not installed.

  ```bash
  # Install golangci-lint
  brew install golangci-lint                        # macOS
  winget install golangci-lint                      # Windows
  curl -sSfL https://raw.githubusercontent.com/golangci/golangci-lint/master/install.sh | sh -s -- -b $(go env GOPATH)/bin  # Linux
  ```

### Semgrep (Multi-Language SAST + Code Quality)

- **What it is**: Free, open-source multi-language static analysis. Unlike linters, Semgrep finds semantic patterns across the entire codebase — SQL injection patterns in Java, hardcoded credentials in any language, unsafe deserialization in Go, etc.
- **Languages covered**: Java, Go, Python, JavaScript/TypeScript (all in a single scan).
- **Cost**: Completely free. Uses public registry rulesets (`r/java`, `r/go`, `r/python`, `r/javascript`) — no account or API key required.
- **CI**: Runs in `build-and-test` via `pip install semgrep` + `semgrep scan`. Fails only on `ERROR`-severity findings (security bugs), not `WARNING`-level style suggestions.
- **Local**: `pnpm run analyze:semgrep` — gracefully skips if semgrep is not installed.

  ```bash
  pip install semgrep          # install
  pnpm run analyze:semgrep     # run across all languages
  ```

### Quality gates summary

| Command                    | When to run                    | Blocks merge?                            |
| -------------------------- | ------------------------------ | ---------------------------------------- |
| `pnpm run quality:ci`      | Every PR (includes lint:go)    | Yes                                      |
| `pnpm run test:all`        | Pre-release / local deep check | Recommended                              |
| `pnpm run analyze:semgrep` | Included in `test:all`         | Yes (in test:all)                        |
| CodeQL workflow            | Automatic on push + weekly     | Advisory (non-blocking on private repos) |

`test:all` is the full kitchen-sink gate: `quality:ci` + container integration tests + Semgrep SAST.

#### Dependency and container scanning

All lockfiles, container images, and OS packages used in CI or runtime images must be scanned for known
vulnerabilities.

Add an image-scanning tool such as Trivy or Grype to CI for all Dockerfiles and published images.

High and critical vulnerabilities in runtime dependencies or base images block merge unless explicitly waived with
documented justification and expiry date.

Base image tags must be pinned to explicit versions, never floating tags like `latest`.

#### Secrets and credential hygiene

Secret scanning must run in CI and pre-commit hooks where feasible.

No credentials, tokens, certificates, SSH keys, or `.env` files may be committed, even in test fixtures, unless
clearly fake and labeled as non-secret examples.

Example configuration files must end in `.example` and contain placeholders only.

#### SBOM and provenance

Release artifacts and container images should generate an SBOM.

Production images should be traceable to a commit SHA, build pipeline run, and version tag.

Signed artifacts/images are preferred for release builds where the toolchain supports it.

---

## 3. TypeScript — Angular & NestJS

These standards matter because the frontend and API layers change constantly and tend to accumulate
shortcuts fast. Strong typing, thin components, DTO validation, and Nx boundaries keep the Angular/Nest
stack scalable instead of letting it decay into tightly coupled reactive spaghetti with pretty buttons.

See the canonical developer run and environment docs: [GETTING_STARTED.md](/documentation/overview/GETTING_STARTED.md) and [ENVIRONMENT.md](/documentation/infra/ENVIRONMENT.md).

### Workspace and library design

Each Nx library must have a clearly defined type: UI, feature, data-access, util, or contract. Do not mix
these concerns in the same library.

Angular feature libraries may depend on UI, data-access, and contract libraries, but UI libraries must not
depend on feature libraries.

NestJS application layers should follow controller → service → repository/client boundaries. Controllers do not
call repositories directly.

Shared DTO and contract libraries must not import framework-specific runtime code unless explicitly intended
for that purpose.

### Package manager

- Node/JavaScript projects MUST use `pnpm` for installs, scripts, and CI. Do not use `npm` or `yarn`.
- Do not commit `package-lock.json` or `yarn.lock`. Commit `pnpm-lock.yaml` and use it in all CI runners.
- Document all commands with `pnpm` (e.g. `pnpm install`, `pnpm run lint`).

#### TypeScript

- Strict mode is mandatory (`"strict": true` in `tsconfig`). Never use `as any` or `@ts-ignore` except to work around a verified upstream bug, with a comment explaining why.
- Prefer `unknown` over `any` when a type is genuinely unknown.
- Use discriminated unions for multi-state results and event payload families where practical.
- Avoid boolean argument flags in public methods. Replace with named option objects or separate methods.
- Public methods returning async data must return `Observable<T>` or `Promise<T>` consistently per layer conventions. Do not mix styles arbitrarily within the same subsystem.
- Prefer `readonly` types for DTOs, config objects, and immutable state structures.
- Keep `libs/shared/models` as the single source of truth for shared types. Do not duplicate model definitions across apps.
- Nx-first task execution: run builds, tests, and linting via `pnpm nx <target> <project>`, not raw `tsc`/`jest`/`eslint` invocations.

#### Angular

- Module-mode policy: all `@Component` and `@Directive` declarations MUST explicitly set `standalone: false`. Enforced by `pnpm run standalone:check`.
- Standalone components are not allowed by default in this workspace. Any exception must be explicitly documented and justified by an approved migration plan.
- No inline templates or styles. Components must reference external `.html` and `.scss` files. Never use `template:` or `styles:` literals in decorators.
- **Do not use any inline CSS in templates** (no `style="..."`, `[ngStyle]`, or `[style.x]` attributes). All styling belongs in the component’s SCSS so that Angular Material 3 theming (MD3) and global style rules work correctly.
  - For cases where the style value must be computed at runtime (widths, positions, colors, etc.), use a helper directive such as `appDynamicStyle`, host bindings, or set CSS custom properties from the component class so the templates remain free of inline styles.
- Angular Signals are not allowed by default in application code for this workspace. Do not introduce `signal()`, `computed()`, or `effect()` without a documented workspace-level decision.
- Prefer `ChangeDetectionStrategy.OnPush` for all components unless a documented exception exists.
- Favor RxJS observables (hot/live streams) over ad-hoc Promises for UI and service flows. Keep subscription lifecycles explicit — always unsubscribe via `takeUntilDestroyed`, `AsyncPipe`, or an explicit `ngOnDestroy`.
- Prefer Observable-based UI state and polling flows over Promise-first component orchestration. `async` / `await` is acceptable only at narrow integration boundaries such as dynamic imports, one-time bootstrapping, or isolated browser APIs.
- Use the observer pattern via services for cross-component communication. Do not pass data through deeply nested `@Input`/`@Output` chains.
- Components must be thin: no business logic, no HTTP calls, no direct store access. Delegate to services.
- Initial render must be lifecycle-safe. Do not mutate template-bound state during the first render check in a way that triggers Angular `NG0100`; start first-load polling and subscription-driven UI mutations only after the initial render settles.
- Prefer Angular-native event and rendering APIs over raw DOM access. Use `Renderer2`, `@HostListener`, `@ViewChild`, or RxJS event streams before `window.addEventListener`, `document.querySelector`, or manual DOM mutation.
- Prefer injected `DOCUMENT` over direct `document` access when document access is required.
- Raw DOM access is allowed only at narrow integration boundaries such as D3, fullscreen, or file-download interop, and must stay localized and teardown-safe.
- For ongoing remediation tracking (scan status, enforcement, and historical fixes), see [documentation/remediation/ANGULAR_STANDARDS_AND_REMEDIATION.md](../remediation/ANGULAR_STANDARDS_AND_REMEDIATION.md).

#### NestJS

- Use constructor injection only — never property injection.
- Validate all inbound DTOs with `class-validator`; throw `BadRequestException` for invalid payloads at the controller boundary.
- Modules must be self-contained: declare providers, imports, and exports explicitly. No `global: true` modules except for core infrastructure (config, logger).

### TypeScript / Angular / NestJS Testing

- Every UI component includes a unit test (`*.spec.ts`). Key interactive components include a Cypress e2e test covering main interactions.
- Include test stubs when scaffolding new components.
- Unit tests run via `pnpm nx test <project>` and are required in PR checks.

---

## 4. Java — Spring Boot

These standards matter because Java services often become long-lived system anchors. Clear layering,
DTO separation, constructor injection, and disciplined testing keep Spring Boot services predictable,
testable, and resistant to the kind of enterprise bloat that arrives wearing a badge and calling itself
flexibility.

Services: `apps/java-governance` (`com.cosmic.governance`), `tools/java-ingest` (`org.phase2.ingest`).
Runtime: Java 21+. Framework: Spring Boot 3.x with Jakarta EE namespaces (`jakarta.*`, not `javax.*`).

### Project structure

```text
src/main/java/<package>/
  config/       # Spring @Configuration classes only — no business logic
  controller/   # @RestController — HTTP boundary only
  dto/          # Request/response data carriers (Java records preferred)
  service/      # Business logic — one class per bounded concern
  repository/   # Data access — interfaces only, no ad-hoc JDBC
  listener/     # Kafka / messaging consumers
```

### Dependency injection

- Constructor injection only. Never use `@Autowired` on fields or setters.
- If a class has more than four constructor parameters, extract a collaborator or introduce a configuration record — it is a design smell.

### Controllers

- Controllers are boundary adapters only: they map HTTP ↔ DTOs and delegate to services. No business logic in controllers.
- All inbound request bodies must be annotated with `@Valid`. Validation failure is handled globally by `ApiExceptionHandler` — do not add try-catch in controllers.
- Use `@RequestMapping("/api/v1")` at class level; method-level mappings use `@GetMapping`, `@PostMapping`, etc.

### Services & business logic

- One service class per bounded concern. Services may call other services but must not call controllers.
- Use `Optional<T>` for nullable returns; never return `null` from a public service method.
- Prefer `String#isBlank()` over `== null` checks for string guard clauses.

### DTOs

- Use Java records for immutable DTOs. If mutation is required, use a plain class with final fields and a canonical constructor.
- Do not expose JPA/Hibernate entities directly in API responses. Map to DTOs at the service boundary.

### Java Configuration

- Prefer `@ConfigurationProperties` for typed configuration. Use `@Value` only for isolated one-off properties or when a full record is overkill; always include a sensible default so the service starts in a minimal environment.
- Group related config into a `@ConfigurationProperties` record when three or more related properties exist together.

### Messaging (Kafka / RabbitMQ)

- Every `@KafkaListener` or `@RabbitListener` method must call `metricsService.recordReceived(...)` at entry, `recordProcessed(...)` on success, `recordValidationFailure(...)` for bad payloads, and `recordFailure(...)` in the catch block.
- Never throw from a listener without first recording the failure metric — unhandled exceptions may cause offset commit issues.

### Java Logging

- Use SLF4J: `private static final Logger log = LoggerFactory.getLogger(Foo.class);`
- Never use `System.out.println` or `System.err.println` in production code.

### Java Testing

- Unit tests use `@ExtendWith(MockitoExtension.class)`. Do not load a Spring context for pure unit tests — it slows the build and hides design problems.
- Integration tests that require live containers are named `*ContainerIntegrationTest.java` and are excluded from the default surefire run. Enable them with `-Pwith-containers`.
- Use Testcontainers 1.19+ for Kafka, RabbitMQ, and database containers. Image versions must be pinned (e.g. `confluentinc/cp-kafka:7.5.0`).
- Awaitility assertions must set an explicit timeout (15 seconds maximum) and a poll interval.
- Run unit tests: `pnpm run test:java` or `mvn -f <pom> clean verify -B`.
- Run container integration tests: `pnpm run test:java:it` or `mvn -f <pom> clean verify -Pwith-containers -B`.

### Code style

- Four-space indentation. No wildcard imports (`import com.foo.*`).
- Class-level Javadoc is required for public API types (`@RestController`, public service interfaces). Method-level Javadoc is only required when the intent is not obvious from the signature.

---

## 5. Go

These standards matter because Go makes it easy to write code that looks simple while hiding concurrency
leaks, silent errors, and operational chaos. Explicit context handling, bounded concurrency, structured
logging, and clear package design keep small binaries from becoming fast little disasters.

Service: `tools/data-generator` (`github.com/cosmic-horizon/data-generator`). Go version: 1.21+.

### Go Module & package layout

```text
tools/<service>/
  cmd/<service>/main.go   # Binary entry point — wiring only, minimal logic
  internal/               # Non-exported library packages
  go.mod / go.sum         # Pinned dependency graph — always commit go.sum
```

- Entry-point `main.go` wires flags, dependencies, signal handling, and starts goroutines. Business logic lives in `internal/` packages or as exported pure functions tested independently.
- Package names are lowercase, single words, matching the directory name. No `util` or `common` packages — name by capability (e.g. `segment`, `sink`, `metrics`).

### Error handling

- Return errors to the caller; do not `panic` in library code. `panic` is only acceptable in `func init()` for unrecoverable initialisation (e.g. `prometheus.MustRegister`).
- Wrap errors with context using `fmt.Errorf("doing X: %w", err)` so stack traces are meaningful.
- At the top-level `main`, print the error to `os.Stderr` and call `os.Exit(1)` — never `log.Fatal` mid-flow after resources are acquired.

### Concurrency & shutdown

- Always use `signal.NotifyContext(context.Background(), os.Interrupt)` for graceful shutdown.
- Thread `context.Context` as the first argument of any function that performs I/O or blocks.
- Do not leak goroutines: every goroutine started in `main` must have a shutdown path reachable from the context cancellation.

### Metrics

- Register Prometheus counters/gauges/histograms at package level via `prometheus.MustRegister` in `func init()`.
- Counter names end in `_total`. Use `_seconds` (not `_ms`) for durations. Labels must be bounded.
- Every service must expose `/metrics` (Prometheus) and `/health` on its metrics HTTP port.

### HTTP

- Use `net/http` standard library. Create an explicit `*http.ServeMux` — do not use `http.DefaultServeMux`.
- Every server must set explicit `ReadTimeout`, `WriteTimeout`, and `IdleTimeout` on `http.Server`.

### Go Logging

- Use the standard `log` package for simple binaries. For services with multiple subsystems, use a structured logger (e.g. `log/slog` from Go 1.21+).
- Prefer `log/slog` for all new Go services so structured fields remain consistent across environments.
- Never use `fmt.Println` in production code paths.

### Formatting & linting

- All code must pass `gofmt`. CI enforces `gofmt -l .` with a non-zero exit if any files are reformatted.
- Imports are ordered: standard library, then external packages, separated by a blank line. `goimports` enforces this.
- Run `go vet ./...` as part of CI; treat any finding as a build failure.

### Go Testing

- Use table-driven tests with `t.Run` subtests. Each subcase must have a descriptive name.
- Test files are named `<file>_test.go` alongside the source they test.
- Pure functions that contain decision logic MUST have dedicated unit tests covering: the zero/empty case, a single-element case, the happy path, and at least one error/invalid-input case.
- Run tests: `pnpm run test:go` or `sh ./scripts/test-go.sh` (gracefully skips if Go is not installed).
- Target 80%+ statement coverage for `internal/` packages; track with `go test -coverprofile`.

---

## 6. Python

These standards matter because Python is excellent for tooling and pipelines, but it will happily let quick
scripts become production dependencies without anyone admitting it happened. Type hints, packaging,
testing, and linting reduce the risk of “temporary” scripts becoming permanent mystery machinery.

Python is used for data-pipeline scripts and tooling. Version: 3.11+.

### Python Project structure

```text
tools/<service>/
  src/                  # Application source
    <package>/
      __init__.py
      main.py           # Entry point or CLI
  tests/                # Test files — mirror src structure
    test_<module>.py
  pyproject.toml        # Project metadata, dependencies, tool config
  requirements.lock     # Pinned lock file generated by pip-compile
```

### Package management

- Use `pip` with `pyproject.toml` for dependency declarations. Pin all transitive dependencies in `requirements.lock` generated by `pip-compile`.
- Do not commit `.venv` or `__pycache__` directories.
- Virtual environments must be reproducible: document the exact `python -m venv` + `pip install -r requirements.lock` steps in service `README.md`.

### Type hints

- All public functions, methods, and module-level variables must have full type annotations.
- Add `from __future__ import annotations` at the top of every module to enable forward references.
- Run `mypy --strict` in CI; all type errors are build failures.

### Python Formatting & linting

- Format with `black` (line length 100). Enforced by CI (`black --check`).
- Sort imports with `isort` (profile `black`). Enforced by CI.
- Lint with `ruff`. All findings are build failures; no inline `# noqa` suppressions without a comment explaining why.

### Naming

- `snake_case` for variables, functions, and modules.
- `PascalCase` for classes.
- `UPPER_SNAKE_CASE` for module-level constants.
- Private module members are prefixed with a single underscore (`_`). Do not use double underscore name mangling in non-dunder contexts.

### Code style

- Use `dataclasses` or `pydantic` models for structured data. Do not use raw dicts as function return types for anything with more than two fields.
- Absolute imports only. No relative imports (`from .foo import bar` is forbidden outside of `__init__.py` namespace re-exports).
- Each module has a single responsibility. If a file exceeds ~300 lines, extract a collaborator.

### Python Error Handling

- Catch specific exception types. Bare `except:` or `except Exception:` are forbidden except at top-level entry points where you must log and exit gracefully.
- Use custom exception classes that inherit from a service-level base exception for domain errors.
- Always log the exception (not just the message) so stack traces appear in logs: `log.exception("context message")`.

### Logging

- Use the standard `logging` module. Configure at entry point (`main.py`) only — never call `logging.basicConfig` in library modules.
- Log at the correct severity (same cross-cutting rules as above).
- Never use `print()` in production code paths.

### Testing

- Use `pytest`. Test files follow the `test_<module>.py` naming convention under `tests/`.
- Use `pytest-cov` for coverage. Target 80%+ line coverage for business logic modules; enforce with `--cov-fail-under=80`.
- Use `pytest.mark.parametrize` for table-driven tests — prefer it over copy-paste test functions.
- Mock external I/O (network calls, file system writes) using `unittest.mock.patch` or `pytest-mock`.
- Integration tests that require live services are marked `@pytest.mark.integration` and excluded from the default `pytest` run. Enable with `-m integration`.
- Run unit tests: `pytest tests/ -m "not integration"`.
- Run integration tests: `pytest tests/ -m integration` (requires Docker services).

---

## 7. MVP Boundaries in Code

- Viewer Mode A only.
- No FITS proxy code paths.
- Comments/profile extensions may exist, but Pillar 1/2 behavior and performance gates must remain green.

---

## 8. Deferred Work Handling

If implementing v1.1/v2 work (comments, [Mode B](/documentation/viewer/VIEWER_MODEB.md), FITS proxy), gate with explicit roadmap updates first.

## 9. Messaging — Kafka, RabbitMQ, Pulsar

These standards matter because asynchronous systems fail in ways that are harder to see and harder to
debug than request/response code. Schema discipline, retry safety, idempotency, dead-letter handling, and
correlation metadata are what prevent message-driven systems from becoming haunted.

### Event design

Every message must declare an explicit event name/type and schema version.

Event payloads must be self-describing enough for independent consumers to validate them without
reverse-engineering producer code.

Do not use anonymous maps or untyped JSON blobs for durable cross-service contracts unless absolutely
unavoidable and documented.

Include trace or correlation identifiers in all message metadata where supported.

### Delivery semantics

Producers and consumers must document expected delivery semantics: at-most-once, at-least-once, or
exactly-once-like behavior.

Consumers must be replay-safe.

Ordering assumptions must be explicit. Never assume global ordering unless the platform and
topic/partition model actually guarantees it.

### Broker-specific discipline

Kafka topics, RabbitMQ exchanges/queues, and Pulsar topics/subscriptions must be provisioned via code or
declarative infra, not tribal knowledge.

Retention, TTL, dead-lettering, retry topics/queues, and partitioning strategy must be documented for each
production message flow.

Consumer group or subscription naming must follow a documented convention.

### Failure handling

Poison messages must have a deterministic handling path: reject, DLQ, quarantine, or park for operator
review.

Retrying a bad payload forever is not resilience; it is a denial-of-service attack with extra steps.

Listener code must emit structured logs containing event type, correlation ID, retry attempt if known, and
failure class.

## 10. Docker & Containers

These standards matter because containers are part of the runtime, not just packaging. Weak Docker
discipline leads to bloated images, root processes, fragile local stacks, inconsistent CI behavior, and
production surprises that somehow always happen on Friday.

### Image construction

Use multi-stage Docker builds for all production images unless the service is genuinely trivial.

Runtime images must contain only runtime dependencies. Build tools, package managers, and test-only assets
should not ship in final images.

Containers must run as non-root unless there is a documented and approved exception.

Use minimal base images appropriate to the runtime, pinned to explicit versions.

### Container runtime behavior

Every container must define a healthcheck or expose a health endpoint suitable for orchestrators and local
compose environments.

Containers must fail fast on invalid startup configuration.

Logs must write to stdout/stderr in containerized environments; do not depend on file-based logs inside
containers.

Persistent data directories, if used, must be explicit and mounted intentionally.

### Compose and local dev

docker/dev-compose.yml services must have stable service names, documented ports, and deterministic startup
requirements.

Compose files must distinguish required services from optional developer convenience services.

Local stack scripts must support partial startup for targeted development workflows where feasible.

## 11. Observability — Prometheus, Grafana, Tracing

These standards matter because if a service fails and nobody can tell why, then the code is only technically
running. Good metrics, logs, tracing, and dashboards turn outages from guesswork into diagnosis and make
performance and reliability measurable instead of mystical.

### Metrics design

Metrics names must follow a documented naming convention by subsystem and unit.

Histograms are preferred over ad-hoc average calculations for request and processing durations.

Gauge usage must be intentional; avoid gauges for values that are really monotonically increasing counts.

Business metrics and technical metrics should be distinguishable by naming and dashboard placement.

### Logging and correlation

All inbound HTTP requests and asynchronous message-handling flows should propagate a correlation ID /
trace ID.

Logs must include service name, environment, version, and correlation identifier where possible.

Log messages should be human-readable and machine-parsable. Do not bury the actual failure cause in
decorative prose.

### Tracing

Distributed tracing is strongly recommended for cross-service flows involving HTTP plus messaging
boundaries.

Trace propagation must be preserved across producer and consumer boundaries where supported by client
libraries and infra.

### Dashboards and alerts

Grafana dashboards for production services must include: request/message volume, error rate, latency,
saturation or queue depth, and dependency health.

Alerts must be actionable. Alert on symptoms that require intervention, not on every transient hiccup.

## 12. Security

These standards matter because security failures are usually boundary failures: bad validation, weak auth
checks, leaked secrets, missing audit trails, or unsafe assumptions about trust. Security has to be embedded
in normal development practice, not stapled on during panic.

### Authn / authz

Authentication and authorization checks must occur at trusted boundaries and must never rely solely on
client-provided claims without verification.

Role checks, permission checks, and policy decisions must be centralized and testable.

Privileged actions must emit audit logs with actor, action, target, and outcome.

### Input and output safety

All external input is untrusted.

Output encoding must match sink type: HTML, JSON, SQL parameters, shell arguments, file paths, etc.

Never construct SQL, shell commands, or broker-routing primitives by string concatenation from untrusted
input.

### Secrets and keys

Secrets must come from environment, secret managers, mounted files, or equivalent secure injection paths.

Secret rotation procedures must be documented for production dependencies.

Certificates and private keys must never be embedded in code, fixtures, or container images.

### Auditability

Security-relevant events require structured audit logging separate from noisy operational debug output.

Audit events must be immutable in intent and not rely on best-effort debug logs for reconstruction.

## 13. Database & Persistence

These standards matter because persistence decisions outlive most application code. Migration discipline,
query visibility, indexing awareness, and pagination rules prevent data stores from becoming the place where
performance, correctness, and maintainability go to die.

Schema changes must be applied through versioned migrations.

Destructive migrations require explicit rollback or remediation planning.

Index strategy for new tables/collections must be considered during implementation, not after production
falls over.

Soft delete behavior, if used, must be explicit and consistent.

Repository/query methods must not hide expensive full scans behind innocent names.

Pagination must be explicit for potentially unbounded result sets.

## 14. Naming & File Conventions

These standards matter because naming is architecture in plain English. Good names reduce cognitive load, reveal
intent, and make systems easier to navigate. Bad names create confusion that no amount of clever code can
fully undo.

Names must reflect business meaning, not implementation accidents.

Avoid vague names such as data, info, manager, helper, processor, or misc unless the scope is extremely
obvious.

Event names should be past-tense for facts and imperative for commands, and those two categories must not be
mixed casually.

Filenames, package names, library names, queue names, and topic names should follow a documented
convention consistent across the repo.

---

## Cosmic Horizon Development - (c) 2026 Jeffrey Sanford. All rights reserved
