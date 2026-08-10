// These pin the properties the artifact cache previously lacked. It kept every
// artifact forever, and its index lived only in memory while the files lived on
// disk, so a restart both lost the cache and orphaned the bytes it had written.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ArtifactCacheService } from "./artifact-cache.service";
import type { ForgeImageProduct } from "../domain/forge.models";

function withCacheDir(ttlMs?: string): string {
  const cacheDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "forge-artifact-cache-")
  );
  process.env["FORGE_ARTIFACT_CACHE_DIR"] = cacheDir;
  if (ttlMs === undefined) {
    delete process.env["FORGE_ARTIFACT_CACHE_TTL_MS"];
  } else {
    process.env["FORGE_ARTIFACT_CACHE_TTL_MS"] = ttlMs;
  }
  return cacheDir;
}

function cleanup(cacheDir: string): void {
  fs.rmSync(cacheDir, { recursive: true, force: true });
  delete process.env["FORGE_ARTIFACT_CACHE_DIR"];
  delete process.env["FORGE_ARTIFACT_CACHE_TTL_MS"];
}

function writeCachedArtifact(
  cacheDir: string,
  imageId: string,
  cacheKey: string,
  cachedAt: number
): string {
  const previewPath = path.join(cacheDir, `${cacheKey}.jpg`);
  fs.writeFileSync(previewPath, "preview-bytes");
  fs.writeFileSync(
    path.join(cacheDir, `${cacheKey}.meta.json`),
    JSON.stringify({ imageId, previewPath, fitsPath: null, cachedAt })
  );
  return previewPath;
}

test("restores cached artifacts from disk so a restart does not re-download them", () => {
  const cacheDir = withCacheDir();
  try {
    writeCachedArtifact(cacheDir, "image-1", "key-1", Date.now());

    const service = new ArtifactCacheService();
    service.onModuleInit();

    assert.ok(service.getArtifactFiles("image-1"));
    service.onModuleDestroy();
  } finally {
    cleanup(cacheDir);
  }
});

test("expires artifacts past the TTL and removes their files", () => {
  const cacheDir = withCacheDir();
  try {
    const twoDaysAgo = Date.now() - 48 * 60 * 60 * 1000;
    const previewPath = writeCachedArtifact(
      cacheDir,
      "image-old",
      "key-old",
      twoDaysAgo
    );

    const service = new ArtifactCacheService();
    service.onModuleInit();

    assert.equal(service.getArtifactFiles("image-old"), null);
    assert.equal(fs.existsSync(previewPath), false);
    assert.equal(
      fs.readdirSync(cacheDir).filter((f) => f.endsWith(".meta.json")).length,
      0
    );
    service.onModuleDestroy();
  } finally {
    cleanup(cacheDir);
  }
});

test("does not serve an entry that expires between sweeps", () => {
  // The sweep is a cleanup cadence, not a correctness boundary: reads check too.
  const cacheDir = withCacheDir("1");
  try {
    writeCachedArtifact(cacheDir, "image-brief", "key-brief", Date.now() - 5);

    const service = new ArtifactCacheService();
    service.onModuleInit();

    assert.equal(service.getArtifactFiles("image-brief"), null);
    service.onModuleDestroy();
  } finally {
    cleanup(cacheDir);
  }
});

test("discards a sidecar whose preview file is missing", () => {
  const cacheDir = withCacheDir();
  try {
    fs.writeFileSync(
      path.join(cacheDir, "key-orphan.meta.json"),
      JSON.stringify({
        imageId: "image-orphan",
        previewPath: path.join(cacheDir, "key-orphan.jpg"),
        fitsPath: null,
        cachedAt: Date.now(),
      })
    );

    const service = new ArtifactCacheService();
    service.onModuleInit();

    assert.equal(service.getArtifactFiles("image-orphan"), null);
    assert.equal(fs.existsSync(path.join(cacheDir, "key-orphan.meta.json")), false);
    service.onModuleDestroy();
  } finally {
    cleanup(cacheDir);
  }
});

test("leaves an already-cached product untouched", async () => {
  const cacheDir = withCacheDir();
  try {
    const service = new ArtifactCacheService();
    const product = {
      id: "image-cached",
      artifactMode: "cached",
      format: "jpeg",
    } as unknown as ForgeImageProduct;

    const result = await service.cacheImageArtifact(product, "key", () => "/x");

    assert.equal(result, product);
  } finally {
    cleanup(cacheDir);
  }
});

test("stopping the sweep timer is idempotent", () => {
  const cacheDir = withCacheDir();
  try {
    const service = new ArtifactCacheService();
    service.onModuleInit();
    service.onModuleDestroy();
    service.onModuleDestroy();
    assert.ok(true);
  } finally {
    cleanup(cacheDir);
  }
});
