# GraphQL Contract Draft

Alignment anchors

- Product scope: [./PRODUCT_BLUEPRINT.md](./PRODUCT_BLUEPRINT.md)
- Architecture: [./ARCHITECTURE.md](./ARCHITECTURE.md)
- Persistence plan: [./PERSISTENCE_PLAN.md](./PERSISTENCE_PLAN.md)
- Current jobs/frontend reality: [../frontend/features/JOBS.md](../frontend/features/JOBS.md)

Status: `in_progress`

This document is the branch-scoped GraphQL contract draft for Cosmic Forge. It is aligned to the implemented Forge API shape and calls out the remaining contract gaps explicitly.

## Current query surface

- `serviceInfo(operationName: String)`
- `surveys`
- `jobs`
- `imageProducts`
- `job(id: ID!)`
- `imageProductsByJob(jobId: ID!)`
- `provenanceByImage(imageId: ID!)`

## Current mutation surface

- `createCutoutJob`
- `cancelJob`
- `retryJob`
- `cacheImageArtifact`

## Planned next mutation surface

- `createCompositeJob`

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
  createdAt: String!
  updatedAt: String!
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
  imageProductIds: [ID!]!
  compositeMode: String!
}
```

## Current implementation note

The current Forge branch now has two live adapter-backed paths:

- `Legacy Surveys / NOIRLab`
- `IRSA AllWISE`

Current behavior:

- preview and FITS artifacts can be served back through Forge artifact routes
- `artifactMode` may be `external` or `cached`
- `cacheStatus` may be `external-only` or `cached`
- the API now serves queue state through a repository-backed persisted state file rather than process memory only
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
- expose job-event audit history once the UI is ready to consume it
