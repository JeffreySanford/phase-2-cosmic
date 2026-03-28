import { Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import {
  ForgeCreateCompositeJobInputDto,
  ForgeCreateCompositeJobResponseDto,
  ForgeCreateCutoutJobInputDto,
  ForgeCreateCutoutJobResponseDto,
  ForgeImageMutationResponseDto,
  ForgeJobMutationResponseDto,
  ForgeWorkbenchBootstrapResponseDto,
} from "./forge.models";
import { Observable } from "rxjs";

@Injectable({ providedIn: "root" })
export class ForgeApiService {
  private readonly http = inject(HttpClient);

  getWorkbenchBootstrap(): Observable<ForgeWorkbenchBootstrapResponseDto> {
    return this.http.post<ForgeWorkbenchBootstrapResponseDto>("/api/forge/graphql", {
      operationName: "ForgeWorkbenchBootstrap",
    });
  }

  createCutoutJob(
    input: ForgeCreateCutoutJobInputDto
  ): Observable<ForgeCreateCutoutJobResponseDto> {
    return this.http.post<ForgeCreateCutoutJobResponseDto>("/api/forge/graphql", {
      operationName: "CreateCutoutJob",
      variables: {
        input,
      },
    });
  }

  createCompositeJob(
    input: ForgeCreateCompositeJobInputDto
  ): Observable<ForgeCreateCompositeJobResponseDto> {
    return this.http.post<ForgeCreateCompositeJobResponseDto>("/api/forge/graphql", {
      operationName: "CreateCompositeJob",
      variables: {
        input,
      },
    });
  }

  cancelJob(jobId: string): Observable<ForgeJobMutationResponseDto> {
    return this.http.post<ForgeJobMutationResponseDto>("/api/forge/graphql", {
      operationName: "CancelJob",
      variables: {
        jobId,
      },
    });
  }

  retryJob(jobId: string): Observable<ForgeJobMutationResponseDto> {
    return this.http.post<ForgeJobMutationResponseDto>("/api/forge/graphql", {
      operationName: "RetryJob",
      variables: {
        jobId,
      },
    });
  }

  cacheImageArtifact(imageId: string): Observable<ForgeImageMutationResponseDto> {
    return this.http.post<ForgeImageMutationResponseDto>("/api/forge/graphql", {
      operationName: "CacheImageArtifact",
      variables: {
        imageId,
      },
    });
  }
}
