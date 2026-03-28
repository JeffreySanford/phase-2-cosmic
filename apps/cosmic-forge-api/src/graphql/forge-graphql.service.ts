import { Inject, Injectable } from "@nestjs/common";
import { GraphQLError, buildSchema, graphql } from "graphql";
import type {
  ForgeCreateCutoutJobInput,
  ForgeDomainError,
  ForgeErrorCode,
} from "../domain/forge.models";
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

type JobArgs = Readonly<{
  id: string;
}>;

export const FORGE_GRAPHQL_CONTRACT_VERSION = "forge-workbench.v1";

export const forgeGraphqlDocuments: Record<string, string> = {
  ForgeWorkbenchBootstrap: `
    query ForgeWorkbenchBootstrap($operationName: String) {
      serviceInfo(operationName: $operationName) {
        name
        status
        operationName
        graphReady
        contractVersion
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
        errorCode
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
  ForgeJobById: `
    query ForgeJobById($id: ID!) {
      job(id: $id) {
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
        errorCode
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
  ForgeImageProductsByJob: `
    query ForgeImageProductsByJob($jobId: ID!) {
      imageProductsByJob(jobId: $jobId) {
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
  ForgeProvenanceByImage: `
    query ForgeProvenanceByImage($imageId: ID!) {
      provenanceByImage(imageId: $imageId) {
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
        errorCode
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
        errorCode
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
        errorCode
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
    job(id: ID!): ForgeJob!
    imageProducts: [ForgeImageProduct!]!
    imageProductsByJob(jobId: ID!): [ForgeImageProduct!]!
    provenanceByImage(imageId: ID!): ForgeImageProvenance!
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
    contractVersion: String!
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
    errorCode: String
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

  private toGraphqlError(
    code: ForgeErrorCode,
    message: string,
    retryable = false,
    details: Record<string, unknown> | null = null
  ): GraphQLError {
    return new GraphQLError(message, {
      extensions: {
        code,
        retryable,
        details,
      },
    });
  }

  private normalizeCreateCutoutJobInput(
    input: Partial<ForgeCreateCutoutJobInput> | undefined
  ): ForgeCreateCutoutJobInput {
    const normalized = {
      requestedBy: String(input?.requestedBy ?? "anonymous-operator").trim(),
      targetName: String(input?.targetName ?? "Unnamed target").trim(),
      ra: Number(input?.ra ?? Number.NaN),
      dec: Number(input?.dec ?? Number.NaN),
      radiusArcmin: Number(input?.radiusArcmin ?? Number.NaN),
      surveyIds: Array.isArray(input?.surveyIds)
        ? input.surveyIds.filter((value): value is string => typeof value === "string")
        : [],
    };

    if (!normalized.targetName) {
      throw this.toGraphqlError(
        "FORGE_VALIDATION_ERROR",
        "Target name is required for a Forge cutout job."
      );
    }

    if (!Number.isFinite(normalized.ra) || !Number.isFinite(normalized.dec)) {
      throw this.toGraphqlError(
        "FORGE_VALIDATION_ERROR",
        "RA and Dec must be valid numeric coordinates."
      );
    }

    if (!Number.isFinite(normalized.radiusArcmin) || normalized.radiusArcmin <= 0) {
      throw this.toGraphqlError(
        "FORGE_VALIDATION_ERROR",
        "Radius must be a positive arcminute value."
      );
    }

    if (normalized.surveyIds.length === 0) {
      throw this.toGraphqlError(
        "FORGE_VALIDATION_ERROR",
        "At least one survey must be selected for a Forge cutout job."
      );
    }

    return normalized;
  }

  private createServiceInfo(operationName: string | null) {
    return {
      name: "cosmic-forge-api",
      status: "graphql-live",
      operationName,
      graphReady: true,
      contractVersion: FORGE_GRAPHQL_CONTRACT_VERSION,
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

  private normalizeGraphqlError(error: unknown) {
    if (error instanceof GraphQLError) {
      const fallbackCode =
        /Float cannot represent|Expected value of type|argument .* is required|Field .* was not provided|String cannot represent|Int cannot represent/i.test(
          error.message
        )
          ? "FORGE_VALIDATION_ERROR"
          : "FORGE_INTERNAL_ERROR";
      return {
        message: error.message,
        extensions: {
          code:
            typeof error.extensions?.["code"] === "string"
              ? error.extensions["code"]
              : fallbackCode,
          retryable: Boolean(error.extensions?.["retryable"]),
          details:
            error.extensions?.["details"] &&
            typeof error.extensions["details"] === "object"
              ? error.extensions["details"]
              : null,
        },
      };
    }

    const domainError = error as ForgeDomainError;
    if (domainError?.name === "ForgeDomainError" && typeof domainError.code === "string") {
      return {
        message: domainError.message,
        extensions: {
          code: domainError.code,
          retryable: Boolean(domainError.retryable),
          details: domainError.details ?? null,
        },
      };
    }

    return {
      message: error instanceof Error ? error.message : "Unexpected Forge GraphQL failure.",
      extensions: {
        code: "FORGE_INTERNAL_ERROR",
        retryable: false,
        details: null,
      },
    };
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
          errors: [
            {
              message: "GraphQL query is required",
              extensions: {
                code: "FORGE_BAD_REQUEST",
                retryable: false,
                details: null,
              },
            },
          ],
        },
      };
    }

    const rootValue = {
      serviceInfo: ({ operationName: opName }: GraphqlResolverArgs) =>
        this.createServiceInfo(opName ?? null),
      surveys: () => this.store.getSurveys(),
      jobs: () => this.store.getJobs(),
      job: ({ id }: JobArgs) => {
        const job = this.store.getJob(id);
        if (!job) {
          throw this.toGraphqlError("FORGE_JOB_NOT_FOUND", "Forge job not found.");
        }
        return job;
      },
      imageProducts: () => this.store.getImageProducts(),
      imageProductsByJob: ({ jobId }: JobIdArgs) => this.store.getImageProductsByJob(jobId),
      provenanceByImage: ({ imageId }: ImageIdArgs) => {
        const provenance = this.store.getProvenanceByImage(imageId);
        if (!provenance) {
          throw this.toGraphqlError(
            "FORGE_IMAGE_NOT_FOUND",
            "Forge image provenance not found."
          );
        }
        return provenance;
      },
      createCutoutJob: ({ input: mutationInput }: CreateCutoutJobArgs) =>
        this.store.createCutoutJob(this.normalizeCreateCutoutJobInput(mutationInput)),
      cancelJob: ({ jobId }: JobIdArgs) => {
        const job = this.store.cancelJob(jobId);
        if (!job) {
          throw this.toGraphqlError("FORGE_JOB_NOT_FOUND", "Forge job not found.");
        }
        return job;
      },
      retryJob: ({ jobId }: JobIdArgs) => {
        const job = this.store.retryJob(jobId);
        if (!job) {
          throw this.toGraphqlError("FORGE_JOB_NOT_FOUND", "Forge job not found.");
        }
        return job;
      },
      cacheImageArtifact: async ({ imageId }: ImageIdArgs) => {
        const imageProduct = await this.store.cacheImageArtifactById(imageId);
        if (!imageProduct) {
          throw this.toGraphqlError(
            "FORGE_IMAGE_NOT_FOUND",
            "Forge image product not found."
          );
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
      body: result.errors?.length
        ? {
            data: result.data ?? null,
            errors: result.errors.map((error) => this.normalizeGraphqlError(error)),
          }
        : result,
    };
  }
}
