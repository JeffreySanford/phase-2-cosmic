# IRSA Implementation Notes

Alignment anchors

- PI execution plan: [./PI_EXECUTION_PLAN.md](./PI_EXECUTION_PLAN.md)
- IRSA adapter decision: [./IRSA_ADAPTER_DECISION.md](./IRSA_ADAPTER_DECISION.md)
- Data source comparison: [./DATA_SOURCE_COMPARISON_MATRIX.md](./DATA_SOURCE_COMPARISON_MATRIX.md)
- GraphQL contract draft: [./GRAPHQL_CONTRACT_DRAFT.md](./GRAPHQL_CONTRACT_DRAFT.md)
- NgRx state blueprint: [./NGRX_STATE_BLUEPRINT.md](./NGRX_STATE_BLUEPRINT.md)

Status: `planned`

## Purpose

This document turns the IRSA follow-on adapter decision into concrete engineering work.

The first IRSA implementation should target:

- `AllWISE`

The next IRSA-backed follow-on should be:

- `2MASS`

The goal is to add a real infrared archive family without changing the outer Forge queue, provenance, and artifact model.

## IRSA objective

Deliver one real IRSA-backed image job path that:

- accepts target or coordinate input
- discovers an archive-native image through `SIA v2`
- retrieves a real cutout through `IBE`
- stores result metadata and provenance
- exposes a preview artifact in the Forge UI
- preserves a clean shared seam for later `2MASS`

## First implementation scope

### Included in the first IRSA slice

- one production adapter for `IRSA / AllWISE`
- one deterministic mock IRSA adapter fixture for tests
- one supported discovery path
- one supported cutout retrieval path
- one preview artifact path
- one provenance payload shape compatible with later `2MASS`

### Excluded from the first IRSA slice

- multiple IRSA mission families at once
- time-domain `NEOWISE` handling
- IRSA-wide generalized search UI
- advanced reprojection or cross-mission stacking
- full mission switching in a single first implementation

## Recommended first workflow

First workflow to implement:

- `Create IRSA cutout job`

Input:

- target name or explicit RA/Dec
- field size
- one selected IRSA survey profile
- one selected band

Output:

- one preview artifact
- one result record
- one provenance record
- one authoritative IRSA access URL

This should be the first IRSA path because it is the narrowest useful archive-backed slice.

## Recommended archive path

The first IRSA implementation should use:

- `SIA v2` for discovery and metadata lookup
- direct `IBE` cutout URLs for retrieval

Do not use the browser-oriented image-service flow as the primary Forge automation path.

The implementation should treat:

- `SIA v2` as the metadata and discovery contract
- `IBE` as the artifact retrieval contract

## Adapter contract

The IRSA adapter interface should remain compatible with the existing adapter seam.

Recommended responsibilities:

- `resolveAvailability`
- `discoverImages`
- `selectBestImage`
- `buildCutoutRequest`
- `fetchPreviewArtifact`
- `fetchMetadata`
- `buildProvenance`

The adapter should not own:

- queue scheduling
- SSR proxy behavior
- NgRx state transitions
- cross-provider result normalization outside its own returned payload

## Request model

The first `AllWISE` adapter request should support:

- [ ] target name
- [ ] RA
- [ ] Dec
- [ ] field size
- [ ] collection identifier
- [ ] band identifier
- [ ] requested output mode: preview first, with linked archive download metadata

Recommended normalized persisted request fields:

- `provider`
- `missionFamily`
- `collection`
- `band`
- `ra`
- `dec`
- `size`
- `sizeUnit`
- `targetName`

Recommended first-wave `AllWISE` constraints:

- begin with one `AllWISE Atlas` image family
- begin with one band per job: `W1`, `W2`, `W3`, or `W4`
- persist normalized coordinates after target resolution
- keep rectangular geometry support in the shared model, even if the first UI exposes a single size control

## Result model

The first successful IRSA-backed result should persist:

- [ ] image product id
- [ ] originating job id
- [ ] provider name
- [ ] mission family
- [ ] collection id
- [ ] selected band id
- [ ] preview URL or cached preview path
- [ ] authoritative source URL
- [ ] retrieval path type
- [ ] artifact mode: `external` or `cached`
- [ ] access timestamp
- [ ] created timestamp

## Provenance requirements

The first IRSA adapter implementation should capture at minimum:

