# Resolution Graph Model and Use Cases

## 1. Why the current repository is sufficient for a first graph

Cosmic Horizon already has enough structured relationships to build a meaningful engineering graph without inventing a synthetic business domain.

Current or already-modeled evidence includes:

- live ESO TAP / ObsCore proof metadata,
- VO/ObsCore/ADQL/DataLink sample records,
- sample astronomy targets such as 3C 273 and M87,
- VLASS-style observation metadata,
- jobs and workflow states,
- dataset identifiers,
- lineage fields,
- external-source attribution,
- artifacts and storage URLs,
- broker/service topology,
- runtime telemetry and cache/evidence states,
- planned/implemented provenance records and manifests.

The first Phase 3 graph should therefore be a **software/data lineage and evidence graph**, not a claim of new astrophysical knowledge.

## 2. Initial node types

| Node | Purpose | Likely source |
| --- | --- | --- |
| `Provider` | ESO, NRAO, HEASARC, etc. | source attribution / VO jobs |
| `ExternalSource` | TAP/ObsCore/cone-search/DataLink endpoint or dataset | source attribution / external-call artifact |
| `Target` | named sky target when explicitly known | job/source metadata |
| `Observation` | canonical observation entity | Silver / ObsCore mapping |
| `Dataset` | governed dataset identity | Governance / manifest / Silver |
| `Job` | ingest/calibrate/image/catalog/etc. execution | Java Governance |
| `Artifact` | output artifact metadata | job artifact manifests |
| `StorageObject` | MinIO/S3/FITS/MS/archive reference | manifest / storage URI |
| `BronzeRecord` | source-faithful analytical ingest identity | Delta Bronze |
| `SilverEntity` | canonical analytical entity | Delta Silver |
| `GoldProduct` | analytical aggregate/product | Delta Gold |
| `QualityResult` | validation/quarantine result | Silver / quality subsystem |
| `Service` | Java Ingest, Governance, Redis, MinIO, etc. | topology registry |
| `Broker` | Kafka/Pulsar/RabbitMQ | topology / broker APIs |
| `MetricEvidence` | bounded measured operational observation | telemetry evidence |
| `Document` | architecture/operator/science text for optional RAG | documentation / notes |

## 3. Initial edge types

| Edge | Example |
| --- | --- |
| `PROVIDES` | Provider -> ExternalSource |
| `DESCRIBES` | ExternalSource -> Observation |
| `OBSERVES` | Observation -> Target |
| `MATERIALIZED_AS` | Observation -> Dataset |
| `INGESTED_AS` | Source/Observation -> BronzeRecord |
| `CANONICALIZED_TO` | BronzeRecord -> SilverEntity |
| `AGGREGATED_INTO` | SilverEntity -> GoldProduct |
| `PRODUCED_BY` | Dataset/Artifact -> Job |
| `CONSUMED` | Job -> Dataset |
| `PRODUCED` | Job -> Dataset/Artifact |
| `STORED_AT` | Artifact/Dataset -> StorageObject |
| `DERIVED_FROM` | Dataset/Product -> Dataset/Entity |
| `HAS_PROVENANCE` | Dataset/Product -> Provenance record/projection |
| `HAS_QUALITY_RESULT` | Record/Dataset -> QualityResult |
| `QUARANTINED_AS` | Silver candidate -> QualityResult/quarantine record |
| `EXECUTED_ON` | Job -> Service |
| `DEPENDS_ON` | Service -> Broker/Service |
| `OBSERVED_BY` | Service/Broker -> MetricEvidence |
| `CITES` | Dataset/Product/Answer -> ExternalSource/Document |

## 4. Existing-data demonstrations

### A. M87 multi-observation relationship

With the current sample VO/ObsCore-style data, a graph can represent multiple explicitly labeled M87 observations from different instruments/providers.

Engineering question:

> Show all modeled observations associated with the named target M87 and the providers/instruments represented in the records.

Valid output is a metadata relationship result. It is **not** a claim that the observations are scientifically comparable without domain validation.

### B. 3C 273 cross-mission source results

Current cone-search-style sample records include 3C 273-related results associated with missions such as Chandra/CXO, ROSAT/HRI, and XMM-Newton.

