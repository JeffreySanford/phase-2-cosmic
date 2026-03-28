import { Inject, Injectable } from "@nestjs/common";
import { ArtifactCacheService } from "../artifacts/artifact-cache.service";
import type {
  ForgeApiHealth,
  ForgeCreateCutoutJobInput,
  ForgeErrorCode,
  ForgeImageProduct,
  ForgeJob,
  ForgeJobEvent,
  ForgePersistedState,
  ForgeSurvey,
} from "../domain/forge.models";
import { ForgeDomainError } from "../domain/forge.models";
import {
  buildCutoutRequestForJob,
  createPreviewImageProduct,
  forgeSurveys,
  getSurveyAdapterForJob,
} from "../providers/surveys";
import { ForgeStateRepository } from "./forge-state.repository";

@Injectable()
export class ForgeStoreService {
  private readonly state: ForgePersistedState;

  constructor(
    @Inject(ArtifactCacheService) private readonly artifactCache: ArtifactCacheService,
    @Inject(ForgeStateRepository) private readonly stateRepository: ForgeStateRepository
  ) {
    this.state = this.stateRepository.load(() => this.createInitialState());
  }

  private isoNow(): string {
    return new Date().toISOString();
  }

  private nextImageId(): string {
    this.state.imageCounter += 1;
    return `forge-image-${this.state.imageCounter}`;
  }

