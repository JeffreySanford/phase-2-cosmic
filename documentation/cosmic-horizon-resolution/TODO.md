# Cosmic Horizon Resolution — Future Phase 3 TODO

> This is a **future product-phase backlog**.  
> It is intentionally separate from `documentation/lakehouse/TODO.md`, where `Stage 3` means the current Phase 2 Lakehouse vertical-slice gate.

## Phase 2 handoff prerequisites

- [ ] Complete a real public-source -> Kafka -> Spark -> Bronze Delta path.
- [ ] Persist a canonical Silver observation/entity.
- [ ] Persist at least one Gold aggregate.
- [ ] Demonstrate replay and deduplication.
- [ ] Demonstrate one schema-evolution case.
- [ ] Demonstrate analytical quarantine with deterministic reason codes.
- [ ] Demonstrate Gold -> Silver -> Bronze -> source/object lineage.
- [ ] Preserve canonical job/dataset/artifact/provenance identifiers across projections.
- [ ] Retain truthful measured/configured/stale/unavailable/mock evidence labels.

Phase 3 implementation should not begin until these foundations are sufficiently stable to avoid building a graph over proof-only or ambiguous semantics.

## P3.1 — Canonical Rectification

- [ ] Inventory canonical IDs across Governance, datasets, jobs, artifacts, storage, and Lakehouse entities.
- [ ] Define a Phase 3 entity identity contract.
- [ ] Define deterministic relationship contracts.
- [ ] Define relationship evidence/provenance fields.
- [ ] Define schema/versioning rules for graph projections.
- [ ] Add fixtures covering ESO, M87, 3C 273, and VLASS-style bounded examples where available.
- [ ] Add tests for duplicate identity resolution and orphan detection.

## P3.2 — Lakehouse Handoff

- [ ] Define graph projection views from Silver canonical entities.
- [ ] Define optional Gold-to-graph projections.
- [ ] Preserve Bronze/source references for traceability.
- [ ] Define graph rebuild/replay behavior.
- [ ] Measure projection freshness on a bounded dataset.

## P3.3 — Evidence Graph

- [ ] Select the first property-graph implementation for evaluation.
- [ ] Implement nodes for Provider, Source, Observation, Dataset, Job, Artifact, StorageObject, QualityResult, Service, Broker.
- [ ] Implement source/provenance/processing/dependency relationships.
- [ ] Add graph import/rebuild command.
- [ ] Add deterministic lineage traversal API.
- [ ] Add graph schema/version endpoint or metadata record.
- [ ] Add graph visualization proof.

## P3.4 — Graph Analytics

- [ ] Implement lineage BFS/shortest-path proof.
- [ ] Detect orphan graph entities.
- [ ] Detect invalid provenance cycles.
- [ ] Measure degree/centrality on the bounded graph.
- [ ] Evaluate PageRank as a structural—not scientific—importance metric.
- [ ] Evaluate community/label-propagation output with explicit interpretation limits.
- [ ] Evaluate GraphFrames against Lakehouse-derived vertices/edges.

## P3.5 — Ask Cosmic / GraphRAG

- [ ] Define an evidence-bundle contract for AI retrieval.
- [ ] Add entity resolution from user question to canonical graph node(s).
- [ ] Add graph traversal retriever.
- [ ] Add structured Lakehouse retriever where needed.
- [ ] Add vector/document retriever only for unstructured context.
- [ ] Return evidence paths and citations with answers.
- [ ] Mark inferred relationships separately from authoritative/analytical relationships.
- [ ] Ensure Ask Cosmic fails transparently when required evidence is unavailable.

## P3.6 — Evaluation Harness

- [ ] Create a fixed graph correctness corpus.
- [ ] Create a fixed Ask Cosmic question set.
- [ ] Measure entity/path/citation precision and recall.
- [ ] Measure unsupported-claim count.
- [ ] Inject broken lineage edges and confirm detection.
- [ ] Inject lineage cycles and confirm detection.
- [ ] Inject broker/service degradation and validate impact-path reasoning.
- [ ] Capture stale/unavailable source behavior.
- [ ] Record model/provider/version and retrieval configuration for AI runs.
- [ ] Produce a reproducible Phase 3 evidence report.

## P3.7 — Optional Graph ML / GNN research

- [ ] Complete selected Stanford CS224W material.
- [ ] Complete introductory PyTorch Geometric notebooks.
- [ ] Define one engineering-labeled graph task with known ground truth.
- [ ] Establish a non-GNN baseline first.
- [ ] Compare GNN result against the baseline.
- [ ] Add explanation/error analysis.
- [ ] Keep astrophysical inference out of scope unless appropriately validated.

## Final Resolution acceptance gate

Resolution is complete when the system can reproducibly answer a bounded question and show:

```text
answer
  + graph entities
  + graph path
  + Lakehouse/source evidence
  + producing jobs/artifacts
  + citations
  + evidence state
  + limitations
```

without requiring the reviewer to trust the LLM itself.