- [ ] provider name: `NASA/IPAC IRSA`
- [ ] mission family: `allwise`
- [ ] collection / dataset identifier
- [ ] target name if supplied
- [ ] resolved RA/Dec used for the request
- [ ] requested band
- [ ] requested cutout geometry
- [ ] retrieval path type: `sia-v2` plus `ibe-cutout`
- [ ] authoritative URL returned by IRSA
- [ ] output format such as `fits.gz` or `fits`
- [ ] returned archive metadata needed for replay and audit
- [ ] access timestamp
- [ ] dataset DOI and citation reference
- [ ] transform chain used to produce the preview artifact
- [ ] artifact mode

Recommended `AllWISE` metadata to preserve when returned:

- `sia_fmt`
- `sia_scale`
- `sia_bp_id`
- `coadd_id`
- `unc_url`
- `cov_url`

The provenance payload must be sufficient for a reviewer to answer:

- what IRSA collection was queried
- which band was requested
- how the cutout was parameterized
- which archive URL produced the artifact
- what citation applies to the returned result
- whether Forge transformed or merely cached the result

## GraphQL changes for the IRSA slice

The GraphQL layer should support IRSA without breaking the existing queue model.

Required capabilities:

- [ ] create cutout job mutation supports explicit provider / collection / band selection
- [ ] bootstrap query returns IRSA-backed jobs and image products with provider-aware metadata
- [ ] image product payload includes mission family, collection, band, and provenance fields
- [ ] error payloads can distinguish discovery failure from retrieval failure

If contract drift is needed, update:

- [ ] `GRAPHQL_CONTRACT_DRAFT.md`
- [ ] Forge DTOs
- [ ] NgRx model types

## NgRx implications

The frontend should absorb IRSA through the existing entity-backed queue model.

Required frontend behavior:

- [ ] enqueue a real IRSA cutout request through the Forge action flow
- [ ] preserve provider, collection, and band in the queued request model
- [ ] patch the returned IRSA image product and provenance into selector output
- [ ] show the selected `AllWISE` result in the workbench
- [ ] preserve retry and cancel compatibility with the same job model

Do not add archive-specific component state that duplicates selector-derived behavior.

## Worker implications

The worker should treat IRSA as another provider-backed execution path, not a special queue type.

Required worker behavior:

- [ ] accept queued IRSA cutout work
- [ ] run `SIA v2` discovery
- [ ] select a usable archive image
- [ ] run `IBE` cutout retrieval
- [ ] classify discovery, retrieval, validation, and timeout failures cleanly
- [ ] emit status transitions that match Forge queue semantics
- [ ] return a persisted result payload suitable for bootstrap refresh or later subscriptions

## 2MASS seam requirements

Even though `AllWISE` is first inside IRSA, the implementation should not create `AllWISE`-only lock-in.

Required seam decisions:

- [ ] adapter interface must not hardcode WISE-only field names
- [ ] request model must allow `J`, `H`, and `K_s` later without contract churn
- [ ] provenance model must support a different IRSA mission family later
- [ ] UI survey selection should represent `IRSA` as a family with provider-specific options beneath it

## Suggested engineering order

1. Lock the shared IRSA request and provenance fields.
2. Add the shared IRSA adapter contract.
3. Add a deterministic mock `AllWISE` fixture.
4. Implement `SIA v2` discovery for the first `AllWISE` collection.
5. Implement `IBE` cutout retrieval.
6. Persist result metadata and provenance.
7. Wire the result into GraphQL bootstrap output.
8. Validate the Forge workbench renders the real IRSA result.
9. Add failure-path and provenance tests.

## Suggested acceptance checks

- [ ] An IRSA cutout job can be created from the Forge workbench.
- [ ] The job reaches a terminal state through the real `AllWISE` adapter path.
- [ ] The result includes a visible preview artifact.
- [ ] The result preserves the exact IRSA request fields needed for replay and audit.
- [ ] Provenance fields are visible and not empty.
- [ ] The result indicates whether it is externally referenced or cached locally.
- [ ] Failure cases do not collapse the queue model or UI state.
- [ ] The adapter seam remains compatible with a later `2MASS` implementation.

## Official references

- [IRSA Image APIs](https://irsa.ipac.caltech.edu/docs/program_interface/api_images.html)
- [IRSA image cutouts application](https://irsa.ipac.caltech.edu/applications/Cutouts/)
- [IRSA image server cutouts](https://irsa.ipac.caltech.edu/ibe/cutouts.html)
- [WISE mission page](https://irsa.ipac.caltech.edu/Missions/wise.html)
- [2MASS mission page](https://irsa.ipac.caltech.edu/Missions/2mass.html)
- [IRSA acknowledgment guidance](https://irsa.ipac.caltech.edu/ack.html)
