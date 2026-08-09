# Public dataset scan for Lakehouse development

> Status: **PR40 planning evidence**
> Reviewed: **2026-08-08**
> Scope: public astronomy datasets and archive surfaces that can support Lakehouse development without relying on academic-only, proprietary, or live operational records.

## What this adds

The existing Lakehouse documentation already identifies ESO TAP/ObsCore, NRAO/VLA/VLASS, CADC/CAOM, ngVLA simulation output, and deterministic replay/generator data as the first source strategy.

This scan expands the candidate public-source catalog for PR40 and PR41 planning. It does not mean every source should become active by default. The right model is:

```text
public archive / catalog / preview release
              |
              v
source registry entry
              |
              v
included, excluded, sample-only, candidate, or disabled
              |
              v
bounded dev ingestion profile
              |
              v
Bronze source truth -> Silver canonical mapping -> Gold evidence
```

The Lakehouse should be able to keep an archive in the registry while excluding it from active records for size, access, stability, relevance, or cost reasons.

## Already represented in current Lakehouse docs

| Source                       | Current status                   | Notes                                                        |
| ---------------------------- | -------------------------------- | ------------------------------------------------------------ |
| ESO TAP / ObsCore            | Implemented PR40 proof source    | Active proof-only `/api/v1/lakehouse/metrics` evidence path. |
| NRAO archive / VLA / VLASS   | Planned domain-aligned profile   | Most important radio-astronomy validation target after ESO.  |
| CADC / CAOM                  | Planned interoperability profile | Useful for testing cross-provider mapping.                   |
| ngVLA simulation output      | Planned scientific-shape profile | Must be labeled as simulated.                                |
| Go generator / broker replay | Existing operational profile     | Useful for duplicates, timing, failure, and replay tests.    |

## Candidate public datasets not yet captured as active Lakehouse sources

### Priority A - adapter-ready catalog and metadata sources

These are good candidates for early source-registry entries because they expose structured metadata/catalog interfaces and can be queried in bounded development slices.

| Candidate                      | Official source                                                                                                  | Useful records                                                                  | Why it matters                                                              | Suggested default |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------- |
| MAST                           | <https://archive.stsci.edu/home>, <https://mast.stsci.edu/api/v0/>                                               | HST, JWST, spectra, catalogs, timeseries, publication records                   | Adds major NASA optical/UV/IR archive coverage and a programmatic API.      | `candidate`       |
| HEASARC / Xamin / Browse       | <https://heasarc.gsfc.nasa.gov/>, <https://heasarc.gsfc.nasa.gov/w3browse/>                                      | EUV, X-ray, gamma-ray, CMB mission metadata and catalogs                        | Adds high-energy astronomy coverage already hinted by frontend VO examples. | `candidate`       |
| IRSA / IPAC                    | <https://www.ipac.caltech.edu/project/irsa>, <https://irsa.ipac.caltech.edu/docs/program_interface/ztf_api.html> | Infrared/submillimeter mission products, ZTF image metadata, time-series access | Adds infrared and time-domain development sources.                          | `candidate`       |
| Gaia Archive                   | <https://gea.esac.esa.int/archive/>, <https://www.cosmos.esa.int/web/gaia-users/archive/writing-queries>         | Astrometry, photometry, source catalogs through ADQL/TAP-style access           | Excellent for canonical catalog/crossmatch tests.                           | `candidate`       |
| SDSS SkyServer / CAS / CasJobs | <https://www.sdss4.org/dr17/data_access/tools/>, <https://www.sdss.org/dr18/data_access/>                        | Imaging and spectroscopic catalog data                                          | Mature public catalog source with batch-query workflow.                     | `candidate`       |
| VizieR / TAPVizieR             | <https://vizier.cds.unistra.fr/>, <https://vizier.cds.unistra.fr/vizier/surveys.htx>                             | Published astronomical catalogs                                                 | Broad catalog interoperability and citation testing surface.                | `sample-only`     |
| SIMBAD                         | <https://simbad.u-strasbg.fr/>                                                                                   | Object identifiers, cross-identifications, bibliography, measurements           | Useful for catalog identity enrichment and crossmatch evidence.             | `sample-only`     |

### Priority B - image/archive and mission-specific development sources

These sources are valuable, but they should stay metadata-first unless a specific test needs bounded files. Large binary products should stay in authoritative archive/object storage and enter Lakehouse as references, checksums, access URLs, and quality/provenance records.

