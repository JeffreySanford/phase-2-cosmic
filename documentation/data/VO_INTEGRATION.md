# Virtual Observatory (VO) Integration

Last reviewed: 2026-03-07

This note explains how the Virtual Observatory (IVOA) protocols and services (TAP, DataLink, VOTable) are used by Cosmic Horizon for discovery, lightweight ETL, and viewer integration.

## 1. Why VO matters for Cosmic Horizon

- VO/TAP provides a standardized, queryable metadata layer for astronomy archives (cone searches, ADQL/TAP queries).
- DataLink and VOTable enable discovery of science-ready products and machine-readable product links (FITS, cutouts, HiPS tiles).
- Using VO reduces the need for heavy archive downloads for catalog-level workflows and enables reproducible provenance linking.

## 2. High-level flow

```mermaid
flowchart LR
  Archive[External Archive / Data Provider]
  TAP[TAP / ADQL Service]
  Gov[Cosmic Horizon Governance API]
  UI[Frontend Viewer / Diagnostics]
  Cache[In-memory Cache / Redis]

  Archive -->|publish TAP/DataLink| TAP
  TAP -->|ADQL / cone search| Gov
  Gov -->|VOTable / stream parse| UI
  Gov --> Cache
  UI -->|follow product link (DataLink/accessURL)| Archive

  classDef archive fill:#f4f4f8,stroke:#666
  class Archive,TAP,Cache,Gov,UI archive
```

## 3. Common operations & examples

- Example TAP/ADQL cone query (via HTTP GET to TAP endpoint):

```text
https://data-query.nrao.edu/tap/sync?REQUEST=doQuery&LANG=ADQL&QUERY=SELECT+*+FROM+chanmaster+WHERE+1=CONTAINS(POINT('ICRS',ra,dec),CIRCLE('ICRS',187.277915,2.052389,0.1))
```

- Example Xamin stream query (pipe-delimited):

```text
https://heasarc.gsfc.nasa.gov/xamin/query?table=chanmaster&position=3c273&format=stream
```

- Example VOTable fetch (parsing required):

```text
https://heasarc.gsfc.nasa.gov/xamin/query?table=chanmaster&position=3c273&format=votable
```

Server-side guidance:

- Prefer `format=stream` for lightweight, fast tabular ingest; use `format=votable` when DataLink/accessURL and FIELD metadata are required.
- Parse VOTable by extracting `FIELD` names, `TABLEDATA/TR/TD` rows, and `LINK[@href]` or `accessURL` elements for product URLs.

Client-side guidance:

- Present authoritative product links (`DataLink`/`accessURL`) as source-attribution links in the viewer and dataset detail panels.
- Treat VO-originated datasets as external-source records — persist `sourceName`, `providerName`, `citationUrl`, and retrieval timestamp in the `DatasetManifest`.

## 4. ObsCore → DatasetManifest mapping (recommended)

| ObsCore field     | DatasetManifest path                  | Notes                                  |
| ----------------- | ------------------------------------- | -------------------------------------- |
| obs_publisher_did | manifest.sourceAttribution.datasetId  | Persistent identifier from provider    |
| access_url        | manifest.sourceAttribution.accessUrl  | Prefer DataLink/accessURL when present |
| dataproduct_type  | manifest.sourceAttribution.sourceType | image/catalog/visibility               |
| obs_collection    | manifest.sourceAttribution.sourceName | survey or collection name              |
| ra, dec           | manifest.pointing                     | store as canonical numeric fields      |

## 5. Caching, rate limits, and robustness

- Cache parsed VOTable summaries for a short TTL (e.g., 5 minutes) to avoid repeated TAP query load during interactive sessions.
- Respect archive rate limits; implement exponential backoff on HTTP 429 and surface friendly errors to the UI.
- Consider Redis for multi-instance caching and persistence in production.

## 6. Security and provenance

- Treat VO providers as external sources — record `citationUrl` and `accessedAt` for every harvested dataset.
- When credentials or API tokens are required, keep them in secrets (K8s/ Vault) and gate access via the governance service.

## 7. Frontend snippets (Diagnostics / Viewer)

- `GET /api/v1/vo/services` → returns `tapUrl`, `dataLinkUrl` for configured providers.
- `GET /api/v1/vo/votable?table=chanmaster&position=3c273` → returns JSON `{fields:[], rows:[[]], links:[]}` suitable for UI rendering.

