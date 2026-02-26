# Provenance Model & Lineage

This document defines provenance concepts and provides examples for constructing verifiable lineage graphs for SRDPs.

Provenance primitives

- Entity: a dataset, file, or artifact (raw visibility, calibrated table, image)
- Activity: a computational process that transforms entities (calibration job, reconstruction job)
- Agent: an identity or system that submitted or authorized an activity (user, workflow engine)
- Bundle/Manifest: a packaged representation of entities, activities, agents, parameters, and environment metadata used for reproducibility

Lineage example (DAG)

```mermaid
graph LR
  subgraph Raw
    R1[Raw: vis-0001]
    R2[Raw: vis-0002]
  end
  subgraph Compute
    C1[Calibrator v1.4]
    C2[Flagger v2.1]
    RCON[Reconstructor v2.0]
  end
  subgraph Results
    S1[SRDP: image-0001]
  end

  R1 --> C1
  R2 --> C1
  C1 --> C2
  C2 --> RCON
  RCON --> S1

  click S1 "" "SRDP package contains manifest + hash anchors"
```

Provenance bundle contents (recommended minimum)

- Identifiers and stable URIs for all input entities
- Exact software versions and container digests
- Parameter sets and configuration files (diffable)
- Execution timestamps, resource footprints, and node identifiers
- Signed audit manifest linking the bundle to the governance catalog entry

Verification and replay

- Provide tools that can consume a provenance bundle and re-run workflows in a controlled environment.
- Where exact hardware parity is impossible, provide emulation layers or runbooks describing equivalence classes of environments.
