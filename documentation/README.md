# Phase 2 — Real-World Specification

Alignment anchors

- Frontend UX source of truth: [FRONTEND_UI.md](/docuentation/frontend/FRONTEND_UI.md)
- Execution backlog: [../TODO.md](/docuentation/planning/TODO.md)
- Delivery plan: [../ROADMAP.md](/ROADMAP.md)

This folder contains the Phase 2 documentation for moving Cosmic Horizon past prototype into production-grade, real-world specifications. It includes an expanded executive summary, architecture descriptions, component-level designs for the Operational Streaming Plane and the Governance & Orchestration
Control Plane, provenance and data-trust guidance, and deployment recommendations.

Files:

- [EXECUTIVE_SUMMARY.md](/docuentation/overview/EXECUTIVE_SUMMARY.md) — verbose executive summary for stakeholders
- [AUDIENCE_GUIDE.md](/docuentation/overview/AUDIENCE_GUIDE.md) — role-based read paths for scientists, operators, leadership, and HR
- [ALIGNMENT.md](/docuentation/overview/ALIGNMENT.md) — documentation alignment matrix and status
- [PROGRAM_DIRECTION.md](/docuentation/overview/PROGRAM_DIRECTION.md) — authoritative direction and prioritization guardrails
- [NGVLA_MISSION_ALIGNMENT.md](/docuentation/ngvla/NGVLA_MISSION_ALIGNMENT.md) — explicit ngVLA mission outcomes and planning rules
- [NGVLA_DATA_ARCHITECT_RESEARCH.md](/docuentation/ngvla/NGVLA_DATA_ARCHITECT_RESEARCH.md) — dated external-source traceability for Data Architect scope decisions
- [NGVLA_MISSION_GAP_ANALYSIS_2026-03-03.md](/docuentation/ngvla/NGVLA_MISSION_GAP_ANALYSIS_2026-03-03.md) — identified mission oversights and closure actions
- [MISSION_TO_CAPABILITY_TRACE.md](/docuentation/ngvla/MISSION_TO_CAPABILITY_TRACE.md) — mission outcomes mapped to implemented/in-progress/planned capabilities
- [MISSION_GATES.md](/docuentation/ngvla/MISSION_GATES.md) — release readiness criteria tied to mission outcomes
- [DECISIONS.md](/docuentation/architecture/DECISIONS.md) — mission-critical architecture and scope decision log
- [PROFESSIONAL_CONSOLE_SPEC.md](/docuentation/architecture/PROFESSIONAL_CONSOLE_SPEC.md) — single-source professional console product specification
- [STRESS_TEST.md](/docuentation/stress-test/README.md) — stress load and validation tooling, replay, and CI artifacts
- [API_CONTRACT_STATUS.md](/docuentation/data/API_CONTRACT_STATUS.md) — implemented vs target API contract status matrix

- [GETTING_STARTED.md](/docuentation/overview/GETTING_STARTED.md) — developer quickstart: bring up dev infra and frontend
- [ENVIRONMENT.md](/docuentation/infra/ENVIRONMENT.md) — environment files, secrets policy and dev `.env` guidance

- [ARCHITECTURE.md](/docuentation/architecture/ARCHITECTURE.md) — overall hybrid control plane architecture with mermaid diagrams
- [EXECUTION_LAYER_API_SKETCH.md](/docuentation/architecture/EXECUTION_LAYER_API_SKETCH.md) — minimal execution-layer API evolved from the original remote-compute gateway idea
- [EVENT_ENVELOPE_AND_BROKER_ROLES.md](/docuentation/messaging/EVENT_ENVELOPE_AND_BROKER_ROLES.md) — canonical event envelope and RabbitMQ/Kafka/Pulsar role partitioning

