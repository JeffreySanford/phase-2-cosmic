import { createActionGroup, emptyProps, props } from "@ngrx/store";
import {
  ForgeCreateCutoutJobInputDto,
  ForgeCreateCutoutJobResponseDto,
  ForgeHealthDto,
  ForgeImageMutationResponseDto,
  ForgeJobMutationResponseDto,
  ForgeWorkbenchBootstrapResponseDto,
} from "./forge.models";

export const ForgeActions = createActionGroup({
  source: "Forge",
  events: {
    InitializeRequested: emptyProps(),
    RefreshRequested: emptyProps(),
    StartAutoRefreshRequested: emptyProps(),
    LoadHealthRequested: emptyProps(),
    LoadHealthSucceeded: props<{ health: ForgeHealthDto }>(),
    LoadHealthFailed: props<{ error: string }>(),
    LoadBootstrapRequested: emptyProps(),
    LoadBootstrapSucceeded: props<{ payload: ForgeWorkbenchBootstrapResponseDto }>(),
    LoadBootstrapFailed: props<{ error: string }>(),
    SelectJobRequested: props<{ jobId: string }>(),
    CreateCutoutJobRequested: props<{ input: ForgeCreateCutoutJobInputDto }>(),
    CreateCutoutJobSucceeded: props<{ payload: ForgeCreateCutoutJobResponseDto }>(),
    CreateCutoutJobFailed: props<{ error: string }>(),
    CancelJobRequested: props<{ jobId: string }>(),
    CancelJobSucceeded: props<{ payload: ForgeJobMutationResponseDto }>(),
    CancelJobFailed: props<{ error: string }>(),
    RetryJobRequested: props<{ jobId: string }>(),
    RetryJobSucceeded: props<{ payload: ForgeJobMutationResponseDto }>(),
    RetryJobFailed: props<{ error: string }>(),
    CacheImageArtifactRequested: props<{ imageId: string }>(),
    CacheImageArtifactSucceeded: props<{ payload: ForgeImageMutationResponseDto }>(),
    CacheImageArtifactFailed: props<{ error: string }>(),
  },
});
