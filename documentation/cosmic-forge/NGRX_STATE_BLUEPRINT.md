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

## Design rule

Keep UI components thin:

- presentational components render selector output
- container components dispatch actions
- effects own GraphQL orchestration and subscription wiring
