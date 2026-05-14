import { Injectable } from "@nestjs/common";
import { execFile } from "node:child_process";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { Response } from "express";
import type { ForgeImageProduct } from "../domain/forge.models";

interface ArtifactFiles {
  previewPath: string;
  fitsPath: string | null;
}

@Injectable()
export class ArtifactCacheService {
  private readonly execFileAsync = promisify(execFile);
  private readonly cacheDir =
    process.env["FORGE_ARTIFACT_CACHE_DIR"] ||
    path.join(process.cwd(), "tmp", "cosmic-forge-artifacts");
  private readonly fitsPrerenderDisabled =
    process.env["FORGE_DISABLE_FITS_PRERENDER"] === "true";
  private readonly artifactCacheIndex = new Map<string, ArtifactFiles>();

  private ensureCacheDir(): void {
    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  private readonly artifactDownloadRetryCount = Number(
    process.env["FORGE_ARTIFACT_CACHE_DOWNLOAD_RETRIES"] ?? "3"
  );
  private readonly artifactDownloadRetryBaseDelayMs = Number(
    process.env["FORGE_ARTIFACT_CACHE_DOWNLOAD_RETRY_DELAY_MS"] ?? "500"
  );

  private async downloadArtifact(url: string): Promise<Buffer> {
    let lastError: Error | null = null;

    for (
      let attempt = 0;
      attempt < this.artifactDownloadRetryCount;
      attempt += 1
    ) {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          const error = new Error(
            `Artifact download failed: ${response.status} ${response.statusText}`
          );
          if (
            [429, 502, 503, 504].includes(response.status) &&
            attempt < this.artifactDownloadRetryCount - 1
          ) {
            const delayMs =
              this.artifactDownloadRetryBaseDelayMs * Math.pow(2, attempt);
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            lastError = error;
            continue;
          }
          throw error;
        }

        return Buffer.from(await response.arrayBuffer());
      } catch (error) {
        const isRetryable =
          error instanceof Error &&
          (error.message.includes("429") ||
            error.message.includes("502") ||
            error.message.includes("503") ||
            error.message.includes("504"));

        if (isRetryable && attempt < this.artifactDownloadRetryCount - 1) {
          const delayMs =
            this.artifactDownloadRetryBaseDelayMs * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          lastError = error;
          continue;
        }

        throw error;
      }
    }

    throw lastError ?? new Error("Artifact download failed: unknown error");
  }

  private resolveRendererCommand(): { command: string; argsPrefix: string[] } {
    const configuredBinary = process.env["FORGE_FITS_RENDERER_BIN"];
    if (configuredBinary) {
      return { command: configuredBinary, argsPrefix: [] };
    }

    const builtBinary = path.join(
      process.cwd(),
      "dist",
      "apps",
      "cosmic-forge-fits-renderer-go",
      "fits-renderer.exe"
    );
    if (existsSync(builtBinary)) {
      return { command: builtBinary, argsPrefix: [] };
    }

    return {
      command: "go",
      argsPrefix: ["run", "./apps/cosmic-forge-fits-renderer-go"],
    };
  }

  private async renderFitsPreview(
    inputPath: string,
    outputPath: string
  ): Promise<void> {
    const renderer = this.resolveRendererCommand();
    await this.execFileAsync(
      renderer.command,
      [...renderer.argsPrefix, "--input", inputPath, "--output", outputPath],
      { cwd: process.cwd() }
    );
  }

  async cacheImageArtifact(
    imageProduct: ForgeImageProduct | null,
    cacheKey: string,
    buildArtifactRoute: (imageId: string, kind: "preview" | "fits") => string
  ): Promise<ForgeImageProduct | null> {
    if (!imageProduct) {
      return null;
    }

    if (imageProduct.artifactMode === "cached") {
      return imageProduct;
    }

    if (this.fitsPrerenderDisabled && imageProduct.format === "fits") {
      return imageProduct;
    }

    this.ensureCacheDir();

    let fitsPath: string | null = null;
    let previewPath = path.join(this.cacheDir, `${cacheKey}.jpg`);

    const needsFitsPrerender =
      !this.fitsPrerenderDisabled &&
      (imageProduct.format === "fits" ||
        Boolean(imageProduct.fitsUrl) ||
        /application\/fits/i.test(imageProduct.provenance.outputFormat || ""));

    if (imageProduct.fitsUrl) {
      fitsPath = path.join(this.cacheDir, `${cacheKey}.fits`);
      writeFileSync(
        fitsPath,
        await this.downloadArtifact(imageProduct.fitsUrl)
      );
    }

    if (needsFitsPrerender) {
      if (!fitsPath) {
        fitsPath = path.join(this.cacheDir, `${cacheKey}.fits`);
        writeFileSync(
          fitsPath,
          await this.downloadArtifact(imageProduct.previewUrl)
        );
      }
      previewPath = path.join(this.cacheDir, `${cacheKey}.png`);
      await this.renderFitsPreview(fitsPath, previewPath);
    } else {
      writeFileSync(
        previewPath,
        await this.downloadArtifact(imageProduct.previewUrl)
      );
    }

    this.artifactCacheIndex.set(imageProduct.id, {
      previewPath,
      fitsPath,
    });

    imageProduct.artifactMode = "cached";
    imageProduct.cacheKey = cacheKey;
    imageProduct.cacheStatus = "cached";
    imageProduct.previewUrl = buildArtifactRoute(imageProduct.id, "preview");
    imageProduct.fitsUrl = fitsPath
      ? buildArtifactRoute(imageProduct.id, "fits")
      : null;

    return imageProduct;
  }

  getArtifactFiles(imageId: string): ArtifactFiles | null {
    return this.artifactCacheIndex.get(imageId) ?? null;
  }

  sendBinaryFile(
    res: Response,
    filePath: string | null,
    contentType: string
  ): void {
    if (!filePath || !existsSync(filePath)) {
      if (!res.headersSent) {
        res.status(404).json({
          error: "ARTIFACT_NOT_FOUND",
        });
      }
      return;
    }

    const stat = statSync(filePath);
    const resolvedContentType =
      path.extname(filePath).toLowerCase() === ".png"
        ? "image/png"
        : contentType;

    if (!res.headersSent) {
      res.status(200);
      res.set({
        "Content-Type": resolvedContentType,
        "Content-Length": stat.size,
        "Access-Control-Allow-Origin": "*",
      });
    }

    const stream = createReadStream(filePath);

    const cleanup = () => {
      if (!stream.destroyed) {
        stream.destroy();
      }
    };

    stream.on("error", (err) => {
      cleanup();
      if (!res.headersSent) {
        res.status(500).json({ error: "STREAM_ERROR", message: err.message });
      } else {
        res.destroy();
      }
    });

    stream.on("end", () => {
      if (!res.writableEnded) {
        res.end();
      }
    });

    stream.pipe(res);
  }
}
