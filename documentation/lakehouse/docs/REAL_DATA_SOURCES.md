# Real data sources for the Lakehouse Initiative

> Status: **active source strategy**
> Purpose: identify real public astronomy sources that can drive the Lakehouse proof while keeping the ingestion architecture provider-neutral.

## Recommendation summary

The Lakehouse should use **real astronomy metadata/data whenever practical**, but the Lakehouse domain model must not depend on one archive provider.

The architectural contract is therefore:

```text
VO / TAP / archive provider
          |
          v
provider profile / source adapter
          |
          v
canonical Phase 2 source/event attribution
          |
          v
Bronze -> Silver -> Gold
```

The first working profile in PR #40 is **ESO TAP / ObsCore** because the branch already has a live, bounded ObsCore fetch used by the evidence surface. ESO is the first provider implementation, not the permanent Lakehouse architecture.

For Cosmic's radio-astronomy/ngVLA alignment, **NRAO/VLA/VLASS remains the most important subsequent provider profile**.

## Provider profiles

### 1. ESO TAP / ObsCore — current working profile

- Endpoint: `https://archive.eso.org/tap_obs`
- Data model: ObsCore
- Current role: live public metadata source for the PR #40 proof/evidence scaffold.
- Why useful: compact, real observation rows with publisher identifiers, collection/product metadata, coordinates, and access references.
- Architectural role: provider profile behind a reusable VO/TAP-style source contract.

Example ADQL query:

```sql
SELECT TOP 100
  obs_publisher_did,
  obs_collection,
  dataproduct_type,
  s_ra,
  s_dec,
  access_url
FROM ivoa.ObsCore
```

### 2. NRAO archive / VLA / VLASS — domain-aligned validation profile

- Archive: `https://data.nrao.edu`
- TAP service: `https://data-query.nrao.edu/tap`
- Why important: directly aligned with the repository's radio-astronomy and ngVLA direction.
- Target use: validate that the same provider-neutral contract works for VLA/VLASS observation/project metadata and authoritative archive references.
- Larger science objects such as Measurement Sets or FITS products should remain in authoritative object/archive storage; the Lakehouse should carry structured metadata, references, quality, lineage, and derived analytics around them.

### 3. CADC / CAOM — interoperability profile

- Search surface: `https://www.cadc-ccda.hia-iha.nrc-cnrc.gc.ca/en/search/`
- Why useful: another real astronomy archive/data model for testing cross-provider normalization and provenance.
- Target use: validate that source attribution and canonical Silver entities are not accidentally ESO- or NRAO-specific.

### 4. ngVLA simulation output — scientific-shape profile

Until production ngVLA archive data is generally available, official or documented ngVLA simulation output can provide ngVLA-shaped scientific records while preserving explicit provenance that the instrument output is simulated.

### 5. Existing Go generator / broker replay — operational profile

The generator/replay path should remain available for deterministic load, timing, duplicate, out-of-order, schema-change, and broker-failure testing. It should complement real scientific content rather than replace it when authentic data is available.

## Source contract rules

Every provider profile should normalize into existing Phase 2 concepts rather than inventing a parallel domain model. Where available, preserve:

- provider/source name,
- stable source record/dataset identifier,
- source endpoint/access URL,
- citation/reference URL,
- source access time,
- original/source-faithful payload,
- observation/dataset identifiers when they can be mapped safely,
- schema/adapter version,
- object URI/checksum when the provider exposes those semantics,
- lineage/query context needed for replay and reproducibility.

Provider-specific fields belong in the source payload/profile mapping. Canonical Silver entities should use the existing Cosmic observation, dataset, source-attribution, and provenance vocabulary.

## Current versus target proof

### Already present on PR #40

```text
ESO ObsCore
    |
    v
live bounded metadata fetch
    |
    v
Lakehouse summary/evidence service
    |
    v
operator evidence panel
```

This is a useful real-data scaffold, but it is not yet a Bronze/Silver/Gold Delta pipeline.

### First complete Lakehouse proof

```text
ESO or NRAO provider profile
          |
          v
provider-neutral source contract
          |
          v
Kafka
          |
          v
Bronze Delta
          |
          v
Silver canonical observation
          |
          v
Gold aggregate
```

## Guardrails

- Use metadata/object references first; large binary science products do not need to travel through broker messages or Delta tables merely to prove the architecture.
- Preserve source attribution and reproducibility information from the first ingest step.
- Tag real, simulated, replayed, and fault-injected data distinctly.
- Do not treat ESO-specific field names as canonical Lakehouse fields.
- Do not claim a provider profile proves ngVLA production behavior.
- Validate the same contract against NRAO/VLA/VLASS as the initiative matures.
