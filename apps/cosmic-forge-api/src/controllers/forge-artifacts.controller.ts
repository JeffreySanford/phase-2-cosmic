import { Controller, Get, Inject, Param, Res } from "@nestjs/common";
import type { Response } from "express";
import { ArtifactCacheService } from "../artifacts/artifact-cache.service";

@Controller("artifacts")
export class ForgeArtifactsController {
  constructor(
    @Inject(ArtifactCacheService) private readonly artifactCache: ArtifactCacheService
  ) {}

  @Get(":imageId/:kind")
  getArtifact(
    @Param("imageId") imageId: string,
    @Param("kind") kind: "preview" | "fits",
    @Res() res: Response
  ): void {
    const artifactFiles = this.artifactCache.getArtifactFiles(imageId);
    if (!artifactFiles) {
      res.status(404).json({
        error: "ARTIFACT_NOT_CACHED",
        imageId,
        kind,
      });
      return;
    }

    if (kind === "preview") {
      this.artifactCache.sendBinaryFile(res, artifactFiles.previewPath, "image/jpeg");
      return;
    }

    this.artifactCache.sendBinaryFile(res, artifactFiles.fitsPath, "application/fits");
  }
}
