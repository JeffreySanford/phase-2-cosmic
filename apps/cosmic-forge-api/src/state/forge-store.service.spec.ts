import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ArtifactCacheService } from "../artifacts/artifact-cache.service";
import { ForgeStateRepository } from "./forge-state.repository";
import { ForgeStoreService } from "./forge-store.service";

function createStore(testName = "default"): ForgeStoreService {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `forge-store-${testName}-`));
  process.env["FORGE_ARTIFACT_CACHE_DIR"] = path.join(root, "artifacts");
  process.env["FORGE_STATE_FILE"] = path.join(root, "state", "forge-state.json");
  process.env["FORGE_DISABLE_FITS_PRERENDER"] = "true";
  return new ForgeStoreService(new ArtifactCacheService(), new ForgeStateRepository());
}

test("unsupported non-legacy cutout jobs fail with an explicit adapter error", async () => {
  const store = createStore("unsupported");
  const job = store.createCutoutJob({
    requestedBy: "test-user",
    targetName: "Cygnus A",
    ra: 299.86815,
    dec: 40.73391,
    radiusArcmin: 10,
    surveyIds: ["vlass"],
  });

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await store.advanceJobs();
  }

  const updated = store.getJobs().find((item) => item.id === job.id);
  assert.equal(updated?.status, "FAILED");
  assert.equal(updated?.errorCode, "FORGE_UNSUPPORTED_SURVEY");
  assert.match(updated?.errorMessage || "", /No production cutout adapter is available yet/);
});

test("allwise jobs get a normalized IRSA request before retrieval is wired", () => {
  const store = createStore("allwise-request");
  const job = store.createCutoutJob({
    requestedBy: "test-user",
    targetName: "M87",
    ra: 187.70593,
    dec: 12.39112,
    radiusArcmin: 15,
    surveyIds: ["allwise"],
  });

  assert.ok(job.request);
  assert.equal(job.request?.providerAdapter, "irsa-allwise");
  assert.equal(job.request?.sourceService, "sia-v2");
  assert.equal(job.request?.missionFamily, "allwise");
  assert.equal(job.request?.collection, "allwise/p3am_cdd");
  assert.deepEqual(job.request?.bands, ["W1"]);
  assert.match(job.request?.discoveryUrl || "", /irsa\.ipac\.caltech\.edu\/ibe\/sia/);
  assert.match(job.request?.fitsCutoutUrl || "", /pending=ibe-cutout/);
});

test("skyview jobs get a normalized derived-preview request scaffold", () => {
  const store = createStore("skyview-request");
  const job = store.createCutoutJob({
    requestedBy: "test-user",
    targetName: "M87",
    ra: 187.70593,
    dec: 12.39112,
    radiusArcmin: 15,
    surveyIds: ["skyview"],
  });

  assert.ok(job.request);
  assert.equal(job.request?.providerAdapter, "skyview-derived-preview");
  assert.equal(job.request?.sourceService, "skyview-query");
  assert.equal(job.request?.missionFamily, "skyview");
  assert.equal(job.request?.collection, "skyview/derived-preview");
  assert.equal(job.request?.layer, "DSS2 Red");
  assert.deepEqual(job.request?.bands, ["DSS2 Red"]);
  assert.equal(job.request?.outputFormat, "jpeg");
  assert.equal(job.request?.retrievalPathType, "skyview-query");
  assert.match(job.request?.jpegCutoutUrl || "", /skyview\.gsfc\.nasa\.gov/);
  assert.equal(job.request?.fitsCutoutUrl, null);
});

