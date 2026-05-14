import test from "node:test";
import assert from "node:assert/strict";
import { ForgeTargetResolverService } from "./forge-target-resolver.service";

test("resolves a CDS Sesame XML response into Forge target data", async () => {
  const service = new ForgeTargetResolverService();
  const originalFetch = global.fetch;

  global.fetch = (async () =>
    new Response(
      [
        "<Sesame>",
        "<Resolver>",
        "<oname>Cygnus A</oname>",
        "<jradeg>299.86815</jradeg>",
        "<jdedeg>40.73391</jdedeg>",
        "</Resolver>",
        "</Sesame>",
      ].join(""),
      { status: 200, headers: { "content-type": "application/xml" } }
    )) as typeof fetch;

  try {
    const result = await service.resolve("Cygnus A");

    assert.equal(result.status, 200);
    assert.deepEqual(result.body, {
      data: {
        query: "Cygnus A",
        canonicalName: "Cygnus A",
        providerName: "CDS Sesame / SIMBAD",
        sourceUrl:
          "https://cds.unistra.fr/cgi-bin/nph-sesame/-oxp/SNV?Cygnus%20A",
        ra: 299.86815,
        dec: 40.73391,
        suggestedRadiusArcmin: 12,
      },
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test("returns not found when Sesame response does not contain coordinates", async () => {
  const service = new ForgeTargetResolverService();
  const originalFetch = global.fetch;

  global.fetch = (async () =>
    new Response(
      "<Sesame><Resolver><oname>Unknown</oname></Resolver></Sesame>",
      {
        status: 200,
        headers: { "content-type": "application/xml" },
      }
    )) as typeof fetch;

  try {
    const result = await service.resolve("Unknown");

    assert.equal(result.status, 404);
    assert.deepEqual(result.body, {
      error: "forge_target_not_found",
      message: 'No target coordinates were resolved for "Unknown".',
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test("returns bad request for blank target queries", async () => {
  const service = new ForgeTargetResolverService();

  const result = await service.resolve("   ");

  assert.equal(result.status, 400);
  assert.deepEqual(result.body, {
    error: "forge_target_resolution_bad_request",
    message: "Target query is required for Forge target resolution.",
  });
});

test("returns unavailable when the upstream request throws", async () => {
  const service = new ForgeTargetResolverService();
  const originalFetch = global.fetch;

  global.fetch = (async () => {
    throw new Error("network down");
  }) as typeof fetch;

  try {
    const result = await service.resolve("M87");

    assert.equal(result.status, 502);
    assert.deepEqual(result.body, {
      error: "forge_target_resolution_unavailable",
      message: "Forge target resolution is unavailable right now.",
      details: "network down",
    });
  } finally {
    global.fetch = originalFetch;
  }
});