Engineering question:

> Which source records in the bounded sample share the same explicit target/search context, and which provider/mission metadata is attached to each result?

### C. VLASS observation cluster

Current VLASS-style sample rows include multiple nearby observation IDs and coordinates.

Engineering question:

> Which records are nearest by the supplied RA/Dec fields and which share the same provider/source profile?

This is a coordinate/metadata computation. It must not be described as a physical-association discovery.

### D. ESO proof lineage

Once Lakehouse Stage 3 exists:

```text
ESO ObsCore row
 -> canonical source envelope
 -> Kafka event
 -> Bronze record
 -> Silver observation
 -> Gold aggregate
```

Engineering question:

> Show every persisted analytical representation derived from this ESO source row and the evidence references required to reproduce the path.

### E. Job-to-artifact impact path

```text
Dataset
 -> produced-by Job
 -> executed-on Service
 -> depends-on Kafka
```

Engineering question:

> Which datasets/products could be affected by a degraded broker/service path?

This connects scientific/data lineage with operational topology.

## 5. High-value deterministic graph algorithms

### Breadth-first search / shortest path

Use for:

- Gold -> source provenance,
- artifact -> producing job -> input dataset,
- product -> affected infrastructure dependency.

### Connected components

Use for detecting:

- orphan datasets,
- artifacts with no producing job,
- provenance fragments disconnected from a source,
- disconnected operational subgraphs.

### Degree / centrality

Use for engineering questions such as:

- Which service participates in the most dependency paths?
- Which dataset is reused by the most downstream products?
- Which provider/source feeds the largest number of bounded test records?

### PageRank

Use as a structural-importance experiment, not as truth. Examples:

- rank datasets by incoming downstream dependencies,
- rank services by graph connectivity in a bounded topology snapshot.

### Label propagation / community detection

Use to explore graph structure such as:

- target/provider clusters,
- processing-family clusters,
- infrastructure dependency clusters.

Any discovered cluster is an algorithmic grouping requiring interpretation; it is not automatically a scientific classification.

### Cycle detection

Especially valuable for provenance.

Expected lineage should normally be acyclic. A cycle can indicate:

- corrupt lineage,
- bad identity resolution,
- projection bugs,
- invalid replay relationships.

## 6. Ask Cosmic question classes

### Provenance

- Where did this product come from?
- Which source record ultimately produced this artifact?
- What transformations occurred between source and Gold?

### Impact analysis

- Which products depend on this failed job?
- Which datasets cross this degraded service path?
- What evidence was generated during the affected period?

### Quality

- Why was this record quarantined?
- Which schema version generated the most validation failures in the bounded run?
- Which records were recovered by replay?

### Source attribution

- Which products use ESO-derived metadata?
- Show the citation/access information for all public-source inputs to this product.

### Structural analytics

- Which nodes are orphaned?
- Which service is most central in this test topology?
- Which datasets have the greatest downstream reuse?

## 7. Flagship UI concept

**Ask Cosmic — Evidence Explorer** should combine an answer with an interactive evidence graph.

Suggested layout:

```text
+--------------------------------------------------------------+
| Ask Cosmic: Why is this Gold product related to M87?         |
+--------------------------------------------------------------+
| Grounded answer                                               |
| ...                                                           |
+-------------------------------+------------------------------+
| Evidence graph                | Evidence inspector            |
|                               | selected node                 |
| Source -> Observation         | ID                            |
|        -> Bronze              | source/provider               |
|        -> Silver              | timestamp                     |
|        -> Gold                | schema/checksum               |
|                               | producing job                 |
|                               | citation                      |
+-------------------------------+------------------------------+
```

The graph itself should be inspectable without invoking the LLM.

## 8. Later Graph ML opportunities

After deterministic graph correctness is established, controlled labels can support Graph Neural Network experiments.

Good engineering-label experiments:

- intentionally broken lineage vs valid lineage,
- successful vs failed jobs,
- normal vs injected broker delay,
- valid vs malformed canonical records,
- intentionally removed vs known provenance edges.

Avoid using the first GNN experiments to claim astrophysical prediction or discovery. The repository can provide trustworthy engineering ground truth long before it can provide trustworthy scientific labels.
