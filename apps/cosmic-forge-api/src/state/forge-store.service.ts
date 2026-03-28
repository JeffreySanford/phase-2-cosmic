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
      const imageProduct = await adapter.executeJob(job, this.nextImageId(), this.isoNow());
      const persistedImageProduct =
        imageProduct.format === "fits"
          ? ((await this.artifactCache.cacheImageArtifact(
              imageProduct,
              `${imageProduct.id}-${Date.now()}`,
              this.buildArtifactRoute
            )) ??
            imageProduct)
          : imageProduct;
      this.state.imageProducts.unshift(persistedImageProduct);
      job.resultImageIds = [persistedImageProduct.id];
      job.status = "COMPLETED";
      job.errorCode = null;
      job.errorMessage = null;
      this.appendJobEvent(job, "JOB_COMPLETED", "RUNNING", "COMPLETED", null);
      return;
    }

    if (adapter.createImageProduct) {
      const imageProduct = adapter.createImageProduct(job, this.nextImageId(), this.isoNow());
      this.state.imageProducts.unshift(imageProduct);
      job.resultImageIds = [imageProduct.id];
      job.status = "COMPLETED";
      job.errorCode = null;
      job.errorMessage = null;
      this.appendJobEvent(job, "JOB_COMPLETED", "RUNNING", "COMPLETED", null);
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

    if (job.status === "COMPLETED") {
      return job;
    }

    const previousStatus = job.status;
    job.status = "CANCELLED";
    job.errorCode = null;
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
    for (const job of this.state.jobs) {
      if (job.status === "QUEUED") {
        if (!job.request) {
          job.request = buildCutoutRequestForJob(job);
        }
        const previousStatus = job.status;
        job.status = "RUNNING";
        job.progressPercent = Math.max(job.progressPercent, 15);
        job.errorCode = null;
        job.errorMessage = null;
        job.updatedAt = this.isoNow();
        this.appendJobEvent(job, "JOB_STARTED", previousStatus, "RUNNING", "Worker claimed job");
        this.persistState();
        return;
      }

      if (job.status === "RUNNING") {
        const nextProgress = Math.min(job.progressPercent + 25, 100);
        job.progressPercent = nextProgress;
        job.updatedAt = this.isoNow();

        if (nextProgress >= 100) {
          try {
            await this.executeJobWithAdapter(job);
          } catch (error) {
            job.status = "FAILED";
            job.errorCode =
              error instanceof ForgeDomainError ? error.code : "FORGE_INTERNAL_ERROR";
            job.errorMessage =
              error instanceof Error ? error.message : "Forge worker execution failed.";
            this.appendJobEvent(
              job,
              "JOB_FAILED",
              "RUNNING",
              "FAILED",
              job.errorMessage,
              job.errorCode
            );
          }
          job.updatedAt = this.isoNow();
        }
        this.persistState();
        return;
      }
    }
  }

  async executeNextJob(): Promise<ForgeJob | null> {
    await this.advanceJobs();
    return (
      this.sortedJobs().find((job) => job.status === "RUNNING" || job.status === "QUEUED") ??
      null
    );
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