## 8. Live VO job model for Jobs page

This repo should treat VO work as a first-class live job family, not as a simulator-only side path.

Design direction:

- VO jobs use live public VO providers by default.
- Simulator fallback is not the normal execution path for VO jobs.
- Each VO job type has its own request shape, validation rules, and expected artifact outputs.
- Angular submit UX should use typed reactive forms, not a raw JSON editor, for VO job submission.
- Backend should validate VO job payloads with per-type schemas before accepting execution.

Current implementation note:

- the current backend only performs optional VO harvesting inside the `simulator` executor and only emits JSON-like sample artifacts
- the target state described below replaces that with explicit live VO job types and mode-gated execution

## 9. Recommended VO job taxonomy

Not every public archive supports every VO capability. The job family should therefore separate discovery jobs from product-retrieval jobs.

### 9.1 `vo.cone-search`

Purpose:

- simple positional discovery against a public catalog/image table

Typical protocols:

- TAP
- service-specific query endpoints returning stream or VOTable

Required inputs:

- provider
- service URL
- target coordinates or target name
- search radius
- output format (`stream` or `votable`)

Expected outputs:

- tabular rows
- field metadata
- source attribution
- optional `access_url` / DataLink references

### 9.2 `vo.adql.query`

Purpose:

- advanced metadata discovery using operator-authored or template-authored ADQL

Typical protocols:

- TAP sync
- TAP async

Required inputs:

- provider
- TAP URL
- ADQL text

Optional inputs:

- row limit
- timeout
- async flag

Expected outputs:

- VOTable or stream result set
- parsed fields and rows
- provider citation and request provenance

### 9.3 `vo.obscore.search`

Purpose:

- standardized ObsCore discovery for image, cube, visibility, and catalog records

Typical protocols:

- TAP with ObsCore table

Required inputs:

- provider
- TAP URL
- spatial constraint

Optional inputs:

- time range
- spectral range
- dataproduct type
- collection / instrument filter

Expected outputs:

- ObsCore rows
- normalized dataset manifest candidates
- `obs_publisher_did`, `access_url`, and collection metadata

### 9.4 `vo.votable.fetch`

Purpose:

- fetch and parse a VOTable response for downstream workflow use

Typical protocols:

- TAP/VOTable
- VOTable URL already discovered upstream

Required inputs:

- provider
- VOTable URL or query definition

Expected outputs:

- raw VOTable artifact
- parsed `fields`
- parsed `rows`
- extracted `LINK` or `accessURL` values

### 9.5 `vo.datalink.resolve`

Purpose:

- resolve product links and related resources from a VO record or dataset identifier

Typical protocols:

- IVOA DataLink

Required inputs:

- provider
- DataLink URL or dataset identifier

Expected outputs:

- DataLink response artifact
- normalized product-link list
- MIME types and semantic roles when available

### 9.6 `vo.product.fetch`

Purpose:

- download the actual remote product discovered through `access_url` or DataLink

Typical protocols:

- HTTP GET against product URL

Required inputs:

- provider
- product URL

Optional inputs:

- expected MIME type
- preferred filename

Expected outputs:

- binary artifact such as `*.fits`, `*.jpg`, `*.png`, `*.csv`, or `*.vot`
- content metadata
- checksum and retrieval timestamp

### 9.7 `vo.soda.cutout`

Purpose:

- fetch server-side cutouts/subsets for large images or cubes when provider supports SODA

Typical protocols:

- SODA / DataLink service descriptors

Required inputs:

- provider
- SODA/DataLink endpoint
- dataset identifier
- spatial bounds

Optional inputs:

- spectral bounds
- time bounds
- output format

Expected outputs:

- cutout artifact, commonly FITS
- subsetting provenance
- request bounds captured in manifest

### 9.8 `vo.preview.fetch`

Purpose:

- fetch a browser-friendly derivative for the Jobs or Viewer UI

Typical protocols:

- DataLink preview relation
- direct image URL
- HiPS or other preview-capable public endpoints

Required inputs:

- provider
- preview URL or DataLink-derived preview reference

Expected outputs:

- `jpg`, `png`, or other preview asset
- thumbnail/preview metadata

## 10. Job chaining model

Several VO tasks are naturally multi-step rather than single-call jobs.

Recommended chain patterns:

1. discovery chain

- `vo.obscore.search` or `vo.adql.query`
- `vo.datalink.resolve`
- `vo.product.fetch`

