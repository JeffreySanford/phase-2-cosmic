# Phase 2 — Real-World Specification

This folder contains the Phase 2 documentation for moving Cosmic Horizon past prototype into production-grade, real-world specifications. It includes an expanded executive summary, architecture descriptions, component-level designs for the Operational Streaming Plane and the Governance & Orchestration Control Plane, provenance and data-trust guidance, and deployment recommendations.

Files:

- [EXECUTIVE_SUMMARY.md](documentation/phase-2-realworld-spec/EXECUTIVE_SUMMARY.md) — verbose executive summary for stakeholders

- [GETTING_STARTED.md](GETTING_STARTED.md) — developer quickstart: bring up dev infra and frontend
- [ENVIRONMENT.md](ENVIRONMENT.md) — environment files, secrets policy and dev `.env` guidance

- [ARCHITECTURE.md](documentation/phase-2-realworld-spec/ARCHITECTURE.md) — overall hybrid control plane architecture with mermaid diagrams

- [OPERATIONAL_STREAMING_PLANE.md](documentation/phase-2-realworld-spec/OPERATIONAL_STREAMING_PLANE.md) — Go-based streaming plane design and flows

- [GOVERNANCE_CONTROL_PLANE.md](documentation/phase-2-realworld-spec/GOVERNANCE_CONTROL_PLANE.md) — Java-based governance plane design and workflows

- [DATA_TRUST_PLATFORM.md](documentation/phase-2-realworld-spec/DATA_TRUST_PLATFORM.md) — how the planes form the Data Trust Platform

- [PROVENANCE.md](documentation/phase-2-realworld-spec/PROVENANCE.md) — provenance model examples and lineage diagrams

- [DEPLOYMENT.md](documentation/phase-2-realworld-spec/DEPLOYMENT.md) — deployment recommendations and operational considerations

- [VIEWER_MODEB.md](documentation/phase-2-realworld-spec/VIEWER_MODEB.md) — Mode B high-resolution viewer design

- [FRONTEND_UI.md](documentation/phase-2-realworld-spec/FRONTEND_UI.md) — frontend theming, visualization and animations

- [GO_GENERATOR_SPEC.md](documentation/phase-2-realworld-spec/GO_GENERATOR_SPEC.md) — Go data generator spec and runbook

- [JAVA_GOVERNANCE_SPEC.md](documentation/phase-2-realworld-spec/JAVA_GOVERNANCE_SPEC.md) — Java Governance API spec (OpenAPI-first)

- [DATA_LAKE_OVERVIEW.md](documentation/storage/DATA_LAKE_OVERVIEW.md) — storage tiering and lifecycle

- [INFRA_TOPOLOGY.md](documentation/phase-2-realworld-spec/INFRA_TOPOLOGY.md) — dev-compose and service topology

- [TESTING_REQUIREMENTS.md](documentation/phase-2-realworld-spec/TESTING_REQUIREMENTS.md) — CI, coverage and runbook

- [TODO_SIMULATION.md](documentation/phase-2-realworld-spec/TODO_SIMULATION.md) — simulation harness plan and timeline

Grouped folders (new):

- `messaging/` — messaging integration and connectors

- `governance/` — governance-related docs

- `frontend/` — UI and viewer docs

- `infra/` — infra topology and dev-compose notes

- `generators/` — data generators and simulation runbooks

- `provenance/` — provenance and lineage docs

Use these documents as a starting point for detailed design, security review, and implementation planning.
