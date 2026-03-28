# PI Plan - Coding Standards v2 Partner Remediation

Last updated: 2026-03-12

## Purpose

This document converts the Coding Standards v2 assessment into a delivery-ready PI plan with sprints, stories, concrete execution steps, rationale, and exit definitions of done.

It is the partner execution companion to [CODING_STANDARDS_V2_REMEDIATION.md](/c:/repos/phase-2-cosmic/documentation/development/CODING_STANDARDS_V2_REMEDIATION.md).

## PI Goal

Bring the Phase 2 Cosmic codebase into material alignment with the new Coding Standards v2 by:

- encoding missing standards in lint, CI, and project structure
- removing the highest-risk standards violations in frontend, backend, and platform code
- documenting runtime, messaging, and operational rules in a reviewable way
- leaving only explicitly accepted, time-bounded exceptions at PI close

## Why This PI Matters

- The current repo is not unmanaged; it is inconsistent. That makes maintenance, onboarding, and review more expensive than they should be.
- Several standards gaps are structural, not cosmetic: permissive module boundaries, no strict TypeScript, oversized SSR bootstrap, mixed Java injection/config styles, and uneven security hardening.
- If these gaps remain, future feature work will amplify architecture drift and make the standards document aspirational instead of enforceable.

## PI Scope

In scope:

- Nx governance and repository standards encoding
- Angular/TypeScript remediation
- Nest SSR decomposition planning and first extraction wave
- Java DI/configuration consistency
- Messaging, security, and observability standardization
- Docker/runtime hardening
- CI additions for security and container scanning
- README and operational documentation remediation

Out of scope for this PI unless introduced by adjacent work:

- large new product features
- relational database adoption and migration frameworks
- full distributed tracing rollout beyond baseline propagation/documentation
- Python package/service implementation

## PI Timeline

PI span: 6 sprints, 2 weeks each

- Sprint 1: Governance baseline and policy encoding
- Sprint 2: Frontend standards remediation
- Sprint 3: SSR and TypeScript hardening
- Sprint 4: Java standards remediation
- Sprint 5: Platform, Docker, and CI hardening
- Sprint 6: Documentation closure, exceptions, and final compliance sweep

## PI Exit Definition Of Done

The PI is done when all of the following are true:

- Nx tags and module-boundary constraints are restrictive and enforced in CI.
- Root and service READMEs follow the required operational format.
- TypeScript strict mode is enabled or has only documented, tracked exceptions.
- No production Angular component relies on inline styles/templates.
- Missing Angular component tests are added and green.
- `apps/frontend/server.nest.ts` has begun decomposition and the first bounded slices are extracted.
- Java production code no longer uses field injection or `System.out.println`.
- Typed Java configuration properties replace the highest-risk scattered `@Value` usage.
- CI includes secret scanning and container vulnerability scanning.
- Runtime Docker images are pinned and run as non-root where feasible.
- Messaging semantics and audit/retry/DLQ expectations are documented for current flows.
- Remaining deviations are explicitly documented as accepted exceptions with owner and expiry criteria.

## Sprint Breakdown

## Sprint 1 - Governance Baseline And Standards Encoding

### Why

This sprint makes the standards enforceable at the repository level. Without this, later code cleanup remains advisory and can regress immediately.

### Stories

#### Story 1.1 - Encode Nx project classification and boundaries

- Why:
  The current module-boundary rule is effectively permissive because project tags are empty and unconstrained.
- Steps:
  - [ ] classify apps, libs, and tools by role and domain
  - [ ] add tags to `project.json` files
  - [ ] tighten `eslint.config.js` dep constraints
  - [ ] keep a short architecture table of allowed dependency directions
  - [ ] run dep-graph validation and lint in CI
- Exit definition of done:
  - all active Nx projects have meaningful tags
  - illegal cross-layer imports fail lint
  - `pnpm nx dep-graph --scan` still passes

#### Story 1.2 - Upgrade README and operational documentation baseline

- Why:
  The standards require service-level operational clarity; the current root README is too thin.
- Steps:
  - [ ] expand root README with repo purpose, run commands, test commands, ports, env vars, and service map
  - [ ] add or normalize service READMEs for frontend, governance, ingest, and data-generator
  - [ ] include health and metrics endpoints where they exist
  - [ ] link operational docs from the root README
- Exit definition of done:
  - root README and service READMEs follow a common operational template
  - each primary runnable service documents run, test, env, ports, health, and metrics

#### Story 1.3 - Establish repository-wide standards exception register

- Why:
  Some deviations are currently implicit. They need to be explicit, owned, and temporary.
- Steps:
  - [ ] create a standards-exceptions section in the remediation docs
  - [ ] record known intentional exceptions such as D3/Aladin native DOM boundaries
  - [ ] assign owner, rationale, and expiry/closure condition
