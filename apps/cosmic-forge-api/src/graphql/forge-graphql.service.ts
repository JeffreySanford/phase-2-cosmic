import { Inject, Injectable } from "@nestjs/common";
import { buildSchema, graphql } from "graphql";
import type { ForgeCreateCutoutJobInput } from "../domain/forge.models";
import { ForgeStoreService } from "../state/forge-store.service";

type GraphqlRequestBody = Readonly<{
  operationName?: string;
  query?: string | null;
  variables?: Record<string, unknown>;
}>;

type GraphqlResolverArgs = Readonly<{
  operationName?: string;
}>;

type CreateCutoutJobArgs = Readonly<{
  input?: Partial<ForgeCreateCutoutJobInput>;
}>;

type JobIdArgs = Readonly<{
  jobId: string;
}>;

type ImageIdArgs = Readonly<{
  imageId: string;
}>;

const forgeGraphqlDocuments: Record<string, string> = {
  ForgeWorkbenchBootstrap: `
    query ForgeWorkbenchBootstrap($operationName: String) {
      serviceInfo(operationName: $operationName) {
        name
        status
        operationName
        graphReady
      }
      surveys {
        id
        name
        providerName
        waveband
        supportsFits
        supportsCutout
        supportsPreview
        previewReady
        citationUrl
      }
      jobs {
        id
        type
        status
        progressPercent
        requestedBy
        targetName
        ra
        dec
        radiusArcmin
        requestedSurveyIds
        resultImageIds
        errorMessage
        request {
          providerAdapter
          sourceService
          missionFamily
          collection
          layer
          bands
          ra
          dec
          radiusArcmin
          pixscale
          size
          width
          height
          outputFormat
          retrievalPathType
          discoveryUrl
          jpegCutoutUrl
          fitsCutoutUrl
        }
        createdAt
        updatedAt
      }
      imageProducts {
        id
        jobId
        surveyId
        providerName
        artifactMode
        format
        previewUrl
        fitsUrl
        authoritativeUrl
        accessedAt
        cacheKey
        cacheStatus
        createdAt
        provenance {
          sourceSurvey
          providerName
          citationUrl
          authoritativeUrl
          accessedAt
          transformChain
          artifactMode
          missionFamily
          collection
          retrievalPathType
          outputFormat
          citationReference
          datasetDoi
          layer
          bandSet
          ra
          dec
          pixscale
          size
          width
          height
        }
      }
    }
  `,
  CreateCutoutJob: `
    mutation CreateCutoutJob($input: ForgeCreateCutoutJobInput!) {
      createCutoutJob(input: $input) {
        id
        type
        status
        progressPercent
        requestedBy
        targetName
        ra
        dec
        radiusArcmin
        requestedSurveyIds
        resultImageIds
        errorMessage
        request {
          providerAdapter
          sourceService
          missionFamily
          collection
          layer
          bands
          ra
          dec
          radiusArcmin
          pixscale
          size
          width
          height
          outputFormat
          retrievalPathType
          discoveryUrl
          jpegCutoutUrl
          fitsCutoutUrl
        }
        createdAt
        updatedAt
      }
    }
  `,
  CancelJob: `
    mutation CancelJob($jobId: ID!) {
      job: cancelJob(jobId: $jobId) {
        id
        type
        status
        progressPercent
        requestedBy
        targetName
        ra
        dec
        radiusArcmin
        requestedSurveyIds
        resultImageIds
        errorMessage
        request {
          providerAdapter
          sourceService
          missionFamily
          collection
          layer
          bands
          ra
          dec
          radiusArcmin
          pixscale
          size
          width
          height
          outputFormat
          retrievalPathType
          discoveryUrl
          jpegCutoutUrl
          fitsCutoutUrl
        }
        createdAt
        updatedAt
      }
    }
  `,
  RetryJob: `
    mutation RetryJob($jobId: ID!) {
      job: retryJob(jobId: $jobId) {
        id
        type
        status
        progressPercent
        requestedBy
        targetName
        ra
        dec
        radiusArcmin
        requestedSurveyIds
        resultImageIds
        errorMessage
        request {
          providerAdapter
          sourceService
          missionFamily
          collection
          layer
          bands
          ra
          dec
          radiusArcmin
          pixscale
          size
          width
          height
          outputFormat
          retrievalPathType
          discoveryUrl
          jpegCutoutUrl
          fitsCutoutUrl
        }
        createdAt
        updatedAt
      }
    }
  `,
  CacheImageArtifact: `
    mutation CacheImageArtifact($imageId: ID!) {
      imageProduct: cacheImageArtifact(imageId: $imageId) {
        id
        jobId
        surveyId
        providerName
        artifactMode
        format
        previewUrl
        fitsUrl
        authoritativeUrl
        accessedAt
        cacheKey
        cacheStatus
        createdAt
        provenance {
          sourceSurvey
          providerName
          citationUrl
          authoritativeUrl
          accessedAt
          transformChain
          artifactMode
          missionFamily
          collection
          retrievalPathType
          outputFormat
          citationReference
          datasetDoi
          layer
          bandSet
          ra
          dec
          pixscale
          size
          width
          height
        }
      }
    }
  `,
};

