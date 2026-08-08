# Resolution Learning Plan

> Verified against official course/documentation pages on **2026-08-08**.  
> Goal: learn the technologies by applying them to Cosmic Horizon rather than completing disconnected tutorial datasets.

## 1. Learning strategy

Do not stop project work for months to study in isolation.

Use this loop:

```text
Learn one concept
   -> reproduce the official exercise
   -> apply it to a bounded Cosmic Horizon example
   -> capture evidence/tests
   -> move to the next concept
```

Recommended order:

```text
Spark / Delta / streaming
        -> canonical Lakehouse entities
        -> graph fundamentals / Cypher
        -> knowledge graphs / GraphRAG
        -> graph algorithms
        -> graph ML / GNNs later
```

## 2. Track A — Databricks, Spark, and Delta Lake

This track directly supports the remaining Phase 2 Lakehouse work and should come first.

### Databricks Data Engineer Learning Plan

- Official learning plan: <https://customer-academy.databricks.com/learn/learning-plans/10/data-engineer-learning-plan>
- Databricks free-training guide: <https://docs.databricks.com/gcp/en/getting-started/free-training>
- Intro data-engineering course: <https://customer-academy.databricks.com/learn/courses/2469/get-started-with-databricks-for-data-engineering/lessons>

Focus on:

- DataFrames,
- Delta tables,
- Unity Catalog concepts,
- ingestion patterns,
- table history/time travel,
- data engineering workflows.

**Cosmic lab:** ingest the bounded ESO/VO provider extract into a DataFrame and define the source-faithful Bronze schema.

### Structured Streaming

- Official first-workload tutorial: <https://docs.databricks.com/aws/en/structured-streaming/tutorial>
- Structured Streaming patterns: <https://docs.databricks.com/aws/en/structured-streaming/examples>
- Delta + Structured Streaming reference: <https://docs.databricks.com/aws/en/structured-streaming/delta-lake>

Databricks currently recommends Lakeflow pipelines for new ingestion/ETL workloads, but learning the underlying Structured Streaming concepts remains valuable because the same streaming-read/transformation/state concepts apply.

**Cosmic lab:** Kafka -> Spark -> `bronze.observation_events`, with checkpointing and repeatable replay.

## 3. Track B — Graph database fundamentals

### Neo4j GraphAcademy

- Course/learning-path catalog: <https://graphacademy.neo4j.com/categories>
- Generative AI & GraphRAG path: <https://graphacademy.neo4j.com/categories/generative-ai>
- Neo4j + Generative AI workshop: <https://graphacademy.neo4j.com/courses/workshop-genai>

Recommended progression:

1. Neo4j fundamentals,
2. graph data modeling,
3. Cypher fundamentals,
4. Neo4j & Generative AI fundamentals,
5. knowledge-graph construction,
6. vector + Cypher retrieval,
7. GraphRAG.

The current GraphRAG learning path contains a sequence of hands-on courses rather than a single overview.

**Cosmic lab:** model `Provider -> Observation -> Dataset -> Job -> Artifact` and answer lineage questions with Cypher before introducing an LLM.

## 4. Track C — Knowledge Graphs for RAG

### DeepLearning.AI — Knowledge Graphs for RAG

- Course: <https://www.deeplearning.ai/courses/knowledge-graphs-rag>

The current course is approximately two hours and covers:

- knowledge-graph fundamentals,
- Cypher retrieval,
- graph + vector context,
- construction of knowledge graphs,
- graph-grounded question answering.

**Cosmic lab:** create a bounded question such as `Which source and processing path produced this product?`, retrieve the graph path, and format that path as LLM context.

## 5. Track D — Graph theory and graph machine learning

### Stanford CS224W — Machine Learning with Graphs

- Stanford course description: <https://bulletin.stanford.edu/courses/1058241>
- Stanford Online Lecture 1.1 — Why Graphs: <https://www.youtube.com/watch?v=JAB_plj2rbA>

CS224W covers topics including:

- graph structure,
- representation learning,
- knowledge-graph reasoning,
- graph neural networks,
- graph mining and influence/structural analysis.

Approach this first as an architect: understand why relational structure changes the learning problem before trying to reproduce every mathematical derivation.

**Cosmic lab:** identify which Phase 3 questions are ordinary traversal/analytics problems and which, if any, genuinely justify learned graph representations.

## 6. Track E — PyTorch Geometric / GNN implementation