- Exit definition of done:
  - all known intentional deviations are documented
  - no silent exceptions remain in core standards areas

### Sprint 1 Exit Definition Of Done

- Nx boundaries are materially stricter than the current baseline.
- Documentation required for routine engineering and operations is discoverable and current.
- The remediation effort has an explicit exception model instead of tribal knowledge.

## Sprint 2 - Frontend Standards Remediation

### Why

The Angular app is the largest concentration of direct standards violations: missing tests, inline styles, minimal OnPush usage, and inconsistent architectural rules.

### Stories

#### Story 2.1 - Remove direct Angular standards violations

- Why:
  These are low-friction fixes with immediate standards value.
- Steps:
  - [ ] remove inline styles from production Angular components
  - [ ] confirm all components follow the required module-mode policy
  - [ ] either eliminate standalone usage or explicitly revise the policy if the repo intends to allow it
  - [ ] sweep for obvious inline template/style regressions
- Exit definition of done:
  - no production Angular component uses inline styles/templates
  - no undocumented standalone component exceptions remain

#### Story 2.2 - Close missing component unit tests

- Why:
  The standard requires every component to have a unit test. The current gap is small and measurable.
- Steps:
  - [ ] add unit tests for `apps/frontend/src/app/base/environment/environment.component.ts`
  - [ ] add unit tests for `apps/frontend/src/app/shared/external-sources/external-sources.component.ts`
  - [ ] add unit tests for `apps/frontend/src/app/features/settings/settings-dialog.component.ts`
  - [ ] add unit tests for `apps/frontend/src/app/features/telemetry/pulsar-status/pulsar-status.component.ts`
  - [ ] run targeted frontend tests
  - [ ] ensure tests reflect current Angular 21 lifecycle-safe behavior
- Exit definition of done:
  - all production Angular components have companion specs
  - new specs are green in local and CI lanes

#### Story 2.3 - Expand OnPush adoption on suitable components

- Why:
  OnPush is a stated workspace expectation and also reduces accidental change-detection churn.
- Steps:
  - [ ] identify input-driven or observable-backed components safe for OnPush
  - [ ] convert them incrementally
  - [ ] fix tests and lifecycle timing where required
  - [ ] document deliberate non-OnPush exceptions where complexity is still too high
- Exit definition of done:
  - a first wave of appropriate components uses `ChangeDetectionStrategy.OnPush`
  - any major non-OnPush holdouts are documented with rationale

### Sprint 2 Exit Definition Of Done

- The frontend no longer has the obvious direct standards breaches.
- Component testing coverage is complete at the policy level.
- OnPush adoption is no longer limited to only a small subset of the app.

## Sprint 3 - SSR And TypeScript Hardening

### Why

`apps/frontend/server.nest.ts` and non-strict TypeScript are the two biggest maintainability multipliers on the frontend/server side.

### Stories

#### Story 3.1 - Enable strict TypeScript in a staged migration

- Why:
  The standards explicitly call for strict mode; without it, type safety and review rigor are weakened across the workspace.
- Steps:
  - [ ] turn on strict settings in `tsconfig.base.json`
  - [ ] address the highest-value compile failures first
  - [ ] use narrow temporary suppressions only where needed
  - [ ] document any remaining follow-up work as explicit debt
- Exit definition of done:
  - strict TypeScript is enabled repo-wide or in a clearly staged, enforced configuration
  - remaining exceptions are small, documented, and tracked

#### Story 3.2 - Extract bounded services from `server.nest.ts`

- Why:
  The file currently mixes bootstrap, API mocks, metrics, proxying, state orchestration, and caching in one oversized unit.
- Steps:
  - [ ] define the target slices for bootstrap/app wiring
  - [ ] define the target slices for governance proxy
  - [ ] define the target slices for dev mock API surface
  - [ ] define the target slices for metrics exposition
  - [ ] define the target slices for runtime load profile orchestration
  - [ ] define the target slices for Redis/cache support
  - [ ] extract the first bounded modules/services without changing public behavior
  - [ ] keep tests green and add new focused tests where coverage is weak
- Exit definition of done:
  - at least the first extraction wave is complete
  - `server.nest.ts` is materially smaller and more bounded
  - extracted code paths have focused ownership and tests

#### Story 3.3 - Reduce `any` and typing shims in bootstrap/runtime paths

- Why:
  Some `any` usage is pragmatic, but the current baseline is broader than the standard intends.
- Steps:
  - [ ] replace bootstrap `any` with narrow interfaces where practical
  - [ ] confine dynamic/runtime-only typing gaps to dedicated adapters
  - [ ] preserve intentional interoperability shims where third-party APIs require them
