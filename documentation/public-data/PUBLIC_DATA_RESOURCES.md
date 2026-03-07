# Public Data Resources for ETL, Ingest, Viewer, and Reference Work

Last reviewed: 2026-03-06

<!-- markdownlint-disable MD060 -->

This file lists public data sources from `data.gov`, `NSF`, `NIST`, `NRAO`, and `VLA` that are likely useful for this system's ETL, ingest, viewer, metadata enrichment, calibration, and validation workflows.

## Recommended first targets

These are the strongest near-term candidates if the goal is to stand up a realistic ingestion and viewer pipeline quickly:

| Priority | Resource                                              | Why it is a good fit                                                                                 |
| --- | --- | --- |
| 1        | NRAO Data Archive (`data.nrao.edu`)                   | Core archive for raw and derived radio astronomy data, with image viewing and downloadable products. |
| 2        | NRAO TAP metadata service (`data-query.nrao.edu/tap`) | Best option for repeatable scripted ETL of archive metadata before bulk download.                    |
| 3        | VLASS basic products and HiPS imagery                 | Good viewer seed data because the products are already tiled, image-oriented, and public-facing.     |
| 4        | `data.gov` NVSS and VLSSr catalogs                    | Good catalog-scale sources for ingest, search, crossmatch, and test fixtures.                        |
| 5        | VLA calibrator and flux-history pages                 | Useful for calibration reference overlays, QA, and observer-facing tooling.                          |

## data.gov

## Public API

The governance service now exposes an HTTP endpoint for retrieving the curated set of public
sources described in this file. A simple `GET /api/v1/public-sources` returns an array of
objects with `name` and `url` fields, e.g. the NRAO TAP service, VLASS HiPS imagery, and
`data.gov` catalog entries. This API is used by front‑end components when they need to
dynamically populate dropdowns or help text with approved source links.

| Resource                                                  | URL                                                                                  | What it provides                                                                                                             | Likely system use                                                                              |
| --- | --- | --- | --- |
| NRAO VLA Sky Survey Catalog (NVSS)                        | <https://catalog.data.gov/dataset/nrao-vla-sky-survey-catalog>                       | Public catalog for the 1.4 GHz NVSS survey, including nearly 2 million discrete radio sources and associated image products. | Bootstrap catalog ingest, sky search, cone search, crossmatch testing, viewer overlays.        |
| VLA Low-Frequency Sky Survey Redux Source Catalog (VLSSr) | <https://catalog.data.gov/dataset/vla-low-frequency-sky-survey-redux-source-catalog> | Public low-frequency counterpart to NVSS at about 74 MHz / 73.8 MHz with source catalog and supporting files.                | Multi-frequency crossmatch, spectral index pipelines, low-frequency ingest validation.         |
| All-Sky Optical Catalog of Radio/X-Ray Sources (QORG)     | <https://catalog.data.gov/dataset/all-sky-optical-catalog-of-radio-x-ray-sources>    | Cross-domain catalog linking radio and X-ray associations with optical objects, including NVSS/FIRST/SUMSS references.       | Entity enrichment, source association workflows, viewer annotation, search federation testing. |

Notes:

- `data.gov` is best used here as a catalog discovery and acquisition layer rather than as the main operational archive.
- These entries are good for structured ETL because they are already published as public datasets with stable landing pages and metadata.

## NSF

| Resource                           | URL                                                                          | What it provides                                                                                                                     | Likely system use                                                                            |
| --- | --- | --- | --- |
| NSF Developer Resources            | <https://www.nsf.gov/digital/developer>                                      | Official index of NSF developer-facing data resources. Links to the Award Search API and NSF data on `data.gov`.                     | Starting point for programmatic ingest of NSF metadata and future data discovery.            |
| Award Search API                   | <https://www.research.gov/common/webapi/awardapisearch-v1.htm>               | API for NSF award metadata, principal investigators, institutions, funding, dates, abstracts, and outcomes context.                  | ETL for grant provenance, project lineage, award-to-dataset joins, analytics dashboards.     |
| Open Data at NSF                   | <https://www.nsf.gov/digital/data>                                           | Official NSF open-data page linking the award abstracts database, public data inventory JSON, NCSES, PAR, and other agency datasets. | Governance metadata, inventory harvesting, link validation, data catalog seeding.            |
| NSF Public Data Inventory (JSON)   | <https://nsf-gov-resources.nsf.gov/e-gov/data/inventory/json/inventory.json> | Machine-readable inventory of NSF public data assets.                                                                                | Automated source registration, data catalog sync, ingestion planning.                        |
| NSF Public Access Repository (PAR) | <https://par.nsf.gov/>                                                       | Public repository for peer-reviewed articles and conference papers from NSF-funded investigators.                                    | Publication enrichment, provenance graphing, linking science outputs to grants and datasets. |
| NCSES data portal                  | <https://ncses.nsf.gov/explore-data>                                         | NSF statistical data on the science and engineering workforce, education, R&D, and funding.                                          | Executive metrics, contextual dashboards, benchmarking, policy-oriented analytics.           |