test("allwise cutout jobs complete through live SIA discovery and IBE retrieval", async () => {
  const originalFetch = global.fetch;
  global.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/ibe/sia/wise/allwise/p3am_cdd")) {
      return {
        ok: true,
        text: async () => `<?xml version="1.0" encoding="utf-8"?>
<VOTABLE><RESOURCE><TABLE>
<FIELD name="sia_title"/><FIELD name="sia_url"/><FIELD name="sia_fmt"/><FIELD name="sia_scale"/><FIELD name="sia_bp_id"/><FIELD name="unc_url"/><FIELD name="cov_url"/><FIELD name="coadd_id"/>
<DATA><TABLEDATA><TR>
<TD>W1 Coadd 1884p121_ac51</TD>
<TD>https://irsa.ipac.caltech.edu/ibe/data/wise/allwise/p3am_cdd/18/1884/1884p121_ac51/1884p121_ac51-w1-int-3.fits</TD>
<TD>image/fits</TD>
<TD>-0.0003819444391411 0.0003819444391411</TD>
<TD>W1</TD>
<TD>https://irsa.ipac.caltech.edu/unc.fits.gz</TD>
<TD>https://irsa.ipac.caltech.edu/cov.fits.gz</TD>
<TD>1884p121_ac51</TD>
</TR></TABLEDATA></DATA></TABLE></RESOURCE></VOTABLE>`,
      } as Response;
    }

    if (url.includes("/ibe/data/wise/allwise/p3am_cdd") && init?.method === "HEAD") {
      return {
        ok: true,
        status: 200,
      } as Response;
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const store = createStore("allwise-live");
  const job = store.createCutoutJob({
    requestedBy: "test-user",
    targetName: "M87",
    ra: 187.70593,
    dec: 12.39112,
    radiusArcmin: 15,
    surveyIds: ["allwise"],
  });

  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await store.advanceJobs();
    }

    const updated = store.getJobs().find((item) => item.id === job.id);
    const imageProduct = store.getImageProducts().find((item) => item.jobId === job.id);

    assert.equal(updated?.status, "COMPLETED");
    assert.equal(updated?.request?.providerAdapter, "irsa-allwise");
    assert.deepEqual(updated?.request?.bands, ["W1"]);
    assert.match(updated?.request?.fitsCutoutUrl || "", /center=187\.70593,12\.39112/);
    assert.ok(imageProduct);
    assert.equal(imageProduct?.surveyId, "allwise");
    assert.equal(imageProduct?.format, "fits");
    assert.deepEqual(imageProduct?.provenance.bandSet, ["W1"]);
    assert.equal(imageProduct?.provenance.collection, "allwise/p3am_cdd");
    assert.equal(imageProduct?.provenance.retrievalPathType, "ibe-cutout");
  } finally {
    global.fetch = originalFetch;
  }
});

test("legacy job retry clears failure state and rebuilds the normalized request", () => {
  const store = createStore("legacy-retry");
  const job = store.createCutoutJob({
    requestedBy: "test-user",
    targetName: "M87",
    ra: 187.70593,
    dec: 12.39112,
    radiusArcmin: 15,
    surveyIds: ["legacy"],
  });

  job.status = "FAILED";
  job.errorMessage = "legacy adapter upstream timeout";
  job.request = null;

  const retried = store.retryJob(job.id);

  assert.equal(retried?.status, "QUEUED");
  assert.equal(retried?.progressPercent, 0);
  assert.equal(retried?.errorMessage, null);
  assert.ok(retried?.request);
  assert.equal(retried?.request?.layer, "ls-dr10");
  assert.deepEqual(retried?.request?.bands, ["g", "r", "z"]);
});

test("allwise retry rebuilds the normalized request scaffold", () => {
  const store = createStore("allwise-retry");
  const job = store.createCutoutJob({
    requestedBy: "test-user",
    targetName: "M87",
    ra: 187.70593,
    dec: 12.39112,
    radiusArcmin: 15,
    surveyIds: ["allwise"],
  });

  job.status = "FAILED";
  job.errorMessage = "IRSA retrieval timeout";
  job.request = null;

  const retried = store.retryJob(job.id);

  assert.equal(retried?.status, "QUEUED");
  assert.equal(retried?.errorMessage, null);
  assert.equal(retried?.request?.providerAdapter, "irsa-allwise");
  assert.equal(retried?.request?.collection, "allwise/p3am_cdd");
  assert.deepEqual(retried?.request?.bands, ["W1"]);
});

test("skyview retry rebuilds the normalized derived-preview request scaffold", () => {
  const store = createStore("skyview-retry");
  const job = store.createCutoutJob({
    requestedBy: "test-user",
    targetName: "M87",
    ra: 187.70593,
    dec: 12.39112,
    radiusArcmin: 15,
    surveyIds: ["skyview"],
  });

  job.status = "FAILED";
  job.errorMessage = "SkyView upstream unavailable";
  job.request = null;

  const retried = store.retryJob(job.id);

  assert.equal(retried?.status, "QUEUED");
  assert.equal(retried?.errorMessage, null);
  assert.equal(retried?.request?.providerAdapter, "skyview-derived-preview");
  assert.equal(retried?.request?.collection, "skyview/derived-preview");
  assert.deepEqual(retried?.request?.bands, ["DSS2 Red"]);
});

