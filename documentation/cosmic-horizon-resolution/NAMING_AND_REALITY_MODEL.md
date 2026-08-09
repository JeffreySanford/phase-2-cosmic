# Resolution Naming and Reality Model

## 1. Purpose

This note preserves the product-language reasoning behind **Cosmic Horizon: Resolution** and adds a compact conceptual model for the future Phase 3 evidence graph.

The goal is not branding for its own sake. The name should keep the engineering direction honest: Phase 3 resolves already-governed evidence into a coherent queryable model rather than introducing a disconnected AI subsystem.

## 2. Selected name

Preferred product/release name:

```text
Cosmic Horizon: Resolution
```

Formal engineering initiative:

```text
Phase 3 — Resolution: Evidence-Driven Scientific Intelligence
```

Short initiative label:

```text
Phase 3 — Evidence Graph & Scientific Intelligence
```

## 3. Why "Resolution"

Resolution works at three levels:

1. **Astronomical meaning**: resolution is the ability to distinguish detail that was previously blended together.
2. **Architectural meaning**: Phase 3 resolves disconnected observations, datasets, jobs, artifacts, provenance, telemetry, Lakehouse records, and AI context into one evidence model.
3. **Product meaning**: Resolution is the settling and consolidation phase after Foundation and Realization.

The name therefore describes the actual system behavior. Cosmic Horizon should be able to distinguish which evidence came from where, how it was transformed, what system path produced it, and which conclusions are supported.

## 4. Ranked name alternatives

| Rank | Name                        | What it conveys                                                                  | Limitation                                                               |
| ---- | --------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1    | Cosmic Horizon: Resolution  | Scientific meaning, architectural completion, clarity, evidence-path explanation | Best fit; should be retained unless product direction changes materially |
| 2    | Cosmic Horizon: Convergence | Streaming, Lakehouse, graph, and AI capabilities coming together                 | Less precise about explainability and provenance                         |
| 3    | Cosmic Horizon: Synthesis   | Data and relationships becoming knowledge                                        | Slightly broad; can sound like generic AI summarization                  |
| 4    | Cosmic Horizon: Nexus       | Connected graph / central intelligence fabric                                    | Strong connectivity signal but less astronomical                         |
| 5    | Cosmic Horizon: Continuum   | Full lifecycle from observation through knowledge                                | Good lifecycle framing but less active than Resolution                   |
| 6    | Cosmic Horizon: Provenance  | Trust and lineage                                                                | Technically strong but too narrow for the full product phase             |

Avoid **Final Resolution**. It sounds like product termination rather than product completion.

## 5. Phase vocabulary

```text
Cosmic Horizon
  Phase 1 — Foundation
    Prototype and system exploration.

  Phase 2 — Realization
    Operational architecture, governance, Lakehouse, and evidence.

  Phase 3 — Resolution
    Knowledge graph, cross-plane provenance, graph analytics,
    and grounded AI.
```

This vocabulary gives Phase 2 a reason for rigor. Canonical identities, source citations, Lakehouse lineage, quality semantics, and truthful evidence states are not polish; they are the substrate that Resolution will query.

## 6. Data Reality and System Reality

Resolution should explicitly connect two evidence realities.

### Data Reality

Data Reality covers the scientific and analytical facts the system is responsible for preserving or producing:

- observations,
- targets,
- providers and external sources,
- datasets,
- products,
- artifacts,
- provenance,
- object references,
- Lakehouse Bronze/Silver/Gold records,
- quality results and quarantine decisions.

### System Reality

System Reality covers the operational path that created, transformed, transported, stored, or failed to produce the data:

- services,
- jobs,
- brokers,
- queues/topics,
- retries,
- failures,
- runtime telemetry,
- source freshness,
- measured/configured/mock/unavailable evidence states.

### Resolution layer

The Evidence Graph connects the two:

```text
Data Reality
  observations / datasets / products / provenance / Lakehouse
        |
        v
Evidence Graph
        ^
        |
System Reality
  services / brokers / jobs / telemetry / failures
```

That connection supports a stronger class of question than either side can answer alone:

- Which source record produced this product?
- Which job and artifact path created it?
- Which service or broker dependency affected the processing window?
- Which quality rule or schema version caused quarantine?
- Which evidence path makes the answer defensible?

## 7. Identity of the final product

Cosmic Horizon Resolution is not:

```text
Cosmic Horizon with a chatbot.
```

It is:

```text
Cosmic Horizon can answer a question and show the evidence path
that makes the answer defensible.
```

This distinction is the product identity. The LLM may explain, summarize, or help navigate, but evidence remains the authority.

## 8. Design implication for Phase 2

Phase 2 Lakehouse and governance work should preserve:

- stable source/event/dataset/job/artifact identifiers,
- provider/source citations,
- Gold -> Silver -> Bronze -> source traceability,
- separate broker DLQ, science-object quarantine, and analytical quarantine semantics,
- replay and deduplication evidence,
- measured/configured/mock/unavailable evidence labels,
- provenance records that can be projected into graph edges.

Without those, Phase 3 would be forced to infer or invent relationships. With them, Resolution can become a trustworthy projection of governed evidence.