Notes:

- NSF content is more useful for provenance, grant metadata, publication linkage, and governance context than for primary sky-image ingestion.
- The `Award Search API` and the public inventory JSON are the most ETL-friendly NSF assets.

## NIST

| Resource                               | URL                                                                                                          | What it provides                                                                                                | Likely system use                                                                            |
| --- | --- | --- | --- |
| NIST data landing page                 | <https://www.nist.gov/data>                                                                                  | Official hub for NIST public data, including the Science Data Portal and Public Data Repository.                | Discovery layer for NIST machine-readable datasets and standards-oriented reference data.    |
| NIST Science Data Portal               | <https://data.nist.gov/sdp/>                                                                                 | Search and exploration portal across NIST public datasets and repository holdings.                              | External reference catalog ingest, standards lookup, reproducibility metadata.               |
| NIST Public Data Repository about page | <https://data.nist.gov/pdr/about>                                                                            | Explains repository capabilities, persistent identifiers, machine-readable access, and API/search support.      | Integration planning for DOI-backed reference datasets and metadata harvesting.              |
| Time Scale Data and Bulletin Archive   | <https://www.nist.gov/pml/time-and-frequency-division/time-realization/time-scale-data-and-bulletin-archive> | Monthly bulletins and archives for UTC(NIST), leap-second and UT1/UTC information, and related timing products. | Time synchronization validation, timestamp QA, observatory timing reference workflows.       |
| NIST Time Scale Data Archive           | <https://www.nist.gov/pml/time-and-frequency-division/time-services/nist-time-scale-data-archive>            | Historical NIST time-scale parameters and explanatory material for AT1 and UTC(NIST).                           | Long-horizon time-reference validation and historical timing analysis.                       |
| GPS Data Archive                       | <https://www.nist.gov/pml/time-and-frequency-division/services/gps-data-archive>                             | Archive for GPS satellite time and frequency status, updated every 10 minutes.                                  | External timing-health checks, timing-monitor demos, ingest of operational reference series. |

Notes:

- NIST is not a primary science archive for this project, but it is valuable for timing, standards, FAIR metadata practice, and traceability.
- The strongest immediate ETL use is operational reference data rather than large image or catalog ingest.

## NRAO

| Resource                                           | URL                                                                              | What it provides                                                                                                        | Likely system use                                                                                   |
| --- | --- | --- | --- |
| NRAO Data Archive                                  | <https://data.nrao.edu>                                                          | Primary archive for raw VLA, VLBA, GMVA, some GBT, and ALMA-served content, with project, observation, and image views. | Core ingest target for archive metadata, raw observations, calibrated measurement sets, and images. |
| NRAO archive documentation                         | <https://science.nrao.edu/facilities/vla/archive/index>                          | Current description of archive search, download flows, image viewing, formats, and archive organization.                | ETL design reference, downloader design, metadata model design, archive behavior validation.        |
| NRAO TAP service                                   | <https://data-query.nrao.edu/tap>                                                | Virtual Observatory Table Access Protocol endpoint for scripted metadata queries across archive holdings.               | Automated metadata harvest, scheduled ETL, source/position queries, downstream index building.      |
| Related guidance: see [VO Integration](../data/VO_INTEGRATION.md) for example TAP queries, VOTable parsing notes, and DataLink handling. |                                                                                      |                                                                                                                        |                                                                                                   |
| Scripted archive access guide                      | <https://science.nrao.edu/srdp/scripted-access-to-the-nrao-archive>              | Official guide for using the TAP interface, including useful returned columns and workflow notes.                       | Implementation reference for pyVO or TAP-based metadata ingestion.                                  |
| Science Reference Data Products (SRDP) for the VLA | <https://science.nrao.edu/srdp/science-reference-data-products-srdp-for-the-vla> | Quality-assessed calibration products, calibrated measurement sets, pipeline weblogs, and archive images.               | Faster ingest path for viewer-ready products, QA workflows, calibration lineage capture.            |

Notes:

- As of the current archive documentation reviewed on 2026-03-06, raw VLA data are ingested immediately and the archive exposes project, observation, and image views.
- The archive docs also indicate a current 2-year proprietary period for VLA SRDP/archive data, so the ETL should explicitly distinguish public vs proprietary-access paths.

## VLA

