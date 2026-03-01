# Documentation Alignment Matrix (2026-02-28, Rev 2)

This file records how all documentation in `docuentation/` aligns with:
- Frontend product specification: [FRONTEND_UI.md](FRONTEND_UI.md)
- Execution backlog: [../TODO.md](../TODO.md)
- Delivery roadmap: [../ROADMAP.md](../ROADMAP.md)

Purpose:
- prevent architecture/docs drift
- make planned vs implemented status explicit
- keep frontend behavior aligned with control-plane goals

## Status legend

- `aligned`: content is consistent with current frontend/UI direction and implementation baseline
- `needs-update`: content is directionally valid but contains stale paths, commands, or scope assumptions
- `planned`: intentionally future-state; not yet implemented in runtime

## Root docs

| Document | Status | Alignment notes |
|---|---|---|
| `README.md` | aligned | Index corrected to current folder structure and linked to active docs. |
| `EXECUTIVE_SUMMARY.md` | aligned | High-level architecture remains consistent with roadmap direction. |
| `ARCHITECTURE.md` | aligned | Rewritten with current-vs-target states and implementation status model. |
| `OPERATIONAL_STREAMING_PLANE.md` | aligned | Now linked to current structure and direction anchors. |
| `GOVERNANCE_CONTROL_PLANE.md` | aligned | Matches Java governance control-plane direction. |
| `JAVA_GOVERNANCE_SPEC.md` | aligned | Updated to baseline-implemented API endpoints and next hardening steps. |
| `FRONTEND_UI.md` | aligned | Source of truth for frontend IA, workflows, page contracts, and acceptance criteria. |
| `VIEWER_MODEB.md` | aligned | Path conventions normalized for current repository structure. |
| `INFRA_TOPOLOGY.md` | aligned | Updated for transition state (`java-ingest` + `java-governance`) and planned components. |
| `MESSAGING_INTEGRATION.md` | aligned | Mermaid render issues fixed; strategy remains forward-looking. |
| `DEPLOYMENT.md` | aligned | Still roadmap-oriented and consistent with target architecture. |
| `GETTING_STARTED.md` | aligned | Prereqs and commands normalized to current scripts and env setup. |
| `TESTING_REQUIREMENTS.md` | aligned | Now points to active script names and quality-gate flow. |
| `ENVIRONMENT.md` | aligned | Consistent with frontend/server env exposure model. |
| `PROVENANCE.md` | aligned | Supports trust-model needed by UI provenance surfaces. |
| `DATA_TRUST_PLATFORM.md` | aligned | Coherent with control-plane + frontend trust goals. |
| `GO_GENERATOR_SPEC.md` | aligned | Supports telemetry/diagnostics UX direction. |
| `TODO.md` (under `docuentation/`) | aligned | Simulation-harness scope retained with explicit note that root `TODO.md` is canonical backlog. |
| `PROGRAM_DIRECTION.md` | aligned | New authority doc connecting strategy, backlog, roadmap, and frontend priorities. |
| `API_CONTRACT_STATUS.md` | aligned | Tracks implemented vs target contracts to prevent frontend/backend drift. |
| `CODING-STANDARDS.md` | aligned | No contradiction with frontend or roadmap direction. |

## Grouped-folder docs

| Folder | Status | Alignment notes |
|---|---|---|
| `frontend/` | aligned | Feature docs now include dedicated `Jobs` and `Datasets` specs plus index. |
| `infra/` | aligned | Grouping docs remain coherent with compose/runtime posture. |
| `messaging/` | aligned | Grouped index aligns to messaging strategy and active spec. |
| `governance/` | aligned | Grouped index aligns to governance direction and API baseline. |
| `generators/` | aligned | Supports telemetry and diagnostic workflows. |
| `provenance/` | aligned | Supports trust/provenance UI requirements. |
| `storage/` | planned | Architecture-first documents; still intentionally future-state for runtime integration. |

## Frontend alignment decisions applied

1. Frontend UI spec is now the product contract for page behavior and data-state UX.
2. Root `TODO.md` is the canonical implementation backlog.
3. Root `ROADMAP.md` is the canonical phased delivery plan.
4. All docs now include direct alignment anchors to these three sources.

## Required follow-up for full closure

1. Implement frontend `Jobs` page per new feature spec and wire to governance APIs.
2. Implement datasets API contracts and connect `Datasets` page.
3. Add section-level status tags to storage and deployment docs as they move from planned to implemented.
