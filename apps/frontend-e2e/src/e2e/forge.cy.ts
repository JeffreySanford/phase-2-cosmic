describe("forge workbench", () => {
  beforeEach(() => {
    const transparentPngBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=";
    let includeCreatedJobInBootstrap = false;

    cy.intercept("GET", "/api/forge/health", {
      statusCode: 200,
      body: {
        status: "ok",
        service: "cosmic-forge-api",
      },
    }).as("forgeHealth");

    cy.intercept("GET", "/api/forge/artifacts/*/preview", {
      statusCode: 200,
      headers: {
        "content-type": "image/png",
      },
      body: Cypress.Buffer.from(transparentPngBase64, "base64"),
    }).as("forgePreview");

    cy.intercept("GET", "/api/forge/artifacts/*/fits", {
      statusCode: 200,
      headers: {
        "content-type": "application/fits",
      },
      body: "SIMPLE  =                    T",
    }).as("forgeFits");

    cy.intercept("POST", "/api/forge/graphql", (req) => {
      const operationName = req.body?.operationName;

      if (operationName === "CreateCutoutJob") {
        includeCreatedJobInBootstrap = true;
        req.reply({
          statusCode: 200,
          body: {
            data: {
              createCutoutJob: {
                id: "forge-job-99",
                type: "cutout",
                status: "QUEUED",
                progressPercent: 0,
                requestedBy: "jeffreysanford",
                targetName: "M87",
                ra: 187.70593,
                dec: 12.39112,
                radiusArcmin: 15,
                requestedSurveyIds: ["allwise"],
                resultImageIds: [],
                errorMessage: null,
                request: {
                  providerAdapter: "irsa-allwise",
                  sourceService: "sia-v2",
                  missionFamily: "allwise",
                  collection: "allwise/p3am_cdd",
                  layer: "allwise/p3am_cdd",
                  bands: ["W1"],
                  ra: 187.70593,
                  dec: 12.39112,
                  radiusArcmin: 15,
                  pixscale: null,
                  size: 1800,
                  width: 1800,
                  height: 1800,
                  outputFormat: "fits",
                  retrievalPathType: "ibe-cutout",
                  discoveryUrl:
                    "https://irsa.ipac.caltech.edu/ibe/sia/wise/allwise/p3am_cdd?POS=187.70593,12.39112&SIZE=0.25000&INTERSECT=OVERLAPS",
                  jpegCutoutUrl: null,
                  fitsCutoutUrl:
                    "https://irsa.ipac.caltech.edu/ibe/data/wise/allwise/p3am_cdd/example.fits?center=187.70593,12.39112&size=1800arcsec&gzip=false",
                },
                createdAt: "2026-03-27T20:30:00.000Z",
                updatedAt: "2026-03-27T20:30:00.000Z",
              },
            },
          },
        });
        return;
      }

      req.reply({
        statusCode: 200,
        body: {
          data: {
            serviceInfo: {
              name: "cosmic-forge-api",
              status: "test",
              operationName: "ForgeWorkbenchBootstrap",
              graphReady: true,
            },
            surveys: [
              {
                id: "legacy",
                name: "Legacy Surveys",
                providerName: "NOIRLab / Legacy Surveys",
                waveband: "optical",
                supportsFits: true,
                supportsCutout: true,
                supportsPreview: true,
                previewReady: true,
                citationUrl: "https://www.legacysurvey.org/viewer",
              },
              {
                id: "allwise",
                name: "AllWISE",
                providerName: "NASA/IPAC IRSA",
                waveband: "infrared",
                supportsFits: true,
                supportsCutout: true,
                supportsPreview: true,
                previewReady: false,
                citationUrl: "https://irsa.ipac.caltech.edu/Missions/wise.html",
              },
            ],
            jobs: [
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
                requestedSurveyIds: ["legacy"],
                resultImageIds: ["forge-image-1"],
                errorMessage: null,
                createdAt: "2026-03-27T20:00:00.000Z",
                updatedAt: "2026-03-27T20:05:00.000Z",
              },
              ...(includeCreatedJobInBootstrap
                ? [
                    {
                      id: "forge-job-99",
                      type: "cutout",
                      status: "QUEUED",
                      progressPercent: 0,
                      requestedBy: "jeffreysanford",
                      targetName: "M87",
                      ra: 187.70593,
                      dec: 12.39112,
                      radiusArcmin: 15,
                      requestedSurveyIds: ["allwise"],
                      resultImageIds: [],
                      errorMessage: null,
                      request: {
                        providerAdapter: "irsa-allwise",
                        sourceService: "sia-v2",
                        missionFamily: "allwise",
                        collection: "allwise/p3am_cdd",
                        layer: "allwise/p3am_cdd",
                        bands: ["W1"],
                        ra: 187.70593,
                        dec: 12.39112,
                        radiusArcmin: 15,
                        pixscale: null,
                        size: 1800,
                        width: 1800,
                        height: 1800,
                        outputFormat: "fits",
                        retrievalPathType: "ibe-cutout",
                        discoveryUrl:
                          "https://irsa.ipac.caltech.edu/ibe/sia/wise/allwise/p3am_cdd?POS=187.70593,12.39112&SIZE=0.25000&INTERSECT=OVERLAPS",
                        jpegCutoutUrl: null,
                        fitsCutoutUrl:
                          "https://irsa.ipac.caltech.edu/ibe/data/wise/allwise/p3am_cdd/example.fits?center=187.70593,12.39112&size=1800arcsec&gzip=false",
                      },
                      createdAt: "2026-03-27T20:30:00.000Z",
                      updatedAt: "2026-03-27T20:30:00.000Z",
                    },
                  ]
                : []),
              {
                id: "forge-job-2",
                type: "cutout",
                status: "COMPLETED",
                progressPercent: 100,
                requestedBy: "jeffreysanford",
                targetName: "M87",
                ra: 187.70593,
                dec: 12.39112,
                radiusArcmin: 15,
                requestedSurveyIds: ["allwise"],
                resultImageIds: ["forge-image-2"],
                errorMessage: null,
                request: {
                  providerAdapter: "irsa-allwise",
                  sourceService: "sia-v2",
                  missionFamily: "allwise",
                  collection: "allwise/p3am_cdd",
                  layer: "allwise/p3am_cdd",
                  bands: ["W1"],
                  ra: 187.70593,
                  dec: 12.39112,
                  radiusArcmin: 15,
                  pixscale: 1.37499998090796,
                  size: 1800,
                  width: 1800,
                  height: 1800,
                  outputFormat: "fits",
                  retrievalPathType: "ibe-cutout",
                  discoveryUrl:
                    "https://irsa.ipac.caltech.edu/ibe/sia/wise/allwise/p3am_cdd?POS=187.70593,12.39112&SIZE=0.25000&INTERSECT=OVERLAPS",
                  jpegCutoutUrl: null,
                  fitsCutoutUrl: "/api/forge/artifacts/forge-image-2/fits",
                },
                createdAt: "2026-03-28T07:05:00.000Z",
                updatedAt: "2026-03-28T07:06:00.000Z",
              },
            ],
            imageProducts: [
              {
                id: "forge-image-1",
                jobId: "forge-job-1",
                surveyId: "legacy",
                providerName: "NOIRLab / Legacy Surveys",
                artifactMode: "external",
                format: "jpeg",
                previewUrl: "https://example.invalid/preview.jpg",
                fitsUrl: "https://example.invalid/image.fits",
                authoritativeUrl: "https://example.invalid/preview.jpg",
                accessedAt: "2026-03-27T20:05:00.000Z",
                cacheKey: null,
                cacheStatus: "external-only",
                provenance: {
                  sourceSurvey: "Legacy Surveys DR10",
                  providerName: "NOIRLab / Legacy Surveys",
                  citationUrl: "https://www.legacysurvey.org/viewer",
                  authoritativeUrl: "https://example.invalid/preview.jpg",
                  accessedAt: "2026-03-27T20:05:00.000Z",
                  transformChain: ["external-cutout-request"],
                  artifactMode: "external",
                },
                createdAt: "2026-03-27T20:05:00.000Z",
              },
              {
                id: "forge-image-2",
                jobId: "forge-job-2",
                surveyId: "allwise",
                providerName: "NASA/IPAC IRSA",
                artifactMode: "cached",
                format: "fits",
                previewUrl: "/api/forge/artifacts/forge-image-2/preview",
                fitsUrl: "/api/forge/artifacts/forge-image-2/fits",
                authoritativeUrl:
                  "https://irsa.ipac.caltech.edu/ibe/data/wise/allwise/p3am_cdd/example.fits?center=187.70593,12.39112&size=1800arcsec&gzip=false",
                accessedAt: "2026-03-28T07:06:00.000Z",
                cacheKey: "forge-image-2-123",
                cacheStatus: "cached",
                provenance: {
                  sourceSurvey: "AllWISE Atlas",
                  providerName: "NASA/IPAC IRSA",
                  citationUrl: "https://irsa.ipac.caltech.edu/Missions/wise.html",
                  authoritativeUrl:
                    "https://irsa.ipac.caltech.edu/ibe/data/wise/allwise/p3am_cdd/example.fits?center=187.70593,12.39112&size=1800arcsec&gzip=false",
                  accessedAt: "2026-03-28T07:06:00.000Z",
                  transformChain: ["irsa-sia-discovery", "irsa-ibe-cutout", "local-cache-retention"],
                  artifactMode: "cached",
                  missionFamily: "allwise",
                  collection: "allwise/p3am_cdd",
                  retrievalPathType: "ibe-cutout",
                  outputFormat: "image/fits",
                  citationReference: "https://irsa.ipac.caltech.edu/ack.html",
                  datasetDoi: "10.26131/IRSA1",
                  layer: "allwise/p3am_cdd",
                  bandSet: ["W1"],
                  ra: 187.70593,
                  dec: 12.39112,
                  pixscale: 1.37499998090796,
                  size: 1800,
                  width: 1800,
                  height: 1800,
                },
                createdAt: "2026-03-28T07:06:00.000Z",
              },
            ],
          },
        },
      });
    }).as("forgeGraphql");
  });

  it("loads bootstrap data and creates a queued cutout job", () => {
    cy.visit("/forge");
    cy.wait("@forgeHealth");
    cy.wait("@forgeGraphql");

    cy.contains("Public survey image orchestration workbench");
    cy.contains("Forge API health").parent().contains(/^ok$/);
    cy.contains("GraphQL bootstrap").parent().contains("graph ready: yes");
    cy.contains("h3", "My jobs").closest("section").contains("M87 · cutout");

    cy.contains("button", "Create cutout job").click();

    cy.wait("@forgeGraphql")
      .its("request.body.operationName")
      .should("eq", "CreateCutoutJob");

    cy.contains("forge-job-99");
    cy.contains("Surveys: allwise");
    cy.contains("preview pending until completion");
  });

  it("renders a completed AllWISE result with cached preview and fits artifact links", () => {
    cy.visit("/forge");
    cy.wait("@forgeHealth");
    cy.wait("@forgeGraphql");

    cy.contains("M87 · cutout")
      .closest(".forge-queue__item")
      .contains("Surveys: allwise")
      .closest(".forge-queue__item")
      .click();

    cy.contains("Artifact mode:").parent().contains("cached");
    cy.contains("Cache status:").parent().contains("cached");
    cy.contains("Preview provider:").parent().contains("NASA/IPAC IRSA");
    cy.contains("Survey:").parent().contains("allwise");
    cy.contains("Provenance layer:").parent().contains("allwise/p3am_cdd");
    cy.contains("Provenance bands:").parent().contains("W1");
    cy.contains("Transform chain:").parent().contains("irsa-sia-discovery");
    cy.contains("Transform chain:").parent().contains("local-cache-retention");

    cy.get("img.forge-results__image")
      .should("have.attr", "src")
      .and("include", "/api/forge/artifacts/forge-image-2/preview");
    cy.wait("@forgePreview");

    cy.contains("FITS URL:")
      .parent()
      .find("a")
      .should("have.attr", "href", "/api/forge/artifacts/forge-image-2/fits");
  });
});
