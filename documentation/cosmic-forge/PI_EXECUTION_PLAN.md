# PI Execution Plan

Alignment anchors

- Overview: [./OVERVIEW.md](./OVERVIEW.md)
- Product scope: [./PRODUCT_BLUEPRINT.md](./PRODUCT_BLUEPRINT.md)
- Architecture: [./ARCHITECTURE.md](./ARCHITECTURE.md)
- Implementation slices: [./IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)
- Branch enablement: [./BRANCH_ENABLEMENT.md](./BRANCH_ENABLEMENT.md)
- UI route plan: [./UI_SURFACE_PLAN.md](./UI_SURFACE_PLAN.md)
- First adapter decision: [./FIRST_ADAPTER_DECISION.md](./FIRST_ADAPTER_DECISION.md)
- IRSA adapter decision: [./IRSA_ADAPTER_DECISION.md](./IRSA_ADAPTER_DECISION.md)
- SkyView adapter decision: [./SKYVIEW_ADAPTER_DECISION.md](./SKYVIEW_ADAPTER_DECISION.md)
- ESASky adapter decision: [./ESASKY_ADAPTER_DECISION.md](./ESASKY_ADAPTER_DECISION.md)
- IRSA implementation notes: [./IRSA_IMPLEMENTATION_NOTES.md](./IRSA_IMPLEMENTATION_NOTES.md)
- Sprint 5 implementation notes: [./SPRINT_5_IMPLEMENTATION_NOTES.md](./SPRINT_5_IMPLEMENTATION_NOTES.md)

Status: `in_progress`

## Purpose

This document breaks the Cosmic Forge idea into one PI-sized execution plan with sprint-by-sprint deliverables and individual checklist items.

It is the delivery companion to `IMPLEMENTATION_PLAN.md`.

Use this document when the question is:

What do we need to finish, in what order, and what can we check off as the branch becomes real?

## PI outcome

By the end of this PI, Cosmic Forge should be a credible bounded-track product branch with:

- a stable `/forge` route in the frontend
- a working SSR-proxied Forge API
- a bounded-concurrency worker
- one real public survey adapter
- queue lifecycle, retries, cancel, and diagnostics
- cached preview artifacts and provenance
- a side-by-side Forge Docker environment
- enough tests and docs to operate the branch intentionally

## Exit criteria

- [x] Forge runtime starts via its own side-by-side Docker environment.
- [x] `/api/forge/health` and `/api/forge/graphql` work through the SSR shim.
- [x] A user can submit a real cutout job and watch it progress to completion.
- [x] At least one real survey-backed preview artifact is produced and viewable in `/forge`.
- [x] Provenance and source attribution are retained with each result.
- [x] Retry and cancel flows work for the operator-facing queue.
- [x] Core unit/integration/e2e tests exist for the main Forge path.
- [x] The Forge docs set reflects the implemented runtime rather than a future-only design.

## Working rules

- [x] Keep Forge bounded to the branch-scoped `/forge` and `/api/forge/*` surface.
- [x] Do not merge Forge semantics into the repo-wide governance API surface.
- [x] Do not require Kafka, RabbitMQ, or Pulsar for Forge v1 unless a later sprint explicitly proves that dependency is necessary.
- [x] Keep provenance mandatory, not optional polish.
- [ ] Prefer one complete vertical slice over multiple half-finished subsystems.
- [x] Keep the frontend queue model NgRx-first: Entity-backed collection state, effect-owned orchestration, and explicit job lifecycle transitions.

## External Agency And Archive Inputs

These are the highest-value external data sources currently recommended for Cosmic Forge.

### Priority 1 - NSF NOIRLab Legacy Surveys / Astro Data Lab