const forgeSchema = buildSchema(`
  type Query {
    serviceInfo(operationName: String): ForgeServiceInfo!
    surveys: [ForgeSurvey!]!
    jobs: [ForgeJob!]!
    imageProducts: [ForgeImageProduct!]!
  }

  type Mutation {
    createCutoutJob(input: ForgeCreateCutoutJobInput!): ForgeJob!
    cancelJob(jobId: ID!): ForgeJob!
    retryJob(jobId: ID!): ForgeJob!
    cacheImageArtifact(imageId: ID!): ForgeImageProduct!
  }

  input ForgeCreateCutoutJobInput {
    requestedBy: String!
    targetName: String!
    ra: Float!
    dec: Float!
    radiusArcmin: Float!
    surveyIds: [String!]!
  }

  type ForgeServiceInfo {
    name: String!
    status: String!
    operationName: String
    graphReady: Boolean!
  }

  type ForgeSurvey {
    id: ID!
    name: String!
    providerName: String!
    waveband: String!
    supportsFits: Boolean!
    supportsCutout: Boolean!
    supportsPreview: Boolean!
    previewReady: Boolean!
    citationUrl: String!
  }

  type ForgeJob {
    id: ID!
    type: String!
    status: String!
    progressPercent: Int!
    requestedBy: String!
    targetName: String!
    ra: Float!
    dec: Float!
    radiusArcmin: Float!
    requestedSurveyIds: [String!]!
    resultImageIds: [String!]!
    errorMessage: String
    request: ForgeCutoutRequest
    createdAt: String!
    updatedAt: String!
  }

  type ForgeCutoutRequest {
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

  type ForgeImageProvenance {
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

  type ForgeImageProduct {
    id: ID!
    jobId: ID!
    surveyId: String!
    providerName: String!
    artifactMode: String!
    format: String!
    previewUrl: String!
    fitsUrl: String
    authoritativeUrl: String!
    accessedAt: String!
    cacheKey: String
    cacheStatus: String!
    provenance: ForgeImageProvenance!
    createdAt: String!
  }
`);

@Injectable()
export class ForgeGraphqlService {
  constructor(@Inject(ForgeStoreService) private readonly store: ForgeStoreService) {}

  private normalizeCreateCutoutJobInput(
    input: Partial<ForgeCreateCutoutJobInput> | undefined
  ): ForgeCreateCutoutJobInput {
    return {
      requestedBy: String(input?.requestedBy ?? "anonymous-operator"),
      targetName: String(input?.targetName ?? "Unnamed target"),
      ra: Number(input?.ra ?? 0),
      dec: Number(input?.dec ?? 0),
      radiusArcmin: Number(input?.radiusArcmin ?? 0),
      surveyIds: Array.isArray(input?.surveyIds)
        ? input.surveyIds.filter((value): value is string => typeof value === "string")
        : [],
    };
  }

  private createServiceInfo(operationName: string | null) {
    return {
      name: "cosmic-forge-api",
      status: "graphql-live",
      operationName,
      graphReady: true,
    };
  }

  private resolveGraphqlSource(operationName: string | null, query: unknown): string | null {
    if (typeof query === "string" && query.trim().length > 0) {
      return query;
    }

    if (operationName && forgeGraphqlDocuments[operationName]) {
      return forgeGraphqlDocuments[operationName];
    }

    return null;
  }

  async execute(body: unknown): Promise<{ status: number; body: unknown }> {
    const input: GraphqlRequestBody =
      body && typeof body === "object" ? (body as GraphqlRequestBody) : {};
    const operationName = typeof input.operationName === "string" ? input.operationName : null;
    const source = this.resolveGraphqlSource(operationName, input.query);

    if (!source) {
      return {
        status: 400,
        body: {
          errors: [{ message: "GraphQL query is required" }],
        },
      };
    }

    const rootValue = {
      serviceInfo: ({ operationName: opName }: GraphqlResolverArgs) =>
        this.createServiceInfo(opName ?? null),
      surveys: () => this.store.getSurveys(),
      jobs: () => this.store.getJobs(),
      imageProducts: () => this.store.getImageProducts(),
      createCutoutJob: ({ input: mutationInput }: CreateCutoutJobArgs) =>
        this.store.createCutoutJob(this.normalizeCreateCutoutJobInput(mutationInput)),
      cancelJob: ({ jobId }: JobIdArgs) => {
        const job = this.store.cancelJob(jobId);
        if (!job) {
          throw new Error("Job not found");
        }
        return job;
      },
      retryJob: ({ jobId }: JobIdArgs) => {
        const job = this.store.retryJob(jobId);
        if (!job) {
          throw new Error("Job not found");
        }
        return job;
      },
      cacheImageArtifact: async ({ imageId }: ImageIdArgs) => {
        const imageProduct = await this.store.cacheImageArtifactById(imageId);
        if (!imageProduct) {
          throw new Error("Image product not found");
        }
        return imageProduct;
      },
    };

    const variableValues =
      input.variables && typeof input.variables === "object"
        ? { ...input.variables }
        : {};

    if (!("operationName" in variableValues) && operationName) {
      variableValues["operationName"] = operationName;
    }

    const result = await graphql({
      schema: forgeSchema,
      source,
      rootValue,
      variableValues,
      operationName: operationName ?? undefined,
    });

    return {
      status: result.errors?.length ? 400 : 200,
      body: result,
    };
  }
}
