# Sprint 5 Implementation Notes

Alignment anchors

- PI execution plan: [./PI_EXECUTION_PLAN.md](./PI_EXECUTION_PLAN.md)
- First adapter decision: [./FIRST_ADAPTER_DECISION.md](./FIRST_ADAPTER_DECISION.md)
- Data source comparison: [./DATA_SOURCE_COMPARISON_MATRIX.md](./DATA_SOURCE_COMPARISON_MATRIX.md)
- GraphQL contract draft: [./GRAPHQL_CONTRACT_DRAFT.md](./GRAPHQL_CONTRACT_DRAFT.md)
- NgRx state blueprint: [./NGRX_STATE_BLUEPRINT.md](./NGRX_STATE_BLUEPRINT.md)

Status: `implemented_for_first_adapter_slice`

## Purpose

This document turns Sprint 5 into concrete engineering work.

The first production adapter for Sprint 5 is:

- `Legacy Surveys / NOIRLab`

The second adapter family remains:

- `IRSA`

Sprint 5 should therefore optimize for one complete Legacy Surveys-backed vertical slice without closing the door on IRSA.

Current implementation reality:

- `Legacy Surveys / NOIRLab` is live as the first archive-native adapter
- `IRSA AllWISE` is live as the second archive-native adapter family
- `SkyView` is live as a derived-preview comparison path
- upstream failure handling is now adapter-specific for the current IRSA path so worker retry posture and operator diagnostics do not collapse into generic internal errors

## Sprint 5 objective

Deliver one real image job path that:

- accepts target/coordinate input
- requests a real Legacy Surveys-backed cutout
- stores result metadata and provenance
- exposes a preview artifact in the Forge UI
- preserves a clean adapter seam for the later IRSA implementation

## Legacy Surveys adapter scope

### Included in Sprint 5

- one production adapter for Legacy Surveys / NOIRLab
- one deterministic mock adapter for tests and local fallback
- one supported cutout workflow
- one preview artifact path
- one provenance payload shape

### Excluded from Sprint 5

- multi-source composite generation
- advanced image stacking or reprojection workflows
- full survey-family abstraction beyond what is needed for Legacy Surveys + IRSA seam stability
- broad viewer-layer controls beyond basic preview/result inspection

## Recommended first workflow

First workflow to implement:

- `Create cutout job`

Input:

- target name or explicit RA/Dec
- radius / field size
- one selected survey profile

Output:

- one preview artifact
- one result record
- one provenance record
- one authoritative source URL

This should be the first real path because it is the narrowest useful end-to-end slice.

## Adapter contract

The adapter interface should stay small and production-oriented.

Recommended responsibilities:

- `resolveAvailability`
- `buildCutoutRequest`
- `fetchPreviewArtifact`
- `fetchMetadata`
- `buildProvenance`

The adapter should not own:

- queue scheduling
- SSR proxy logic
- NgRx state transitions
- general artifact persistence abstractions outside its own result payload

## Request model

The first Legacy Surveys adapter request should support:

- [ ] target name
- [ ] RA
- [ ] Dec
- [ ] radius or field size
- [ ] survey/layer identifier
- [ ] requested output mode: preview first, with linked downloadable artifact metadata when available

Confirmed first-wave Legacy Surveys request parameters from the official viewer/cutout path:

- `ra`
- `dec`
- `layer`
- `pixscale`
- `width`
- `height`
- `size`
- `bands`

Recommended first-wave constraints:

- cap requested cutouts to the currently documented `512` pixel maximum
- default to the documented approximate native pixel scale of `0.262`
- begin with viewer cutout URLs for the first production adapter
- keep Data Lab SIA as the follow-on bulk/script-friendly path rather than the first adapter dependency

Recommendation:

Support either resolved coordinates or direct coordinates internally, but keep the persisted request shape normalized to coordinates once the job is enqueued.

## Result model

The first successful Legacy Surveys-backed result should persist:

- [ ] image product id
- [ ] originating job id
- [ ] selected survey/layer id
- [ ] provider name
- [ ] preview URL or cached preview path
- [ ] authoritative source URL
- [ ] artifact mode: `external` or `cached`
- [ ] access timestamp
- [ ] created timestamp