- Official PyTorch Geometric Colabs and video tutorials: <https://pytorch-geometric.readthedocs.io/en/latest/notes/colabs.html>

The official examples include:

- introductory GNNs,
- node classification,
- graph classification,
- scaling GNNs,
- explaining GNN predictions,
- custom message passing.

Do this **after** deterministic evidence-graph correctness is stable.

**Cosmic lab:** use deliberately injected engineering labels, for example valid vs broken provenance or successful vs failed jobs. Do not begin with astrophysical prediction claims.

## 7. Track F — Distributed graph analytics on Spark

### GraphFrames

- Official site: <https://graphframes.io/>
- Quick start: <https://graphframes.io/02-quick-start/02-quick-start.html>
- Centrality/PageRank guide: <https://graphframes.io/04-user-guide/03-centralities.html>

GraphFrames provides graph processing over Spark DataFrames and supports algorithms such as connected components, shortest paths, PageRank-related workflows, label propagation, cycle detection, and other structural analysis.

**Cosmic lab:** derive graph vertices/edges from Silver/Gold DataFrames and compare a distributed GraphFrames lineage/connected-components analysis with the property-graph projection.

## 8. Track G — Microsoft GraphRAG

- Official getting-started guide: <https://microsoft.github.io/graphrag/get_started/>

Microsoft GraphRAG is especially relevant for the **unstructured** side of Resolution: documents, operator notes, architecture text, incident narratives, and scientific descriptions.

Do not use it to replace deterministic graph construction for already-structured domain entities.

**Cosmic lab:** index a bounded set of Cosmic documentation and test whether document-derived context can supplement—not override—the canonical evidence graph.

## 9. Suggested project-driven sequence

| Step | Study | Immediate Cosmic deliverable |
| --- | --- | --- |
| 1 | Databricks data engineering | ESO/VO DataFrame + Bronze schema |
| 2 | Structured Streaming | Kafka -> Spark bounded stream |
| 3 | Delta Lake | persisted Bronze + checkpoint/replay |
| 4 | Silver transformations | canonical observation entity + quarantine |
| 5 | Gold aggregation | one persisted consumer aggregate |
| 6 | Neo4j fundamentals + Cypher | deterministic evidence graph projection |
| 7 | Graph algorithms / GraphFrames | lineage, orphan, cycle, centrality analysis |
| 8 | DeepLearning.AI KG-RAG | graph-grounded QA prototype |
| 9 | Neo4j GraphRAG path | hybrid graph/vector retrievers |
| 10 | Microsoft GraphRAG | unstructured documentation experiment |
| 11 | CS224W | deeper theory and model selection reasoning |
| 12 | PyTorch Geometric | controlled engineering GNN experiment |

## 10. Eight-week practical curriculum

### Week 1 — Spark and DataFrames

- Databricks data-engineering foundations.
- Recreate a bounded ESO metadata DataFrame.
- Write tests for schema/source-attribution preservation.

### Week 2 — Streaming and Delta

- Structured Streaming tutorial.
- Kafka -> Bronze proof.
- Checkpoints and replay.

### Week 3 — Silver and Gold

- canonicalization,
- deduplication,
- quality/quarantine,
- one Gold aggregate.

### Week 4 — Graph fundamentals

- Neo4j fundamentals,
- Cypher,
- graph data modeling.

Build the first deterministic Cosmic evidence graph.

### Week 5 — Graph analytics

- shortest path,
- connected components,
- centrality,
- cycle detection,
- GraphFrames comparison.

### Week 6 — Knowledge Graph + RAG

- DeepLearning.AI course,
- Neo4j GraphRAG coursework.

Build the first `Ask Cosmic` bounded question set.

### Week 7 — Evaluation

- fixed question/answer evidence corpus,
- citation/path accuracy,
- injected lineage defects,
- stale/unavailable evidence scenarios.

### Week 8 — Graph ML orientation

- CS224W selected lectures,
- PyTorch Geometric introductory notebooks.

Decide whether a GNN solves a real Phase 3 problem or should remain a research branch.

## 11. Learning evidence to keep in the repository

For each learning milestone, capture:

- concept learned,
- official resource used,
- Cosmic-specific experiment,
- input dataset/fixture,
- expected result,
- observed result,
- test/evidence artifact,
- limitations,
- follow-up decision.

That turns coursework into demonstrable architecture and implementation evidence rather than a list of certificates.
