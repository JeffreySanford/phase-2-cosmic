# IRSA Adapter Decision

Alignment anchors

- PI execution plan: [./PI_EXECUTION_PLAN.md](./PI_EXECUTION_PLAN.md)
- Data source comparison: [./DATA_SOURCE_COMPARISON_MATRIX.md](./DATA_SOURCE_COMPARISON_MATRIX.md)
- First adapter decision: [./FIRST_ADAPTER_DECISION.md](./FIRST_ADAPTER_DECISION.md)
- Public-data readiness: [./PUBLIC_DATA_READINESS.md](./PUBLIC_DATA_READINESS.md)

Status: `planned`

## Decision

Cosmic Forge should implement `IRSA` as the second adapter family after `Legacy Surveys / NOIRLab`.

Within `IRSA`, the first implementation should target `AllWISE`.

`2MASS` should follow as the next IRSA-backed implementation once the shared IRSA adapter contract is stable.

## Why IRSA is the right second adapter family

IRSA is the strongest follow-on source family because it gives Forge:

- official NASA/IPAC archive-backed image access
- a strong API-oriented integration surface
- broad long-term mission coverage
- an infrared complement to the first optical-heavy adapter path

That makes IRSA the right place to prove that Forge can move beyond a single archive without changing its queue, provenance, and artifact model.

## Why AllWISE should be first inside IRSA

### Best complement to the Legacy Surveys first slice

Legacy Surveys gives Forge a strong optical preview path.

`AllWISE` is the better first IRSA pairing because it adds a clear mid-infrared comparison layer rather than another optical-adjacent source.

This makes the second adapter more product-distinct and more useful in demos, operator workflows, and provenance-rich result comparisons.

### Cleaner first IRSA story

IRSA supports many collections, which is useful long-term but adds choice pressure early.

`AllWISE` is a better first IRSA choice because:

- IRSA documents a concrete `AllWISE Atlas` discovery flow via `SIA v2`
- the four atlas bands `W1`, `W2`, `W3`, and `W4` are straightforward to expose in the first adapter UI and API
- cutout retrieval can follow a stable pattern using IRSA `IBE` cutout URLs

This makes `AllWISE` a cleaner first IRSA target than starting with a broader or more mixed collection strategy.

### Better sequence for product learning

`2MASS` remains important, but it is better as the next step after the first IRSA slice because:

- the shared IRSA adapter seam will already exist
- the product team will already have learned how to represent IRSA-specific provenance
- the UI will already have the pattern for banded infrared archive outputs

That makes the sequence:

1. `Legacy Surveys / NOIRLab`
2. `IRSA / AllWISE`
3. `IRSA / 2MASS`

## Recommended implementation posture

- use `SIA v2` for image discovery and metadata lookup
- use direct `IBE` cutout URLs for job retrieval once the archive URL is known
- keep the browser-oriented IRSA cutout and WISE image-service flows as manual/operator references, not the main Forge automation path
- keep the IRSA adapter contract generic enough that `AllWISE` and `2MASS` can share it without GraphQL contract churn

## Provenance requirements for IRSA-backed results

An IRSA-backed result should capture at least:

- provider name
- mission family
- collection / dataset identifier
- requested target name if provided
- resolved `ra` / `dec`
- requested band identifier
- requested cutout geometry
- retrieval path type
- authoritative source URL
- output format
- returned archive metadata needed for reproducibility
- access timestamp
- applicable dataset DOI and citation reference
- any Forge-side transform chain

## Citation posture

Forge should treat IRSA attribution as result-level provenance, not a generic footer note.

That means:

- include the general IRSA archive acknowledgment when IRSA services are used
- include the mission-specific acknowledgment for the actual data set
- store the applicable canonical paper or DOI alongside the result metadata where available

## What this means for the next implementation step

- add an IRSA adapter interface that supports archive discovery plus cutout retrieval
- implement the first IRSA slice against `AllWISE`
- shape the GraphQL and frontend request model so `band`, `collection`, and cutout geometry are explicit
- preserve a clean seam for `2MASS` without changing the outer queue model

## Inference note

The recommendation to start IRSA with `AllWISE` before `2MASS` is an implementation decision derived from the official archive capabilities and Cosmic Forge product goals.

It is not a claim that IRSA requires one mission to be used before the other.

## Official references

- [IRSA Image APIs](https://irsa.ipac.caltech.edu/docs/program_interface/api_images.html)
- [IRSA image cutouts application](https://irsa.ipac.caltech.edu/applications/Cutouts/)
- [IRSA image server cutouts](https://irsa.ipac.caltech.edu/ibe/cutouts.html)
- [WISE mission page](https://irsa.ipac.caltech.edu/Missions/wise.html)
- [2MASS mission page](https://irsa.ipac.caltech.edu/Missions/2mass.html)
- [IRSA acknowledgment guidance](https://irsa.ipac.caltech.edu/ack.html)
