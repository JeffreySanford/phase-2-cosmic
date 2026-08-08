# Cosmic Horizon: Resolution

> Product phase: **Phase 3 — Resolution**  
> Engineering initiative: **Evidence Graph & Scientific Intelligence**  
> Status: **future-phase architecture and learning plan only**  
> Current implementation boundary: Phase 2 and the PR #40 Lakehouse Initiative must finish their evidence gates before Phase 3 implementation begins.

## Mission

**Cosmic Horizon: Resolution** is the proposed final product phase that turns scientific, operational, provenance, quality, and analytical evidence into a unified, queryable knowledge fabric.

The defining capability is not an AI chatbot. It is a system that can answer a question **and show the evidence path that makes the answer defensible**.

Phase 3 should make it possible to trace and reason across:

- public/authoritative science sources,
- observations and targets,
- canonical datasets,
- jobs and processing steps,
- artifacts and object-store references,
- provenance and audit records,
- Lakehouse Bronze/Silver/Gold analytical history,
- quality decisions and quarantine outcomes,
- runtime services, brokers, and telemetry,
- graph analytics and later grounded AI retrieval.

## Why "Resolution"

The name is intentional:

1. In astronomy, **resolution** is the ability to distinguish detail that was previously blended together.
2. In architecture, Phase 3 resolves previously separate evidence planes into a coherent relationship model.
3. In product terms, Resolution is the final consolidation phase rather than another independent feature stack.

## Phase progression

```text
Phase 1 — Foundation / Prototype
  Explore what Cosmic Horizon can do.

Phase 2 — Realization
  Make the architecture real, measurable, governed, and evidence-backed.

Phase 3 — Resolution
  Resolve scientific + operational + provenance + analytical evidence
  into a graph-backed intelligence and explanation layer.
```

## Relationship to PR #40

PR #40 remains the **Phase 2 Lakehouse Initiative** umbrella. Adding this directory to PR #40 captures the future handoff and prevents Phase 2 architecture decisions from accidentally blocking the final product direction.

This directory is **planning only**. It does not claim that Neo4j, GraphRAG, GraphFrames, GNNs, or Phase 3 APIs are implemented in PR #40.

Important terminology:

- **Lakehouse Stage 3** = the current PR #40 implementation gate for the first real Kafka -> Spark -> Bronze Delta -> Silver -> Gold slice.
- **Product Phase 3 — Resolution** = the future product phase described here.

Phase 3 depends on the Phase 2 Lakehouse becoming a trustworthy analytical source; it does not replace that work.

## Proposed Phase 3 outcome

```text
Authoritative Sources
        |
        v
Operational + Scientific Data Planes
        |
        v
Lakehouse analytical history
        |
        +------------------------+
        |                        |
        v                        v
Canonical evidence         Operational evidence
        |                        |
        +------------+-----------+
                     |
                     v
              Evidence Graph
                     |
          +----------+----------+
          |          |          |
          v          v          v
      Lineage     Graph      GraphRAG /
      analysis   analytics   grounded AI
                     |
                     v
                 Ask Cosmic
                     |
                     v
        answers + paths + citations
```

## Directory map

```text
documentation/cosmic-horizon-resolution/
├── README.md
├── PHASE_3_EVIDENCE_GRAPH_AND_SCIENTIFIC_INTELLIGENCE.md
├── ARCHITECTURE.md
├── GRAPH_MODEL_AND_USE_CASES.md
├── EVALUATION_AND_GUARDRAILS.md
├── LEARNING_PLAN.md
├── TODO.md
└── diagrams/
    ├── README.md
    ├── resolution-overview.mmd
    ├── evidence-graph.mmd
    ├── lakehouse-to-graphrag.mmd
    ├── phase-3-gates.mmd
    └── learning-roadmap.mmd
```

## Core design rule

**AI is never the authority. Evidence is.**

Structured domain entities and relationships should be produced deterministically from governed records whenever possible. LLM extraction belongs primarily at unstructured boundaries such as documents, operator notes, incident narratives, and scientific descriptions.

## Read next

1. [`PHASE_3_EVIDENCE_GRAPH_AND_SCIENTIFIC_INTELLIGENCE.md`](./PHASE_3_EVIDENCE_GRAPH_AND_SCIENTIFIC_INTELLIGENCE.md)
2. [`ARCHITECTURE.md`](./ARCHITECTURE.md)
3. [`GRAPH_MODEL_AND_USE_CASES.md`](./GRAPH_MODEL_AND_USE_CASES.md)
4. [`EVALUATION_AND_GUARDRAILS.md`](./EVALUATION_AND_GUARDRAILS.md)
5. [`LEARNING_PLAN.md`](./LEARNING_PLAN.md)
6. [`TODO.md`](./TODO.md)