- [LAKEHOUSE_INITIATIVE.md](/documentation/lakehouse/README.md) — active PR #40 Lakehouse initiative: architecture, validated public-data evidence scaffold, staged Bronze/Silver/Gold implementation plan, and guardrails
- [LAKEHOUSE_TODO.md](/documentation/lakehouse/TODO.md) — current PR #40 execution stages and evidence gates
- [LAKEHOUSE_TOPOLOGY.md](/documentation/lakehouse/docs/LAKEHOUSE_TOPOLOGY.md) — integrated physical/logical topology for streaming, governance, object storage, and Bronze/Silver/Gold analytics
- [MEDALLION_ARCHITECTURE.md](/documentation/lakehouse/docs/MEDALLION_ARCHITECTURE.md) — Bronze/Silver/Gold contracts plus RAW/CAL/SCI/DRV crosswalk and failure/quarantine semantics
- [LAKEHOUSE_STORAGE_RESPONSIBILITIES.md](/documentation/lakehouse/docs/STORAGE_RESPONSIBILITIES.md) — authoritative object storage versus analytical table ownership
- [REAL_DATA_SOURCES.md](/documentation/lakehouse/docs/REAL_DATA_SOURCES.md) — provider-neutral VO/TAP source strategy; ESO is the first working profile and NRAO/VLA/VLASS is the key radio-astronomy validation profile
- [ESO_PROOF_SLICE_BRIEF.md](/documentation/lakehouse/docs/ESO_PROOF_SLICE_BRIEF.md) — current ESO provider profile and path from the live evidence scaffold to the first complete Lakehouse vertical slice
- [ESO_INGESTION_ADAPTER_CONTRACT.md](/documentation/lakehouse/docs/ESO_INGESTION_ADAPTER_CONTRACT.md) — provider-neutral source-to-Bronze contract documented through the current ESO profile
- [PIPELINE_TELEMETRY_EVIDENCE.md](/documentation/lakehouse/docs/PIPELINE_TELEMETRY_EVIDENCE.md) — active evidence API, measured/configured/mock/unavailable source semantics, telemetry cadence, and the Bronze/Silver/Gold claim boundary
- [LAKEHOUSE_MERMAID_SOURCES.md](/documentation/lakehouse/diagrams/README.md) — reusable `.mmd` topology source catalog, including processing-level and failure-routing views

### Future product phase — Cosmic Horizon: Resolution

The following package is intentionally captured in PR #40 as **future Phase 3 planning only** so the Phase 2 Lakehouse and provenance architecture can preserve a clean handoff:

- [COSMIC_HORIZON_RESOLUTION.md](/documentation/cosmic-horizon-resolution/README.md) — Phase 3 product vision and documentation map
- [PHASE_3_EVIDENCE_GRAPH_AND_SCIENTIFIC_INTELLIGENCE.md](/documentation/cosmic-horizon-resolution/PHASE_3_EVIDENCE_GRAPH_AND_SCIENTIFIC_INTELLIGENCE.md) — proposed Evidence Graph & Scientific Intelligence gates
- [RESOLUTION_ARCHITECTURE.md](/documentation/cosmic-horizon-resolution/ARCHITECTURE.md) — authoritative-plane, Lakehouse, evidence-graph, and GraphRAG boundaries
- [RESOLUTION_GRAPH_MODEL_AND_USE_CASES.md](/documentation/cosmic-horizon-resolution/GRAPH_MODEL_AND_USE_CASES.md) — initial graph model and bounded ESO/M87/3C 273/VLASS-style engineering use cases
- [RESOLUTION_EVALUATION_AND_GUARDRAILS.md](/documentation/cosmic-horizon-resolution/EVALUATION_AND_GUARDRAILS.md) — software/data-engineering evidence criteria and scientific-claim boundaries
- [RESOLUTION_LEARNING_PLAN.md](/documentation/cosmic-horizon-resolution/LEARNING_PLAN.md) — current Databricks/Spark, Neo4j/GraphRAG, Stanford CS224W, GraphFrames, PyTorch Geometric, and Microsoft GraphRAG learning path
- [RESOLUTION_TODO.md](/documentation/cosmic-horizon-resolution/TODO.md) — future P3.1-P3.7 execution gates
- [RESOLUTION_MERMAID_SOURCES.md](/documentation/cosmic-horizon-resolution/diagrams/README.md) — reusable Phase 3 architecture and learning-roadmap diagrams

