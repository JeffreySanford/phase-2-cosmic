# GraphQL Contract Draft

Alignment anchors

- Product scope: [./PRODUCT_BLUEPRINT.md](./PRODUCT_BLUEPRINT.md)
- Architecture: [./ARCHITECTURE.md](./ARCHITECTURE.md)
- Current jobs/frontend reality: [../frontend/features/JOBS.md](../frontend/features/JOBS.md)

Status: `planned`

This document is a branch-scoped draft contract for Cosmic Forge. It is not current production API truth for the repository.

## Query surface

- `surveys`
- `jobs`
- `job(id: ID!)`
- `imageProductsByJob(jobId: ID!)`
- `targetResolution(input: TargetResolutionInput!)`
- `provenanceByImage(imageId: ID!)`

## Mutation surface

- `createCutoutJob`
- `createCompositeJob`
- `cancelJob`
- `retryJob`
- `cacheImageArtifact`

## Subscription surface

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

type Survey {
  id: ID!
  name: String!
  waveband: String
  supportsFits: Boolean!
  supportsCutout: Boolean!
  supportsPreview: Boolean!
  citationUrl: String
}

type Target {
  id: ID!
  displayName: String!
  ra: Float!
  dec: Float!
  radiusArcmin: Float
}

type Job {
  id: ID!
  type: String!
  status: JobStatus!
  progressPercent: Float
  targetId: ID
  requestedSurveyIds: [ID!]!
  resultImageIds: [ID!]!
  errorMessage: String
  createdAt: String!
  updatedAt: String!
}

type ImageProduct {
  id: ID!
  jobId: ID!
  surveyId: ID!
  artifactMode: String!
  format: String!
  previewPath: String
  authoritativeUrl: String
  accessedAt: String
  cacheKey: String
  cacheStatus: String!
  wcsSummary: String
  width: Int
  height: Int
  pixelScale: Float
  provenance: ProvenanceRecord
}

type ProvenanceRecord {
  id: ID!
  sourceSurvey: String!
  providerName: String!
  citationUrl: String
  authoritativeUrl: String
  accessedAt: String
  transformChain: [String!]!
  artifactMode: String!
}
```

## Current implementation note

The current Forge branch uses external-source image products first:

- `artifactMode` is currently `external`
- `cacheStatus` is currently `external-only`
- preview and FITS links point at the provider directly

The next cache-retention slice adds:

- `cacheImageArtifact(imageId: ID!)`
- `artifactMode: cached`
- `cacheStatus: cached`
- retained preview and FITS artifacts served back through Forge routes
- later object-store-backed retention replacing the local placeholder cache

## Inputs

```graphql
input TargetResolutionInput {
  targetName: String
  ra: Float
  dec: Float
  radiusArcmin: Float
}

input CreateCutoutJobInput {
  targetName: String
  ra: Float
  dec: Float
  radiusArcmin: Float
  surveyIds: [ID!]!
}

input CreateCompositeJobInput {
  imageProductIds: [ID!]!
  compositeMode: String!
}
```

## Adapter-facing contract assumptions

The GraphQL layer assumes worker-side adapter functions can provide:

- `resolveAvailability`
- `requestCutout`
- `fetchMetadata`
- `buildPreview`

The API should not leak provider-specific wire formats directly into the UI.
