import {
  createEntityAdapter,
  EntityAdapter,
  EntityState,
} from "@ngrx/entity";
import { createReducer, on } from "@ngrx/store";
import { ForgeActions } from "./forge.actions";
import {
  ForgeImageProductDto,
  ForgeJobDto,
  ForgeServiceInfoDto,
  ForgeSurveyDto,
} from "./forge.models";

export const FORGE_FEATURE_KEY = "forge";

export type ForgeState = EntityState<ForgeJobDto> & {
  currentUserId: string;
  selectedJobId: string | null;
  imageIds: readonly string[];
  imageEntities: Readonly<Record<string, ForgeImageProductDto>>;
  serviceInfo: ForgeServiceInfoDto | null;
  surveys: readonly ForgeSurveyDto[];
  bootstrapLoading: boolean;
  bootstrapError: string | null;
  createJobLoading: boolean;
  createJobError: string | null;
  cacheArtifactLoading: boolean;
  cacheArtifactError: string | null;
};

export const forgeJobsAdapter: EntityAdapter<ForgeJobDto> =
  createEntityAdapter<ForgeJobDto>({
    selectId: (job) => job.id,
    sortComparer: (left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
  });

export const initialForgeState: ForgeState = forgeJobsAdapter.getInitialState({
  currentUserId: "jeffreysanford",
  selectedJobId: null,
  imageIds: [],
  imageEntities: {},
  serviceInfo: null,
  surveys: [],
  bootstrapLoading: false,
  bootstrapError: null,
  createJobLoading: false,
  createJobError: null,
  cacheArtifactLoading: false,
  cacheArtifactError: null,
});

export const forgeReducer = createReducer(
  initialForgeState,
  on(ForgeActions.loadBootstrapRequested, (state) => ({
    ...state,
    bootstrapLoading: true,
    bootstrapError: null,
  })),
  on(ForgeActions.loadBootstrapSucceeded, (state, { payload }) =>
    forgeJobsAdapter.setAll(payload.data.jobs.slice(), {
      ...state,
      selectedJobId:
        state.selectedJobId &&
        payload.data.jobs.some((job) => job.id === state.selectedJobId)
          ? state.selectedJobId
          : payload.data.jobs[0]?.id ?? null,
      imageIds: payload.data.imageProducts.map((image) => image.id),
      imageEntities: payload.data.imageProducts.reduce<
        Readonly<Record<string, ForgeImageProductDto>>
      >((accumulator, image) => ({ ...accumulator, [image.id]: image }), {}),
      serviceInfo: payload.data.serviceInfo,
      surveys: payload.data.surveys,
      bootstrapLoading: false,
      bootstrapError: null,
    })
  ),
  on(ForgeActions.loadBootstrapFailed, (state, { error }) => ({
    ...state,
    selectedJobId: null,
    serviceInfo: null,
    surveys: [],
    bootstrapLoading: false,
    bootstrapError: error,
  })),
  on(ForgeActions.selectJobRequested, (state, { jobId }) => ({
    ...state,
    selectedJobId: jobId,
  })),
  on(ForgeActions.createCutoutJobRequested, (state) => ({
    ...state,
    createJobLoading: true,
    createJobError: null,
  })),
  on(ForgeActions.createCutoutJobSucceeded, (state, { payload }) =>
    forgeJobsAdapter.upsertOne(payload.data.createCutoutJob, {
      ...state,
      selectedJobId: payload.data.createCutoutJob.id,
      createJobLoading: false,
      createJobError: null,
    })
  ),
  on(ForgeActions.createCutoutJobFailed, (state, { error }) => ({
    ...state,
    createJobLoading: false,
    createJobError: error,
  })),
  on(ForgeActions.cancelJobRequested, (state) => ({
    ...state,
    createJobError: null,
  })),
  on(ForgeActions.cancelJobSucceeded, (state, { payload }) =>
    forgeJobsAdapter.upsertOne(payload.data.job, state)
  ),
  on(ForgeActions.cancelJobFailed, (state, { error }) => ({
    ...state,
    createJobError: error,
  })),
  on(ForgeActions.retryJobRequested, (state) => ({
    ...state,
    createJobError: null,
  })),
  on(ForgeActions.retryJobSucceeded, (state, { payload }) =>
    forgeJobsAdapter.upsertOne(payload.data.job, state)
  ),
  on(ForgeActions.retryJobFailed, (state, { error }) => ({
    ...state,
    createJobError: error,
  })),
  on(ForgeActions.cacheImageArtifactRequested, (state) => ({
    ...state,
    cacheArtifactLoading: true,
    cacheArtifactError: null,
  })),
  on(ForgeActions.cacheImageArtifactSucceeded, (state, { payload }) => ({
    ...state,
    cacheArtifactLoading: false,
    cacheArtifactError: null,
    imageIds: state.imageIds.includes(payload.data.imageProduct.id)
      ? state.imageIds
      : [payload.data.imageProduct.id, ...state.imageIds],
    imageEntities: {
      ...state.imageEntities,
      [payload.data.imageProduct.id]: payload.data.imageProduct,
    },
  })),
  on(ForgeActions.cacheImageArtifactFailed, (state, { error }) => ({
    ...state,
    cacheArtifactLoading: false,
    cacheArtifactError: error,
  }))
);
