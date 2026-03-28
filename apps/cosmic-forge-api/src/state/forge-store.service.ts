import { Inject, Injectable } from "@nestjs/common";
import { ArtifactCacheService } from "../artifacts/artifact-cache.service";
import type {
  ForgeApiHealth,
  ForgeCreateCutoutJobInput,
  ForgeImageProduct,
  ForgeJob,
  ForgeSurvey,
} from "../domain/forge.models";
import {
  buildCutoutRequestForJob,
  createPreviewImageProduct,
  forgeSurveys,
  getSurveyAdapterForJob,
} from "../providers/surveys";

@Injectable()
export class ForgeStoreService {
  private forgeJobCounter = 3;
  private forgeImageCounter = 0;
  private readonly forgeJobs: ForgeJob[] = [
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
      requestedSurveyIds: ["vlass", "legacy"],
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
        errorMessage: null,
        createdAt: "2026-03-27T18:55:00.000Z",
        updatedAt: "2026-03-27T19:10:00.000Z",
      }),
      resultImageIds: [],
      errorMessage: null,
      createdAt: "2026-03-27T18:55:00.000Z",
      updatedAt: "2026-03-27T19:10:00.000Z",
    },
    {
      id: "forge-job-2",
      type: "cutout",
      status: "RUNNING",
      progressPercent: 42,
      requestedBy: "archive-operator",
      targetName: "Cygnus A",
      ra: 299.86815,
      dec: 40.73391,
      radiusArcmin: 10,
      requestedSurveyIds: ["vlass"],
      request: null,
      resultImageIds: [],
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
      requestedSurveyIds: ["vlass", "legacy", "nvas"],
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
        errorMessage: null,
        createdAt: "2026-03-27T18:50:00.000Z",
        updatedAt: "2026-03-27T19:04:00.000Z",
      }),
      resultImageIds: [],
      errorMessage: null,
      createdAt: "2026-03-27T18:50:00.000Z",
      updatedAt: "2026-03-27T19:04:00.000Z",
    },
  ];

  private readonly forgeImageProducts: ForgeImageProduct[] = [];

  constructor(@Inject(ArtifactCacheService) private readonly artifactCache: ArtifactCacheService) {
    this.attachPreviewImage(this.forgeJobs[0]);
    this.attachPreviewImage(this.forgeJobs[2]);
  }

  private isoNow(): string {
    return new Date().toISOString();
  }

  private nextImageId(): string {
    this.forgeImageCounter += 1;
    return `forge-image-${this.forgeImageCounter}`;
  }

  private sortedJobs(): ForgeJob[] {
    return [...this.forgeJobs].sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt)
    );
  }

  private sortedImageProducts(): ForgeImageProduct[] {
    return [...this.forgeImageProducts].sort((left, right) =>
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

    this.forgeImageProducts.unshift(imageProduct);
    job.resultImageIds = [imageProduct.id];
  }

  private async executeJobWithAdapter(job: ForgeJob): Promise<void> {
    const adapter = getSurveyAdapterForJob(job);
    if (!adapter) {
      job.status = "FAILED";
      job.errorMessage = "No production cutout adapter is available yet for the selected surveys.";
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
      this.forgeImageProducts.unshift(persistedImageProduct);
      job.resultImageIds = [persistedImageProduct.id];
      job.status = "COMPLETED";
      job.errorMessage = null;
      return;
    }

    if (adapter.createImageProduct) {
      job.status = "COMPLETED";
      job.errorMessage = null;
      this.attachPreviewImage(job);
      return;
    }

    job.status = "FAILED";
    job.errorMessage = "A normalized request exists for the selected survey, but retrieval is not wired yet.";
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

  getImageProducts(): ForgeImageProduct[] {
    return this.sortedImageProducts();
  }

  createCutoutJob(input: ForgeCreateCutoutJobInput): ForgeJob {
    this.forgeJobCounter += 1;
    const timestamp = this.isoNow();
    const requestedSurveyIds = Array.isArray(input.surveyIds)
      ? input.surveyIds.filter((value): value is string => typeof value === "string")
      : [];

    const job: ForgeJob = {
      id: `forge-job-${this.forgeJobCounter}`,
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
      errorMessage: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    job.request = buildCutoutRequestForJob(job);
    this.forgeJobs.unshift(job);
    return job;
  }

  findJob(jobId: string): ForgeJob | null {
    return this.forgeJobs.find((job) => job.id === jobId) ?? null;
  }

  cancelJob(jobId: string): ForgeJob | null {
    const job = this.findJob(jobId);
    if (!job) {
      return null;
    }

    if (job.status === "COMPLETED") {
      return job;
    }

    job.status = "CANCELLED";
    job.updatedAt = this.isoNow();
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

    job.status = "QUEUED";
    job.progressPercent = 0;
    job.errorMessage = null;
    job.request = buildCutoutRequestForJob(job);
    job.updatedAt = this.isoNow();
    return job;
  }

  async advanceJobs(): Promise<void> {
    for (const job of this.forgeJobs) {
      if (job.status === "QUEUED") {
        if (!job.request) {
          job.request = buildCutoutRequestForJob(job);
        }
        job.status = "RUNNING";
        job.progressPercent = Math.max(job.progressPercent, 15);
        job.errorMessage = null;
        job.updatedAt = this.isoNow();
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
            job.errorMessage =
              error instanceof Error ? error.message : "Forge worker execution failed.";
          }
          job.updatedAt = this.isoNow();
        }
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
    const imageProduct = this.forgeImageProducts.find((image) => image.id === imageId) ?? null;
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

    return cached;
  }

  buildArtifactRoute(imageId: string, kind: "preview" | "fits"): string {
    return `/api/forge/artifacts/${imageId}/${kind}`;
  }
}