- Exit definition of done:
  - `any` usage in runtime/bootstrap code is materially reduced
  - remaining uses are isolated and justified

### Sprint 3 Exit Definition Of Done

- TypeScript discipline is enforceable rather than aspirational.
- The SSR/Nest runtime no longer depends on one monolithic source file.

## Sprint 4 - Java Standards Remediation

### Why

The Java services are operationally capable, but they currently use mixed patterns that conflict directly with the new standard: field injection, heavy `@Value` usage, and legacy console logging.

### Stories

#### Story 4.1 - Remove field injection and parameter-level `@Autowired`

- Why:
  Constructor injection is required by the standard and improves clarity, immutability, and testability.
- Steps:
  - [ ] identify all field-injected and parameter-annotated classes
  - [ ] refactor to constructor injection only
  - [ ] simplify tests accordingly
  - [ ] re-run unit and integration suites
- Exit definition of done:
  - production Java code uses constructor injection only
  - no field injection remains in the active Java code paths

#### Story 4.2 - Replace scattered `@Value` usage with typed configuration

- Why:
  The current configuration model is fragmented and harder to validate or evolve.
- Steps:
  - [ ] create `@ConfigurationProperties` classes for messaging settings
  - [ ] create `@ConfigurationProperties` classes for RabbitMQ
  - [ ] create `@ConfigurationProperties` classes for Pulsar
  - [ ] create `@ConfigurationProperties` classes for object store/MinIO
  - [ ] create `@ConfigurationProperties` classes for Prometheus URLs
  - [ ] migrate consumers incrementally
  - [ ] validate boot behavior in local and CI contexts
- Exit definition of done:
  - the highest-risk configuration clusters use typed config classes
  - scattered string property lookups are materially reduced

#### Story 4.3 - Standardize Java logging and public API hygiene

- Why:
  `System.out.println` and uneven public API documentation are straightforward standards gaps.
- Steps:
  - [ ] replace `System.out.println` in `tools/java-ingest`
  - [ ] sweep for any similar usage
  - [ ] add or normalize Javadoc on public API types where missing
- Exit definition of done:
  - no production Java code uses `System.out.println`
  - public API types meet the documented style baseline

### Sprint 4 Exit Definition Of Done

- Java code follows one coherent dependency injection and configuration model.
- Legacy logging/style drift is removed from production code.

## Sprint 5 - Platform, Docker, And CI Hardening

### Why

The repo already has strong CI foundations, but the standards require stronger security automation and runtime hardening than the current pipeline and images provide.

### Stories

#### Story 5.1 - Add CI secret and container scanning

- Why:
  CodeQL and Semgrep are present, but the standards also require secret and image vulnerability scanning.
- Steps:
  - [ ] add secret scanning workflow on push/PR
  - [ ] add image/lockfile vulnerability scanning for Dockerfiles and package ecosystems
  - [ ] tune exclusions to avoid noise from build outputs and vendored/generated artifacts
  - [ ] document waiver process if needed
- Exit definition of done:
  - CI runs secret scanning
  - CI runs container/dependency vulnerability scanning
  - findings thresholds are explicit

#### Story 5.2 - Harden runtime Docker images and compose rules

- Why:
  The runtime layer is part of the product, and the standards require pinned versions, health discipline, and non-root execution where feasible.
- Steps:
  - [ ] replace floating image tags in compose
  - [ ] add non-root users to runtime images where practical
  - [ ] review runtime healthchecks for consistency
  - [ ] annotate compose services as required vs optional
- Exit definition of done:
  - floating tags are removed from primary runtime services
  - runtime images use non-root users where feasible
  - compose is clearer operationally

#### Story 5.3 - Harden Go runtime behavior

- Why:
  The Go service is close to standard already, so the remaining fixes are efficient.
- Steps:
  - [ ] add `ReadTimeout`, `WriteTimeout`, and `IdleTimeout`
  - [ ] decide on `log` vs `slog`
  - [ ] update tests or smoke checks if required
- Exit definition of done:
  - Go HTTP server timeouts are explicit
  - logging choice is aligned with the standard and documented

### Sprint 5 Exit Definition Of Done

- CI reflects the full expected security baseline.
- Runtime container posture is closer to production-grade discipline.
- The Go runtime closes its remaining clear standards gaps.

## Sprint 6 - Messaging, Observability, Security Closure, And Final Compliance Sweep

### Why

This sprint closes the cross-cutting rules that are partly implemented in code but not yet fully standardized, documented, or reviewable.

### Stories

#### Story 6.1 - Create messaging contract matrix and failure-policy baseline

- Why:
  Messaging exists across Kafka, RabbitMQ, and Pulsar, but semantics, DLQ policy, and schema/version discipline are not consolidated.
