import assert from "node:assert/strict";
import test from "node:test";
import { ArtifactCacheService } from "../artifacts/artifact-cache.service";
import { ForgeStoreService } from "../state/forge-store.service";
import { ForgeGraphqlService } from "./forge-graphql.service";

type BootstrapPayload = {
  data: {
    jobs: Array<{
      requestedSurveyIds: string[];
      request: {
        providerAdapter: string;
        sourceService: string;
        missionFamily: string | null;
        collection: string | null;
        layer: string | null;
        bands: string[];
        discoveryUrl: string | null;
      } | null;
    }>;
    imageProducts: Array<{
      surveyId: string;
      provenance: {
        layer: string;
        bandSet: string[];
        pixscale: number;
        authoritativeUrl: string;
      };
    }>;
  };
  errors?: unknown;
};

function createGraphqlService(): ForgeGraphqlService {
  process.env["FORGE_DISABLE_FITS_PRERENDER"] = "true";
  return new ForgeGraphqlService(new ForgeStoreService(new ArtifactCacheService()));
}

test("ForgeWorkbenchBootstrap resolves via operationName and returns request/provenance fields", async () => {
  const graphqlService = createGraphqlService();
  const result = await graphqlService.execute({
    operationName: "ForgeWorkbenchBootstrap",
    variables: {},
  });

  assert.equal(result.status, 200);
  const payload = result.body as BootstrapPayload;
  assert.equal(payload.errors, undefined);

  const legacyJob = payload.data.jobs.find((job) => job.requestedSurveyIds.includes("legacy"));
  const legacyImage = payload.data.imageProducts.find(
    (image) => image.surveyId === "legacy"
  );

  assert.ok(legacyJob);
  assert.ok(legacyJob.request);
  assert.equal(legacyJob.request.providerAdapter, "legacy-surveys");
  assert.equal(legacyJob.request.sourceService, "viewer-cutout");
  assert.equal(legacyJob.request.layer, "ls-dr10");
  assert.deepEqual(legacyJob.request.bands, ["g", "r", "z"]);

  assert.ok(legacyImage);
  assert.equal(legacyImage.provenance.layer, "ls-dr10");
  assert.deepEqual(legacyImage.provenance.bandSet, ["g", "r", "z"]);
  assert.equal(typeof legacyImage.provenance.pixscale, "number");
  assert.match(legacyImage.provenance.authoritativeUrl, /legacysurvey\.org/);
});

test("ForgeWorkbenchBootstrap includes ESASky as a planned survey source", async () => {
  const graphqlService = createGraphqlService();
  const result = await graphqlService.execute({
    operationName: "ForgeWorkbenchBootstrap",
    variables: {},
  });

  assert.equal(result.status, 200);
  const payload = result.body as {
    data: {
      surveys: Array<{
        id: string;
        name: string;
        providerName: string;
        supportsCutout: boolean;
        supportsPreview: boolean;
        previewReady: boolean;
      }>;
    };
  };

  const esasky = payload.data.surveys.find((survey) => survey.id === "esasky");
  assert.ok(esasky);
  assert.equal(esasky.name, "ESASky");
  assert.equal(esasky.providerName, "ESA ESASky");
  assert.equal(esasky.supportsCutout, true);
  assert.equal(esasky.supportsPreview, true);
  assert.equal(esasky.previewReady, false);
});

test("CreateCutoutJob returns a normalized AllWISE request scaffold", async () => {
  const graphqlService = createGraphqlService();
  const result = await graphqlService.execute({
    operationName: "CreateCutoutJob",
    variables: {
      input: {
        requestedBy: "test-user",
        targetName: "M87",
        ra: 187.70593,
        dec: 12.39112,
        radiusArcmin: 15,
        surveyIds: ["allwise"],
      },
    },
  });

  assert.equal(result.status, 200);
  const payload = result.body as {
    data: {
      createCutoutJob: {
        request: {
          providerAdapter: string;
          sourceService: string;
          missionFamily: string | null;
          collection: string | null;
          bands: string[];
          discoveryUrl: string | null;
          fitsCutoutUrl: string | null;
        } | null;
      };
    };
  };

  const request = payload.data.createCutoutJob.request;
  assert.ok(request);
  assert.equal(request.providerAdapter, "irsa-allwise");
  assert.equal(request.sourceService, "sia-v2");
  assert.equal(request.missionFamily, "allwise");
  assert.equal(request.collection, "allwise/p3am_cdd");
  assert.deepEqual(request.bands, ["W1"]);
  assert.match(request.discoveryUrl || "", /irsa\.ipac\.caltech\.edu\/ibe\/sia/);
  assert.match(request.fitsCutoutUrl || "", /pending=ibe-cutout/);
});

test("CreateCutoutJob returns a normalized SkyView derived-preview request scaffold", async () => {
  const graphqlService = createGraphqlService();
  const result = await graphqlService.execute({
    operationName: "CreateCutoutJob",
    variables: {
      input: {
        requestedBy: "test-user",
        targetName: "Cygnus A",
        ra: 299.86815,
        dec: 40.73391,
        radiusArcmin: 10,
        surveyIds: ["skyview"],
      },
    },
  });

  assert.equal(result.status, 200);
  const payload = result.body as {
    data: {
      createCutoutJob: {
        request: {
          providerAdapter: string;
          sourceService: string;
          missionFamily: string | null;
          collection: string | null;
          bands: string[];
          discoveryUrl: string | null;
          fitsCutoutUrl: string | null;
        } | null;
      };
    };
  };

  const request = payload.data.createCutoutJob.request;
  assert.ok(request);
  assert.equal(request.providerAdapter, "skyview-derived-preview");
  assert.equal(request.sourceService, "skyview-query");
  assert.equal(request.missionFamily, "skyview");
  assert.equal(request.collection, "skyview/derived-preview");
  assert.deepEqual(request.bands, ["DSS2 Red"]);
  assert.match(request.discoveryUrl || "", /skyview\.gsfc\.nasa\.gov/);
  assert.equal(request.fitsCutoutUrl, null);
});
