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

## Current mutation surface

- `createCutoutJob`
- `cancelJob`
- `retryJob`
- `cacheImageArtifact`

## Planned next query surface

- `job(id: ID!)`
- `imageProductsByJob(jobId: ID!)`
- `provenanceByImage(imageId: ID!)`

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
- the API currently serves queue state from an in-memory store
- durable persistence is the next contract-preserving implementation step

## Adapter-facing contract assumptions

The GraphQL layer assumes worker-side adapter functions can provide:

- `resolveAvailability`
- `requestCutout`
- `fetchMetadata`
- `buildPreview`

The API should not leak provider-specific wire formats directly into the UI.

## Remaining gaps to close

- align error payloads so GraphQL failures include normalized Forge error codes
- add targeted queries by `jobId` and `imageId`
- define the subscription payloads without changing the current bootstrap/mutation shapes
- move the backing store from in-memory state to durable persistence without contract churn
