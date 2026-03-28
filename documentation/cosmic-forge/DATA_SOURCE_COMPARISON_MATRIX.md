# Data Source Comparison Matrix

Alignment anchors

- PI execution plan: [./PI_EXECUTION_PLAN.md](./PI_EXECUTION_PLAN.md)
- Product scope: [./PRODUCT_BLUEPRINT.md](./PRODUCT_BLUEPRINT.md)
- Public-data readiness: [./PUBLIC_DATA_READINESS.md](./PUBLIC_DATA_READINESS.md)

Status: `planned`

## Purpose

This document compares the most relevant official external archives and agencies for Cosmic Forge.

It is meant to support one decision:

Which sources should Cosmic Forge implement first for real image cutouts, preview generation, provenance, and operator-facing reliability?

## Scoring model

Scoring scale: `1` low fit, `3` moderate fit, `5` strong fit

Categories:

- `Cutout Fit` - how directly the source supports Forge-style cutout retrieval
- `Preview Fit` - how well the source supports quick preview imagery
- `Metadata/Prov` - how well provenance and source attribution can be preserved
- `API Ergonomics` - how practical the source is for programmatic integration
- `Reliability/Fit` - how appropriate the source is for early production use in this PI

Total score is directional, not absolute.

## Matrix

| Source | Agency / Operator | Main strengths | Main cautions | Cutout Fit | Preview Fit | Metadata / Prov | API Ergonomics | Reliability / Fit | Total |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| [Legacy Surveys / NOIRLab](https://www.legacysurvey.org/viewer) | NSF NOIRLab | Direct optical cutouts, viewer-friendly outputs, strong first-adapter fit | Optical-focused rather than broad mission coverage | 5 | 5 | 4 | 4 | 5 | 23 |
| [IRSA](https://irsa.ipac.caltech.edu/docs/program_interface/api_images.html) | NASA/IPAC Caltech | Strong API model, infrared collections, broad mission value | Collection-specific differences require adapter discipline | 5 | 4 | 5 | 5 | 5 | 24 |
| [SkyView](https://skyview.gsfc.nasa.gov/current/docs/availability.html) | NASA GSFC | Multi-survey discovery and quick-look generation | Output may be less archive-native than mission-specific services | 3 | 5 | 3 | 3 | 3 | 17 |
| [ESASky](https://open.esa.int/esasky/) | ESA / ESAC | Excellent discovery story, HiPS-friendly previewing, broad mission surface | Better for exploration than first-wave authoritative cutout production | 3 | 5 | 4 | 3 | 3 | 18 |
| [Pan-STARRS / STScI](https://outerspace.stsci.edu/display/PANSTARRS/) | STScI / MAST | Strong optical archive and cutout path, good comparison source | Some overlap with Legacy Surveys for early PI priorities | 4 | 4 | 4 | 4 | 4 | 20 |

## Recommended implementation order

### First production adapter

`IRSA` or `Legacy Surveys / NOIRLab`

Decision guidance:

- Choose `Legacy Surveys / NOIRLab` first if the primary goal is fast visual success in the Forge workbench with strong optical previews.
- Choose `IRSA` first if the primary goal is a more general-purpose archive/API foundation with stronger collection breadth and provenance discipline.

### Second adapter

Whichever of `IRSA` or `Legacy Surveys / NOIRLab` was not chosen first.

This gives Forge one optical-forward source and one broader archive/API-oriented source family early in the PI.

### Discovery / comparison sources

- `SkyView`
- `ESASky`

These are useful for preview/discovery/comparison workflows, but they should not displace a stronger archive-native first adapter.

### Follow-on optical source

- `Pan-STARRS / STScI`

This is a good follow-on source after the first optical adapter is stable.

## Recommended source roles in Cosmic Forge

### Legacy Surveys / NOIRLab

- first-wave optical cutout source
- fast preview generation
- operator-visible visual comparison baseline

Official references:

- [Legacy Surveys viewer](https://www.legacysurvey.org/viewer)
- [NOIRLab Data Lab Legacy Surveys](https://datalab.noirlab.edu/data/legacy-surveys)
- [NOIRLab image cutout documentation](https://datalab.noirlab.edu/docs/manual/UsingAstroDataLab/WebPortal/DataExplorer/ImageSearchCutout/ImageSearchCutout.html)

### IRSA

- first-wave or second-wave archive adapter
- WISE / 2MASS / infrared-oriented image products
- stronger generalized API pattern for long-term adapter design

Official references:

- [IRSA Image APIs](https://irsa.ipac.caltech.edu/docs/program_interface/api_images.html)
- [IRSA cutouts application](https://irsa.ipac.caltech.edu/applications/Cutouts/)
- [IRSA image cutout service](https://irsa.ipac.caltech.edu/ibe/cutouts.html)

### SkyView

- quick-look discovery
- cross-survey comparison
- optional derived preview generation
- fallback imagery when archive-native cutouts are unavailable or unsuitable

Official references:

- [SkyView survey availability](https://skyview.gsfc.nasa.gov/current/docs/availability.html)
- [SkyView in a Jar](https://skyview.gsfc.nasa.gov/jar/skyviewinajar.html)

Recommended posture:

- treat SkyView as a derived-image and comparison source, not as the first archive-native production adapter

### ESASky

- sky discovery
- HiPS-driven exploration
- mission-breadth enrichment for viewer-facing flows
- EDDIE-generated preview images for viewer workflows

Official references:

- [ESASky overview](https://open.esa.int/esasky/)
- [ESASky skies and HiPS information](https://www.cosmos.esa.int/web/esdc/esasky-skies)
- [ESASky cutout help](https://sky.esa.int/esasky/hipsCutout/help.html)

Recommended posture:

- treat ESASky as a HiPS/discovery and preview adapter
- label HiPS/EDDIE outputs as visualization-oriented derived products
- keep mission-native science downloads separate from HiPS-generated preview artifacts

### Pan-STARRS / STScI

- follow-on optical source
- validation/comparison path versus Legacy Surveys
- additional archive-backed cutout coverage
- post-PI optical extension rather than a first-wave replacement for Legacy

Official references:

- [Pan-STARRS archive overview](https://outerspace.stsci.edu/display/PANSTARRS/)
- [How to retrieve and use PS1 data](https://outerspace.stsci.edu/display/PANSTARRS/How%2Bto%2Bretrieve%2Band%2Buse%2BPS1%2Bdata)
- [PS1 Image Cutout Service](https://outerspace.stsci.edu/display/PANSTARRS/PS1%2BImage%2BCutout%2BService)

Recommended posture:

- treat Pan-STARRS as an archive-native optical comparison adapter after Legacy is stable
- use it for same-target cutout comparison against Legacy Surveys
- keep its STScI/MAST acknowledgement and provenance separate from Legacy results

## Recommended decision checkpoint

Before Sprint 5 implementation begins:

- [ ] Choose the first production adapter.
- [ ] Choose the second adapter family.
- [ ] Mark discovery-only sources separately from archive-native production sources.
- [ ] Record any source-specific provenance requirements in `PI_EXECUTION_PLAN.md`.
- [ ] Update `PRODUCT_BLUEPRINT.md` if source choices materially change MVP scope.