| Resource                            | URL                                                    | What it provides                                                                                                  | Likely system use                                                                              |
| --- | --- | --- | --- |
| VLA Sky Survey (VLASS)              | <https://science.nrao.edu/vlass>                       | Top-level landing page for the modern VLA sky survey, including current campaign context and product links.       | Survey discovery, viewer framing, roadmap for public image products.                           |
| VLASS data page                     | <https://science.nrao.edu/vlass/vlass-data>            | Links to tile definitions, observing status, basic products, enhanced products, weblogs, and interactive imagery. | Product harvesting, survey-tile metadata ETL, viewer navigation model.                         |
| VLASS HiPS imagery                  | <https://vlass-dl.nrao.edu>                            | Interactive HiPS and Aladin Lite compatible survey imagery for large-sky browsing.                                | Immediate viewer prototype data source, tiled image exploration, progressive rendering.        |
| VLA Archive Imaging Pilot (NVAS)    | <https://www.vla.nrao.edu/astro/nvas/>                 | Historical VLA image access, browseable archive outputs, project coverage, and downloadable images.               | Historical viewer content, image backfill, archive-testing fixtures, browse experience ideas.  |
| VLA calibrator SED and flux history | <https://www.vla.nrao.edu/astro/calib/vlacal/cal_mon/> | Calibrator mining outputs from the VLA CASA pipeline with source-specific spectral and time-series views.         | Calibration reference overlays, QA checks, calibrator trend inspection, expert-facing tooling. |
| VLA tip-curve data                  | <https://www.vla.nrao.edu/astro/calib/tipper/>         | Atmospheric opacity and system-temperature related calibration products.                                          | Environment/correction overlays, calibration QA, observatory-condition context.                |

Notes:

- VLASS and NVAS are especially useful for viewer work because they already expose image-like, navigable products.
- The calibrator and tipper resources are better suited to specialist views, QA panels, and provenance overlays than to general public browsing.

## Suggested ETL split

| Pipeline area                  | Best source candidates                                           |
| --- | --- |
| Catalog ingest                 | `data.gov` NVSS, VLSSr, QORG                                     |
| Archive metadata ingest        | NRAO TAP service, NRAO archive docs, VLASS tile/status pages     |
| Raw science data ingest        | NRAO Data Archive                                                |
| Viewer imagery                 | VLASS HiPS, VLASS basic products, NVAS historical images         |
| Calibration/reference ingest   | VLA calibrator flux history, VLA tipper data, NRAO SRDP products |
| Provenance and governance      | NSF Award Search API, NSF PAR, NSF public data inventory         |
| Timing and external validation | NIST time-scale archive, UTC(NIST) bulletins, GPS Data Archive   |

## Implementation notes

1. Start with metadata-first ETL against `https://data-query.nrao.edu/tap` before attempting large archive downloads.
2. Use VLASS HiPS and NVAS as low-friction viewer seed data while the deeper archive ingest path is being built.
3. Treat NSF and NIST as supporting systems for provenance, timing, and governance rather than as the primary sky-data backbone.
4. Model source records separately from observation records, image products, calibration products, publications, and grant metadata.
5. Preserve original landing-page URLs and dataset identifiers in the ingest layer so the viewer can always link back to the authoritative source.

## Viewer Mode B alignment

The public-data plan aligns well with Viewer Mode B:

- `VLASS` HiPS/basic products are the best near-term public image source for progressive zoom behavior.
- `NVAS` is a useful historical fallback image source for demos, regression tests, and alternate deep-zoom paths.
- NRAO TAP metadata can support target-aware overlays and viewer context before full archive product ingest is complete.
- `data.gov` catalogs such as `NVSS`, `VLSSr`, and `QORG` can support catalog overlays and source annotations.

Recommended viewer-citation rule:

- When public imagery, catalogs, or metadata are presented in the UI, show the authoritative source in subdued small text when layout permits.
- If a compact surface cannot support the citation inline, preserve the source URL/identifier in the object, layer, or detail metadata.

## Source pages used for this inventory

- <https://catalog.data.gov/dataset/nrao-vla-sky-survey-catalog>
- <https://catalog.data.gov/dataset/vla-low-frequency-sky-survey-redux-source-catalog>
- <https://catalog.data.gov/dataset/all-sky-optical-catalog-of-radio-x-ray-sources>
- <https://www.nsf.gov/digital/developer>
- <https://www.nsf.gov/digital/data>
- <https://par.nsf.gov/>
- <https://ncses.nsf.gov/explore-data>
- <https://www.nist.gov/data>
- <https://data.nist.gov/pdr/about>
- <https://www.nist.gov/pml/time-and-frequency-division/time-realization/time-scale-data-and-bulletin-archive>
- <https://www.nist.gov/pml/time-and-frequency-division/time-services/nist-time-scale-data-archive>
- <https://www.nist.gov/pml/time-and-frequency-division/services/gps-data-archive>
- <https://science.nrao.edu/facilities/vla/archive/index>
- <https://science.nrao.edu/srdp/scripted-access-to-the-nrao-archive>
- <https://science.nrao.edu/srdp/science-reference-data-products-srdp-for-the-vla>
- <https://science.nrao.edu/vlass>
- <https://science.nrao.edu/vlass/vlass-data>
- <https://vlass-dl.nrao.edu>
- <https://www.vla.nrao.edu/astro/nvas/>
- <https://www.vla.nrao.edu/astro/calib/vlacal/cal_mon/>
- <https://www.vla.nrao.edu/astro/calib/tipper/>
