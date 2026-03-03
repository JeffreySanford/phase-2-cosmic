# Documentation Audience Guide (Scientists to HR)

Alignment anchors
- Frontend UX source of truth: [FRONTEND_UI.md](/docuentation/frontend/FRONTEND_UI.md)
- Execution backlog: [../TODO.md](/docuentation/planning/TODO.md)
- Delivery plan: [../ROADMAP.md](/ROADMAP.md)

This guide helps different audiences quickly find the right documentation depth and avoid technical overload.

## 1. Quick role map

```mermaid
flowchart TD
  A[Audience]
  A --> S[Scientists and Data Stewards]
  A --> O[Operations and Engineering]
  A --> L[Leadership and Program Mgmt]
  A --> H[HR, Recruiting, and New Joiners]

  S --> S1[Mission, Trust, Reproducibility]
  O --> O1[Architecture, APIs, Reliability]
  L --> L1[Roadmap, Risks, Outcomes]
  H --> H1[Program Purpose, Team Scope, Vocabulary]
```

## 2. Read paths by audience

### Scientists and Data Stewards
- Start: [EXECUTIVE_SUMMARY.md](/docuentation/overview/EXECUTIVE_SUMMARY.md)
- Then: [NGVLA_MISSION_ALIGNMENT.md](/docuentation/ngvla/NGVLA_MISSION_ALIGNMENT.md)
- Then: [DATA_TRUST_PLATFORM.md](/docuentation/data/DATA_TRUST_PLATFORM.md), [PROVENANCE.md](/docuentation/provenance/PROVENANCE.md), [storage/STORAGE_EXECUTIVE_SUMMARY.md](/docuentation/storage/STORAGE_EXECUTIVE_SUMMARY.md)
- Why: explains reproducibility, provenance, and SRDP trust guarantees.

### Observatory Operators and Engineers
- Start: [ARCHITECTURE.md](/docuentation/architecture/ARCHITECTURE.md)
- Then: [FRONTEND_UI.md](/docuentation/frontend/FRONTEND_UI.md), [API_CONTRACT_STATUS.md](/docuentation/data/API_CONTRACT_STATUS.md), [JAVA_GOVERNANCE_SPEC.md](/docuentation/governance/JAVA_GOVERNANCE_SPEC.md)
- Then: [TESTING_REQUIREMENTS.md](/docuentation/testing/TESTING_REQUIREMENTS.md), [INFRA_TOPOLOGY.md](/docuentation/infra/INFRA_TOPOLOGY.md)
- Why: maps operational workflows to implementation contracts and reliability checks.

### Leadership, Program, and Product
- Start: [PROGRAM_DIRECTION.md](/docuentation/overview/PROGRAM_DIRECTION.md)
- Then: [ROADMAP.md](/ROADMAP.md), [TODO.md](/docuentation/planning/TODO.md), [MISSION_GATES.md](/docuentation/ngvla/MISSION_GATES.md)
- Then: [MISSION_TO_CAPABILITY_TRACE.md](/docuentation/ngvla/MISSION_TO_CAPABILITY_TRACE.md), [DECISIONS.md](/docuentation/architecture/DECISIONS.md)
- Why: shows priorities, tradeoffs, and measurable mission delivery.

### HR, Recruiting, and New Joiners
- Start: [README.md](/docuentation/README.md)
- Then: [EXECUTIVE_SUMMARY.md](/docuentation/overview/EXECUTIVE_SUMMARY.md), [NGVLA_MISSION_ALIGNMENT.md](/docuentation/ngvla/NGVLA_MISSION_ALIGNMENT.md)
- Then: [GETTING_STARTED.md](/docuentation/overview/GETTING_STARTED.md)
- Why: provides plain-language context, mission, and onboarding path without deep implementation details.

## 3. Shared vocabulary (plain language)

- Operational Streaming Plane: handles fast live telemetry and system health signals.
- Governance Control Plane: records job/dataset truth, lifecycle, and policy decisions.
- SRDP: Science Ready Data Product, a publishable research output.
- Provenance: the evidence trail showing how an SRDP was produced.
- Mission gate: a release requirement tied to mission outcomes, not only code completion.

## 4. Reading order for broad audiences

```mermaid
flowchart LR
  R[README] --> E[Executive Summary]
  E --> M[NGVLA Mission Alignment]
  M --> A[Architecture]
  A --> G[Mission Gates]
  G --> P[Roadmap + TODO]
```
