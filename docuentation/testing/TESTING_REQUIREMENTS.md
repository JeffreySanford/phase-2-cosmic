# Testing Requirements & Quality Gates

Alignment anchors

- Frontend UX source of truth: [FRONTEND_UI.md](/docuentation/frontend/FRONTEND_UI.md)
- Execution backlog: [../TODO.md](/docuentation/planning/TODO.md)
- Delivery plan: [../ROADMAP.md](/ROADMAP.md)

This document defines required quality checks for local development and CI.

## 1. Testing objectives

1. Prevent contract drift between frontend, governance API, and docs.
2. Keep mainline builds reliable and reproducible.
3. Validate critical operator workflows, not only unit-level behavior.

## 2. Required quality gate

The canonical gate is:

```bash
pnpm run quality:ci
```

Current gate sequence:

1. lint
2. format check
3. unit tests
4. OpenAPI + fixture validation
5. e2e smoke tests

## 3. Local commands

Install dependencies:

```bash
pnpm install --store-dir ./pnpm-store
```

Lint:

```bash
pnpm run lint
```

Format check:

```bash
pnpm run format:check:changed
```

Unit tests:

```bash
pnpm run unit-test
```

OpenAPI validation:

```bash
pnpm run openapi-validate
```

E2E smoke:

```bash
pnpm run e2e-smoke
```

## 4. Coverage policy

Target:

- 90% aggregated coverage across unit/integration/e2e where practical

Current state:

- target is policy; strict automated threshold enforcement is still a backlog item in root [TODO.md](/docuentation/planning/TODO.md)

## 5. Contract validation policy

Source of truth:

- `openapi/governance.yaml`

Required fixtures:

- `schemas/fixtures/*.json`

Rule:

- any API change must update OpenAPI and fixtures in the same PR

## 6. Environment prerequisites

Minimum:

- Node 20+
- pnpm
- Docker + Compose

For Java governance tests:

- Maven must be installed and available on PATH

For browser-driven e2e:

- Cypress binary installed (CI handles this explicitly)

## 7. CI expectations

PR merges should require:

- successful `quality-ci` workflow
- no tolerated failures in required steps
- Java verification workflow must run tests (`mvn verify` or equivalent) before package/image publication workflows.

Artifacts to retain:

- coverage reports
- e2e artifacts (screenshots/videos where available)
- JUnit/Surefire XML for Java modules
- integration/stress harness logs for scheduled runs

## 8. Failure handling

If quality gate fails:

1. fix root cause in same branch where practical
2. if temporary exception is needed, document reason and follow-up issue in PR
3. do not merge with silent skip flags for required checks

## 9. Build flags policy (`-DskipTests`)

Rules:

- Forbidden in required correctness gates (PR and main branch verification jobs).
- Allowed only in packaging-only stages that depend on prior successful verify/test jobs.
- Any workflow using `-DskipTests` must explicitly document its dependency on a passing verification workflow.

Rationale:

- keeps packaging fast without sacrificing correctness guarantees.
- prevents accidental regression where tests are never executed in merge-critical paths.

## 10. Related docs

- [GETTING_STARTED.md](/docuentation/overview/GETTING_STARTED.md)
- [JAVA_GOVERNANCE_SPEC.md](/docuentation/governance/JAVA_GOVERNANCE_SPEC.md)
- [FRONTEND_UI.md](/docuentation/frontend/FRONTEND_UI.md)
- [TESTING_FRAMEWORK_ARCHITECTURE.md](/docuentation/testing/TESTING_FRAMEWORK_ARCHITECTURE.md)
- [MESSAGING_INTEGRATION.md](/docuentation/messaging/MESSAGING_INTEGRATION.md)
- [messaging/PULSAR.md](/docuentation/messaging/PULSAR.md)
- [messaging/RABBITMQ.md](/docuentation/messaging/RABBITMQ.md)

## 11. Messaging fabric test matrix (required)

This section is mandatory for messaging-fabric work (Kafka, RabbitMQ, Pulsar).

Unit tests required:

- profile scaling logic (`10%`, `25%`, `50%`, `100%`) including 3-minute `100%` auto-revert to `10%`
- queue/topic naming and routing configuration (`workflow.<workflowId>.commands`, bridge topic mapping)
- payload shaping logic (rate, size, fanout controls)

Integration tests required:

- RabbitMQ control command processing and Kafka audit mirror path
- Pulsar-to-Kafka bridge delivery and DLQ/replay behavior
- broker health/degradation behavior under restart/failure injection

E2E tests required:

- `/topology` shows Kafka + RabbitMQ + Pulsar nodes/links and broker detail metrics
- Visualization page shows broker cards and source-state labels (`live`, `fallback`, `mock`, `stale`)
- Footer `100%` burst profile drives broker-wide load increase, then auto-reverts after 180 seconds

CI policy:

- Messaging PRs must pass unit + integration + e2e lanes.
- Scheduled stress lane must archive broker metrics and auto-revert proof artifacts.