- [x] Validate NSF NOIRLab Legacy Surveys as the first real cutout adapter target.
  Decision: validated as the first production adapter for Sprint 5.
  Official cutout/data access references:
  [Legacy Surveys DR10 cutouts](https://www.legacysurvey.org/viewer)
  [NOIRLab Data Lab Legacy Surveys access](https://datalab.noirlab.edu/data/legacy-surveys)
  [NOIRLab image search and cutout documentation](https://datalab.noirlab.edu/docs/manual/UsingAstroDataLab/WebPortal/DataExplorer/ImageSearchCutout/ImageSearchCutout.html)
- [x] Confirm allowed cutout parameters, size limits, supported bands, and rate expectations for Forge usage.
  Confirmed from official Legacy Surveys documentation:
  - viewer cutouts support `ra`, `dec`, `layer`, `pixscale`
  - cutout sizing can use `width`, `height`, or `size`
  - supported `bands` strings include values such as `griz`, `grz`, `gz`, or single-band requests such as `g`
  - DR10 layer options include `ls-dr10`, `ls-dr10-grz`, `ls-dr10-model`, and `ls-dr10-resid`
  - northern and southern footprints can be requested separately with `ls-dr9-north` and `ls-dr10-south`
  - current documented maximum cutout size is `512` pixels
  - `pixscale=0.262` is documented as approximately the native pixel scale used by the Tractor
  Rate expectation note:
  - no public numeric rate-limit was found in the cited docs
  - Data Lab’s interactive cutout UI documents at most `20` downloads at once and explicitly points scripted bulk use to the SIA API
  - Forge should therefore treat the viewer cutout service as suitable for single-job retrieval and use conservative request behavior
- [x] Confirm whether Forge should use the Legacy Surveys viewer cutout URLs directly, Data Lab SIA, or both.
  Decision:
  - use Legacy Surveys viewer cutout URLs directly for the first production adapter because they match Forge’s first vertical slice best
  - keep Data Lab SIA as the follow-on path for larger-scale or more script-heavy retrieval scenarios
  - do not make the first Sprint 5 adapter depend on the interactive Data Explorer cutout workflow
- [x] Capture provenance fields required for NOIRLab-backed results: layer, band set, RA/Dec, pixscale, authoritative URL, access time.
  Required first-wave provenance fields:
  - provider name
  - source survey / layer
  - requested target name if provided
  - resolved `ra` / `dec`
  - requested `bands`
  - requested `pixscale`
  - requested `width` / `height` / `size`
  - authoritative source URL
  - access timestamp
  - artifact mode
  - transform chain used by Forge, if any

Why this is a strong fit:

- direct JPEG and FITS cutouts
- optical survey imagery well-suited to quick previews
- official NSF/NOIRLab public archive and cutout tooling

### Priority 2 - NASA/IPAC IRSA

- [x] Validate IRSA as the second major adapter family for WISE, 2MASS, and related infrared image products.
  Decision: validated as the second adapter family after `Legacy Surveys / NOIRLab`, with `AllWISE` as the recommended first IRSA-backed implementation and `2MASS` as the follow-on infrared companion.
  Official service references:
  [IRSA Image APIs](https://irsa.ipac.caltech.edu/docs/program_interface/api_images.html)
  [IRSA image cutouts application](https://irsa.ipac.caltech.edu/applications/Cutouts/)
  [IRSA image server cutouts](https://irsa.ipac.caltech.edu/ibe/cutouts.html)
- [x] Evaluate whether Forge should begin with AllWISE or 2MASS as the first IRSA-backed implementation.
  Decision: Forge should begin IRSA work with `AllWISE`, not `2MASS`.
  Rationale:
  - `AllWISE` is a stronger second-adapter complement to Legacy optical imagery because it adds a clear mid-infrared comparison path rather than another near-infrared optical-adjacent archive
  - IRSA publishes a concrete `AllWISE Atlas` SIA workflow and exposes stable access URLs for the four atlas bands `W1`, `W2`, `W3`, and `W4`
  - the WISE mission page positions `AllWISE` as the main archival release for static-sky WISE imagery, while `2MASS` remains a valuable later follow-on for `J`, `H`, and `K_s`
  Inference note:
  - this sequencing recommendation is an implementation choice derived from the official archive capabilities and Forge’s product goals, not a statement from IRSA that one mission must be used before the other
- [x] Confirm scriptable cutout access, metadata richness, output formats, and citation expectations.
  Confirmed from official IRSA documentation:
  - IRSA recommends `SIA v2` as the primary API for new image queries and notes that older `SIA v1` and image-server style APIs are superseded for new work
  - `SIA v2` returns access URLs and rich image metadata in machine-readable formats including `FITS`, `IPAC_TABLE`, `VOTABLE`, `JSON`, `CSV`, and related tabular outputs
  - IRSA `IBE` cutouts are the right programmatic retrieval path once an access URL is known; cutouts are requested by appending `center`, `size`, and optional `gzip` parameters to an `/ibe/data/...` FITS URL
  - IBE cutouts support pixel or angular coordinates, rectangular or square cutout sizes, and return gzipped FITS by default unless `gzip=false` is passed
  - `AllWISE` Atlas imagery is documented as four-band calibrated FITS imagery with related metadata fields such as `sia_url`, `sia_fmt`, `sia_ra`, `sia_dec`, `sia_scale`, `sia_bp_id`, `unc_url`, `cov_url`, and `coadd_id`
  - `2MASS` image services expose `J`, `H`, and `K_s` image sets; Atlas and Quicklook images are delivered in FITS and include WCS headers, while Atlas images also include photometric zero point information
  Citation expectations:
  - include the general IRSA archive acknowledgment when IRSA data or services are used
  - include the mission-specific acknowledgment and canonical paper / DOI for the specific data set used
  - for `AllWISE`, include the published AllWISE acknowledgment plus the AllWISE DOI documented by IRSA
  - for `2MASS`, include the standard 2MASS acknowledgment published on the mission page
- [x] Define IRSA-specific provenance capture: collection, band, cutout geometry, retrieval endpoint, and output format.
  Required IRSA provenance fields:
  - provider name
  - mission family: `wise`, `allwise`, `neowise`, or `2mass`
  - collection / dataset identifier such as `allwise/p3am_cdd` or the 2MASS atlas collection used
  - requested target name if provided
  - resolved `ra` / `dec`
  - requested band identifier such as `W1`, `W2`, `W3`, `W4`, `J`, `H`, or `K_s`
  - image product type such as intensity, uncertainty, or coverage where applicable
  - retrieval path type: `sia-v2`, `image-server`, or direct `ibe-cutout`
  - authoritative access URL returned by IRSA
  - cutout request geometry:
    - `center`
    - `size`
    - angular or pixel units
    - width and height when rectangular
  - output format such as `fits.gz` or `fits`
  - compression flag used
  - key returned metadata when available:
    - `sia_fmt`
    - `sia_scale`
    - `sia_bp_id`
    - `coadd_id`
    - `unc_url`
    - `cov_url`
  - access timestamp
  - applicable dataset DOI and canonical citation reference
  - transform chain used by Forge, if any

Recommended implementation posture:

- use `SIA v2` for discovery and metadata lookup where available
- use direct `IBE` cutout URLs for artifact retrieval in Forge jobs
- do not use the browser-oriented `WISE Image Service API` as the primary Forge automation path
- add `2MASS` after the first `AllWISE` slice without changing the shared IRSA adapter contract

Why this is a strong fit:

- official NASA/IPAC image services
- broad mission coverage
- cutout and API-oriented access that matches Forge’s artifact workflow

### Priority 3 - NASA GSFC SkyView

- [x] Evaluate SkyView as a fallback or comparison adapter rather than the first production adapter.
  Decision: validated for fallback / comparison / derived-preview use, not as a first-wave archive-native production adapter.
  Official service references:
  [SkyView survey availability](https://skyview.gsfc.nasa.gov/current/docs/availability.html)
  [SkyView in a Jar / SIA notes](https://skyview.gsfc.nasa.gov/jar/skyviewinajar.html)
- [x] Confirm whether SkyView should be used for quick-look composites and cross-survey discovery rather than authoritative science-ready products.
  Decision: yes. SkyView should be used for quick-look composites, cross-survey discovery, and comparison output rather than as the authoritative source of science-ready archive-native cutouts.
- [x] Document reliability tradeoffs when SkyView depends on remote upstream transfers.
  Confirmed from the official SkyView availability page:
  - most SkyView data are local, but some survey data are transferred from remote servers
  - SkyView explicitly notes that interrupted upstream connections can cause requested image queries to fail
  - Forge should therefore classify SkyView failures as potential upstream-availability issues rather than only internal adapter failures
- [x] If adopted, mark SkyView outputs clearly as SkyView-generated products in provenance rather than archive-native cutouts.
  Required provenance posture:
  - provider name should remain `NASA GSFC SkyView`
  - requested survey should be retained as the source survey identifier
  - output should be labeled as a `SkyView-generated` derivative
  - transform chain should explicitly show `skyview-derived-image`
  - SkyView output must not be presented as an archive-native cutout from the underlying upstream survey

Why this is useful:

- multi-survey discovery and quick-look image generation
- useful comparison path when direct survey-native cutouts are inconsistent

Recommended implementation posture:

- treat SkyView as a comparison and fallback adapter after Legacy and IRSA
- use it for quick-look preview generation and cross-survey comparison
- keep its provenance distinct from archive-native provider adapters
- when a provider UI supports query-string target parameters, Forge should prefer authoritative links that open prepopulated with the current target coordinates or source input rather than dropping the operator onto a blank external form

### Priority 4 - ESA ESASky

- [x] Evaluate ESASky for discovery, HiPS-based previewing, and mission-breadth enrichment rather than first-wave science-ready cutout output.
  Decision: validated for discovery, HiPS-backed previewing, and mission-breadth enrichment rather than first-wave archive-native science-cutout delivery.
  Official service references:
  [ESASky overview](https://open.esa.int/esasky/)
  [ESASky HiPS information](https://www.cosmos.esa.int/web/esdc/esasky-skies)
  [ESASky EDDIE cutout service help](https://sky.esa.int/esasky/hipsCutout/help.html)
- [x] Confirm where ESASky cutout output is appropriate for visualization and where mission-native science products are still required.
  Decision:
  - ESASky HiPS and EDDIE-generated images are appropriate for visualization, quick-look previewing, and broad mission discovery
  - mission-native science products are still required when Forge needs authoritative science-ready downloadable artifacts rather than a generated preview image
  Basis:
  - the ESASky overview describes the portal as providing access to science-ready mission images and catalogues
  - the ESASky HiPS documentation explicitly states that HiPS layers are intended for visualization only and are not science-ready products
- [x] Define separate handling for HiPS visualization outputs versus mission-grade downloadable products.
  Required handling split:
  - `HiPS visualization output`
    - derived preview artifact
    - sourced through ESASky HiPS / EDDIE
    - labeled visualization-only in provenance and UI
  - `mission-grade downloadable product`
    - underlying mission data product when available
    - must not share the same provenance semantics as a HiPS-generated image
    - should remain a separate adapter mode or artifact class in Forge
- [x] Capture ESASky-specific provenance fields: surveyId, HiPS source, projection, FOV, output format, and any science-readiness caveat.
  Required ESASky provenance fields:
  - provider name
  - output class: `esasky-derived-preview` or `esasky-mission-download`
  - `surveyId` / HiPS source identifier
  - HiPS source URL when available
  - requested target name if provided
  - resolved `ra` / `dec` when target coordinates are used
  - requested `fov`
  - requested projection
  - requested image `size`
  - requested or returned `norder`
  - output format such as `png` or `jpg`
  - retrieval endpoint type such as `esasky-eddie`
  - science-readiness caveat such as `visualization-only`
  - access timestamp
  - transform chain used by Forge

Why this is useful:

- broad ESA mission coverage
- strong sky-discovery and HiPS preview story
- good fit for viewer-facing exploration workflows

Recommended implementation posture:

- implement ESASky as a preview/discovery adapter after the current Legacy, IRSA, and SkyView slices
- use EDDIE-generated images for first-wave ESASky output
- preserve a later separate seam for mission-native downloadable products where needed
- when ESASky or another provider offers query-string prepopulation for target, FOV, or survey parameters, Forge should use those links so external handoff preserves the operator’s current context where possible

### Priority 5 - MAST / STScI Pan-STARRS

- [x] Evaluate Pan-STARRS through MAST/STScI as an optional additional optical adapter after Legacy Surveys is stable.
  Official service references:
  [Pan-STARRS archive overview](https://outerspace.stsci.edu/display/PANSTARRS/)
  [How to retrieve and use PS1 data](https://outerspace.stsci.edu/display/PANSTARRS/How%2Bto%2Bretrieve%2Band%2Buse%2BPS1%2Bdata)
  [PS1 Image Cutout Service](https://outerspace.stsci.edu/display/PANSTARRS/PS1%2BImage%2BCutout%2BService)
- [x] Confirm whether Pan-STARRS should be a first-PI adapter or a post-PI extension.
- [x] Compare Pan-STARRS cutout ergonomics and output quality against Legacy Surveys for the same targets.
- [x] Define Pan-STARRS provenance fields and citation requirements if adopted.

Why this is useful:

- strong public optical image cutout path
- good follow-on comparison against Legacy Surveys

Recommended implementation posture:

- treat `Pan-STARRS / STScI` as a `post-PI extension`, not as a first-PI replacement for `Legacy Surveys / NOIRLab`
- use it as an `archive-native optical comparison` source once the current Legacy and IRSA slices are stable
- compare the same targets, geometry, and operator workflows already used for the Legacy adapter
- preserve STScI/MAST-specific provenance and acknowledgement rather than collapsing results into generic optical metadata
- see [PANSTARRS_ADAPTER_DECISION.md](./PANSTARRS_ADAPTER_DECISION.md) for the detailed rationale and provenance expectations

### Source selection gate

- [x] Choose the first production adapter from Priority 1 or Priority 2 and record the decision in the sprint tracker.
  Decision: `Legacy Surveys / NOIRLab` is the first production adapter.
- [x] Choose one secondary archive for follow-on implementation or comparison testing.
  Decision: `IRSA` is the second adapter family and first follow-on implementation target.
- [x] Document any archive-specific access caveats, reliability concerns, and attribution rules before calling the adapter production-ready.
  Documented:
  - `Legacy Surveys / NOIRLab` should be treated as single-job retrieval first, with conservative request behavior and SIA reserved for larger scripted access
  - `IRSA` should prefer `SIA v2` plus `IBE` cutouts for automation, with the browser-oriented image service reserved for manual/operator reference
  - both archive families require result-level provenance and source attribution rather than a generic platform-only citation

## Sprint 1 - Branch Baseline And Runtime Hygiene

Goal: make the branch implementation-ready and locally runnable without colliding with the main Phase 2 stack.

- [x] Confirm branch naming and bounded-track scope in docs and working notes.
- [x] Finalize `docker/cosmic-forge-compose.yml` as the canonical Forge runtime.
- [x] Finalize `scripts/cosmic-forge-up.sh` and `scripts/cosmic-forge-down.sh`.
- [x] Ensure Forge compose uses the root `.env` with `.env.sample` fallback semantics.
- [x] Ensure Forge compose project naming is isolated from `docker/dev-compose.yml`.
- [x] Add placeholder-but-real health endpoints for `cosmic-forge-api` and `cosmic-forge-worker`.
- [x] Verify direct health endpoints on `4101` and `4102`.
- [x] Verify the SSR-proxied health path on `/api/forge/health`.
- [x] Record any remaining local port or startup collisions in docs.

Sprint 1 done when:

- [x] Forge services can be started and stopped independently of the main stack.
- [x] The documented runtime baseline exists on disk, not just in prose.

## Sprint 2 - SSR Proxy And Frontend Shell

Goal: make Forge a first-class but isolated UI route in the existing frontend shell.

- [x] Stabilize the `/forge` route reservation in Angular.
- [x] Keep sidebar, status-band, and service-availability gating consistent with Forge route behavior.
- [x] Ensure `/api/forge/*` handlers are separated from `/api/v1/*`.
- [x] Ensure Forge proxy metrics are recorded separately from governance proxy metrics.
- [x] Add clear error handling for Forge API unavailable, GraphQL unavailable, and artifact unavailable states.
- [x] Make the Forge shell render cleanly when the API is offline.
- [x] Add or update unit tests for Forge route/module loading and SSR proxy behavior.
- [x] Add one e2e smoke path for opening `/forge` successfully.

Sprint 2 done when:

- [x] The frontend can load `/forge` without destabilizing the rest of the app shell.
- [x] Forge traffic is visibly branch-scoped and SSR-proxied.

## Sprint 3 - GraphQL Contract And Read Model

Goal: replace placeholder health-only behavior with a stable Forge read/write contract.

- [x] Align implementation with `GRAPHQL_CONTRACT_DRAFT.md`.
- [x] Finalize bootstrap query shape for service info, surveys, jobs, and image products.
- [x] Implement create job mutation.
- [x] Implement cancel job mutation.
- [x] Implement retry job mutation.
- [x] Implement cache artifact mutation.
- [x] Normalize API error payloads for queue, provider, and artifact failures.
- [x] Define the minimal persistence/read model for jobs, results, and provenance.
- [x] Add contract tests around the GraphQL document set.
- [x] Update docs if any field names or semantics changed during implementation.

Sprint 3 done when:

- [x] The Forge UI can bootstrap entirely from the GraphQL read model.
- [x] The contract is explicit enough to lock the worker and UI against it.

## Sprint 4 - Queue Lifecycle And Worker Execution

Goal: turn Forge into a real orchestration branch with bounded background work.

- [x] Replace the worker placeholder with a bounded-concurrency execution loop.
- [x] Define queue states clearly: queued, running, completed, failed, cancelled.
- [x] Persist job state transitions instead of keeping them only in memory.
- [x] Add progress reporting semantics for the UI.
- [x] Add retry handling that preserves auditability.
- [x] Add cancel handling for queued and in-flight jobs where feasible.
- [x] Add failure classification for provider, validation, timeout, and internal errors.
- [x] Add worker health details beyond a bare `ok` response.
- [x] Add integration tests for create -> run -> complete and create -> fail -> retry.

Sprint 4 done when:

- [x] One end-to-end queue lifecycle exists beyond placeholder timers.

## Sprint 5 - First Real Survey Adapter

Goal: produce a real survey-backed result rather than a mock-only artifact.

Working implementation reference:

- `SPRINT_5_IMPLEMENTATION_NOTES.md`

- [x] Choose the first real public survey adapter from the source-selection gate above and lock that choice in docs.
  Decision locked: `Legacy Surveys / NOIRLab`
- [x] Record the first-adapter rationale and second-adapter sequence in sprint tracking and implementation notes.
- [x] Implement adapter abstraction boundaries for availability, retrieval, metadata, and preview generation.
- [x] Implement one mock adapter for deterministic testing.
- [x] Implement one real public-data adapter for `Legacy Surveys / NOIRLab`.
- [x] Capture authoritative source URL, access time, provider metadata, survey/layer selection, and cutout geometry in provenance.
- [x] Prepare the adapter seam so `IRSA` can be added next without contract churn.
- [x] Add adapter-specific error handling for upstream outages, bad responses, and unsupported requests.
- [x] Produce one real preview artifact and one linked FITS/download path where applicable.
- [x] Add tests for adapter translation and provenance population.
- [x] Update `PUBLIC_DATA_READINESS.md` if any provider assumptions changed.

Sprint 5 done when:

- [x] A real public-survey-backed preview artifact can be created through the Forge flow.
- [x] Upstream adapter failures are classified explicitly enough for retry and operator diagnosis.
- [x] Public-data readiness docs match the providers that are actually live in the branch.

## Sprint 6 - Workbench UX And Result Inspection

Goal: make `/forge` a usable operator/scientist workbench instead of a scaffold.

- [x] Finalize target input and coordinate entry UX.
- [x] Finalize survey selection UX.
- [x] Show my jobs and global jobs with clear state labels.
- [x] Show selected result preview, metadata, and provenance details.
- [x] Show cached versus external artifact mode clearly.
- [x] Add empty, loading, degraded, and failed UX states.
- [x] Ensure the workbench remains usable on desktop and mobile widths.
- [x] Add user-facing validation for invalid coordinates, empty survey selection, and unsupported requests.
- [x] Add e2e coverage for create job, inspect result, retry, and cache artifact flows.

Implemented workbench behaviors:

- validated target, coordinate, and radius entry with user-facing guidance
- survey chips that distinguish live, derived, planned, and registered sources
- queue panels for owned jobs and global queue state with clearer lifecycle copy
- selected-result shell showing preview, artifact delivery mode, cache status, metadata, and provenance
- cache-artifact action for external provider assets
- degraded and offline runtime messaging through the GraphQL read-model shell
- responsive layout behavior validated through the frontend build and e2e suite

Sprint 6 done when:

- [x] A user can work through the main cutout flow entirely from the `/forge` screen.

## Sprint 7 - Composite Workflow And Diagnostics

Goal: complete the operator-facing story with richer workflows and supportability.

- [ ] Define the first composite workflow scope and constraints.
- [ ] Add composite job creation flow to the API and UI.
- [ ] Add worker steps for multi-input preparation and composite assembly.
- [ ] Record transform-chain provenance for composite outputs.
- [ ] Add queue diagnostics for blocked, delayed, and retrying jobs.
- [ ] Add observability metrics for Forge queue depth, run time, success/failure counts, and artifact caching.
- [ ] Surface diagnostics in a Forge-appropriate UI panel or linked diagnostics surface.
- [ ] Add tests for composite path and operator diagnostics.

Sprint 7 done when:

- [ ] Forge supports more than a single basic cutout request and exposes why work is failing or delayed.

## Sprint 8 - Hardening, Compliance, And Demo Closure

Goal: finish the branch as an intentional PI deliverable instead of a promising prototype.

- [ ] Review all Forge docs for implemented-versus-planned accuracy.
- [ ] Update README links and reader guides to include the PI execution state.
- [ ] Add explicit runbook steps for local startup, shutdown, debugging, and health verification.
- [ ] Close or document all known exceptions for runtime gaps and deliberate non-goals.
- [ ] Ensure tests are runnable from the repo’s normal Nx and package-manager workflows.
- [ ] Add one demo checklist for the Forge path.
- [ ] Add one handoff note describing what remains post-PI.
- [ ] Mark completed items in this document and carry forward any deferred work explicitly.

Sprint 8 done when:

- [ ] The branch can be demonstrated, operated locally, and reviewed without verbal reconstruction.

## Deferred after this PI

- [ ] Additional survey adapters beyond the first one or two.
- [ ] GraphQL subscriptions if polling is sufficient for the first PI.
- [ ] Native acceleration seam for image-processing hotspots.
- [ ] Advanced viewer-layer integration beyond the initial result inspection workflow.
- [ ] Any broker-backed scaling model beyond the bounded v1 worker runtime.

## Suggested tracking use

- [ ] Treat each sprint section as the current source of truth for checklist completion.
- [ ] Update this file when a sprint starts, not just when it ends.
- [ ] If scope changes, add or remove checklist items explicitly rather than leaving drift between docs and implementation.
