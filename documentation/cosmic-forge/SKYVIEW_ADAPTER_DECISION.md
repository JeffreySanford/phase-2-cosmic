# SkyView Adapter Decision

Alignment anchors

- PI execution plan: [./PI_EXECUTION_PLAN.md](./PI_EXECUTION_PLAN.md)
- Data source comparison: [./DATA_SOURCE_COMPARISON_MATRIX.md](./DATA_SOURCE_COMPARISON_MATRIX.md)
- Architecture: [./ARCHITECTURE.md](./ARCHITECTURE.md)

Status: `in_progress`

## Decision

`SkyView` should be used as a fallback or comparison adapter, not as a first-wave archive-native production adapter.

## Why this is the right role

SkyView is a strong fit for:

- multi-survey discovery
- quick-look image generation
- cross-survey comparison when archive-native cutouts are inconsistent
- derived mosaics and preview-oriented outputs

SkyView is a weaker fit for:

- authoritative archive-native cutout provenance
- strict first-choice production retrieval when an official survey-specific adapter already exists

## Evidence from the official SkyView documentation

- The survey availability page states that most data are local, but some surveys require remote transfer from upstream servers and that failures occur when those transfers are interrupted.
- The SkyView-in-a-Jar documentation describes SkyView as a geometry engine that generates a new image in user-specified geometry from one or more existing survey images.
- The same documentation explains that SkyView supports post-processing steps such as de-edging, scaling, graphics generation, and RGB composition.
- The SIA notes describe the SkyView SIA path as returning URLs that invoke regular SkyView queries when survey overlap exists.

## Recommended product posture for Forge

- Keep `Legacy Surveys / NOIRLab` and `IRSA` as the archive-native adapter families.
- Position `SkyView` as a derived-image provider for preview, comparison, and fallback generation.
- Do not let SkyView provenance masquerade as an archive-native cutout from the underlying source survey.
- Use SkyView when the operator explicitly wants:
  - cross-survey quicklooks
  - RGB or composite preview generation
  - a comparison image when a mission-native adapter is unavailable or unsuitable

## Reliability tradeoffs

- Some SkyView survey requests depend on remote upstream transfers rather than only local hosting.
- Remote transfer interruptions can cause query failure even when Forge itself is healthy.
- Because SkyView generates a new output image from one or more upstream images, the result should be treated as a SkyView-produced derivative, not a raw provider-native artifact.

## Provenance rules if adopted

SkyView-backed results should include at least:

- provider name: `NASA GSFC SkyView`
- source survey identifier as requested in SkyView
- requested target name if provided
- resolved `ra` / `dec`
- requested field of view or geometry
- projection
- scaling mode if graphics output is generated
- output format
- authoritative SkyView request URL
- access timestamp
- transform chain including `skyview-derived-image`
- a clear marker that the artifact is `SkyView-generated`, not archive-native

## Recommended implementation order

- add SkyView only after Legacy and IRSA slices are stable
- implement it as a separate adapter class with explicit `derivedPreview` semantics
- keep its provenance schema distinct from archive-native cutout providers

## Official references

- [SkyView survey availability](https://skyview.gsfc.nasa.gov/current/docs/availability.html)
- [SkyView in a Jar / user guide](https://skyview.gsfc.nasa.gov/current/docs/skyviewinajar.html)
- [SkyView in a Jar / SIA notes](https://skyview.gsfc.nasa.gov/jar/skyviewinajar.html)