  private sortedJobs(): ForgeJob[] {
    return [...this.state.jobs].sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt)
    );
  }

  private sortedImageProducts(): ForgeImageProduct[] {
    return [...this.state.imageProducts].sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt)
    );
  }

  private nextQueuedJob(): ForgeJob | null {
    const queuedJobs = this.state.jobs
      .filter((job) => job.status === "QUEUED")
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    return queuedJobs[0] ?? null;
  }

  private attachPreviewImage(job: ForgeJob | undefined): void {
    if (!job || job.resultImageIds.length > 0) {
      return;
    }

    const imageProduct = createPreviewImageProduct(job, this.nextImageId(), this.isoNow());
    if (!imageProduct) {
      return;
    }

    this.state.imageProducts.unshift(imageProduct);
    job.resultImageIds = [imageProduct.id];
  }

  private persistState(): void {
    this.stateRepository.save(this.state);
  }

  private setJobProgress(job: ForgeJob, progressPercent: number, eventType: string, message: string) {
    const normalizedProgress = Math.max(job.progressPercent, Math.min(progressPercent, 99));
    job.progressPercent = normalizedProgress;
    job.updatedAt = this.isoNow();
    this.appendJobEvent(job, eventType, job.status, job.status, message);
    this.persistState();
  }

  private classifyExecutionError(error: unknown): ForgeDomainError {
    if (error instanceof ForgeDomainError) {
      return error;
    }

    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof Error && error.name === "AbortError") {
      return new ForgeDomainError(
        "FORGE_UPSTREAM_TIMEOUT",
        message || "Forge provider request timed out.",
        true
      );
    }

    if (/timeout|timed out/i.test(message)) {
      return new ForgeDomainError(
        "FORGE_UPSTREAM_TIMEOUT",
        message,
        true
      );
    }

    if (/fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|unavailable/i.test(message)) {
      return new ForgeDomainError(
        "FORGE_UPSTREAM_UNAVAILABLE",
        message,
        true
      );
    }

    if (/bad response|retrieval failed|discovery failed|returned no matching|status/i.test(message)) {
      return new ForgeDomainError("FORGE_UPSTREAM_BAD_RESPONSE", message, false);
    }

    return new ForgeDomainError("FORGE_INTERNAL_ERROR", message || "Forge worker execution failed.");
  }

  private nextEventId(): string {
    this.state.eventCounter += 1;
    return `forge-event-${this.state.eventCounter}`;
  }

  private appendJobEvent(
    job: ForgeJob,
    eventType: string,
    fromStatus: ForgeJob["status"] | null,
    toStatus: ForgeJob["status"] | null,
    message: string | null,
    errorCode: ForgeErrorCode | null = null
  ): void {
    const event: ForgeJobEvent = {
      id: this.nextEventId(),
      jobId: job.id,
      eventType,
      fromStatus,
      toStatus,
      message,
      errorCode,
      createdAt: this.isoNow(),
    };
    this.state.jobEvents.unshift(event);
  }

  private createInitialState(): ForgePersistedState {
    let seedImageCounter = 0;
    let seedEventCounter = 0;
    const jobs: ForgeJob[] = [
      {
        id: "forge-job-1",
        type: "cutout",
        status: "COMPLETED",
        progressPercent: 100,
        requestedBy: "jeffreysanford",
        targetName: "M87",
        ra: 187.70593,
        dec: 12.39112,
        radiusArcmin: 15,
        requestedSurveyIds: ["legacy"],
        request: buildCutoutRequestForJob({
          id: "bootstrap-legacy-1",
          type: "cutout",
          status: "COMPLETED",
          progressPercent: 100,
          requestedBy: "bootstrap",
          targetName: "M87",
          ra: 187.70593,
          dec: 12.39112,
          radiusArcmin: 15,
          requestedSurveyIds: ["legacy"],
          request: null,
          resultImageIds: [],
          errorCode: null,
          errorMessage: null,
          createdAt: "2026-03-27T18:55:00.000Z",
          updatedAt: "2026-03-27T19:10:00.000Z",
        }),
        resultImageIds: [],
        errorCode: null,
        errorMessage: null,
        createdAt: "2026-03-27T18:55:00.000Z",
        updatedAt: "2026-03-27T19:10:00.000Z",
      },
      {
        id: "forge-job-2",
        type: "cutout",
        status: "COMPLETED",
        progressPercent: 100,
        requestedBy: "jeffreysanford",
        targetName: "M87",
        ra: 187.70593,
        dec: 12.39112,
        radiusArcmin: 15,
        requestedSurveyIds: ["allwise"],
        request: buildCutoutRequestForJob({
          id: "bootstrap-allwise-1",
          type: "cutout",
          status: "COMPLETED",
          progressPercent: 100,
          requestedBy: "bootstrap",
          targetName: "M87",
          ra: 187.70593,
          dec: 12.39112,
          radiusArcmin: 15,
          requestedSurveyIds: ["allwise"],
          request: null,
          resultImageIds: [],
          errorCode: null,
          errorMessage: null,
          createdAt: "2026-03-27T18:57:00.000Z",
          updatedAt: "2026-03-27T19:01:00.000Z",
        }),
        resultImageIds: [],
        errorCode: null,
        errorMessage: null,
        createdAt: "2026-03-27T18:57:00.000Z",
        updatedAt: "2026-03-27T19:01:00.000Z",
      },
      {
        id: "forge-job-3",
        type: "composite",
        status: "COMPLETED",
        progressPercent: 100,
        requestedBy: "jeffreysanford",
        targetName: "NGC 1275",
        ra: 49.95067,
        dec: 41.5117,
        radiusArcmin: 12,
        requestedSurveyIds: ["legacy", "allwise"],
        request: buildCutoutRequestForJob({
          id: "bootstrap-legacy-2",
          type: "composite",
          status: "COMPLETED",
          progressPercent: 100,
          requestedBy: "bootstrap",
          targetName: "NGC 1275",
          ra: 49.95067,
          dec: 41.5117,
          radiusArcmin: 12,
          requestedSurveyIds: ["legacy"],
          request: null,
          resultImageIds: [],
          errorCode: null,
          errorMessage: null,
          createdAt: "2026-03-27T18:50:00.000Z",
          updatedAt: "2026-03-27T19:04:00.000Z",
        }),
        resultImageIds: [],
        errorCode: null,
        errorMessage: null,
        createdAt: "2026-03-27T18:50:00.000Z",
        updatedAt: "2026-03-27T19:04:00.000Z",
      },
    ];

    const state: ForgePersistedState = {
      jobCounter: 3,
      imageCounter: 0,
      eventCounter: 0,
      jobs,
      imageProducts: [],
      jobEvents: [],
    };

    const appendSeedPreviewImage = (job: ForgeJob) => {
      seedImageCounter += 1;
      const imageProduct = createPreviewImageProduct(
        job,
        `forge-image-${seedImageCounter}`,
        this.isoNow()
      );
      if (imageProduct) {
        state.imageProducts.unshift(imageProduct);
        job.resultImageIds = [imageProduct.id];
      }
    };

    const appendSeedEvent = (
      job: ForgeJob,
      message: string
    ) => {
      seedEventCounter += 1;
      state.jobEvents.unshift({
        id: `forge-event-${seedEventCounter}`,
        jobId: job.id,
        eventType: "BOOTSTRAP_JOB_PRESENT",
        fromStatus: null,
        toStatus: "COMPLETED",
        message,
        errorCode: null,
        createdAt: this.isoNow(),
      });
    };

    appendSeedPreviewImage(jobs[0]);
    appendSeedPreviewImage(jobs[2]);
    appendSeedEvent(jobs[0], "Seeded Legacy job");
    appendSeedEvent(jobs[1], "Seeded AllWISE job");
    appendSeedEvent(jobs[2], "Seeded composite job");
    state.imageCounter = seedImageCounter;
    state.eventCounter = seedEventCounter;
    this.stateRepository.save(state);
    return state;
  }

  private async executeJobWithAdapter(job: ForgeJob): Promise<void> {
    const adapter = getSurveyAdapterForJob(job);
    if (!adapter) {
      job.status = "FAILED";
      job.errorCode = "FORGE_UNSUPPORTED_SURVEY";
      job.errorMessage = "No production cutout adapter is available yet for the selected surveys.";
      this.appendJobEvent(
        job,
        "JOB_FAILED",
        "RUNNING",
        "FAILED",
        job.errorMessage,
        job.errorCode
      );
      return;
    }

    if (adapter.executeJob) {
      this.setJobProgress(job, 45, "JOB_PROVIDER_EXECUTION", "Provider execution started");
      const imageProduct = await adapter.executeJob(job, this.nextImageId(), this.isoNow());
      if (this.findJob(job.id)?.status === "CANCELLED") {
        this.appendJobEvent(
          job,
          "JOB_CANCELLATION_CONFIRMED",
          "CANCELLED",
          "CANCELLED",
          "Worker honored cancellation before completion"
        );
        this.persistState();
        return;
      }
      this.setJobProgress(job, 85, "JOB_ARTIFACT_PERSIST", "Persisting artifact metadata");
      const persistedImageProduct =
        imageProduct.format === "fits"
          ? ((await this.artifactCache.cacheImageArtifact(
              imageProduct,
              `${imageProduct.id}-${Date.now()}`,
              this.buildArtifactRoute
            )) ??
            imageProduct)
          : imageProduct;
      if (this.findJob(job.id)?.status === "CANCELLED") {
        this.appendJobEvent(
          job,
          "JOB_CANCELLATION_CONFIRMED",
          "CANCELLED",
          "CANCELLED",
          "Worker honored cancellation before artifact publication"
        );
        this.persistState();
        return;
      }
      this.state.imageProducts.unshift(persistedImageProduct);
      job.resultImageIds = [persistedImageProduct.id];
      job.status = "COMPLETED";
      job.progressPercent = 100;
      job.errorCode = null;
      job.errorMessage = null;
      this.appendJobEvent(job, "JOB_COMPLETED", "RUNNING", "COMPLETED", null);
      this.persistState();
      return;
    }

    if (adapter.createImageProduct) {
      this.setJobProgress(job, 70, "JOB_PREVIEW_BUILD", "Building derived preview artifact");
      const imageProduct = adapter.createImageProduct(job, this.nextImageId(), this.isoNow());
      if (this.findJob(job.id)?.status === "CANCELLED") {
        this.appendJobEvent(
          job,
          "JOB_CANCELLATION_CONFIRMED",
          "CANCELLED",
          "CANCELLED",
          "Worker honored cancellation before preview publication"
        );
        this.persistState();
        return;
      }
      this.state.imageProducts.unshift(imageProduct);
      job.resultImageIds = [imageProduct.id];
      job.status = "COMPLETED";
      job.progressPercent = 100;
      job.errorCode = null;
      job.errorMessage = null;
      this.appendJobEvent(job, "JOB_COMPLETED", "RUNNING", "COMPLETED", null);
      this.persistState();
      return;
    }

    job.status = "FAILED";
    job.errorCode = "FORGE_UPSTREAM_BAD_RESPONSE";
    job.errorMessage = "A normalized request exists for the selected survey, but retrieval is not wired yet.";
    this.appendJobEvent(
      job,
      "JOB_FAILED",
      "RUNNING",
      "FAILED",
      job.errorMessage,
      job.errorCode
    );
    this.persistState();
  }

  getHealth(): ForgeApiHealth {
    return {
      status: "ok",
      service: "cosmic-forge-api",
      mode: "graphql-live",
      timestamp: this.isoNow(),
    };
  }

  getSurveys(): ForgeSurvey[] {
    return forgeSurveys;
  }

  getJobs(): ForgeJob[] {
    return this.sortedJobs();
  }

  getJob(jobId: string): ForgeJob | null {
    return this.findJob(jobId);
  }

  getImageProducts(): ForgeImageProduct[] {
    return this.sortedImageProducts();
  }

  getImageProductsByJob(jobId: string): ForgeImageProduct[] {
    return this.sortedImageProducts().filter((imageProduct) => imageProduct.jobId === jobId);
  }

  getProvenanceByImage(imageId: string) {
    const imageProduct = this.state.imageProducts.find((image) => image.id === imageId) ?? null;
    return imageProduct?.provenance ?? null;
  }

  createCutoutJob(input: ForgeCreateCutoutJobInput): ForgeJob {
    this.state.jobCounter += 1;
    const timestamp = this.isoNow();
    const requestedSurveyIds = Array.isArray(input.surveyIds)
      ? input.surveyIds.filter((value): value is string => typeof value === "string")
      : [];

    const job: ForgeJob = {
      id: `forge-job-${this.state.jobCounter}`,
      type: "cutout",
      status: "QUEUED",
      progressPercent: 0,
      requestedBy: String(input.requestedBy || "anonymous-operator"),
      targetName: String(input.targetName || "Unnamed target"),
      ra: Number(input.ra || 0),
      dec: Number(input.dec || 0),
      radiusArcmin: Number(input.radiusArcmin || 0),
      requestedSurveyIds,
      request: null,
      resultImageIds: [],
      errorCode: null,
      errorMessage: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    job.request = buildCutoutRequestForJob(job);
    this.state.jobs.unshift(job);
    this.appendJobEvent(job, "JOB_CREATED", null, "QUEUED", "Cutout job created");
    this.persistState();
    return job;
  }

  findJob(jobId: string): ForgeJob | null {
    return this.state.jobs.find((job) => job.id === jobId) ?? null;
  }

  cancelJob(jobId: string): ForgeJob | null {
    const job = this.findJob(jobId);
    if (!job) {
      return null;
    }

    if (job.status === "COMPLETED" || job.status === "FAILED") {
      return job;
    }

    const previousStatus = job.status;
    job.status = "CANCELLED";
    job.progressPercent = previousStatus === "QUEUED" ? 0 : job.progressPercent;
    job.errorCode = null;
    job.errorMessage =
      previousStatus === "RUNNING"
        ? "Cancellation requested by operator. Worker will not publish completion artifacts."
        : null;
    job.updatedAt = this.isoNow();
    this.appendJobEvent(job, "JOB_CANCELLED", previousStatus, "CANCELLED", "Job cancelled");
    this.persistState();
    return job;
  }

  retryJob(jobId: string): ForgeJob | null {
    const job = this.findJob(jobId);
    if (!job) {
      return null;
    }

    if (job.status !== "FAILED" && job.status !== "CANCELLED") {
      return job;
    }

    const previousStatus = job.status;
    job.status = "QUEUED";
    job.progressPercent = 0;
    job.errorCode = null;
    job.errorMessage = null;
    job.request = buildCutoutRequestForJob(job);
    job.updatedAt = this.isoNow();
    this.appendJobEvent(job, "JOB_RETRIED", previousStatus, "QUEUED", "Job retried");
    this.persistState();
    return job;
  }

  async advanceJobs(): Promise<void> {
    const claimed = this.claimNextJob();
    if (!claimed) {
      return;
    }

    await this.executeClaimedJob(claimed.id);
  }

  async executeNextJob(): Promise<ForgeJob | null> {
    const claimed = this.claimNextJob();
    if (!claimed) {
      return null;
    }

    await this.executeClaimedJob(claimed.id);
    return this.getJob(claimed.id);
  }

  claimNextJob(): ForgeJob | null {
    const job = this.nextQueuedJob();
    if (!job) {
      return null;
    }

    if (!job.request) {
      job.request = buildCutoutRequestForJob(job);
    }

    const previousStatus = job.status;
    job.status = "RUNNING";
    job.progressPercent = Math.max(job.progressPercent, 10);
    job.errorCode = null;
    job.errorMessage = null;
    job.updatedAt = this.isoNow();
    this.appendJobEvent(job, "JOB_STARTED", previousStatus, "RUNNING", "Worker claimed job");
    this.persistState();
    return job;
  }

  async executeClaimedJob(jobId: string): Promise<ForgeJob | null> {
    const job = this.findJob(jobId);
    if (!job) {
      return null;
    }

    if (job.status !== "RUNNING") {
      return job;
    }

    try {
      await this.executeJobWithAdapter(job);
    } catch (error) {
      const classified = this.classifyExecutionError(error);
      job.status = "FAILED";
      job.errorCode = classified.code;
      job.errorMessage = classified.message;
      job.updatedAt = this.isoNow();
      this.appendJobEvent(
        job,
        "JOB_FAILED",
        "RUNNING",
        "FAILED",
        job.errorMessage,
        job.errorCode
      );
      this.persistState();
    }

    return job;
  }

  async cacheImageArtifactById(imageId: string): Promise<ForgeImageProduct | null> {
    const imageProduct = this.state.imageProducts.find((image) => image.id === imageId) ?? null;
    if (!imageProduct) {
      return null;
    }

    const cached = await this.artifactCache.cacheImageArtifact(
      imageProduct,
      `${imageId}-${Date.now()}`,
      this.buildArtifactRoute
    );
    if (!cached) {
      return null;
    }

    cached.accessedAt = this.isoNow();
    cached.provenance = {
      ...cached.provenance,
      accessedAt: cached.accessedAt,
      transformChain: [...cached.provenance.transformChain, "local-cache-retention"],
      artifactMode: "cached",
    };

    this.persistState();
    return cached;
  }

  buildArtifactRoute(imageId: string, kind: "preview" | "fits"): string {
    return `/api/forge/artifacts/${imageId}/${kind}`;
  }
}
