import type { CompositeJobSpec } from "../domain/forge.models";
import { Inject, Injectable } from "@nestjs/common";
import { ArtifactCacheService } from "../artifacts/artifact-cache.service";
import type {
  ForgeApiHealth,
  ForgeCreateCutoutJobInput,
  ForgeCutoutRequest,
  ForgeDiagnostics,
  ForgeErrorCode,
  ForgeImageProduct,
  ForgeJob,
  ForgeJobEvent,
  ForgeMetrics,
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
    @Inject(ArtifactCacheService)
    private readonly artifactCache: ArtifactCacheService,
    @Inject(ForgeStateRepository)
    private readonly stateRepository: ForgeStateRepository
  ) {
    this.state = this.stateRepository.load(() => this.createInitialState());
  }

  /**
   * Create a composite job (Sprint 7).
   * Accepts a CompositeJobSpec and creates a queued composite job.
   */
  createCompositeJob(input: {
    requestedBy: string;
    targetName: string;
    ra: number;
    dec: number;
    radiusArcmin: number;
    surveyIds: string[];
    compositeRequest: CompositeJobSpec;
  }): ForgeJob {
    this.state.jobCounter += 1;
    const timestamp = this.isoNow();
    const requestedSurveyIds = Array.isArray(input.surveyIds)
      ? input.surveyIds.filter(
          (value): value is string => typeof value === "string"
        )
      : [];
    const normalizedInputs =
      input.compositeRequest.inputs.length > 0
        ? input.compositeRequest.inputs
        : this.buildCompositeInputs({
            ra: Number(input.ra || 0),
            dec: Number(input.dec || 0),
            radiusArcmin: Number(input.radiusArcmin || 0),
            surveyIds: requestedSurveyIds,
          });

    const job: ForgeJob = {
      id: `forge-job-${this.state.jobCounter}`,
      type: "composite",
      status: "QUEUED",
      progressPercent: 0,
      requestedBy: String(input.requestedBy || "anonymous-operator"),
      targetName: String(input.targetName || "Unnamed target"),
      ra: Number(input.ra || 0),
      dec: Number(input.dec || 0),
      radiusArcmin: Number(input.radiusArcmin || 0),
      requestedSurveyIds,
      request: null,
      compositeRequest: {
        ...input.compositeRequest,
        inputs: normalizedInputs,
      },
      resultImageIds: [],
      errorCode: null,
      errorMessage: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.state.jobs.unshift(job);
    this.appendJobEvent(
      job,
      "JOB_CREATED",
      null,
      "QUEUED",
      "Composite job created"
    );
    this.persistState();
    return job;
  }

  private buildCompositeInputs(input: {
    ra: number;
    dec: number;
    radiusArcmin: number;
    surveyIds: string[];
  }): ForgeCutoutRequest[] {
    return input.surveyIds
      .map((surveyId) =>
        buildCutoutRequestForJob({
          id: `composite-input-${surveyId}`,
          type: "cutout",
          status: "QUEUED",
          progressPercent: 0,
          requestedBy: "composite-builder",
          targetName: "Composite input",
          ra: input.ra,
          dec: input.dec,
          radiusArcmin: input.radiusArcmin,
          requestedSurveyIds: [surveyId],
          request: null,
          resultImageIds: [],
          errorCode: null,
          errorMessage: null,
          createdAt: this.isoNow(),
          updatedAt: this.isoNow(),
        })
      )
      .filter((request): request is ForgeCutoutRequest => !!request);
  }

  private createCompositePreviewUrl(job: ForgeJob): string {
    const label = encodeURIComponent(
      `${job.targetName}\n${job.requestedSurveyIds.join(" + ")}\n${
        job.compositeRequest?.operation ?? "composite"
      }`
    );
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
      <defs>
        <linearGradient id="forgeCompositeBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#15324f"/>
          <stop offset="50%" stop-color="#2b5d87"/>
          <stop offset="100%" stop-color="#0f2236"/>
        </linearGradient>
      </defs>
      <rect width="800" height="800" rx="36" fill="url(#forgeCompositeBg)"/>
      <circle cx="400" cy="400" r="220" fill="rgba(255,255,255,0.08)"/>
      <circle cx="340" cy="360" r="170" fill="rgba(255,196,109,0.22)"/>
      <circle cx="465" cy="445" r="185" fill="rgba(120,227,255,0.18)"/>
      <text x="60" y="96" fill="#f8fcff" font-size="34" font-family="Segoe UI, Arial, sans-serif">Cosmic Forge composite</text>
      <text x="60" y="144" fill="#d2e9ff" font-size="26" font-family="Segoe UI, Arial, sans-serif">${label}</text>
    </svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  private createCompositeImageProduct(job: ForgeJob): ForgeImageProduct {
    const createdAt = this.isoNow();
    const operation = job.compositeRequest?.operation ?? "survey-stack";
    return {
      id: this.nextImageId(),
      jobId: job.id,
      surveyId: "forge-composite",
      providerName: "Cosmic Forge",
      artifactMode: "cached",
      format: "svg",
      previewUrl: this.createCompositePreviewUrl(job),
      fitsUrl: null,
      authoritativeUrl: "/forge",
      accessedAt: createdAt,
      cacheKey: `forge-composite-${job.id}`,
      cacheStatus: "cached",
      provenance: {
        sourceSurvey: `Composite of ${job.requestedSurveyIds.join(", ")}`,
        providerName: "Cosmic Forge",
        citationUrl: "/forge",
        authoritativeUrl: "/forge",
        accessedAt: createdAt,
        transformChain: [
          "input-normalization",
          "multi-input-preparation",
          `composite-assembly:${operation}`,
        ],
        artifactMode: "cached",
        missionFamily: "forge",
        collection: "forge/composite-preview",
        retrievalPathType: "forge-composite",
        outputFormat: "image/svg+xml",
        layer: operation,
        bandSet: job.requestedSurveyIds,
        ra: job.ra,
        dec: job.dec,
        pixscale: null,
        size: Math.max(256, Math.round(job.radiusArcmin * 80)),
        width: 800,
        height: 800,
      },
      createdAt,
    };
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

    const imageProduct = createPreviewImageProduct(
      job,
      this.nextImageId(),
      this.isoNow()
    );
    if (!imageProduct) {
      return;
    }

    this.state.imageProducts.unshift(imageProduct);
    job.resultImageIds = [imageProduct.id];
  }

  private persistState(): void {
    this.stateRepository.save(this.state);
  }

  private setJobProgress(
    job: ForgeJob,
    progressPercent: number,
    eventType: string,
    message: string
  ) {
    const normalizedProgress = Math.max(
      job.progressPercent,
      Math.min(progressPercent, 99)
    );
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
      return new ForgeDomainError("FORGE_UPSTREAM_TIMEOUT", message, true);
    }

    if (
      /fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|unavailable/i.test(message)
    ) {
      return new ForgeDomainError("FORGE_UPSTREAM_UNAVAILABLE", message, true);
    }

    if (
      /bad response|retrieval failed|discovery failed|returned no matching|status/i.test(
        message
      )
    ) {
      return new ForgeDomainError(
        "FORGE_UPSTREAM_BAD_RESPONSE",
        message,
        false
      );
    }

    return new ForgeDomainError(
      "FORGE_INTERNAL_ERROR",
      message || "Forge worker execution failed."
    );
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
    const state: ForgePersistedState = {
      jobCounter: 0,
      imageCounter: 0,
      eventCounter: 0,
      jobs: [],
      imageProducts: [],
      jobEvents: [],
    };
    this.stateRepository.save(state);
    return state;
  }

  private async executeJobWithAdapter(job: ForgeJob): Promise<void> {
    if (job.type === "composite" && job.compositeRequest) {
      this.setJobProgress(
        job,
        35,
        "COMPOSITE_INPUT_PREPARATION",
        `Preparing ${job.compositeRequest.inputs.length} composite inputs`
      );
      this.setJobProgress(
        job,
        70,
        "COMPOSITE_ASSEMBLY",
        `Assembling ${job.compositeRequest.operation} composite`
      );
      const imageProduct = this.createCompositeImageProduct(job);
      this.state.imageProducts.unshift(imageProduct);
      job.resultImageIds = [imageProduct.id];
      job.status = "COMPLETED";
      job.progressPercent = 100;
      job.errorCode = null;
      job.errorMessage = null;
      job.updatedAt = this.isoNow();
      this.appendJobEvent(
        job,
        "COMPOSITE_JOB_COMPLETED",
        "RUNNING",
        "COMPLETED",
        "Composite job completed"
      );
      this.persistState();
      return;
    }

    // Default: cutout/other job types
    const adapter = getSurveyAdapterForJob(job);
    if (!adapter) {
      job.status = "FAILED";
      job.errorCode = "FORGE_UNSUPPORTED_SURVEY";
      job.errorMessage =
        "No production cutout adapter is available yet for the selected surveys.";
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
      this.setJobProgress(
        job,
        45,
        "JOB_PROVIDER_EXECUTION",
        "Provider execution started"
      );
      const imageProduct = await adapter.executeJob(
        job,
        this.nextImageId(),
        this.isoNow()
      );
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
      this.setJobProgress(
        job,
        85,
        "JOB_ARTIFACT_PERSIST",
        "Persisting artifact metadata"
      );
      const persistedImageProduct =
        imageProduct.format === "fits"
          ? (await this.artifactCache.cacheImageArtifact(
              imageProduct,
              `${imageProduct.id}-${Date.now()}`,
              this.buildArtifactRoute
            )) ?? imageProduct
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
      this.setJobProgress(
        job,
        70,
        "JOB_PREVIEW_BUILD",
        "Building derived preview artifact"
      );
      const imageProduct = adapter.createImageProduct(
        job,
        this.nextImageId(),
        this.isoNow()
      );
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
    job.errorMessage =
      "A normalized request exists for the selected survey, but retrieval is not wired yet.";
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
    return this.sortedImageProducts().filter(
      (imageProduct) => imageProduct.jobId === jobId
    );
  }

  getJobEvents(limit = 10): ForgeJobEvent[] {
    return [...this.state.jobEvents]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, Math.max(1, limit));
  }

  getProvenanceByImage(imageId: string) {
    const imageProduct =
      this.state.imageProducts.find((image) => image.id === imageId) ?? null;
    return imageProduct?.provenance ?? null;
  }

  getDiagnostics(): ForgeDiagnostics {
    const jobs = this.getJobs();
    const now = Date.now();
    const delayedJobs = jobs.filter((job) => {
      if (job.status !== "QUEUED" && job.status !== "RUNNING") {
        return false;
      }
      return now - Date.parse(job.updatedAt) > 60_000;
    }).length;
    const retryingJobs = jobs.filter((job) => {
      const events = this.state.jobEvents.filter(
        (event) => event.jobId === job.id
      );
      return (
        events.some((event) => event.eventType === "JOB_RETRIED") &&
        (job.status === "QUEUED" || job.status === "RUNNING")
      );
    }).length;
    const queuedCount = jobs.filter((job) => job.status === "QUEUED").length;
    const runningCount = jobs.filter((job) => job.status === "RUNNING").length;
    return {
      queueDepth: queuedCount,
      runningJobs: runningCount,
      failedJobs: jobs.filter((job) => job.status === "FAILED").length,
      completedJobs: jobs.filter((job) => job.status === "COMPLETED").length,
      blockedJobs: queuedCount > 0 && runningCount === 0 ? queuedCount : 0,
      delayedJobs,
      retryingJobs,
    };
  }

  getMetrics(): ForgeMetrics {
    const jobs = this.getJobs();
    const completedJobs = jobs.filter((job) => job.status === "COMPLETED");
    const completedDurations = completedJobs
      .map((job) => {
        const created = Date.parse(job.createdAt);
        const updated = Date.parse(job.updatedAt);
        return Number.isFinite(created) &&
          Number.isFinite(updated) &&
          updated >= created
          ? (updated - created) / 1000
          : 0;
      })
      .filter((duration) => duration >= 0);
    const successCount = completedJobs.length;
    const failureCount = jobs.filter((job) => job.status === "FAILED").length;
    return {
      totalJobs: jobs.length,
      avgRunTimeSec:
        completedDurations.length > 0
          ? Number(
              (
                completedDurations.reduce((sum, value) => sum + value, 0) /
                completedDurations.length
              ).toFixed(2)
            )
          : 0,
      successRate:
        jobs.length > 0 ? Number((successCount / jobs.length).toFixed(3)) : 0,
      queueDepth: jobs.filter((job) => job.status === "QUEUED").length,
      successCount,
      failureCount,
      cachedArtifactCount: this.state.imageProducts.filter(
        (image) => image.artifactMode === "cached"
      ).length,
    };
  }

  createCutoutJob(input: ForgeCreateCutoutJobInput): ForgeJob {
    this.state.jobCounter += 1;
    const timestamp = this.isoNow();
    const requestedSurveyIds = Array.isArray(input.surveyIds)
      ? input.surveyIds.filter(
          (value): value is string => typeof value === "string"
        )
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
    this.appendJobEvent(
      job,
      "JOB_CREATED",
      null,
      "QUEUED",
      "Cutout job created"
    );
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
    this.appendJobEvent(
      job,
      "JOB_CANCELLED",
      previousStatus,
      "CANCELLED",
      "Job cancelled"
    );
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
    if (job.type === "composite") {
      job.request = null;
      job.compositeRequest = {
        inputs: job.compositeRequest?.inputs.length
          ? job.compositeRequest.inputs
          : this.buildCompositeInputs({
              ra: job.ra,
              dec: job.dec,
              radiusArcmin: job.radiusArcmin,
              surveyIds: job.requestedSurveyIds,
            }),
        operation: job.compositeRequest?.operation ?? "survey-stack",
        parameters: job.compositeRequest?.parameters ?? {},
      };
    } else {
      job.request = buildCutoutRequestForJob(job);
    }
    job.updatedAt = this.isoNow();
    this.appendJobEvent(
      job,
      "JOB_RETRIED",
      previousStatus,
      "QUEUED",
      "Job retried"
    );
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
    this.appendJobEvent(
      job,
      "JOB_STARTED",
      previousStatus,
      "RUNNING",
      "Worker claimed job"
    );
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

  async cacheImageArtifactById(
    imageId: string
  ): Promise<ForgeImageProduct | null> {
    const imageProduct =
      this.state.imageProducts.find((image) => image.id === imageId) ?? null;
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
      transformChain: [
        ...cached.provenance.transformChain,
        "local-cache-retention",
      ],
      artifactMode: "cached",
    };

    this.persistState();
    return cached;
  }

  buildArtifactRoute(imageId: string, kind: "preview" | "fits"): string {
    return `/api/forge/artifacts/${imageId}/${kind}`;
  }
}
