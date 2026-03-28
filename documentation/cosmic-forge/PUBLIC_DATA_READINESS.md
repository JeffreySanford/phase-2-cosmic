# Public Data Readiness

Alignment anchors

- Existing viewer groundwork: [../viewer/VIEWER_MODEB.md](../viewer/VIEWER_MODEB.md)
- Source contract: [../viewer/VIEWER_SOURCE_CONTRACT.md](../viewer/VIEWER_SOURCE_CONTRACT.md)
- Public-source inventory: [../public-data/PUBLIC_DATA_RESOURCES.md](../public-data/PUBLIC_DATA_RESOURCES.md)
- VO integration: [../data/VO_INTEGRATION.md](../data/VO_INTEGRATION.md)

Status: `implemented_for_v1_sources`

## Direct answer

Do we have enough public data to assemble real images and preview workflows yet?

Qualified answer: yes.

The branch now proves that answer with live provider-backed Forge adapters for:

- `Legacy Surveys / NOIRLab` archive-native optical cutouts
- `IRSA AllWISE` archive-native infrared cutouts with cached FITS-backed previews
- `Pan-STARRS / STScI` archive-native optical cutouts as a second optical comparison path
- `SkyView Explorer` derived-preview comparison output
- additional `SkyView`-derived named presets:
  - `DSS2 Preview`
  - `FIRST Preview`
  - `2MASS J Preview`
  - `2MASS H Preview`
  - `2MASS K Preview`

We also have enough public data to keep building around:

- public survey imagery
- HiPS navigation layers
- cutout retrieval
- FITS-linked artifacts
- overlays and metadata panels
- provenance and source attribution

That answer is no longer just a research conclusion. It is now partially implemented in Cosmic Forge through real upstream archive usage and persisted provenance.

## What is realistic now

The current repo evidence and implementation support a public-data-first image platform now:

- `Legacy Surveys / NOIRLab` is live in Forge for archive-native optical cutouts
- `IRSA AllWISE` is live in Forge for archive-native infrared retrieval with IBE-backed FITS artifacts
- `Pan-STARRS / STScI` is live in Forge for archive-native optical comparison cutouts
- `SkyView` is live in Forge as a derived-preview comparison path, with additional named quick-look presets for optical, radio, and infrared browsing
- `ESASky` remains documented and queued as the next discovery/HiPS-focused extension
- the broader repo still contains VLASS HiPS/basic product, NVAS, and VO-oriented groundwork for later expansion

Practical v1 outcomes that are realistic now:

- target-centered sky navigation
- survey cutout requests
- preview image generation
- FITS-to-preview prerendering through the Go renderer seam
- FITS download metadata
- public-source-backed overlays
- provenance capture for where an image came from and how it was transformed
- adapter-specific upstream error classification and retry posture

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

- public archive-native cutouts from implemented providers
- public HiPS or derived-preview imagery for browsing and comparison
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

The current repo documentation and code now reference the main public-source classes Cosmic Forge needs:

- NOIRLab Legacy Surveys cutout flows
- IRSA SIA and IBE retrieval flows
- SkyView quick-look image generation
- NRAO/VLASS public landing and data pages
- VLASS interactive HiPS imagery
- NRAO archive and TAP/VO discovery surfaces
- NVAS historical public image content

This repo also already assumes Aladin/HiPS integration in the viewer track and explicitly calls for FITS-aware cutout and product handling in VO-oriented workflows.

Inference from those existing sources and docs:

- public imagery and product metadata are sufficient to build a genuine image workbench
- the implemented Forge branch confirms that the main risk is orchestration and provider hardening, not raw data existence

## Product consequence

Cosmic Forge should treat public data as the starting line, not as a stopgap.

That means:

- use public survey products for v1
- capture provenance and source metadata rigorously
- classify upstream archive failures explicitly instead of collapsing them into generic internal errors
- keep a clean seam for later heavier processing
- do not anchor v1 success criteria to raw interferometric imaging

## Decision

Public data is sufficient now for:

- real image products
- real image-oriented UX
- real cutout/composite orchestration
- real provenance-aware operator workflows

Current caveat:

- public data is sufficient for the current operator workbench, but each provider still needs its own availability, timeout, and bad-response handling because public archive behavior is not uniform

Public data is not sufficient grounds for making raw radio full-pipeline imaging the v1 goal.
