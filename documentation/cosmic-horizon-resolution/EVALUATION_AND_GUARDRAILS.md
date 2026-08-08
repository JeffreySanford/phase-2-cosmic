# Resolution Evaluation and Guardrails

## 1. Principle

Resolution must be ambitious in software/data engineering while conservative about scientific claims.

The project can prove graph correctness, provenance, retrieval, replay, fault handling, and evidence quality without claiming novel astrophysical conclusions.

## 2. Authority hierarchy

From strongest authority to weakest:

1. authoritative external/public source record,
2. authoritative object-store or governance record,
3. source-faithful Bronze record,
4. validated/canonical Silver projection,
5. Gold aggregate or analytical product,
6. deterministic graph projection,
7. graph algorithm output,
8. retrieval result,
9. LLM explanation/inference.

AI output must never silently override a stronger evidence layer.

## 3. Allowed claims without academic support

Resolution can legitimately demonstrate:

- source-attribution preservation,
- deterministic entity identity and relationship mapping,
- lineage path correctness,
- replay and deduplication behavior,
- schema-evolution handling,
- quarantine reason correctness,
- orphan/cycle detection,
- graph connectivity and structural metrics,
- operational dependency/impact paths,
- retrieval precision/recall on a bounded test set,
- answer-to-evidence consistency,
- citation coverage,
- deliberately injected anomaly detection,
- reproducibility of bounded engineering experiments.

## 4. Claims that require stronger domain validation

Do not describe the following as validated scientific findings without appropriate domain expertise and evidence:

- a newly discovered astrophysical relationship,
- a physical association inferred only because coordinates are near each other,
- a new astronomical classification produced by community detection,
- a scientifically meaningful source ranking produced by PageRank,
- causal astronomical conclusions inferred from graph structure,
- astrophysical predictions from an experimental GNN.

Use language such as `metadata similarity`, `graph cluster`, `structural relationship`, or `candidate for expert review` when appropriate.

## 5. Test corpus strategy

Use a layered corpus.

### Layer A — real public metadata

Examples:

- live ESO ObsCore proof rows,
- bounded NRAO/VLA/VLASS metadata where available,
- other VO/TAP provider profiles.

Purpose: authentic schemas, identifiers, coordinates, provider metadata, and citations.

### Layer B — repository sample records

Examples:

- M87 sample ObsCore rows,
- 3C 273 cone-search examples,
- VLASS-style sample records,
- seeded jobs, datasets, artifacts, and lineage.

Purpose: deterministic development and regression tests.

### Layer C — deterministic injected faults

Examples:

- duplicate events,
- late/out-of-order events,
- schema mismatch,
- missing metadata,
- broken checksum/object reference,
- missing lineage edge,
- lineage cycle,
- broker delay,
- quarantine/replay scenario.

Purpose: controlled ground truth for graph and AI evaluation.

## 6. Graph correctness metrics

Recommended measurements:

| Metric | Meaning |
| --- | --- |
| Node identity precision | projected nodes mapped to the correct canonical identity |
| Duplicate-node rate | canonical identities incorrectly split into multiple graph nodes |
| Edge correctness | relationship exists and is supported by a source record |
| Orphan rate | expected entities missing required parent/source relationships |
| Lineage path coverage | known source-to-product paths reproduced by the graph |
| Cycle violation count | invalid cycles in lineage/provenance relationships |
| Projection freshness | delay between source/Lakehouse update and graph availability |
| Rebuild determinism | same bounded input produces equivalent graph projection |

## 7. Graph analytics evaluation

Every graph algorithm should have a documented purpose and interpretation boundary.

For example:

- `connected components` can detect disconnected records; it does not determine scientific relevance,
- `PageRank` can expose structural importance; it does not determine scientific importance,
- `community detection` can reveal clusters; it does not establish physical classes,
- `shortest path` can prove a modeled dependency/provenance route when each edge is evidence-backed.

## 8. GraphRAG evaluation

Create a fixed question set with expected entities, paths, and citations.

Example test:

```text
Question:
Which source and processing records support Gold product X?

Expected retrieval:
- Gold product X
- producing Silver entity
- originating Bronze record
- source/provider record
- producing job(s)
- source citation

Pass conditions:
- no unsupported source inserted,
- required path nodes returned,
- citation included,
- answer wording consistent with evidence state.
```

Recommended metrics:

- entity retrieval precision,
- entity retrieval recall,
- path retrieval correctness,
- citation precision,
- citation completeness,
- unsupported-claim count,
- stale-evidence disclosure rate,
- deterministic answer-fact agreement for bounded factual questions.

## 9. AI answer contract

Every Ask Cosmic response should be able to expose:

- evidence state,
- entities used,
- paths used,
- source citations,
- retrieval timestamp,
- known limitations,
- whether any relationship is inferred rather than authoritative.

A good answer structure is:

```text
Answer

Evidence path
A -> B -> C -> D

Sources
- source/provider/citation

Limitations
- derived/inferred relationships
- stale/unavailable evidence
```

## 10. Failure handling

If the graph is unavailable, do not fabricate graph paths.

If vector retrieval is unavailable, graph/structured retrieval may still answer questions that do not require document context.

If the LLM is unavailable, deterministic graph traversal and analytics should remain usable.

If a source is stale or unavailable, propagate that evidence state into the answer.

## 11. Reproducibility package

Each Phase 3 experiment should record:

- input dataset/profile,
- source URLs or bounded fixture IDs,
- graph schema version,
- projection version,
- algorithm and parameters,
- model/provider/version when AI is involved,
- prompt/retrieval configuration when relevant,
- expected result/evidence path,
- measured result,
- limitations.

## 12. Success criterion

Resolution is successful when a reviewer can independently inspect the evidence behind a graph or AI result and determine whether the conclusion is supported—without trusting the LLM by default.