test("legacy cutout jobs complete with normalized request and provenance fields", async () => {
  const store = createStore("legacy-complete");
  const job = store.createCutoutJob({
    requestedBy: "test-user",
    targetName: "M87",
    ra: 187.70593,
    dec: 12.39112,
    radiusArcmin: 15,
    surveyIds: ["legacy"],
  });

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await store.advanceJobs();
  }

  const completedJob = store.getJobs().find((item) => item.id === job.id);
  const imageProduct = store.getImageProducts().find((item) => item.jobId === job.id);

  assert.equal(completedJob?.status, "COMPLETED");
  assert.ok(completedJob?.request);
  assert.equal(completedJob?.request?.providerAdapter, "legacy-surveys");
  assert.equal(completedJob?.request?.sourceService, "viewer-cutout");
  assert.equal(completedJob?.request?.layer, "ls-dr10");
  assert.deepEqual(completedJob?.request?.bands, ["g", "r", "z"]);

  assert.ok(imageProduct);
  assert.equal(imageProduct?.surveyId, "legacy");
  assert.equal(imageProduct?.provenance.layer, "ls-dr10");
  assert.deepEqual(imageProduct?.provenance.bandSet, ["g", "r", "z"]);
  assert.equal(imageProduct?.provenance.ra, 187.70593);
  assert.equal(imageProduct?.provenance.dec, 12.39112);
  assert.match(imageProduct?.previewUrl || "", /jpeg-cutout/);
  assert.match(imageProduct?.fitsUrl || "", /fits-cutout/);
});

test("skyview cutout jobs complete as derived preview products with SkyView provenance", async () => {
  const store = createStore("skyview-complete");
  const job = store.createCutoutJob({
    requestedBy: "test-user",
    targetName: "Cygnus A",
    ra: 299.86815,
    dec: 40.73391,
    radiusArcmin: 10,
    surveyIds: ["skyview"],
  });

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await store.advanceJobs();
  }

  const completedJob = store.getJobs().find((item) => item.id === job.id);
  const imageProduct = store.getImageProducts().find((item) => item.jobId === job.id);

  assert.equal(completedJob?.status, "COMPLETED");
  assert.ok(completedJob?.request);
  assert.equal(completedJob?.request?.providerAdapter, "skyview-derived-preview");
  assert.equal(completedJob?.request?.sourceService, "skyview-query");
  assert.equal(completedJob?.request?.fitsCutoutUrl, null);

  assert.ok(imageProduct);
  assert.equal(imageProduct?.surveyId, "skyview");
  assert.equal(imageProduct?.format, "jpeg");
  assert.equal(imageProduct?.providerName, "NASA GSFC SkyView");
  assert.equal(imageProduct?.fitsUrl, null);
  assert.equal(imageProduct?.provenance.providerName, "NASA GSFC SkyView");
  assert.equal(imageProduct?.provenance.retrievalPathType, "skyview-query");
  assert.equal(imageProduct?.provenance.outputFormat, "image/jpeg");
  assert.deepEqual(imageProduct?.provenance.transformChain, [
    "skyview-query",
    "skyview-derived-image",
  ]);
  assert.equal(imageProduct?.provenance.collection, "skyview/derived-preview");
  assert.equal(imageProduct?.provenance.layer, "DSS2 Red");
});

test("jobs persist across store instances instead of relying on process memory", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "forge-store-persist-"));
  process.env["FORGE_ARTIFACT_CACHE_DIR"] = path.join(root, "artifacts");
  process.env["FORGE_STATE_FILE"] = path.join(root, "state", "forge-state.json");
  process.env["FORGE_DISABLE_FITS_PRERENDER"] = "true";

  const repository = new ForgeStateRepository();
  const firstStore = new ForgeStoreService(new ArtifactCacheService(), repository);
  const created = firstStore.createCutoutJob({
    requestedBy: "persist-user",
    targetName: "M87",
    ra: 187.70593,
    dec: 12.39112,
    radiusArcmin: 15,
    surveyIds: ["legacy"],
  });

  const secondStore = new ForgeStoreService(new ArtifactCacheService(), repository);
  const reloaded = secondStore.getJob(created.id);

  assert.ok(reloaded);
  assert.equal(reloaded?.targetName, "M87");
  assert.equal(reloaded?.requestedBy, "persist-user");
  assert.equal(reloaded?.status, "QUEUED");
  assert.ok(reloaded?.request);
});

test("claimed jobs execute through a real queue lifecycle without placeholder progress ticks", async () => {
  const store = createStore("queue-lifecycle");
  const job = store.createCutoutJob({
    requestedBy: "queue-user",
    targetName: "M87",
    ra: 187.70593,
    dec: 12.39112,
    radiusArcmin: 15,
    surveyIds: ["legacy"],
  });

  const claimed = store.claimNextJob();
  assert.equal(claimed?.id, job.id);
  assert.equal(claimed?.status, "RUNNING");
  assert.equal(claimed?.progressPercent, 10);

  const completed = await store.executeClaimedJob(job.id);
  assert.equal(completed?.status, "COMPLETED");
  assert.equal(completed?.progressPercent, 100);

  const persisted = store.getJob(job.id);
  assert.equal(persisted?.status, "COMPLETED");
  assert.ok(persisted?.resultImageIds.length);
});