**Terminology warning:** Lakehouse `Stage 3` in PR #40 is the Phase 2 real vertical-slice gate. Product `Phase 3 — Resolution` is a future build and is not implemented by this PR.

- [OPERATIONAL_STREAMING_PLANE.md](/docuentation/infra/OPERATIONAL_STREAMING_PLANE.md) — Go-based streaming plane design and flows

- [GOVERNANCE_CONTROL_PLANE.md](/docuentation/governance/GOVERNANCE_CONTROL_PLANE.md) — Java-based governance plane design and workflows

- [DATA_TRUST_PLATFORM.md](/docuentation/data/DATA_TRUST_PLATFORM.md) — how the planes form the Data Trust Platform

- [PROVENANCE.md](/docuentation/provenance/PROVENANCE.md) — provenance model examples and lineage diagrams
- [DATA_QUALITY_STANDARDS.md](/docuentation/data/DATA_QUALITY_STANDARDS.md) — ETL-stage quality gates, required fields, rule IDs, and failure/error contracts

- [DEPLOYMENT.md](/docuentation/infra/DEPLOYMENT.md) — deployment recommendations and operational considerations

- [VIEWER_MODEB.md](/docuentation/viewer/VIEWER_MODEB.md) — Mode B high-resolution viewer design

- [FRONTEND_UI.md](/docuentation/frontend/FRONTEND_UI.md) — frontend product and UX specification

- [GO_GENERATOR_SPEC.md](/docuentation/generators/GO_GENERATOR_SPEC.md) — Go data generator spec and runbook

- [JAVA_GOVERNANCE_SPEC.md](/docuentation/governance/JAVA_GOVERNANCE_SPEC.md) — Java Governance API spec (OpenAPI-first)

- [STORAGE_ARCHITECTURE.md](/docuentation\storage\STORAGE_ARCHITECTURE.md) — storage tiering and lifecycle architecture

- [INFRA_TOPOLOGY.md](/docuentation/infra/INFRA_TOPOLOGY.md) — dev-compose and service topology

- [TESTING_REQUIREMENTS.md](/docuentation/testing/TESTING_REQUIREMENTS.md) — CI, coverage and runbook
- [TESTING_FRAMEWORK_ARCHITECTURE.md](/docuentation/testing/TESTING_FRAMEWORK_ARCHITECTURE.md) — verbose testing architecture with Mermaid diagrams
- [TRIDENT_EXECUTION_TEST_MATRIX.md](/docuentation/testing/TRIDENT_EXECUTION_TEST_MATRIX.md) — execution-layer validation matrix for Trident-style planning, apply, and backend orchestration
- [EXECUTION_LAYER_THREAT_MODEL.md](/docuentation/security/EXECUTION_LAYER_THREAT_MODEL.md) — security and safety risks for execution-layer and operator-facing workflows

- [TODO.md](/docuentation/planning/TODO.md) — simulation harness and implementation backlog

Grouped folders (new):

- `messaging/` — messaging integration and connectors
  - includes `MESSAGING_INTEGRATION.md`, `EVENT_ENVELOPE_AND_BROKER_ROLES.md`, `PULSAR.md`, and `RABBITMQ.md`
- `mission-closure/` — detailed closure plans for timing integrity, RFI/EMC loop, VO interoperability, commissioning/AIV, archive DR, and transient alert latency

- `governance/` — governance-related docs

- `frontend/` — UI and viewer docs

- `infra/` — infra topology and dev-compose notes

- `generators/` — data generators and simulation runbooks

- `provenance/` — provenance and lineage docs

- `lakehouse/` — self-contained PR #40 Lakehouse Initiative package; `docs/` contains narrative architecture/proof documentation, `diagrams/` contains standalone Mermaid sources, and `visualizations/` contains explicitly illustrative proof/design artifacts unless a file states a measured runtime source

- `cosmic-horizon-resolution/` — future Phase 3 planning package for Evidence Graph & Scientific Intelligence; planning/learning/diagram artifacts only in PR #40

- `trident/` — ngVLA Trident research notes and execution-layer integration planning

- `security/` — threat models and security controls for execution-layer and operator-facing workflows

Use these documents as a starting point for detailed design, security review, and implementation planning.
