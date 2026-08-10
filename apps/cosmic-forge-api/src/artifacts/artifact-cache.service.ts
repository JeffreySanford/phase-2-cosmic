import { Injectable, Logger } from "@nestjs/common";
import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { execFile } from "node:child_process";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
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
  cachedAt: number;
}

/**
 * Sidecar written next to every cached artifact.
 *
 * The in-memory index is keyed by image id while the files are named by cache
 * key, so the mapping cannot be recovered from filenames alone. Without the
 * sidecar a restart left the index empty and the files orphaned: every artifact
 * missed and was re-downloaded, while the old bytes stayed on disk forever.
 */
interface ArtifactSidecar {
  imageId: string;
  previewPath: string;
  fitsPath: string | null;
  cachedAt: number;
}

const SIDECAR_SUFFIX = ".meta.json";

@Injectable()
export class ArtifactCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ArtifactCacheService.name);
  private readonly execFileAsync = promisify(execFile);
  private readonly cacheDir =
    process.env["FORGE_ARTIFACT_CACHE_DIR"] ||
    path.join(process.cwd(), "tmp", "cosmic-forge-artifacts");
  private readonly fitsPrerenderDisabled =
    process.env["FORGE_DISABLE_FITS_PRERENDER"] === "true";
  private readonly artifactCacheIndex = new Map<string, ArtifactFiles>();

  /**
   * How long a cached artifact stays valid. Cached renditions are a convenience
   * copy of someone else's archive, never a system of record, so they expire.
   * An unbounded cache on a hot path is what takes services down.
   */
  private readonly ttlMs = Number(
    process.env["FORGE_ARTIFACT_CACHE_TTL_MS"] ?? 24 * 60 * 60 * 1000
  );
  private readonly sweepIntervalMs = Number(
    process.env["FORGE_ARTIFACT_CACHE_SWEEP_MS"] ?? 60 * 60 * 1000
  );
  /** Refuse to buffer a body larger than this; cutouts are megabytes, not gigabytes. */
  private readonly maxArtifactBytes = Number(
    process.env["FORGE_ARTIFACT_MAX_BYTES"] ?? 256 * 1024 * 1024
  );
  private sweepTimer: NodeJS.Timeout | null = null;

  onModuleInit(): void {
    this.restoreIndexFromDisk();
    this.sweepExpired();
    this.sweepTimer = setInterval(() => {
      try {
        this.sweepExpired();
      } catch (error) {
        this.logger.warn(`Artifact cache sweep failed: ${String(error)}`);
      }
    }, this.sweepIntervalMs);
    // Never hold the process open purely to run a cache sweep.
    this.sweepTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  private ensureCacheDir(): void {
    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  private sidecarPath(cacheKey: string): string {
    return path.join(this.cacheDir, `${cacheKey}${SIDECAR_SUFFIX}`);
  }

  private isExpired(cachedAt: number, now = Date.now()): boolean {
    return now - cachedAt >= this.ttlMs;
  }

  /**
   * Rebuild the index from sidecars so a restart reuses what is already on disk
   * instead of re-downloading it and leaking the previous copies.
   */
  private restoreIndexFromDisk(): void {
    if (!existsSync(this.cacheDir)) {
      return;
    }

    let restored = 0;
    for (const entry of readdirSync(this.cacheDir)) {
      if (!entry.endsWith(SIDECAR_SUFFIX)) continue;
      const sidecarPath = path.join(this.cacheDir, entry);
      try {
        const sidecar = JSON.parse(
          readFileSync(sidecarPath, "utf8")
        ) as ArtifactSidecar;
        // A sidecar without its preview is not a usable cache entry.
        if (!sidecar?.imageId || !existsSync(sidecar.previewPath)) {
          this.discardArtifact(entry.slice(0, -SIDECAR_SUFFIX.length));
          continue;
        }
        this.artifactCacheIndex.set(sidecar.imageId, {
          previewPath: sidecar.previewPath,
          fitsPath: sidecar.fitsPath,
          cachedAt: sidecar.cachedAt,
        });
        restored += 1;
      } catch {
        // An unreadable sidecar is treated as a corrupt entry and removed.
        this.discardArtifact(entry.slice(0, -SIDECAR_SUFFIX.length));
      }
    }

    if (restored > 0) {
      this.logger.log(`Restored ${restored} cached artifact(s) from disk`);
    }
  }

  /** Remove every file belonging to one cache key, best effort. */
  private discardArtifact(cacheKey: string): void {
    for (const suffix of [".jpg", ".png", ".fits", SIDECAR_SUFFIX]) {
      try {
        rmSync(path.join(this.cacheDir, `${cacheKey}${suffix}`), {
          force: true,
        });
      } catch {
        // Best effort: a file we cannot remove is retried on the next sweep.
      }
    }
  }

  /** Drop expired entries from both the index and the disk. */
  sweepExpired(now = Date.now()): number {
    if (!existsSync(this.cacheDir)) {
      return 0;
    }

    let removed = 0;
    for (const entry of readdirSync(this.cacheDir)) {
      if (!entry.endsWith(SIDECAR_SUFFIX)) continue;
      const cacheKey = entry.slice(0, -SIDECAR_SUFFIX.length);
      try {
        const sidecar = JSON.parse(
          readFileSync(path.join(this.cacheDir, entry), "utf8")
        ) as ArtifactSidecar;
        if (!this.isExpired(sidecar.cachedAt, now)) continue;
        this.artifactCacheIndex.delete(sidecar.imageId);
        this.discardArtifact(cacheKey);
        removed += 1;
      } catch {
        this.discardArtifact(cacheKey);
        removed += 1;
      }
    }

    if (removed > 0) {
      this.logger.log(`Expired ${removed} cached artifact(s)`);
    }
    return removed;
  }

  private readonly artifactDownloadRetryCount = Number(
    process.env["FORGE_ARTIFACT_CACHE_DOWNLOAD_RETRIES"] ?? "3"
  );
  private readonly artifactDownloadRetryBaseDelayMs = Number(
    process.env["FORGE_ARTIFACT_CACHE_DOWNLOAD_RETRY_DELAY_MS"] ?? "500"
  );

  /**
   * Read a response body with a hard ceiling.
   *
   * The whole retrieval design assumes archive-side cutouts measured in
   * megabytes; this is the one place a mis-resolved URL could pull a full
   * multi-gigabyte product into the heap instead. Content-Length is checked
   * first when the archive declares it, and the stream is counted regardless so
   * a chunked response cannot slip past.
   *
   * `Response` is shadowed by the express import in this file, so the fetch
   * response type is referenced through `fetch` itself.
   */
  private async readBoundedBody(
    response: Awaited<ReturnType<typeof fetch>>,
    url: string
  ): Promise<Buffer> {
    const declared = Number(response.headers.get("content-length") ?? NaN);
    if (Number.isFinite(declared) && declared > this.maxArtifactBytes) {
      throw new Error(
        `Artifact download refused: ${declared} bytes exceeds limit ${this.maxArtifactBytes} (${url})`
      );
    }

    if (!response.body) {
      return Buffer.alloc(0);
    }

    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let total = 0;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > this.maxArtifactBytes) {
        await reader.cancel();
        throw new Error(
          `Artifact download aborted: exceeded limit ${this.maxArtifactBytes} bytes (${url})`
        );
      }
      chunks.push(Buffer.from(value));
    }

    return Buffer.concat(chunks, total);
  }

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

        return await this.readBoundedBody(response, url);
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

    // The built binary has no extension off Windows. Hardcoding `.exe` made
    // this lookup always miss on Linux, silently falling back to `go run`, which
    // compiles on demand and needs the Go toolchain present at runtime.
    const builtBinary = path.join(
      process.cwd(),
      "dist",
      "apps",
      "cosmic-forge-fits-renderer-go",
      process.platform === "win32" ? "fits-renderer.exe" : "fits-renderer"
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

    const cachedAt = Date.now();
    this.artifactCacheIndex.set(imageProduct.id, {
      previewPath,
      fitsPath,
      cachedAt,
    });
    // Sidecar last: it is the record that makes this entry restorable, so it is
    // only written once the files it points at exist.
    const sidecar: ArtifactSidecar = {
      imageId: imageProduct.id,
      previewPath,
      fitsPath,
      cachedAt,
    };
    writeFileSync(this.sidecarPath(cacheKey), JSON.stringify(sidecar), "utf8");

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
    const entry = this.artifactCacheIndex.get(imageId);
    if (!entry) {
      return null;
    }
    // Checked on read as well as on sweep: an entry that expires between sweeps
    // must not be served, and the sweep interval is a cleanup cadence rather
    // than a correctness boundary.
    if (this.isExpired(entry.cachedAt)) {
      this.artifactCacheIndex.delete(imageId);
      return null;
    }
    return entry;
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
