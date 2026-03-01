# Program Direction (Authoritative)

Alignment anchors
- Frontend UX source of truth: [FRONTEND_UI.md](FRONTEND_UI.md)
- Execution backlog: [../TODO.md](../TODO.md)
- Delivery plan: [../ROADMAP.md](../ROADMAP.md)

This document resolves direction ambiguity across architecture, backlog, and roadmap.

## 1. Strategic position

Cosmic Horizon should be positioned as:
- a reference architecture prototype for hybrid operational streaming + governance orchestration
- evolving toward production-grade reliability through phased hardening

It should not be positioned as:
- a finished production control plane
- a full HPC replacement runtime

## 2. Program priorities (next 90 days)

Priority 1:
- make governance orchestration durable and testable

Priority 2:
- deliver professional operator workflows in frontend (`Jobs` first, `Datasets` second)

Priority 3:
- close security and contract gaps in SSR/API boundaries

Priority 4:
- strengthen streaming-to-governance integration reliability

## 3. Direction guardrails

1. No major new capability without API contract and test coverage path.
2. No UI claims for workflows that do not have backend support.
3. No architecture narrative that omits implemented-vs-planned status.
4. Keep scope focused on core orchestration and observability before expanding tool surface.
5. Every new backlog/roadmap item must declare a canonical mission outcome, measurable operator/science impact, and validation evidence.

## 4. Workstream ownership model

- Workstream A: Governance API and persistence
- Workstream B: Frontend operations console
- Workstream C: Streaming integration and event contracts
- Workstream D: Security, testing, and release quality gates

Each workstream should map tasks to:
- [../TODO.md](../TODO.md) for execution
- [../ROADMAP.md](../ROADMAP.md) for phase timing

## 5. Frontend direction contract

Required order:
1. Jobs page
2. Datasets page
3. Viewer and topology enrichments tied to governance context

Reason:
- this order maximizes operational usefulness and professional credibility fastest.

## 6. Required documentation policy

Every major document must include:
- alignment anchors
- implementation status
- explicit dependencies on API/infra contracts
- clear target audience (or link to [AUDIENCE_GUIDE.md](AUDIENCE_GUIDE.md) read path)

Related enforcement:
- see [ALIGNMENT.md](ALIGNMENT.md)

## 7. Testing governance (non-negotiable)

Authoritative testing references:
- [TESTING_FRAMEWORK_ARCHITECTURE.md](TESTING_FRAMEWORK_ARCHITECTURE.md)
- [TESTING_REQUIREMENTS.md](TESTING_REQUIREMENTS.md)
- [../TODO.md](../TODO.md)
- [../ROADMAP.md](../ROADMAP.md)

Program rules:
1. Required correctness gates must execute tests; no silent bypass in merge-critical workflows.
2. `-DskipTests` is allowed only in packaging stages that depend on a previously passing verify/test lane.
3. Test coverage must include unit, integration, and operator-critical e2e paths.
4. Scale confidence must be tracked with explicit smoke, soak, and stress profiles and archived artifacts.

Enforcement intent:
- planning (`TODO`/`ROADMAP`) and implementation (`CI/workflows`) must remain synchronized with the testing architecture documents.
