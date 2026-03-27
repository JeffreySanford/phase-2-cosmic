# Public Data Readiness

Alignment anchors

- Existing viewer groundwork: [../viewer/VIEWER_MODEB.md](../viewer/VIEWER_MODEB.md)
- Source contract: [../viewer/VIEWER_SOURCE_CONTRACT.md](../viewer/VIEWER_SOURCE_CONTRACT.md)
- Public-source inventory: [../public-data/PUBLIC_DATA_RESOURCES.md](../public-data/PUBLIC_DATA_RESOURCES.md)
- VO integration: [../data/VO_INTEGRATION.md](../data/VO_INTEGRATION.md)

Status: `planned`

## Direct answer

Do we have enough public data to assemble real images yet?

Qualified answer: yes.

We already have enough public data to build a real image-oriented application around:

- public survey imagery
- HiPS navigation layers
- cutout retrieval
- FITS-linked artifacts
- overlays and metadata panels
- provenance and source attribution

That answer is already supported by the repo's current viewer and public-data research, which explicitly identifies VLASS HiPS/basic products, NVAS, NRAO TAP metadata, and VO-linked product discovery as near-term usable sources.

## What is realistic now

The current repo evidence supports a public-data-first image platform now:

- `VLASS` public data pages expose basic products, enhanced products, weblogs, and interactive HiPS imagery
- the current viewer strategy already treats `VLASS` HiPS/basic products as the best near-term public source for progressive zoom behavior
- the public-data inventory already recommends VLASS HiPS and NVAS as low-friction viewer seed data
- the VO integration docs already describe TAP/DataLink/VOTable flows for product discovery and FITS-oriented outputs

Practical v1 outcomes that are realistic now:

- target-centered sky navigation
- survey cutout requests
- preview image generation
- FITS download metadata
- public-source-backed overlays
- provenance capture for where an image came from and how it was transformed

## What is not realistic as v1

Enough public image data does not mean "we should build the whole raw radio imaging chain ourselves" as the first iteration.

Not sensible for v1:

- full VLASS/VLA raw-visibility calibration and imaging
- science-grade deconvolution pipelines
- in-browser reconstruction from raw interferometric measurements
- claiming equivalence to archive or observatory reduction systems

Those are later research tracks, not the sensible product entry point.

## Public-data categories

### Ready now

- public HiPS imagery for sky browsing
- public basic/enhanced image products
- public archive metadata via TAP/VO
- historical public image sources for fallback and demos
- catalog overlays and annotation sources

### Later or heavier

- large-scale archive harvesting
- raw visibility ingest workflows
- calibration-heavy processing
- native image-processing acceleration on large local caches

## Current public-service reality

The current repo documentation already references the main public-source classes Cosmic Forge would need:

- NRAO/VLASS public landing and data pages
- VLASS interactive HiPS imagery
- NRAO archive and TAP/VO discovery surfaces
- NVAS historical public image content

This repo also already assumes Aladin/HiPS integration in the viewer track and explicitly calls for FITS-aware cutout and product handling in VO-oriented workflows.

Inference from those existing sources and docs:

- public imagery and product metadata are sufficient to build a genuine image workbench
- the missing piece is product orchestration and state management, not raw data existence

## Product consequence

Cosmic Forge should treat public data as the starting line, not as a stopgap.

That means:

- use public survey products for v1
- capture provenance and source metadata rigorously
- keep a clean seam for later heavier processing
- do not anchor v1 success criteria to raw interferometric imaging

## Decision

Public data is sufficient now for:

- real image products
- real image-oriented UX
- real cutout/composite orchestration
- real provenance-aware operator workflows

Public data is not sufficient grounds for making raw radio full-pipeline imaging the v1 goal.
