# Lakehouse Mermaid Diagram Sources

> Status: **active architecture initiative; runtime status varies by diagram**

This directory contains the standalone Mermaid source files for the Lakehouse Initiative. The corresponding explanatory documents live in `../docs/`.

The `.mmd` files are reusable by documentation tooling, topology/evidence surfaces, presentations, ADRs, and future automated rendering without requiring extraction from Markdown code fences.

## Diagram index

| Mermaid source | Purpose | Primary documentation |
| --- | --- | --- |
| [`concept-overview.mmd`](./concept-overview.mmd) | High-level Lakehouse summary over authoritative storage/runtime | [`LAKEHOUSE_TOPOLOGY.md`](../docs/LAKEHOUSE_TOPOLOGY.md) |
| [`current-proof-scaffold.mmd`](./current-proof-scaffold.mmd) | Implemented PR #40 ESO public-data fetch -> evidence service -> persistence -> operator panel, with the full Lakehouse path shown as the next stage | [`LAKEHOUSE_TOPOLOGY.md`](../docs/LAKEHOUSE_TOPOLOGY.md) |
| [`integrated-target-topology.mmd`](./integrated-target-topology.mmd) | Full streaming, governance, object storage, Lakehouse, and consumption topology | [`LAKEHOUSE_TOPOLOGY.md`](../docs/LAKEHOUSE_TOPOLOGY.md) |
| [`repository-anchors.mmd`](./repository-anchors.mmd) | Maps the Lakehouse initiative to existing repository runtime components | [`LAKEHOUSE_TOPOLOGY.md`](../docs/LAKEHOUSE_TOPOLOGY.md) |
| [`runtime-responsibility.mmd`](./runtime-responsibility.mmd) | Existing runtime versus planned analytical runtime ownership | [`LAKEHOUSE_TOPOLOGY.md`](../docs/LAKEHOUSE_TOPOLOGY.md) |
| [`logical-data-flow.mmd`](./logical-data-flow.mmd) | Source/object/event progression through Bronze, Silver, and Gold | [`LAKEHOUSE_TOPOLOGY.md`](../docs/LAKEHOUSE_TOPOLOGY.md) |
| [`first-vertical-slice.mmd`](./first-vertical-slice.mmd) | Smallest full Lakehouse implementation slice using real/public data and Kafka first | [`LAKEHOUSE_TOPOLOGY.md`](../docs/LAKEHOUSE_TOPOLOGY.md) |
| [`real-science-fault-injection.mmd`](./real-science-fault-injection.mmd) | Real astronomy data combined with deterministic operational faults | [`LAKEHOUSE_TOPOLOGY.md`](../docs/LAKEHOUSE_TOPOLOGY.md) |
| [`medallion-overview.mmd`](./medallion-overview.mmd) | Bronze/Silver/Gold analytical responsibility overview | [`MEDALLION_ARCHITECTURE.md`](../docs/MEDALLION_ARCHITECTURE.md) |
| [`processing-vs-medallion.mmd`](./processing-vs-medallion.mmd) | Separates RAW/CAL/SCI/DRV scientific processing levels from Bronze/Silver/Gold analytical refinement | [`MEDALLION_ARCHITECTURE.md`](../docs/MEDALLION_ARCHITECTURE.md) |
| [`quality-quarantine-flow.mmd`](./quality-quarantine-flow.mmd) | Silver validation, analytical quarantine, correction, and Gold promotion | [`MEDALLION_ARCHITECTURE.md`](../docs/MEDALLION_ARCHITECTURE.md) |
| [`failure-routing.mmd`](./failure-routing.mmd) | Distinguishes broker DLQ, science-object quarantine, and Silver analytical quarantine | [`MEDALLION_ARCHITECTURE.md`](../docs/MEDALLION_ARCHITECTURE.md) |
| [`storage-responsibility-topology.mmd`](./storage-responsibility-topology.mmd) | Authoritative science objects versus analytical table representations | [`STORAGE_RESPONSIBILITIES.md`](../docs/STORAGE_RESPONSIBILITIES.md) |
| [`write-path-boundary.mmd`](./write-path-boundary.mmd) | Write-path ownership from source through object storage and medallion tables | [`STORAGE_RESPONSIBILITIES.md`](../docs/STORAGE_RESPONSIBILITIES.md) |

## Synchronization rule

The standalone `.mmd` file is the reusable diagram source. Markdown documentation may embed the same Mermaid definition for convenient GitHub rendering. When a topology changes, update the `.mmd` source and the corresponding embedded Markdown diagram in the same change until automated diagram inclusion/rendering is introduced.

## Status semantics

PR #40 contains both implemented proof/evidence surfaces and planned Lakehouse topology. A diagram may therefore include existing components alongside target components.

Use these rules when interpreting or updating the diagrams:

- existing Phase 2 runtime edges should reflect runnable repository behavior,
- the live ESO proof/evidence path may be described as implemented where code/tests support it,
- Databricks/Spark/Delta Bronze/Silver/Gold table edges remain planned until runnable table evidence exists,
- Pulsar-to-Lakehouse comparison edges remain planned until measured after the Kafka baseline,
- RAW/CAL/SCI/DRV must not be visually collapsed into Bronze/Silver/Gold.