- Steps:
  - [ ] document each live flow with producer, consumer, contract, delivery semantics, retry, and DLQ behavior
  - [ ] align listener code comments/tests with the documented policy
  - [ ] tighten the worst ambiguous failure paths
- Exit definition of done:
  - current messaging flows are documented in one contract matrix
  - retry/DLQ behavior is explicit for active listeners

#### Story 6.2 - Close security and observability documentation gaps

- Why:
  Security/audit/correlation and observability are partly present but unevenly documented.
- Steps:
  - [ ] document privileged action audit expectations
  - [ ] remove insecure default secret fallbacks such as `minio123`
  - [ ] add dashboard/alert checklist guidance for active services
  - [ ] note any deferred tracing work explicitly
- Exit definition of done:
  - insecure default secret fallbacks are removed from active code/config
  - privileged action audit expectations are documented
  - observability dashboard/alert baseline exists

#### Story 6.3 - Run final standards conformance sweep

- Why:
  The PI needs a closure checkpoint, not just completed slices.
- Steps:
  - [ ] re-run standards review against the repo
  - [ ] update the primary remediation document with closure status
  - [ ] produce a residual-risk list and post-PI backlog
  - [ ] close completed exceptions and carry forward only justified residuals
- Exit definition of done:
  - remediation status is updated with completed work
  - residual risks are explicit and bounded
  - no major hidden standards gaps remain

### Sprint 6 Exit Definition Of Done

- Messaging, security, and observability expectations are codified, not implied.
- The repo ends the PI with a clear compliance baseline and a bounded residual backlog.

## Cross-Sprint Stories

### Cross-Sprint Story A - Keep tests and CI green while remediating

- Why:
  Standards remediation that destabilizes the repo is not a successful remediation.
- Steps:
  - [ ] run lint/test/build targets after each major slice
  - [ ] keep E2E and integration breakages visible
  - [ ] prefer incremental, mergeable changes over one large refactor batch
- Exit definition of done:
  - no sprint closes with unresolved CI breakage caused by remediation work

### Cross-Sprint Story B - Manage accepted exceptions explicitly

- Why:
  Some boundaries, especially D3 and Aladin DOM integration, may remain justified exceptions.
- Steps:
  - [ ] keep the exceptions register current
  - [ ] ensure every exception has owner, rationale, and expiry condition
- Exit definition of done:
  - exceptions are reviewed at every sprint close
  - no exception remains undocumented

## Story Sequence And Dependencies

The intended implementation order is:

1. Sprint 1 governance/policy encoding
2. Sprint 2 direct frontend compliance fixes
3. Sprint 3 strict TypeScript and SSR decomposition
4. Sprint 4 Java consistency refactor
5. Sprint 5 CI and runtime hardening
6. Sprint 6 cross-cutting closure and final sweep

Critical dependencies:

- Strict TypeScript work should start only after baseline boundary rules and direct Angular cleanup are in place.
- SSR decomposition should precede or run alongside deeper frontend type hardening, otherwise the monolith keeps absorbing new exceptions.
- Java typed configuration refactors should precede deeper security/persistence hardening in that service.
- CI security scanning should land before PI closure so final compliance is measured against the real gate set.

## Concrete Deliverables By Sprint

### Sprint 1 Deliverables

- project tags and boundary rules
- upgraded root/service READMEs
- documented standards exceptions register

### Sprint 2 Deliverables

- inline style/template cleanup
- missing Angular specs
- first wave of OnPush conversions

### Sprint 3 Deliverables

- strict TypeScript enablement
- first SSR extraction wave
- reduced runtime `any`

### Sprint 4 Deliverables

- constructor injection only
- typed config properties
- Java logging/style cleanup

### Sprint 5 Deliverables

- secret scanning
- container vulnerability scanning
- pinned image/runtime hardening
- Go timeout hardening

### Sprint 6 Deliverables

- messaging contract matrix
- audit/security/observability closure docs
- final standards conformance summary

## Final Acceptance Gates

The partner remediation effort is accepted when:

- the PI exit definition of done is satisfied
- the repo has a current post-remediation summary
- residual exceptions are explicit and time-bounded
- engineering review can point to lint/CI/documentation evidence rather than verbal assurances

## Immediate First Steps

- Sprint 1, Story 1.1: tag Nx projects and tighten module boundaries
- Sprint 1, Story 1.2: expand root and service READMEs
- Sprint 2, Story 2.2: add the four missing Angular component tests
- Sprint 2, Story 2.1: remove remaining inline Angular styles and close module-mode inconsistency
- Sprint 5, Story 5.1: add secret and container scanning to CI

These are the highest-leverage first moves because they both reduce immediate standards risk and create enforcement paths for everything that follows.
