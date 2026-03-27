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
  format: String!
  artifactPath: String!
  previewPath: String
  authoritativeUrl: String
  accessedAt: String
  wcsSummary: String
  width: Int
  height: Int
  pixelScale: Float
}

type ProvenanceRecord {
  id: ID!
  imageProductId: ID!
  sourceSurvey: String!
  authoritativeUrl: String
  accessedAt: String
  transformChain: [String!]!
  generatedByVersion: String
  timestamp: String!
}
```

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
