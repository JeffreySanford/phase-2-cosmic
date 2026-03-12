# Coding Standards

Alignment anchors

- Frontend UX source of truth: [FRONTEND_UI.md](/docuentation/frontend/FRONTEND_UI.md)
- Execution backlog: [../TODO.md](/docuentation/planning/TODO.md)
- Delivery plan: [../ROADMAP.md](/ROADMAP.md)

Status date: 2026-03-09
Canonical scope: `documentation/product/PRODUCT-CHARTER.md` + `SCOPE-LOCK.md`.

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

---

## 1. Cross-Cutting Rules

These rules apply to every language and service in the repository.

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

---

## 2. Static Analysis & Security Toolchain

The repository enforces code quality and security rules through three complementary free/open-source tools. All three run automatically in CI on every push and PR.

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

---

## 3. TypeScript — Angular & NestJS

See the canonical developer run and environment docs: [GETTING_STARTED.md](/docuentation/overview/GETTING_STARTED.md) and [ENVIRONMENT.md](/docuentation/infra/ENVIRONMENT.md).

### Package manager

- Node/JavaScript projects MUST use `pnpm` for installs, scripts, and CI. Do not use `npm` or `yarn`.
- Do not commit `package-lock.json` or `yarn.lock`. Commit `pnpm-lock.yaml` and use it in all CI runners.
- Document all commands with `pnpm` (e.g. `pnpm install`, `pnpm run lint`).

#### TypeScript

- Strict mode is mandatory (`"strict": true` in `tsconfig`). Never use `as any` or `@ts-ignore` except to work around a verified upstream bug, with a comment explaining why.
- Keep `libs/shared/models` as the single source of truth for shared types. Do not duplicate model definitions across apps.
- Nx-first task execution: run builds, tests, and linting via `pnpm nx <target> <project>`, not raw `tsc`/`jest`/`eslint` invocations.

#### Angular

- Module-mode policy: all `@Component` and `@Directive` declarations MUST explicitly set `standalone: false`. Enforced by `pnpm run standalone:check`.
- No inline templates or styles. Components must reference external `.html` and `.scss` files. Never use `template:` or `styles:` literals in decorators.
- **Do not use any inline CSS in templates** (no `style="..."`, `[ngStyle]`, or `[style.x]` attributes). All styling belongs in the component’s SCSS so that Angular Material 3 theming (MD3) and global style rules work correctly.
  - For cases where the style value must be computed at runtime (widths, positions, colors, etc.), use a helper directive such as `appDynamicStyle`, host bindings, or set CSS custom properties from the component class so the templates remain free of inline styles.
- Favor RxJS observables (hot/live streams) over ad-hoc Promises for UI and service flows. Keep subscription lifecycles explicit — always unsubscribe via `takeUntilDestroyed`, `AsyncPipe`, or an explicit `ngOnDestroy`.
- Use the observer pattern via services for cross-component communication. Do not pass data through deeply nested `@Input`/`@Output` chains.
- Components must be thin: no business logic, no HTTP calls, no direct store access. Delegate to services.

#### NestJS

- Use constructor injection only — never property injection.
- Validate all inbound DTOs with `class-validator`; throw `BadRequestException` for invalid payloads at the controller boundary.
- Modules must be self-contained: declare providers, imports, and exports explicitly. No `global: true` modules except for core infrastructure (config, logger).

### NestJS Testing

- Every UI component includes a unit test (`*.spec.ts`). Key interactive components include a Cypress e2e test covering main interactions.
- Include test stubs when scaffolding new components.
- Unit tests run via `pnpm nx test <project>` and are required in PR checks.

---

## 4. Java — Spring Boot

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

### JavaConfiguration

- Externalise all values via `@Value("${property.key:defaultValue}")`. Include a sensible default for every property so the service starts in a minimal environment.
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

### PythonError handling

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

If implementing v1.1/v2 work (comments, [Mode B](/docuentation/viewer/VIEWER_MODEB.md), FITS proxy), gate with explicit roadmap updates first.

---

## Cosmic Horizon Development - (c) 2026 Jeffrey Sanford. All rights reserved
