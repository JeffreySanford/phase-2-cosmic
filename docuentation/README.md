# Phase 2 — Real-World Specification

Alignment anchors

- Frontend UX source of truth: [FRONTEND_UI.md](FRONTEND_UI.md)
- Execution backlog: [../TODO.md](../TODO.md)
- Delivery plan: [../ROADMAP.md](../ROADMAP.md)

This folder contains the Phase 2 documentation for moving Cosmic Horizon past prototype into production-grade, real-world specifications. It includes an expanded executive summary, architecture descriptions, component-level designs for the Operational Streaming Plane and the Governance & Orchestration Control Plane, provenance and data-trust guidance, and deployment recommendations.

Files:

- [EXECUTIVE_SUMMARY.md](EXECUTIVE_SUMMARY.md) — verbose executive summary for stakeholders
- [ALIGNMENT.md](ALIGNMENT.md) — documentation alignment matrix and status
- [PROGRAM_DIRECTION.md](PROGRAM_DIRECTION.md) — authoritative direction and prioritization guardrails
- [NGVLA_MISSION_ALIGNMENT.md](NGVLA_MISSION_ALIGNMENT.md) — explicit ngVLA mission outcomes and planning rules
- [MISSION_TO_CAPABILITY_TRACE.md](MISSION_TO_CAPABILITY_TRACE.md) — mission outcomes mapped to implemented/in-progress/planned capabilities
- [MISSION_GATES.md](MISSION_GATES.md) — release readiness criteria tied to mission outcomes
- [DECISIONS.md](DECISIONS.md) — mission-critical architecture and scope decision log
- [PROFESSIONAL_CONSOLE_SPEC.md](PROFESSIONAL_CONSOLE_SPEC.md) — single-source professional console product specification
- [API_CONTRACT_STATUS.md](API_CONTRACT_STATUS.md) — implemented vs target API contract status matrix

- [GETTING_STARTED.md](GETTING_STARTED.md) — developer quickstart: bring up dev infra and frontend
- [ENVIRONMENT.md](ENVIRONMENT.md) — environment files, secrets policy and dev `.env` guidance

- [ARCHITECTURE.md](ARCHITECTURE.md) — overall hybrid control plane architecture with mermaid diagrams

- [OPERATIONAL_STREAMING_PLANE.md](OPERATIONAL_STREAMING_PLANE.md) — Go-based streaming plane design and flows

- [GOVERNANCE_CONTROL_PLANE.md](GOVERNANCE_CONTROL_PLANE.md) — Java-based governance plane design and workflows

- [DATA_TRUST_PLATFORM.md](DATA_TRUST_PLATFORM.md) — how the planes form the Data Trust Platform

- [PROVENANCE.md](PROVENANCE.md) — provenance model examples and lineage diagrams

- [DEPLOYMENT.md](DEPLOYMENT.md) — deployment recommendations and operational considerations

- [VIEWER_MODEB.md](VIEWER_MODEB.md) — Mode B high-resolution viewer design

- [FRONTEND_UI.md](FRONTEND_UI.md) — frontend product and UX specification

- [GO_GENERATOR_SPEC.md](GO_GENERATOR_SPEC.md) — Go data generator spec and runbook

- [JAVA_GOVERNANCE_SPEC.md](JAVA_GOVERNANCE_SPEC.md) — Java Governance API spec (OpenAPI-first)

- [STORAGE_ARCHITECTURE.md](storage/STORAGE_ARCHITECTURE.md) — storage tiering and lifecycle architecture

- [INFRA_TOPOLOGY.md](INFRA_TOPOLOGY.md) — dev-compose and service topology

- [TESTING_REQUIREMENTS.md](TESTING_REQUIREMENTS.md) — CI, coverage and runbook
- [TESTING_FRAMEWORK_ARCHITECTURE.md](TESTING_FRAMEWORK_ARCHITECTURE.md) — verbose testing architecture with Mermaid diagrams

- [TODO.md](TODO.md) — simulation harness and implementation backlog

Grouped folders (new):

- `messaging/` — messaging integration and connectors

- `governance/` — governance-related docs

- `frontend/` — UI and viewer docs

- `infra/` — infra topology and dev-compose notes

- `generators/` — data generators and simulation runbooks

- `provenance/` — provenance and lineage docs

Use these documents as a starting point for detailed design, security review, and implementation planning.
