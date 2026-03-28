import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ArtifactCacheService } from "../artifacts/artifact-cache.service";
import { ForgeStateRepository } from "../state/forge-state.repository";
import { ForgeStoreService } from "../state/forge-store.service";
import { ForgeGraphqlService, forgeGraphqlDocuments } from "./forge-graphql.service";

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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "forge-graphql-"));
  process.env["FORGE_ARTIFACT_CACHE_DIR"] = path.join(root, "artifacts");
  process.env["FORGE_STATE_FILE"] = path.join(root, "state", "forge-state.json");
  process.env["FORGE_DISABLE_FITS_PRERENDER"] = "true";
  return new ForgeGraphqlService(
    new ForgeStoreService(new ArtifactCacheService(), new ForgeStateRepository())
  );
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

test("ForgeJobById resolves a single job through the contract document set", async () => {
  const graphqlService = createGraphqlService();
  const result = await graphqlService.execute({
    operationName: "ForgeJobById",
    variables: {
      id: "forge-job-1",
    },
  });

  assert.equal(result.status, 200);
  const payload = result.body as {
    data: {
      job: {
        id: string;
        requestedSurveyIds: string[];
        errorCode: string | null;
      };
    };
  };

  assert.equal(payload.data.job.id, "forge-job-1");
  assert.deepEqual(payload.data.job.requestedSurveyIds, ["legacy"]);
  assert.equal(payload.data.job.errorCode, null);
});

test("ForgeProvenanceByImage resolves a single image provenance record", async () => {
  const graphqlService = createGraphqlService();
  const bootstrap = await graphqlService.execute({
    operationName: "ForgeWorkbenchBootstrap",
    variables: {},
  });
  const bootstrapPayload = bootstrap.body as {
    data: {
      imageProducts: Array<{ id: string; surveyId: string }>;
    };
  };
  const legacyImageId =
    bootstrapPayload.data.imageProducts.find((image) => image.surveyId === "legacy")?.id ?? "";

  const result = await graphqlService.execute({
    operationName: "ForgeProvenanceByImage",
    variables: {
      imageId: legacyImageId,
    },
  });

  assert.equal(result.status, 200);
  const payload = result.body as {
    data: {
      provenanceByImage: {
        providerName: string;
        sourceSurvey: string;
      };
    };
  };

  assert.equal(payload.data.provenanceByImage.providerName, "NOIRLab / Legacy Surveys");
  assert.equal(payload.data.provenanceByImage.sourceSurvey, "Legacy Surveys DR10");
});

test("missing GraphQL source returns a normalized FORGE_BAD_REQUEST error", async () => {
  const graphqlService = createGraphqlService();
  const result = await graphqlService.execute({});

  assert.equal(result.status, 400);
  const payload = result.body as {
    errors: Array<{
      message: string;
      extensions: {
        code: string;
        retryable: boolean;
      };
    }>;
  };

  assert.equal(payload.errors[0]?.message, "GraphQL query is required");
  assert.equal(payload.errors[0]?.extensions.code, "FORGE_BAD_REQUEST");
  assert.equal(payload.errors[0]?.extensions.retryable, false);
});

test("invalid cutout input returns a normalized validation error", async () => {
  const graphqlService = createGraphqlService();
  const result = await graphqlService.execute({
    operationName: "CreateCutoutJob",
    variables: {
      input: {
        requestedBy: "test-user",
        targetName: "",
        ra: "not-a-number",
        dec: 12.39112,
        radiusArcmin: 0,
        surveyIds: [],
      },
    },
  });

  assert.equal(result.status, 400);
  const payload = result.body as {
    errors: Array<{
      message: string;
      extensions: {
        code: string;
      };
    }>;
  };

  assert.equal(payload.errors[0]?.extensions.code, "FORGE_VALIDATION_ERROR");
});

test("missing jobs return a normalized job-not-found error", async () => {
  const graphqlService = createGraphqlService();
  const result = await graphqlService.execute({
    operationName: "CancelJob",
    variables: {
      jobId: "missing-job",
    },
  });

  assert.equal(result.status, 400);
  const payload = result.body as {
    errors: Array<{
      message: string;
      extensions: {
        code: string;
      };
    }>;
  };

  assert.equal(payload.errors[0]?.message, "Forge job not found.");
  assert.equal(payload.errors[0]?.extensions.code, "FORGE_JOB_NOT_FOUND");
});

test("document registry includes the current contract operations", () => {
  assert.ok(forgeGraphqlDocuments["ForgeWorkbenchBootstrap"]);
  assert.ok(forgeGraphqlDocuments["ForgeJobById"]);
  assert.ok(forgeGraphqlDocuments["ForgeImageProductsByJob"]);
  assert.ok(forgeGraphqlDocuments["ForgeProvenanceByImage"]);
  assert.ok(forgeGraphqlDocuments["CreateCutoutJob"]);
  assert.ok(forgeGraphqlDocuments["CancelJob"]);
  assert.ok(forgeGraphqlDocuments["RetryJob"]);
  assert.ok(forgeGraphqlDocuments["CacheImageArtifact"]);
});
