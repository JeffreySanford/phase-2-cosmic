# NgRx State Blueprint

Alignment anchors

- Product scope: [./PRODUCT_BLUEPRINT.md](./PRODUCT_BLUEPRINT.md)
- Architecture: [./ARCHITECTURE.md](./ARCHITECTURE.md)
- Current jobs/frontend reality: [../frontend/features/JOBS.md](../frontend/features/JOBS.md)

Status: `planned`

## Why NgRx is justified

Cosmic Forge has the characteristics that justify NgRx rather than ad hoc component/service state:

- long-running async job lifecycles
- multiple related entity collections
- subscription-driven updates
- retry and cancel flows
- image/result provenance relationships
- viewer/layer state that must stay coherent while data changes

This is not NgRx for fashion. It is a state-machine problem.

It is also a queue-management problem.

The right mental model for Forge is not "fetch some pages and store them".
The right mental model is:

- a queue of image jobs
- explicit per-item lifecycle state
- effect-owned orchestration
- result entities related back to their originating jobs
- a backend worker model that mirrors the same queue semantics

## Feature slices

- `jobs`
- `targets`
- `surveys`
- `images`
- `provenance`
- `viewer`

## Entity relationships

- `jobs` reference `targetId`, `requestedSurveyIds`, and `resultImageIds`
- `images` reference `jobId` and `surveyId`
- `provenance` references `imageProductId`
- `viewer` references selected target, selected image, and active layer stack

## Representative state shapes

```ts
interface JobsState {
  ids: string[];
  entities: Record<string, Job>;
  selectedJobId: string | null;
  activeJobIds: string[];
  loading: boolean;
  error: string | null;
}

interface ViewerState {
  selectedTargetId: string | null;
  selectedImageId: string | null;
  activeLayerIds: string[];
  opacityByLayerId: Record<string, number>;
  mode: "preview" | "analysis";
}
```

## Queue model

Cosmic Forge should follow the standard NgRx Entity queue-management pattern:

- `@ngrx/entity` manages the normalized collection of jobs
- reducer state tracks queue-level UI flags and selected work
- effects own async orchestration
- UI components render selector output and dispatch intent

Recommended queue-facing additions to the state model:

```ts
interface JobsState {
  ids: string[];
  entities: Record<string, Job>;
  selectedJobId: string | null;
  processingMode: "idle" | "polling" | "subscription";
  isCreating: boolean;
  isCancelling: boolean;
  isRetrying: boolean;
  lastError: string | null;
}
```

Per-job lifecycle should remain explicit:

- `QUEUED`
- `RUNNING`
- `COMPLETED`
- `FAILED`
- `CANCELLED`

This keeps Forge aligned with the classic queue scenarios that NgRx handles well:

- sequential or ordered work visibility
- bounded concurrent backend execution
- retry and cancel flows
- operator-facing progress and failure review

## Representative actions

- `createCutoutJobRequested`
- `createCutoutJobSucceeded`
- `createCutoutJobFailed`
- `createCompositeJobRequested`
- `jobUpdatedFromSubscription`
- `jobProgressedFromSubscription`
- `imageProductReadyFromSubscription`
- `cancelJobRequested`
- `retryJobRequested`
- `selectJob`
- `selectImage`
- `setActiveLayers`

Queue-specific follow-on actions that fit the intended model:

- `queueHydratedFromBootstrap`
- `queueModeChanged`
- `jobExecutionStarted`
- `jobExecutionCompleted`
- `jobExecutionFailed`
- `jobCancelled`
- `jobRetried`

## Selectors

- all jobs
- selected job
- active jobs
- failed jobs
- images by selected job
- provenance by selected image
- selected target
- current viewer layer stack

## Subscription update flow

1. mutation creates job
2. reducer inserts optimistic or confirmed job
3. effect connects to GraphQL subscription stream
4. `jobUpdated` and `jobProgressed` patch entity state
5. `imageProductReady` adds result entities and clears waiting UI states

## Polling-first, subscription-ready

The current branch is allowed to begin with polling if that gets the first PI vertical slice done faster.

But the design should preserve the subscription-oriented spirit:

- bootstrap and polling are acceptable early
- GraphQL subscriptions remain the intended end-state for progress and result updates
- polling code should not force a later refactor of the entity model

That means:

- selectors should not assume polling-only behavior
- reducer transitions should work whether updates come from polling or subscriptions
- effects should remain the integration boundary for both strategies

## Sequential vs concurrent responsibility

NgRx should model queue state and user intent.

The backend worker should own bounded concurrency.

That split preserves the spirit of the idea:

- frontend queue state is explicit and inspectable
- backend execution is multi-threaded and controlled
- GraphQL is the contract between the two

Forge therefore behaves more like an operator-facing compute task queue than a simple CRUD app.

## Design rule

Keep UI components thin:

- presentational components render selector output
- container components dispatch actions
- effects own GraphQL orchestration and subscription wiring
