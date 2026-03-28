import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { ArtifactCacheService } from "../artifacts/artifact-cache.service";
import { ForgeStoreService } from "./forge-store.service";

function createStore(): ForgeStoreService {
  process.env["FORGE_ARTIFACT_CACHE_DIR"] = path.join(
    process.cwd(),
    "tmp",
    "cosmic-forge-artifacts-test"
  );
  process.env["FORGE_DISABLE_FITS_PRERENDER"] = "true";
  return new ForgeStoreService(new ArtifactCacheService());
}

test("unsupported non-legacy cutout jobs fail with an explicit adapter error", async () => {
  const store = createStore();
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
  assert.match(updated?.errorMessage || "", /No production cutout adapter is available yet/);
});

test("allwise jobs get a normalized IRSA request before retrieval is wired", () => {
  const store = createStore();
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

  const store = createStore();
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
  const store = createStore();
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
  const store = createStore();
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

test("legacy cutout jobs complete with normalized request and provenance fields", async () => {
  const store = createStore();
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