test("running job cancellation prevents worker completion from publishing artifacts", async () => {
  const store = createStore("cancel-running");
  const job = store.createCutoutJob({
    requestedBy: "cancel-user",
    targetName: "Cygnus A",
    ra: 299.86815,
    dec: 40.73391,
    radiusArcmin: 10,
    surveyIds: ["skyview"],
  });

  store.claimNextJob();
  const cancelled = store.cancelJob(job.id);
  assert.equal(cancelled?.status, "CANCELLED");

  const executed = await store.executeClaimedJob(job.id);
  assert.equal(executed?.status, "CANCELLED");
  assert.equal(store.getImageProductsByJob(job.id).length, 0);
});

test("timeout-like provider failures are classified explicitly for retry handling", async () => {
  const originalFetch = global.fetch;
  global.fetch = (async () => {
    const error = new Error("provider request timed out");
    error.name = "AbortError";
    throw error;
  }) as typeof fetch;

  const store = createStore("timeout-classification");
  const job = store.createCutoutJob({
    requestedBy: "timeout-user",
    targetName: "M87",
    ra: 187.70593,
    dec: 12.39112,
    radiusArcmin: 15,
    surveyIds: ["allwise"],
  });

  try {
    store.claimNextJob();
    const failed = await store.executeClaimedJob(job.id);
    assert.equal(failed?.status, "FAILED");
    assert.equal(failed?.errorCode, "FORGE_UPSTREAM_TIMEOUT");

    const retried = store.retryJob(job.id);
    assert.equal(retried?.status, "QUEUED");
    assert.equal(retried?.errorCode, null);
  } finally {
    global.fetch = originalFetch;
  }
});

test("IRSA discovery 503 failures are classified as upstream unavailable and retryable", async () => {
  const originalFetch = global.fetch;
  global.fetch = (async () =>
    ({
      ok: false,
      status: 503,
      text: async () => "",
    }) as Response) as typeof fetch;

  const store = createStore("irsa-503");
  const job = store.createCutoutJob({
    requestedBy: "unavailable-user",
    targetName: "M87",
    ra: 187.70593,
    dec: 12.39112,
    radiusArcmin: 15,
    surveyIds: ["allwise"],
  });

  try {
    store.claimNextJob();
    const failed = await store.executeClaimedJob(job.id);
    assert.equal(failed?.status, "FAILED");
    assert.equal(failed?.errorCode, "FORGE_UPSTREAM_UNAVAILABLE");
    assert.match(failed?.errorMessage || "", /IRSA SIA discovery is currently unavailable/);
  } finally {
    global.fetch = originalFetch;
  }
});

test("IRSA retrieval 404 failures are classified as upstream bad response", async () => {
  const originalFetch = global.fetch;
  global.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/ibe/sia/wise/allwise/p3am_cdd")) {
      return {
        ok: true,
        text: async () => `<?xml version="1.0" encoding="utf-8"?>
<VOTABLE><RESOURCE><TABLE>
<FIELD name="sia_title"/><FIELD name="sia_url"/><FIELD name="sia_fmt"/><FIELD name="sia_scale"/><FIELD name="sia_bp_id"/>
<DATA><TABLEDATA><TR>
<TD>W1 Coadd</TD>
<TD>https://irsa.ipac.caltech.edu/ibe/data/wise/allwise/p3am_cdd/example.fits</TD>
<TD>image/fits</TD>
<TD>-0.0003819444391411 0.0003819444391411</TD>
<TD>W1</TD>
</TR></TABLEDATA></DATA></TABLE></RESOURCE></VOTABLE>`,
      } as Response;
    }

    if (init?.method === "HEAD") {
      return {
        ok: false,
        status: 404,
      } as Response;
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const store = createStore("irsa-404");
  const job = store.createCutoutJob({
    requestedBy: "bad-response-user",
    targetName: "M87",
    ra: 187.70593,
    dec: 12.39112,
    radiusArcmin: 15,
    surveyIds: ["allwise"],
  });

  try {
    store.claimNextJob();
    const failed = await store.executeClaimedJob(job.id);
    assert.equal(failed?.status, "FAILED");
    assert.equal(failed?.errorCode, "FORGE_UPSTREAM_BAD_RESPONSE");
    assert.match(failed?.errorMessage || "", /IRSA IBE retrieval returned an unexpected status/);
  } finally {
    global.fetch = originalFetch;
  }
});
