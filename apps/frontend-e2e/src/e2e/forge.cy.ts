describe("forge workbench", () => {
  beforeEach(() => {
    const transparentPngBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=";
    let includeCreatedJobInBootstrap = false;
    let createdJobStatus: "QUEUED" | "CANCELLED" = "QUEUED";
    let includeRetriedJobInBootstrap = false;
    let includeCompositeJobInBootstrap = false;
    let legacyArtifactCached = false;

    cy.intercept("GET", "/api/forge/artifacts/*/preview", {
      statusCode: 200,
      headers: {
        "content-type": "image/png",
      },
      body: Cypress.Buffer.from(transparentPngBase64, "base64"),
    }).as("forgePreview");

    cy.intercept("GET", "/api/forge/external-preview/legacy.jpg", {
      statusCode: 200,
      headers: {
        "content-type": "image/png",
      },
      body: Cypress.Buffer.from(transparentPngBase64, "base64"),
    }).as("legacyExternalPreview");

    cy.intercept("GET", "/api/forge/artifacts/*/fits", {
      statusCode: 200,
      headers: {
        "content-type": "application/fits",
      },
      body: "SIMPLE  =                    T",
    }).as("forgeFits");

    cy.intercept("GET", "/api/forge/resolve-target*", (req) => {
      const query = String(req.query?.query ?? "");

      if (query === "Eta Carinae") {
        req.reply({
          statusCode: 200,
          body: {
            data: {
              query: "Eta Carinae",
              canonicalName: "Eta Carinae",
              providerName: "CDS Sesame / SIMBAD",
              sourceUrl:
                "https://cds.unistra.fr/cgi-bin/nph-sesame/-oxp/SNV?Eta%20Carinae",
              ra: 161.265,
              dec: -59.6844,
              suggestedRadiusArcmin: 20,
            },
          },
        });
        return;
      }

      req.reply({
        statusCode: 404,
        body: {
          error: "forge_target_not_found",
          message: `No target coordinates were resolved for "${query}".`,
        },
      });
    }).as("forgeResolveTarget");

    cy.intercept("POST", "/api/forge/graphql", (req) => {
      const operationName = req.body?.operationName;

      if (operationName === "CreateCutoutJob") {
        req.alias = "forgeCreateCutoutJob";
        includeCreatedJobInBootstrap = true;
        createdJobStatus = "QUEUED";
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

      if (operationName === "CreateCompositeJob") {
        req.alias = "forgeCreateCompositeJob";
        includeCompositeJobInBootstrap = true;
        req.reply({
          statusCode: 200,
          body: {
            data: {
              createCompositeJob: {
                id: "forge-job-150",
                type: "composite",
                status: "QUEUED",
                progressPercent: 0,
                requestedBy: "jeffreysanford",
                targetName: "M87 composite",
                ra: 187.70593,
                dec: 12.39112,
                radiusArcmin: 15,
                requestedSurveyIds: ["legacy", "allwise"],
                resultImageIds: [],
                errorCode: null,
                errorMessage: null,
                request: null,
                compositeRequest: {
                  operation: "survey-stack",
                  inputs: [],
                },
                createdAt: "2026-03-28T07:08:00.000Z",
                updatedAt: "2026-03-28T07:08:00.000Z",
              },
            },
          },
        });
        return;
      }

      if (operationName === "CancelJob") {
        req.alias = "forgeCancelJob";
        createdJobStatus = "CANCELLED";
        req.reply({
          statusCode: 200,
          body: {
            data: {
              job: {
                id: "forge-job-99",
                type: "cutout",
                status: "CANCELLED",
                progressPercent: 0,
                requestedBy: "jeffreysanford",
                targetName: "M87",
                ra: 187.70593,
                dec: 12.39112,
                radiusArcmin: 15,
                requestedSurveyIds: ["allwise"],
                resultImageIds: [],
                errorCode: null,
                errorMessage:
                  "Cancellation requested by operator. Worker will not publish completion artifacts.",
                createdAt: "2026-03-27T20:30:00.000Z",
                updatedAt: "2026-03-27T20:31:00.000Z",
              },
            },
          },
        });
        return;
      }

      if (operationName === "RetryJob") {
        req.alias = "forgeRetryJob";
        includeRetriedJobInBootstrap = true;
        req.reply({
          statusCode: 200,
          body: {
            data: {
              job: {
                id: "forge-job-77",
                type: "cutout",
                status: "QUEUED",
                progressPercent: 0,
                requestedBy: "jeffreysanford",
                targetName: "Cygnus A",
                ra: 299.86815,
                dec: 40.73391,
                radiusArcmin: 10,
                requestedSurveyIds: ["allwise"],
                resultImageIds: [],
                errorCode: null,
                errorMessage: null,
                createdAt: "2026-03-27T20:20:00.000Z",
                updatedAt: "2026-03-27T20:32:00.000Z",
              },
            },
          },
        });
        return;
      }

      if (operationName === "CacheImageArtifact") {
        req.alias = "forgeCacheImageArtifact";
        legacyArtifactCached = true;
        req.reply({
          statusCode: 200,
          body: {
            data: {
              imageProduct: {
                id: "forge-image-1",
                jobId: "forge-job-1",
                surveyId: "legacy",
                providerName: "NOIRLab / Legacy Surveys",
                artifactMode: "cached",
                format: "jpeg",
                previewUrl: "/api/forge/artifacts/forge-image-1/preview",
                fitsUrl: "/api/forge/artifacts/forge-image-1/fits",
                authoritativeUrl: "https://example.invalid/preview.jpg",
                accessedAt: "2026-03-27T20:05:00.000Z",
                cacheKey: "forge-image-1-legacy-cache",
                cacheStatus: "cached",
                provenance: {
                  sourceSurvey: "Legacy Surveys DR10",
                  providerName: "NOIRLab / Legacy Surveys",
                  citationUrl: "https://www.legacysurvey.org/viewer",
                  authoritativeUrl: "https://example.invalid/preview.jpg",
                  accessedAt: "2026-03-27T20:05:00.000Z",
                  transformChain: [
                    "external-cutout-request",
                    "local-cache-retention",
                  ],
                  artifactMode: "cached",
                  layer: "ls-dr10",
                  bandSet: ["g", "r", "z"],
                  ra: 187.70593,
                  dec: 12.39112,
                  pixscale: 0.262,
                  size: 512,
                  width: 512,
                  height: 512,
                },
                createdAt: "2026-03-27T20:05:00.000Z",
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
              status: "graphql-live",
              operationName: "ForgeWorkbenchBootstrap",
              graphReady: true,
              contractVersion: "forge-workbench.v1",
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
                previewReady: true,
                citationUrl: "https://irsa.ipac.caltech.edu/Missions/wise.html",
              },
              {
                id: "skyview",
                name: "SkyView Explorer",
                providerName: "NASA GSFC SkyView",
                waveband: "mixed",
                supportsFits: false,
                supportsCutout: true,
                supportsPreview: true,
                previewReady: true,
                citationUrl:
                  "https://skyview.gsfc.nasa.gov/current/cgi/query.pl",
              },
              {
                id: "dss2",
                name: "DSS2 Preview",
                providerName: "NASA GSFC SkyView",
                waveband: "optical",
                supportsFits: false,
                supportsCutout: true,
                supportsPreview: true,
                previewReady: true,
                citationUrl:
                  "https://skyview.gsfc.nasa.gov/current/cgi/query.pl",
              },
              {
                id: "first",
                name: "FIRST Preview",
                providerName: "NASA GSFC SkyView",
                waveband: "radio",
                supportsFits: false,
                supportsCutout: true,
                supportsPreview: true,
                previewReady: true,
                citationUrl:
                  "https://skyview.gsfc.nasa.gov/current/cgi/query.pl",
              },
              {
                id: "2mass-j-preview",
                name: "2MASS J Preview",
                providerName: "NASA GSFC SkyView",
                waveband: "infrared",
                supportsFits: false,
                supportsCutout: true,
                supportsPreview: true,
                previewReady: true,
                citationUrl:
                  "https://skyview.gsfc.nasa.gov/current/cgi/query.pl",
              },
              {
                id: "2mass-h-preview",
                name: "2MASS H Preview",
                providerName: "NASA GSFC SkyView",
                waveband: "infrared",
                supportsFits: false,
                supportsCutout: true,
                supportsPreview: true,
                previewReady: true,
                citationUrl:
                  "https://skyview.gsfc.nasa.gov/current/cgi/query.pl",
              },
              {
                id: "2mass-k-preview",
                name: "2MASS K Preview",
                providerName: "NASA GSFC SkyView",
                waveband: "infrared",
                supportsFits: false,
                supportsCutout: true,
                supportsPreview: true,
                previewReady: true,
                citationUrl:
                  "https://skyview.gsfc.nasa.gov/current/cgi/query.pl",
              },
              {
                id: "panstarrs",
                name: "Pan-STARRS",
                providerName: "MAST / STScI",
                waveband: "optical",
                supportsFits: true,
                supportsCutout: true,
                supportsPreview: true,
                previewReady: true,
                citationUrl:
                  "https://outerspace.stsci.edu/display/PANSTARRS/PS1+Image+Cutout+Service",
              },
              {
                id: "esasky",
                name: "ESASky",
                providerName: "ESA ESASky",
                waveband: "mixed",
                supportsFits: false,
                supportsCutout: true,
                supportsPreview: true,
                previewReady: false,
                citationUrl: "https://open.esa.int/esasky/",
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
                      status: createdJobStatus,
                      progressPercent: 0,
                      requestedBy: "jeffreysanford",
                      targetName: "M87",
                      ra: 187.70593,
                      dec: 12.39112,
                      radiusArcmin: 15,
                      requestedSurveyIds: ["allwise"],
                      resultImageIds: [],
                      errorCode: null,
                      errorMessage:
                        createdJobStatus === "CANCELLED"
                          ? "Cancellation requested by operator. Worker will not publish completion artifacts."
                          : null,
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
              ...(includeRetriedJobInBootstrap
                ? [
                    {
                      id: "forge-job-77",
                      type: "cutout",
                      status: "QUEUED",
                      progressPercent: 0,
                      requestedBy: "jeffreysanford",
                      targetName: "Cygnus A",
                      ra: 299.86815,
                      dec: 40.73391,
                      radiusArcmin: 10,
                      requestedSurveyIds: ["allwise"],
                      resultImageIds: [],
                      errorCode: null,
                      errorMessage: null,
                      request: {
                        providerAdapter: "irsa-allwise",
                        sourceService: "sia-v2",
                        missionFamily: "allwise",
                        collection: "allwise/p3am_cdd",
                        layer: "allwise/p3am_cdd",
                        bands: ["W1"],
                        ra: 299.86815,
                        dec: 40.73391,
                        radiusArcmin: 10,
                        pixscale: null,
                        size: 1200,
                        width: 1200,
                        height: 1200,
                        outputFormat: "fits",
                        retrievalPathType: "ibe-cutout",
                        discoveryUrl:
                          "https://irsa.ipac.caltech.edu/ibe/sia/wise/allwise/p3am_cdd?POS=299.86815,40.73391&SIZE=0.16667&INTERSECT=OVERLAPS",
                        jpegCutoutUrl: null,
                        fitsCutoutUrl:
                          "https://irsa.ipac.caltech.edu/ibe/data/wise/allwise/p3am_cdd/example-cygnus-a.fits?center=299.86815,40.73391&size=1200arcsec&gzip=false",
                      },
                      createdAt: "2026-03-27T20:20:00.000Z",
                      updatedAt: "2026-03-27T20:32:00.000Z",
                    },
                  ]
                : []),
              ...(includeCompositeJobInBootstrap
                ? [
                    {
                      id: "forge-job-150",
                      type: "composite",
                      status: "COMPLETED",
                      progressPercent: 100,
                      requestedBy: "jeffreysanford",
                      targetName: "M87 composite",
                      ra: 187.70593,
                      dec: 12.39112,
                      radiusArcmin: 15,
                      requestedSurveyIds: ["legacy", "allwise"],
                      resultImageIds: ["forge-image-150"],
                      errorCode: null,
                      errorMessage: null,
                      compositeRequest: {
                        operation: "survey-stack",
                        inputs: [],
                        parameters: {
                          mode: "quicklook",
                          sourceCount: 2,
                        },
                      },
                      createdAt: "2026-03-28T07:08:00.000Z",
                      updatedAt: "2026-03-28T07:08:30.000Z",
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
              ...(!includeRetriedJobInBootstrap
                ? [
                    {
                      id: "forge-job-77",
                      type: "cutout",
                      status: "FAILED",
                      progressPercent: 100,
                      requestedBy: "jeffreysanford",
                      targetName: "Cygnus A",
                      ra: 299.86815,
                      dec: 40.73391,
                      radiusArcmin: 10,
                      requestedSurveyIds: ["allwise"],
                      resultImageIds: [],
                      errorCode: "FORGE_UPSTREAM_TIMEOUT",
                      errorMessage: "Provider request timed out.",
                      createdAt: "2026-03-27T20:20:00.000Z",
                      updatedAt: "2026-03-27T20:25:00.000Z",
                    },
                  ]
                : []),
            ],
            imageProducts: [
              {
                id: "forge-image-1",
                jobId: "forge-job-1",
                surveyId: "legacy",
                providerName: "NOIRLab / Legacy Surveys",
                artifactMode: legacyArtifactCached ? "cached" : "external",
                format: "jpeg",
                previewUrl: legacyArtifactCached
                  ? "/api/forge/artifacts/forge-image-1/preview"
                  : "/api/forge/external-preview/legacy.jpg",
                fitsUrl: legacyArtifactCached
                  ? "/api/forge/artifacts/forge-image-1/fits"
                  : "https://example.invalid/image.fits",
                authoritativeUrl: "https://example.invalid/preview.jpg",
                accessedAt: "2026-03-27T20:05:00.000Z",
                cacheKey: legacyArtifactCached
                  ? "forge-image-1-legacy-cache"
                  : null,
                cacheStatus: legacyArtifactCached ? "cached" : "external-only",
                provenance: {
                  sourceSurvey: "Legacy Surveys DR10",
                  providerName: "NOIRLab / Legacy Surveys",
                  citationUrl: "https://www.legacysurvey.org/viewer",
                  authoritativeUrl: "https://example.invalid/preview.jpg",
                  accessedAt: "2026-03-27T20:05:00.000Z",
                  transformChain: legacyArtifactCached
                    ? ["external-cutout-request", "local-cache-retention"]
                    : ["external-cutout-request"],
                  artifactMode: legacyArtifactCached ? "cached" : "external",
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
                  citationUrl:
                    "https://irsa.ipac.caltech.edu/Missions/wise.html",
                  authoritativeUrl:
                    "https://irsa.ipac.caltech.edu/ibe/data/wise/allwise/p3am_cdd/example.fits?center=187.70593,12.39112&size=1800arcsec&gzip=false",
                  accessedAt: "2026-03-28T07:06:00.000Z",
                  transformChain: [
                    "irsa-sia-discovery",
                    "irsa-ibe-cutout",
                    "local-cache-retention",
                  ],
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
              ...(includeCompositeJobInBootstrap
                ? [
                    {
                      id: "forge-image-150",
                      jobId: "forge-job-150",
                      surveyId: "forge-composite",
                      providerName: "Cosmic Forge",
                      artifactMode: "cached",
                      format: "svg",
                      previewUrl:
                        "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect width='100' height='100' fill='%2315324f'/%3E%3C/svg%3E",
                      fitsUrl: null,
                      authoritativeUrl: "/forge",
                      accessedAt: "2026-03-28T07:08:30.000Z",
                      cacheKey: "forge-composite-forge-job-150",
                      cacheStatus: "cached",
                      provenance: {
                        sourceSurvey: "Composite of legacy, allwise",
                        providerName: "Cosmic Forge",
                        citationUrl: "/forge",
                        authoritativeUrl: "/forge",
                        accessedAt: "2026-03-28T07:08:30.000Z",
                        transformChain: [
                          "input-normalization",
                          "multi-input-preparation",
                          "composite-assembly:survey-stack",
                        ],
                        artifactMode: "cached",
                        missionFamily: "forge",
                        collection: "forge/composite-preview",
                        retrievalPathType: "forge-composite",
                        outputFormat: "image/svg+xml",
                        layer: "survey-stack",
                        bandSet: ["legacy", "allwise"],
                        ra: 187.70593,
                        dec: 12.39112,
                        pixscale: null,
                        size: 1200,
                        width: 800,
                        height: 800,
                      },
                      createdAt: "2026-03-28T07:08:30.000Z",
                    },
                  ]
                : []),
            ],
            diagnostics: {
              queueDepth:
                includeCreatedJobInBootstrap || includeRetriedJobInBootstrap
                  ? 1
                  : 0,
              runningJobs: 0,
              failedJobs: includeRetriedJobInBootstrap ? 0 : 1,
              completedJobs: includeCompositeJobInBootstrap ? 3 : 2,
              blockedJobs: includeCreatedJobInBootstrap ? 1 : 0,
              delayedJobs: 0,
              retryingJobs: includeRetriedJobInBootstrap ? 1 : 0,
            },
            metrics: {
              totalJobs:
                2 +
                (includeCreatedJobInBootstrap ? 1 : 0) +
                (includeRetriedJobInBootstrap ? 1 : 0) +
                (includeCompositeJobInBootstrap ? 1 : 0) +
                (includeRetriedJobInBootstrap ? 0 : 1),
              avgRunTimeSec: 5.4,
              successRate: 0.75,
              queueDepth:
                includeCreatedJobInBootstrap || includeRetriedJobInBootstrap
                  ? 1
                  : 0,
              successCount: includeCompositeJobInBootstrap ? 3 : 2,
              failureCount: includeRetriedJobInBootstrap ? 0 : 1,
              cachedArtifactCount: includeCompositeJobInBootstrap ? 2 : 1,
            },
            jobEvents: [
              {
                id: "forge-event-1",
                jobId: "forge-job-2",
                eventType: "JOB_COMPLETED",
                fromStatus: "RUNNING",
                toStatus: "COMPLETED",
                message: "AllWISE artifact published",
                errorCode: null,
                createdAt: "2026-03-28T07:06:00.000Z",
              },
              ...(includeCompositeJobInBootstrap
                ? [
                    {
                      id: "forge-event-2",
                      jobId: "forge-job-150",
                      eventType: "COMPOSITE_JOB_COMPLETED",
                      fromStatus: "RUNNING",
                      toStatus: "COMPLETED",
                      message: "Composite job completed",
                      errorCode: null,
                      createdAt: "2026-03-28T07:08:30.000Z",
                    },
                  ]
                : []),
            ],
          },
        },
      });
    }).as("forgeGraphql");
  });

  it("loads bootstrap data and creates a queued cutout job", () => {
    cy.visit("/forge");
    cy.wait("@forgeGraphql");

    cy.contains("Public survey image orchestration workbench");
    cy.contains("Forge runtime is available");
    cy.contains("h2", "GraphQL read model")
      .closest("article")
      .should("contain.text", "graph ready: yes")
      .and("contain.text", "contract version: forge-workbench.v1")
      .and("contain.text", "refresh mode: GraphQL bootstrap + 10s auto-refresh")
      .and("contain.text", "subscriptions: Deferred for this PI")
      .and(
        "contain.text",
        "Available now: queue diagnostics, metrics, recent job events"
      );
    cy.contains("h3", "My jobs").closest("section").contains("M87 · cutout");

    cy.contains("button.forge-chip", "AllWISE").click({ force: true });
    cy.contains("button", "Create cutout job")
      .should("not.be.disabled")
      .click({ force: true });

    cy.wait("@forgeCreateCutoutJob")
      .its("request.body.operationName")
      .should("eq", "CreateCutoutJob");

    cy.contains("forge-job-99");
    cy.contains("Surveys: allwise");
    cy.contains("preview pending until completion");
  });

  it("populates the workbench from presets and live target lookup", () => {
    cy.visit("/forge");
    cy.wait("@forgeGraphql");

    cy.get('[data-testid="forge-preset-target"]').select("Cygnus A");
    cy.get('input[formcontrolname="target"]').should("have.value", "Cygnus A");
    cy.get('input[formcontrolname="ra"]').should("have.value", "299.86815");
    cy.get('input[formcontrolname="dec"]').should("have.value", "40.73391");
    cy.get('input[formcontrolname="radiusArcmin"]').should("have.value", "12");
    cy.contains("Preset applied: Cygnus A");

    cy.get('input[formcontrolname="target"]').clear();
    cy.get('input[formcontrolname="target"]').type("Eta Carinae");
    cy.contains("button", "Resolve target").click({ force: true });
    cy.wait("@forgeResolveTarget");

    cy.get('input[formcontrolname="target"]').should(
      "have.value",
      "Eta Carinae"
    );
    cy.get('input[formcontrolname="ra"]').should("have.value", "161.265");
    cy.get('input[formcontrolname="dec"]').should("have.value", "-59.6844");
    cy.get('input[formcontrolname="radiusArcmin"]').should("have.value", "20");
    cy.contains("Resolved via CDS Sesame / SIMBAD: Eta Carinae");
  });

  it("creates a composite job and renders queue diagnostics", () => {
    cy.visit("/forge");
    cy.wait("@forgeGraphql");

    cy.contains("button.forge-chip", "AllWISE").click({ force: true });
    cy.contains("button", "Create composite job")
      .should("not.be.disabled")
      .click({ force: true });

    cy.wait("@forgeCreateCompositeJob")
      .its("request.body.operationName")
      .should("eq", "CreateCompositeJob");

    cy.contains("h2", "Diagnostics")
      .closest("article")
      .should("contain.text", "blocked jobs")
      .and("contain.text", "cached artifacts")
      .and("contain.text", "COMPOSITE_JOB_COMPLETED");
  });

  it("walks the composite diagnostics path as a demo-ready workbench flow", () => {
    cy.visit("/forge");
    cy.wait("@forgeGraphql");

    cy.contains("Forge runtime is available");
    cy.contains("contract version: forge-workbench.v1");

    cy.contains("button.forge-chip", "AllWISE").click({ force: true });
    cy.contains("button", "Create composite job").click({ force: true });
    cy.wait("@forgeCreateCompositeJob");
    cy.contains("button", "Refresh workspace").click({ force: true });
    cy.wait("@forgeGraphql");

    cy.contains(".forge-queue__item", "M87 composite · composite").click();
    cy.get('input[formcontrolname="target"]').should(
      "have.value",
      "M87 composite"
    );
    cy.contains("Composite operation:").parent().contains("survey-stack");
    cy.contains("Preview provider:").parent().contains("Cosmic Forge");
    cy.contains("Transform chain:")
      .parent()
      .should("contain.text", "multi-input-preparation")
      .and("contain.text", "composite-assembly:survey-stack");
    cy.contains("h2", "Diagnostics")
      .closest("article")
      .should("contain.text", "queued")
      .and("contain.text", "COMPOSITE_JOB_COMPLETED");
  });

  it("allows a queued job to be cancelled from the Forge queue shell", () => {
    cy.visit("/forge");
    cy.wait("@forgeGraphql");

    cy.contains("button.forge-chip", "AllWISE").click({ force: true });
    cy.contains("button", "Create cutout job").click({ force: true });
    cy.wait("@forgeCreateCutoutJob");

    cy.contains(".forge-queue__item", "preview pending until completion")
      .contains("button", "Cancel")
      .click({ force: true });

    cy.wait("@forgeCancelJob");
    cy.contains(
      ".forge-queue__item",
      "preview pending until completion"
    ).should("contain.text", "CANCELLED");
  });

  it("allows a failed job to be retried from the Forge queue shell", () => {
    cy.visit("/forge");
    cy.wait("@forgeGraphql");

    cy.contains("Cygnus A · cutout")
      .closest(".forge-queue__item")
      .contains("button", "Retry")
      .click({ force: true });

    cy.wait("@forgeRetryJob");
    cy.contains("Cygnus A · cutout")
      .closest(".forge-queue__item")
      .should("contain.text", "QUEUED");
  });

  it("shows adapter-specific upstream failure details for a failed AllWISE job", () => {
    cy.visit("/forge");
    cy.wait("@forgeGraphql");

    cy.contains("Cygnus A · cutout").closest(".forge-queue__item").click();

    cy.get('input[formcontrolname="target"]').should("have.value", "Cygnus A");
    cy.contains("Status:").parent().contains("FAILED");
    cy.contains("Error code:").parent().contains("FORGE_UPSTREAM_TIMEOUT");
    cy.contains("Job error:").parent().contains("Provider request timed out.");
  });

  it("renders a completed AllWISE result with cached preview and fits artifact links", () => {
    cy.visit("/forge");
    cy.wait("@forgeGraphql");

    cy.get(".forge-queue__item")
      .filter(':contains("M87 · cutout")')
      .filter(':contains("Surveys: allwise")')
      .first()
      .click();

    cy.get('input[formcontrolname="target"]').should("have.value", "M87");
    cy.get('input[formcontrolname="ra"]').should("have.value", "187.70593");
    cy.get('input[formcontrolname="dec"]').should("have.value", "12.39112");
    cy.get('input[formcontrolname="radiusArcmin"]').should("have.value", "15");

    cy.contains("Artifact mode:").parent().contains("cached");
    cy.contains("Cache status:")
      .parent()
      .contains("Cached and served by Forge");
    cy.contains("Preview provider:").parent().contains("NASA/IPAC IRSA");
    cy.contains("Survey:").parent().contains("allwise");
    cy.contains("Provenance layer:").parent().contains("allwise/p3am_cdd");
    cy.contains("Provenance bands:").parent().contains("W1");
    cy.contains("Transform chain:").parent().contains("irsa-sia-discovery");
    cy.contains("Transform chain:").parent().contains("local-cache-retention");
    cy.contains("Citation:").parent().contains("NASA/IPAC IRSA citation");
    cy.contains("Authoritative source:")
      .parent()
      .contains("NASA/IPAC IRSA source asset");

    cy.contains("Viewer handoff:")
      .parent()
      .find("a")
      .should("have.attr", "href")
      .and("include", "/view?")
      .and("include", "target=M87")
      .and("include", "ra=187.70593")
      .and("include", "dec=12.39112")
      .and("include", "fov=0.5")
      .and("include", "survey=P%2FallWISE%2Fcolor");

    cy.contains("Preview URL:")
      .parent()
      .find("a")
      .should(
        "have.attr",
        "href",
        "/api/forge/artifacts/forge-image-2/preview"
      );

    cy.contains("FITS URL:")
      .parent()
      .find("a")
      .should("have.attr", "href", "/api/forge/artifacts/forge-image-2/fits");
  });

  it("renders SkyView-derived survey presets as live derived options", () => {
    cy.visit("/forge");
    cy.wait("@forgeGraphql");

    cy.contains("button.forge-chip", "SkyView Explorer")
      .should("not.be.disabled")
      .contains("derived");
    cy.contains("button.forge-chip", "DSS2 Preview")
      .should("not.be.disabled")
      .contains("derived");
    cy.contains("button.forge-chip", "FIRST Preview")
      .should("not.be.disabled")
      .contains("derived");
    cy.contains("button.forge-chip", "2MASS J Preview")
      .should("not.be.disabled")
      .contains("derived");
    cy.contains("button.forge-chip", "Pan-STARRS")
      .should("not.be.disabled")
      .contains("live");
  });

  it("shows provider-specific SkyView source handoff language when a SkyView result is selected", () => {
    cy.intercept("POST", "/api/forge/graphql", (req) => {
      req.reply({
        statusCode: 200,
        body: {
          data: {
            serviceInfo: {
              name: "cosmic-forge-api",
              status: "graphql-live",
              operationName: "ForgeWorkbenchBootstrap",
              graphReady: true,
              contractVersion: "forge-workbench.v1",
            },
            surveys: [
              {
                id: "skyview",
                name: "SkyView",
                providerName: "NASA GSFC SkyView",
                waveband: "mixed",
                supportsFits: false,
                supportsCutout: true,
                supportsPreview: true,
                previewReady: true,
                citationUrl:
                  "https://skyview.gsfc.nasa.gov/current/cgi/query.pl",
              },
            ],
            jobs: [
              {
                id: "forge-job-sky",
                type: "cutout",
                status: "COMPLETED",
                progressPercent: 100,
                requestedBy: "archive-operator",
                targetName: "Cygnus A",
                ra: 299.86815,
                dec: 40.73391,
                radiusArcmin: 10,
                requestedSurveyIds: ["skyview"],
                resultImageIds: ["forge-image-sky"],
                errorCode: null,
                errorMessage: null,
                createdAt: "2026-03-28T09:00:00.000Z",
                updatedAt: "2026-03-28T09:01:00.000Z",
              },
            ],
            imageProducts: [
              {
                id: "forge-image-sky",
                jobId: "forge-job-sky",
                surveyId: "skyview",
                providerName: "NASA GSFC SkyView",
                artifactMode: "external",
                format: "jpeg",
                previewUrl:
                  "https://skyview.gsfc.nasa.gov/current/cgi/runquery.pl?Position=299.86815,40.73391",
                fitsUrl: null,
                authoritativeUrl:
                  "https://skyview.gsfc.nasa.gov/current/cgi/query.pl?Position=299.86815,40.73391",
                accessedAt: "2026-03-28T09:01:00.000Z",
                cacheKey: null,
                cacheStatus: "external-only",
                provenance: {
                  sourceSurvey: "SkyView DSS",
                  providerName: "NASA GSFC SkyView",
                  citationUrl:
                    "https://skyview.gsfc.nasa.gov/current/cgi/query.pl",
                  authoritativeUrl:
                    "https://skyview.gsfc.nasa.gov/current/cgi/query.pl?Position=299.86815,40.73391",
                  accessedAt: "2026-03-28T09:01:00.000Z",
                  transformChain: ["skyview-query", "skyview-derived-image"],
                  artifactMode: "external",
                  missionFamily: "skyview",
                  collection: "skyview/derived-preview",
                  retrievalPathType: "skyview-query",
                  outputFormat: "image/jpeg",
                  citationReference: null,
                  datasetDoi: null,
                  layer: "skyview-dss",
                  bandSet: ["DSS"],
                  ra: 299.86815,
                  dec: 40.73391,
                  pixscale: null,
                  size: 900,
                  width: 900,
                  height: 900,
                },
                createdAt: "2026-03-28T09:01:00.000Z",
              },
            ],
            diagnostics: {
              queueDepth: 0,
              runningJobs: 0,
              failedJobs: 0,
              completedJobs: 1,
              blockedJobs: 0,
              delayedJobs: 0,
              retryingJobs: 0,
            },
            metrics: {
              totalJobs: 1,
              avgRunTimeSec: 3.1,
              successRate: 1,
              queueDepth: 0,
              successCount: 1,
              failureCount: 0,
              cachedArtifactCount: 0,
            },
            jobEvents: [],
          },
        },
      });
    }).as("forgeGraphqlSkyViewOnly");

    cy.visit("/forge");
    cy.wait("@forgeGraphqlSkyViewOnly");

    cy.contains(".forge-queue__item", "Cygnus A · cutout").click();
    cy.get('input[formcontrolname="target"]').should("have.value", "Cygnus A");
    cy.contains("Citation:").parent().contains("NASA GSFC SkyView citation");
    cy.contains("Authoritative source:")
      .parent()
      .contains("Open in NASA GSFC SkyView for this target");
  });

  it("renders ESASky as a planned disabled survey option", () => {
    cy.visit("/forge");
    cy.wait("@forgeGraphql");

    cy.contains("button.forge-chip", "ESASky")
      .should("be.disabled")
      .contains("planned");
  });

  it("renders a clean offline shell when the GraphQL read model is unavailable", () => {
    cy.intercept("POST", "/api/forge/graphql", {
      statusCode: 502,
      body: {
        error: "forge_graphql_proxy_error",
        message: "Unable to reach Cosmic Forge GraphQL endpoint",
      },
    }).as("forgeGraphqlOffline");

    cy.visit("/forge");
    cy.wait("@forgeGraphqlOffline");

    cy.contains("Forge read model is offline through the SSR seam");
    cy.contains(
      "GraphQL bootstrap failed. You can still inspect the form shell"
    );
    cy.contains("Forge GraphQL read model failed:");
    cy.contains("h2", "Workbench shell");
    cy.contains("Select a job to inspect its result");
  });

  it("shows an explicit artifact-unavailable message when preview loading fails", () => {
    cy.intercept("GET", "/api/forge/artifacts/forge-image-2/preview", {
      statusCode: 502,
      body: "artifact unavailable",
    }).as("forgePreviewUnavailable");

    cy.visit("/forge");
    cy.wait("@forgeGraphql");

    cy.contains("M87 · cutout")
      .closest(".forge-queue__item")
      .contains("Surveys: allwise")
      .closest(".forge-queue__item")
      .click();

    cy.wait("@forgePreviewUnavailable");
    cy.contains(
      "Preview artifact is not currently loading directly from the provider. Forge is attempting to cache a local copy so it can be served through the Forge proxy for reliable viewing."
    );
    cy.contains("Please wait a moment and refresh the preview.");
  });

  it("surfaces normalized GraphQL validation errors when job creation fails", () => {
    cy.intercept("POST", "/api/forge/graphql", (req) => {
      if (req.body?.operationName === "CreateCutoutJob") {
        req.reply({
          statusCode: 400,
          body: {
            data: null,
            errors: [
              {
                message:
                  "At least one survey must be selected for a Forge cutout job.",
                extensions: {
                  code: "FORGE_VALIDATION_ERROR",
                  retryable: false,
                  details: null,
                },
              },
            ],
          },
        });
        return;
      }

      req.continue();
    }).as("forgeCreateCutoutJobValidationError");

    cy.visit("/forge");
    cy.contains("h2", "Workbench shell");
    cy.contains("button", "Create cutout job").click({ force: true });

    cy.wait("@forgeCreateCutoutJobValidationError");
    cy.contains(
      "Create cutout job failed: At least one survey must be selected for a Forge cutout job."
    );
  });

  it("shows client-side validation guidance for invalid coordinate input", () => {
    cy.visit("/forge");
    cy.wait("@forgeGraphql");

    cy.get('input[formcontrolname="target"]').clear();
    cy.get('input[formcontrolname="ra"]').clear();
    cy.get('input[formcontrolname="ra"]').type("361");
    cy.get('input[formcontrolname="dec"]').clear();
    cy.get('input[formcontrolname="dec"]').type("-91");
    cy.get('input[formcontrolname="radiusArcmin"]').clear();
    cy.get('input[formcontrolname="radiusArcmin"]').type("0");

    cy.contains(
      "button.forge-chip.forge-chip--selected",
      "Legacy Surveys"
    ).click({
      force: true,
    });

    cy.contains("button", "Create cutout job").click({ force: true });

    cy.contains("Target/source is required");
    cy.contains("RA must be a decimal degree value between 0 and 360.");
    cy.contains("Dec must be a decimal degree value between -90 and 90.");
    cy.contains("Radius must be a positive value up to 60 arcmin.");
    cy.contains("Select at least one live adapter to create a cutout job.");
  });

  it("allows an external Legacy artifact to be cached from the result shell", () => {
    cy.visit("/forge");
    cy.wait("@forgeGraphql");

    cy.contains(".forge-panel", "My jobs")
      .find('[data-job-id="forge-job-1"]')
      .as("legacyJob")
      .should("contain.text", "Surveys: legacy")
      .and("contain.text", "Preview: external provider only");

    cy.get("@legacyJob").scrollIntoView();
    cy.get("@legacyJob").click();

    cy.get("@legacyJob").should("have.class", "forge-queue__item--selected");
    cy.contains("Selected job:").parent().contains("forge-job-1");

    cy.contains("Artifact delivery:")
      .parent()
      .then(($delivery) => {
        if (!$delivery.text().includes("External provider asset")) {
          expect($delivery.text()).to.contain("Cached locally through Forge");
          return;
        }

        cy.contains("button", "Cache selected image for local serving").click({
          force: true,
        });
        cy.wait("@forgeCacheImageArtifact");
      });

    cy.contains("Artifact delivery:")
      .parent()
      .contains("Cached locally through Forge");
    cy.contains("Cache status:")
      .parent()
      .contains("Cached and served by Forge");
  });
});
