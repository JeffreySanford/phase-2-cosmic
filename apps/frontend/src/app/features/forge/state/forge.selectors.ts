import { createFeatureSelector, createSelector } from "@ngrx/store";
import {
  FORGE_FEATURE_KEY,
  ForgeState,
  forgeJobsAdapter,
} from "./forge.reducer";

export const selectForgeState =
  createFeatureSelector<ForgeState>(FORGE_FEATURE_KEY);

const forgeJobSelectors = forgeJobsAdapter.getSelectors(selectForgeState);

export const selectForgeJobs = forgeJobSelectors.selectAll;

export const selectForgeCurrentUserId = createSelector(
  selectForgeState,
  (state) => state.currentUserId
);

export const selectForgeSelectedJobId = createSelector(
  selectForgeState,
  (state) => state.selectedJobId
);

export const selectForgeImageEntities = createSelector(
  selectForgeState,
  (state) => state.imageEntities
);

export const selectForgeImageProducts = createSelector(
  selectForgeState,
  (state) => state.imageIds.map((id) => state.imageEntities[id]).filter(Boolean)
);

export const selectForgeMyJobs = createSelector(
  selectForgeJobs,
  selectForgeCurrentUserId,
  (jobs, currentUserId) =>
    jobs.filter((job) => job.requestedBy === currentUserId)
);

export const selectForgeGlobalJobs = createSelector(
  selectForgeJobs,
  (jobs) => jobs
);

export const selectForgeQueuedCount = createSelector(
  selectForgeJobs,
  (jobs) => jobs.filter((job) => job.status === "QUEUED").length
);

export const selectForgeRunningCount = createSelector(
  selectForgeJobs,
  (jobs) => jobs.filter((job) => job.status === "RUNNING").length
);

export const selectForgeCompletedCount = createSelector(
  selectForgeJobs,
  (jobs) => jobs.filter((job) => job.status === "COMPLETED").length
);

export const selectForgeServiceInfo = createSelector(
  selectForgeState,
  (state) => state.serviceInfo
);

export const selectForgeSurveys = createSelector(
  selectForgeState,
  (state) => state.surveys
);

export const selectForgeDiagnostics = createSelector(
  selectForgeState,
  (state) => state.diagnostics
);

export const selectForgeMetrics = createSelector(
  selectForgeState,
  (state) => state.metrics
);

export const selectForgeJobEvents = createSelector(
  selectForgeState,
  (state) => state.jobEvents
);

export const selectForgeBootstrapLoading = createSelector(
  selectForgeState,
  (state) => state.bootstrapLoading
);

export const selectForgeBootstrapError = createSelector(
  selectForgeState,
  (state) => state.bootstrapError
);

export const selectForgeCreateJobLoading = createSelector(
  selectForgeState,
  (state) => state.createJobLoading
);

export const selectForgeCreateJobError = createSelector(
  selectForgeState,
  (state) => state.createJobError
);

export const selectForgeCacheArtifactLoading = createSelector(
  selectForgeState,
  (state) => state.cacheArtifactLoading
);

export const selectForgeCacheArtifactError = createSelector(
  selectForgeState,
  (state) => state.cacheArtifactError
);

export const selectForgeLatestJob = createSelector(
  selectForgeJobs,
  (jobs) => jobs[0] ?? null
);

export const selectForgeLatestMyJob = createSelector(
  selectForgeMyJobs,
  (jobs) => jobs[0] ?? null
);

export const selectForgeSelectedJob = createSelector(
  selectForgeJobs,
  selectForgeSelectedJobId,
  (jobs, selectedJobId) => jobs.find((job) => job.id === selectedJobId) ?? null
);

export const selectForgeLatestMyImage = createSelector(
  selectForgeLatestMyJob,
  selectForgeImageEntities,
  (latestMyJob, imageEntities) => {
    const imageId = latestMyJob?.resultImageIds[0];
    return imageId ? imageEntities[imageId] ?? null : null;
  }
);

export const selectForgeSelectedImage = createSelector(
  selectForgeSelectedJob,
  selectForgeImageProducts,
  selectForgeImageEntities,
  (selectedJob, imageProducts, imageEntities) => {
    if (!selectedJob) {
      return null;
    }

    const selectedJobImages = imageProducts.filter(
      (image) => image.jobId === selectedJob.id
    );
    const cachedImage = selectedJobImages.find(
      (image) => image.artifactMode === "cached"
    );
    if (cachedImage) {
      return cachedImage;
    }

    const imageId = selectedJob.resultImageIds[0];
    if (imageId && imageEntities[imageId]) {
      return imageEntities[imageId];
    }

    return (
      selectedJobImages.find((image) => image.artifactMode === "external") ??
      selectedJobImages[0] ??
      null
    );
  }
);

export const selectForgeVm = createSelector(
  selectForgeCurrentUserId,
  selectForgeSelectedJobId,
  selectForgeServiceInfo,
  selectForgeSurveys,
  selectForgeJobs,
  selectForgeMyJobs,
  selectForgeGlobalJobs,
  selectForgeImageProducts,
  selectForgeBootstrapLoading,
  selectForgeBootstrapError,
  selectForgeCreateJobLoading,
  selectForgeCreateJobError,
  selectForgeDiagnostics,
  selectForgeMetrics,
  selectForgeJobEvents,
  selectForgeLatestJob,
  selectForgeLatestMyJob,
  selectForgeLatestMyImage,
  selectForgeSelectedJob,
  selectForgeSelectedImage,
  selectForgeCacheArtifactLoading,
  selectForgeCacheArtifactError,
  selectForgeQueuedCount,
  selectForgeRunningCount,
  selectForgeCompletedCount,
  (
    currentUserId,
    selectedJobId,
    serviceInfo,
    surveys,
    jobs,
    myJobs,
    globalJobs,
    imageProducts,
    bootstrapLoading,
    bootstrapError,
    createJobLoading,
    createJobError,
    diagnostics,
    metrics,
    jobEvents,
    latestJob,
    latestMyJob,
    latestMyImage,
    selectedJob,
    selectedImage,
    cacheArtifactLoading,
    cacheArtifactError,
    queuedCount,
    runningCount,
    completedCount
  ) => ({
    graphqlState: {
      loading: bootstrapLoading,
      payload: serviceInfo
        ? {
            data: {
              serviceInfo,
              surveys,
              jobs,
              imageProducts,
              diagnostics,
              metrics,
              jobEvents,
            },
          }
        : null,
      error: bootstrapError,
    },
    currentUserId,
    selectedJobId,
    serviceInfo,
    surveys,
    jobs,
    myJobs,
    globalJobs,
    imageProducts,
    latestJob,
    latestMyJob,
    latestMyImage,
    selectedJob,
    selectedImage,
    createJobLoading,
    createJobError,
    diagnostics,
    metrics,
    jobEvents,
    cacheArtifactLoading,
    cacheArtifactError,
    queueSummary: {
      queuedCount,
      runningCount,
      completedCount,
    },
  })
);