2. image cutout chain

- `vo.obscore.search`
- `vo.datalink.resolve`
- `vo.soda.cutout`
- optional `vo.preview.fetch`

3. catalog harvest chain

- `vo.cone-search`
- `vo.votable.fetch`
- internal dataset manifest creation

Lineage should capture:

- parent job id
- provider
- query URL or ADQL text hash
- remote dataset id / publisher DID
- retrieved artifact URLs

## 11. Angular Jobs form requirements for VO

The Jobs page should expose a VO category in the workflow/type selector and render a typed subform based on selected VO job type.

Required UX direction:

- use Angular reactive forms with strongly typed `FormGroup` trees
- hide irrelevant fields when a VO type is not selected
- show inline validation errors before submit
- preserve values when switching between compatible VO subtypes
- keep a read-only generated JSON preview for advanced inspection, but do not make raw JSON the primary input path

Common VO fields:

- `provider`
- `serviceUrl`
- `requestedBy`
- `datasetId`
- `outputFormat`
- `liveMode`

Rules:

- `liveMode` should be fixed to `true` for VO jobs in normal operation
- if a non-live fallback exists, it must be labeled explicitly as fallback or test-only
- URL fields require URL validation
- coordinate entry requires either `targetName` or `ra/dec`, not both unless the form supports resolution + override explicitly
- radius, spectral bounds, and time bounds require numeric/range validation
- ADQL query text requires non-empty trimmed content
- product-fetch jobs require a URL and expected artifact type when known

Recommended form groups:

- `vo.cone-search`
  - `provider`
  - `serviceUrl`
  - `target`
  - `radius`
  - `format`
- `vo.adql.query`
  - `provider`
  - `tapUrl`
  - `adql`
  - `async`
  - `limit`
- `vo.obscore.search`
  - `provider`
  - `tapUrl`
  - `position`
  - `timeRange`
  - `spectralRange`
  - `dataproductType`
- `vo.datalink.resolve`
  - `provider`
  - `dataLinkUrl`
  - `datasetIdentifier`
- `vo.product.fetch`
  - `provider`
  - `productUrl`
  - `expectedMimeType`
  - `preferredFilename`
- `vo.soda.cutout`
  - `provider`
  - `serviceUrl`
  - `datasetIdentifier`
  - `bounds`
  - `outputFormat`
- `vo.preview.fetch`
  - `provider`
  - `previewUrl`

## 12. Backend validation and execution expectations

Backend job acceptance should no longer rely on free-form simulator semantics for VO.

Required contract changes:

- register JSON schemas for each VO workflow type
- validate via `POST /api/v1/jobs/validate` before submission and again on `POST /api/v1/jobs`
- route accepted VO jobs to a live VO executor rather than the simulator
- keep live vs fallback mode explicit in job status and artifacts

Recommended executor metadata on status/artifacts:

- `provider`
- `protocol`
- `requestUrl`
- `requestMethod`
- `contentType`
- `artifactCount`
- `retrievedAt`
- `sourceState` with values such as `live`, `cached`, `fallback`, `failed`

## 13. Artifact expectations by VO type

- discovery jobs should emit JSON summaries and raw source artifacts
- VOTable jobs should emit raw `*.vot` plus parsed JSON
- DataLink jobs should emit raw response plus normalized link lists
- product fetch jobs should emit the downloaded binary artifact
- preview jobs should emit a browser-displayable image when available
- cutout jobs should prefer FITS output when the provider supports it

For image-centric workflows, the platform should support both:

- authoritative science artifact, typically FITS
- operator-friendly preview artifact, typically JPG or PNG

## 14. Operational guardrails

- respect provider rate limits and cache metadata responses where safe
- record attribution and access timestamps for every retrieved public artifact
- set file-size and timeout ceilings for public downloads
- reject unsupported schemes or unsafe redirects
- make binary retrieval auditable and reproducible through stored request metadata
- keep provider capability differences explicit in UI copy rather than implying all archives support all VO functions

## 15. References

- IVOA TAP: <https://www.ivoa.net/documents/TAP/>
- VOTable: <https://www.ivoa.net/documents/VOTable/>
- DataLink: <https://www.ivoa.net/documents/DataLink/>
- SODA: <https://www.ivoa.net/documents/SODA/>
- HEASARC Xamin docs: <https://heasarc.gsfc.nasa.gov/xamin/>