| Candidate                               | Official source                                                                                                                            | Useful records                                                | Why it matters                                                                   | Suggested default            |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------- |
| NOIRLab Astro Data Lab / Legacy Surveys | <https://datalab.noirlab.edu/data/legacy-surveys>, <https://www.legacysurvey.org/>                                                         | Legacy Surveys image metadata and Tractor catalogs            | Already relevant to Cosmic Forge planning; useful for optical survey metadata.   | `candidate`                  |
| ALMA Science Archive                    | <https://almascience.eso.org/alma-data>, <https://almascience.nrao.edu/alma-data/archive>                                                  | ALMA observation/project metadata and public science products | Important millimeter/submillimeter archive; good radio-adjacent validation.      | `candidate`                  |
| Chandra Data Archive                    | <https://cxc.harvard.edu/cda/>, <https://cda.harvard.edu/chaser/>, <https://heasarc.gsfc.nasa.gov/w3browse/chandra/chanmaster.html>        | Chandra observation metadata and contributed products         | High-energy observation metadata and archive-product references.                 | `candidate`                  |
| XMM-Newton Science Archive              | <https://www.cosmos.esa.int/web/xmm-newton/xsa>, <https://nxsa.esac.esa.int/>, <https://heasarc.gsfc.nasa.gov/docs/xmm/xmmhp_archive.html> | XMM observation and product metadata                          | Good high-energy companion to HEASARC/Chandra examples.                          | `candidate`                  |
| Rubin Data Preview releases             | <https://rubinobservatory.org/for-scientists/data-products/recent-data-releases>, <https://dp1.lsst.io/index.html>                         | Early image/catalog products and preview catalogs             | Valuable future-facing survey model, but preview access/stability needs caveats. | `sample-only` or `candidate` |
| Zwicky Transient Facility               | <https://www.ztf.caltech.edu/ztf-public-releases.html>, <https://irsa.ipac.caltech.edu/Missions/ztf.html>                                  | Public images, metadata, light curves, time-domain products   | Strong time-domain source for late-arrival/replay tests.                         | `candidate`                  |

### Priority C - supporting public-data references

The repository already has a broader public-data folder. These should be linked into the Lakehouse registry only when a concrete development fixture or validation story exists.

| Source class                                                 | Role                                                              | Suggested default                   |
| ------------------------------------------------------------ | ----------------------------------------------------------------- | ----------------------------------- |
| data.gov astronomy catalog listings                          | Discovery/reference support, not necessarily an ingestion source. | `excluded` until mapped             |
| NSF/NIST support datasets                                    | Policy, infrastructure, standards, and validation references.     | `excluded` or `reference-only`      |
| Static test fixtures derived from official archive responses | Offline repeatability and CI stability.                           | `included` for offline bundles only |

## Development bundle recommendations

| Bundle                | Included source families                                        | Purpose                                                                |
| --------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `core-proof`          | ESO ObsCore plus one NRAO/VLASS metadata profile when available | Keep the smallest honest evidence path green.                          |
| `multiwavelength-dev` | HEASARC/Chandra, MAST, IRSA/ZTF, XMM                            | Exercise cross-mission metadata and canonical observation mapping.     |
| `radio-domain`        | NRAO/VLASS, ALMA, NVSS/VLSSr-style references where available   | Keep Cosmic aligned with radio/ngVLA development goals.                |
| `catalog-crossmatch`  | Gaia, SDSS, VizieR, SIMBAD where allowed                        | Exercise catalog normalization, source identity, and citation lineage. |
| `time-domain`         | ZTF plus Rubin preview data where access permits                | Exercise cadence, late-arrival, moving-window, and replay behavior.    |
| `offline-fixture`     | Checked-in or generated bounded fixtures only                   | Keep CI independent of archive uptime and rate limits.                 |

## Proposed registry fields

Each candidate should enter a source registry before it becomes active data:

```json
{
  "providerId": "mast",
  "datasetId": "mast-observations-bounded",
  "label": "MAST observation metadata bounded sample",
  "sourceClass": "archive-metadata",
  "accessUrl": "https://mast.stsci.edu/api/v0/",
  "queryMode": "api",
  "accessPolicy": "public",
  "defaultScope": "bounded metadata only",
  "retentionTier": "dev-active",
  "activationState": "candidate",
  "maxRows": 100,
  "maxBytes": 10485760,
  "cadence": "manual",
  "tags": ["multiwavelength", "metadata-first", "public"],
  "citationUrl": "https://archive.stsci.edu/home",
  "adapterVersion": "planned",
  "schemaVersion": "planned",
  "lastVerifiedAt": "2026-08-08"
}
```

Recommended activation states:

| State            | Meaning                                                                        |
| ---------------- | ------------------------------------------------------------------------------ |
| `included`       | Used in the active development Lakehouse slice by default.                     |
| `excluded`       | Known source, not used in active records. Must have a reason.                  |
| `sample-only`    | Usable only as a small fixture or manually bounded sample.                     |
| `candidate`      | Worth implementing, but not yet adapter-verified.                              |
| `disabled`       | Temporarily unavailable, unstable, access-restricted, or otherwise unsuitable. |
| `reference-only` | Useful for documentation or planning but not an ingestion target.              |

## Guardrails

- Public-source availability is not a substitute for academic/live-record access.
- Prefer metadata-first ingestion. Do not pull large FITS, Measurement Set, image, or archive packages into Delta just to prove the pipeline.
- Every active source must preserve source URL, access time, query context, citation URL, provider identifier, and source payload.
- Every exclusion must preserve the reason so future contributors know whether the blocker was size, stability, access rights, rate limits, missing adapter, or low relevance.
- Preview releases and proprietary-period archives must be labeled honestly. Public subset access does not mean all mission data is public.
- CI should use offline fixtures or tiny bounded queries. Live archive calls belong in smoke/manual checks unless rate limits and uptime behavior are controlled.
- Future academic credentials can add provider profiles later, but the PR40 plan should not assume those records exist.

## Recommended next additions

1. Add a checked-in source registry example and schema.
2. Implement include/exclude configuration for the evidence service and PR41 runner.
3. Add source bundle names for `core-proof`, `offline-fixture`, and `multiwavelength-dev`.
4. Add one non-ESO adapter only after the provider-neutral envelope is implemented.
5. Keep public archive scan dates in documentation so stale source assumptions are visible.
