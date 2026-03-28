# GraphQL Contract Draft

Alignment anchors

- Product scope: [./PRODUCT_BLUEPRINT.md](./PRODUCT_BLUEPRINT.md)
- Architecture: [./ARCHITECTURE.md](./ARCHITECTURE.md)
- Persistence plan: [./PERSISTENCE_PLAN.md](./PERSISTENCE_PLAN.md)
- Current jobs/frontend reality: [../frontend/features/JOBS.md](../frontend/features/JOBS.md)

Status: `implemented`

This document is the branch-scoped GraphQL contract for Cosmic Forge. It is aligned to the implemented Forge API shape and calls out only the deliberate post-PI gaps explicitly.

## Current query surface

- `serviceInfo(operationName: String)`
- `surveys`
- `jobs`
- `imageProducts`
- `job(id: ID!)`
- `imageProductsByJob(jobId: ID!)`
- `provenanceByImage(imageId: ID!)`
- `jobEvents(limit: Int)`
- `diagnostics`
- `metrics`

## Current mutation surface

- `createCutoutJob`
- `createCompositeJob`
- `cancelJob`
- `retryJob`
- `cacheImageArtifact`

## Planned subscription surface

- `jobUpdated`
- `jobProgressed`
- `imageProductReady`

## Core types

```graphql
enum JobStatus {
  QUEUED
  RUNNING
  COMPLETED
  FAILED
  CANCELLED
}

type ForgeServiceInfo {
  name: String!
  status: String!
  operationName: String
  graphReady: Boolean!
  contractVersion: String!
}

type Survey {
  id: ID!
  name: String!
  providerName: String!
  waveband: String
  supportsFits: Boolean!
  supportsCutout: Boolean!
  supportsPreview: Boolean!
  previewReady: Boolean!
  citationUrl: String
}

type Job {
  id: ID!
  type: String!
  status: JobStatus!
  progressPercent: Int!
  requestedBy: String!
  targetName: String!
  ra: Float!
  dec: Float!
  radiusArcmin: Float!
  requestedSurveyIds: [ID!]!
  resultImageIds: [ID!]!
  errorCode: String
  errorMessage: String
  request: CutoutRequest
  compositeRequest: CompositeJobSpec
  createdAt: String!
  updatedAt: String!
}

type CompositeJobSpec {
  inputs: [CutoutRequest!]!
  operation: String!
  parameters: JSON
}

type CutoutRequest {
  providerAdapter: String!
  sourceService: String!
  missionFamily: String
  collection: String
  layer: String
  bands: [String!]!
  ra: Float!
  dec: Float!
  radiusArcmin: Float!
  pixscale: Float
  size: Int!
  width: Int!
  height: Int!
  outputFormat: String
  retrievalPathType: String
  discoveryUrl: String
  jpegCutoutUrl: String
  fitsCutoutUrl: String
}

type ImageProduct {
  id: ID!
  jobId: ID!
  surveyId: ID!
  providerName: String!
  artifactMode: String!
  format: String!
  previewUrl: String!
  fitsUrl: String
  authoritativeUrl: String!
  accessedAt: String!
  cacheKey: String
  cacheStatus: String!
  provenance: ProvenanceRecord!
  createdAt: String!
}

type ForgeJobEvent {
  id: ID!
  jobId: ID!
  eventType: String!
  fromStatus: String
  toStatus: String
  message: String
  errorCode: String
  createdAt: String!
}

type ForgeDiagnostics {
  queueDepth: Int!
  runningJobs: Int!
  failedJobs: Int!
  completedJobs: Int!
  blockedJobs: Int!
  delayedJobs: Int!
  retryingJobs: Int!
}

type ForgeMetrics {
  totalJobs: Int!
  avgRunTimeSec: Float!
  successRate: Float!
  queueDepth: Int!
  successCount: Int!
  failureCount: Int!
  cachedArtifactCount: Int!
}

type ProvenanceRecord {
  sourceSurvey: String!
  providerName: String!
  citationUrl: String!
  authoritativeUrl: String!
  accessedAt: String!
  transformChain: [String!]!
  artifactMode: String!
  missionFamily: String
  collection: String
  retrievalPathType: String
  outputFormat: String
  citationReference: String
  datasetDoi: String
  layer: String
  bandSet: [String!]!
  ra: Float!
  dec: Float!
  pixscale: Float
  size: Int!
  width: Int!
  height: Int!
}
```

## Error envelope

Forge mutation and targeted-query failures now use a normalized GraphQL error envelope:

```graphql
errors: [
  {
    message: String!
    extensions: {
      code: String!
      retryable: Boolean!
      details: JSON
    }
  }
]
```

Current normalized codes include:

- `FORGE_BAD_REQUEST`
- `FORGE_VALIDATION_ERROR`
- `FORGE_JOB_NOT_FOUND`
- `FORGE_IMAGE_NOT_FOUND`
- `FORGE_UNSUPPORTED_SURVEY`
- `FORGE_UPSTREAM_UNAVAILABLE`
- `FORGE_UPSTREAM_TIMEOUT`
- `FORGE_UPSTREAM_BAD_RESPONSE`
- `FORGE_ARTIFACT_UNAVAILABLE`
- `FORGE_INTERNAL_ERROR`

## Inputs

```graphql
input CreateCutoutJobInput {
  requestedBy: String!
  targetName: String!
  ra: Float!
  dec: Float!
  radiusArcmin: Float!
  surveyIds: [ID!]!
}

input CreateCompositeJobInput {
  requestedBy: String!
  targetName: String!
  ra: Float!
  dec: Float!
  radiusArcmin: Float!
  surveyIds: [ID!]!
  compositeRequest: CompositeJobSpecInput!
}

input CompositeJobSpecInput {
  inputs: [CutoutRequestInput!]!
  operation: String!
  parameters: JSON
}
```

## Current implementation note

The current Forge branch now has two live adapter-backed paths:

- `Legacy Surveys / NOIRLab`
- `IRSA AllWISE`
- `SkyView` as a derived-preview path

Current behavior:

- the Forge UI can bootstrap entirely from the `ForgeWorkbenchBootstrap` GraphQL read model without a separate health read
- preview and FITS artifacts can be served back through Forge artifact routes
- `artifactMode` may be `external` or `cached`
- `cacheStatus` may be `external-only` or `cached`
- adapter-backed failures now preserve normalized upstream error codes so the UI can distinguish timeout, unavailability, and bad upstream responses
- the API now serves queue state through a repository-backed persisted state file rather than process memory only
- `ForgeServiceInfo.contractVersion` is now explicit so the UI can reject contract drift without mutating the read model shape
- the GraphQL bootstrap now carries `diagnostics`, `metrics`, and recent `jobEvents` so the UI can render queue supportability without a separate side-channel
- composite jobs are now part of the explicit mutation/read model contract, including `ForgeJob.compositeRequest`
- PostgreSQL remains the recommended next durable backing store without requiring GraphQL contract churn

## Adapter-facing contract assumptions

The GraphQL layer assumes worker-side adapter functions can provide:

- `resolveAvailability`
- `requestCutout`
- `fetchMetadata`
- `buildPreview`

The API should not leak provider-specific wire formats directly into the UI.

## Remaining gaps to close

- define subscription payloads without changing the current bootstrap/mutation shapes
- move the persistence backing store from file-backed state to PostgreSQL without contract churn
- move diagnostics and metrics from bootstrap-only consumption to optional dedicated polling/subscription semantics if the workbench outgrows the current read model size
