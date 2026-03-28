# ESASky Adapter Decision

Alignment anchors

- PI execution plan: [./PI_EXECUTION_PLAN.md](./PI_EXECUTION_PLAN.md)
- Data source comparison matrix: [./DATA_SOURCE_COMPARISON_MATRIX.md](./DATA_SOURCE_COMPARISON_MATRIX.md)
- Product scope: [./PRODUCT_BLUEPRINT.md](./PRODUCT_BLUEPRINT.md)

Status: `planned`

## Decision

`ESASky` should be used in Cosmic Forge as a discovery and HiPS-preview adapter, not as a first-wave archive-native science-cutout adapter.

## Why this is the right role

ESASky is strong where Forge needs broad sky exploration:

- cross-mission discovery
- viewer-facing HiPS browsing
- mission-breadth enrichment
- high-resolution generated preview images through the EDDIE cutout service

It is weaker as the first authoritative science-cutout path because its HiPS outputs are explicitly visualization-oriented and can involve derived products rather than archive-native mission files.

## Product posture for Forge

### Use ESASky for

- survey discovery across ESA mission families
- viewer-facing preview generation
- HiPS-backed quick-look imagery
- operator comparison workflows when a broad mission view is more important than archive-native retrieval fidelity

### Do not use ESASky as

- the first production archive-native cutout adapter
- the sole source of science-ready product delivery when mission-native FITS products are required
- a replacement for direct archive-native providers such as Legacy Surveys or IRSA

## Science-readiness interpretation

Official ESASky material says two things that matter for Forge:

- ESASky provides access to science-ready mission images and catalogues through the portal.
- ESASky HiPS layers are intended for visualization only and should not be treated as science-ready analysis products.

That means Forge should separate two ESASky modes:

- `HiPS visualization output`
  - derived preview image
  - appropriate for exploration, comparison, and viewer workflows
  - not appropriate to represent as mission-native science data
- `mission-grade downloadable product`
  - direct downloadable mission data when ESASky exposes the underlying science-ready product
  - should remain distinct from generated HiPS cutouts in naming, provenance, and artifact handling

## EDDIE cutout service fit

The official EDDIE help makes ESASky a good candidate for preview generation:

- target plus `fov` cutouts are supported
- polygon cutouts are supported
- `hips` selects the HiPS source
- `proj` selects the projection
- `fmt` supports `PNG`, `JPG`, and `JPEG`
- `size` defaults to `1024` and currently supports up to `8192`
- `norder` can be set explicitly or chosen automatically

This is a strong fit for Forge preview artifacts, not for pretending the artifact is a mission-native cutout by default.

## Provenance requirements

Required ESASky provenance fields:

- provider name: `ESA ESASky`
- output class: `esasky-derived-preview` or `esasky-mission-download`
- `surveyId` / HiPS source identifier
- HiPS source URL if available
- requested target name if provided
- resolved `ra` / `dec` when target coordinates are used
- requested `fov`
- requested or derived projection
- requested image `size`
- output format
- `norder` if specified or returned
- retrieval endpoint type: `esasky-eddie` or mission-download path
- science-readiness caveat:
  - `visualization-only` for HiPS-derived outputs
  - `mission-native` only when the downloadable product is the underlying science file
- access timestamp
- transform chain used by Forge

## Recommended implementation posture

- implement ESASky after Legacy, IRSA, and SkyView
- first implementation should be a preview-only adapter using EDDIE-generated images
- label ESASky HiPS results as derived previews in the Forge UI
- preserve a future seam for mission-native download handling, separate from HiPS preview generation

## Recommended Forge wording

Use wording like:

- `ESASky derived preview`
- `HiPS visualization`
- `visualization-only output`

Avoid wording like:

- `science-ready cutout`
- `archive-native mission cutout`

unless the artifact is actually the underlying mission product and not an EDDIE/HiPS-generated image.

## Official references

- ESASky overview: https://open.esa.int/esasky/
- ESASky HiPS information: https://www.cosmos.esa.int/web/esdc/esasky-skies
- ESASky EDDIE cutout help: https://sky.esa.int/esasky/hipsCutout/help.html