## Provenance requirements

The first adapter implementation should capture at minimum:

- [ ] provider name: `NSF NOIRLab / Legacy Surveys`
- [ ] source survey name or layer
- [ ] target name if supplied
- [ ] resolved RA/Dec used for the request
- [ ] requested bands
- [ ] requested pixscale
- [ ] cutout geometry or size parameters
- [ ] authoritative URL used to retrieve the source
- [ ] access timestamp
- [ ] transform chain used to produce the preview artifact
- [ ] artifact mode

The provenance payload must be sufficient for a reviewer to answer:

- what source was queried
- how the request was parameterized
- what artifact was returned
- whether Forge transformed or merely cached the result

## GraphQL changes for Sprint 5

The GraphQL layer should support Sprint 5 without broadening scope unnecessarily.

Required capabilities:

- [ ] create cutout job mutation remains the main write path
- [ ] bootstrap query returns real Legacy Surveys-backed jobs and image products
- [ ] image product payload includes source/provider/provenance fields needed for the workbench
- [ ] error payloads can distinguish provider failure from internal worker failure

If contract drift is needed, update:

- [ ] `GRAPHQL_CONTRACT_DRAFT.md`
- [ ] any Forge DTOs
- [ ] any NgRx model types

## NgRx implications

Sprint 5 should preserve the queue/entity model rather than bypassing it with ad hoc service state.

Required frontend behavior:

- [ ] enqueue a real cutout request through the existing Forge action flow
- [ ] reflect the returned job in the entity-backed queue state
- [ ] patch the returned image product and provenance into selector output
- [ ] show the selected Legacy Surveys result in the workbench
- [ ] preserve retry/cancel compatibility with the same job model

Do not add adapter-specific state branching inside the component tree if it can stay in selectors/effects/models instead.

## Worker implications

Sprint 5 should move the worker closer to the intended queue model even if it remains modest.

Required worker behavior:

- [ ] accept queued cutout work
- [ ] execute one real Legacy Surveys retrieval flow
- [ ] classify provider/network/validation failures cleanly
- [ ] emit status transitions that match Forge queue semantics
- [ ] return a persisted result payload suitable for bootstrap refresh or later subscriptions

If bounded concurrency is not fully implemented in Sprint 5, do not fake a final design.
Keep the worker simple but architecturally honest.

## IRSA seam requirements

Even though IRSA is not the first production adapter, Sprint 5 should avoid Legacy-only lock-in.

Required seam decisions:

- [ ] adapter interface must not hardcode Legacy-only field names
- [ ] provenance model must allow a different archive family later
- [ ] job request model must remain compatible with at least one follow-on archive family
- [ ] UI survey selection should not assume only one provider exists forever

## Suggested engineering order

1. Lock request and provenance fields for the first adapter.
2. Implement or refine the adapter interface.
3. Add deterministic mock fixture for one successful Legacy Surveys result.
4. Implement real Legacy Surveys retrieval path.
5. Persist result metadata and provenance.
6. Wire the result into GraphQL bootstrap output.
7. Validate the Forge workbench renders the real result.
8. Add tests and failure-path coverage.

## Suggested acceptance checks

- [ ] A cutout job can be created from the Forge workbench.
- [ ] The job reaches a terminal state through the real adapter path.
- [ ] The result includes a visible preview artifact.
- [ ] The result preserves the exact Legacy Surveys request parameters needed for replay and audit.
- [ ] Provenance fields are visible and not empty.
- [ ] The result indicates whether it is externally referenced or cached locally.
- [ ] Failure cases do not collapse the queue model or UI state.

## Official references

- [Legacy Surveys viewer](https://www.legacysurvey.org/viewer)
- [NOIRLab Data Lab Legacy Surveys](https://datalab.noirlab.edu/data/legacy-surveys)
- [NOIRLab image cutout documentation](https://datalab.noirlab.edu/docs/manual/UsingAstroDataLab/WebPortal/DataExplorer/ImageSearchCutout/ImageSearchCutout.html)
