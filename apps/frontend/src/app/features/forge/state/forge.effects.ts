import { Injectable, inject } from "@angular/core";
import { Actions, createEffect, ofType } from "@ngrx/effects";
import { HttpErrorResponse } from "@angular/common/http";
import { ForgeApiService } from "./forge-api.service";
import { ForgeActions } from "./forge.actions";
import {
  catchError,
  concatMap,
  exhaustMap,
  map,
  mergeMap,
  of,
  timer,
} from "rxjs";

@Injectable()
export class ForgeEffects {
  private readonly actions$ = inject(Actions);
  private readonly forgeApi = inject(ForgeApiService);

  readonly initialize$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ForgeActions.initializeRequested),
      concatMap(() => [
        ForgeActions.refreshRequested(),
        ForgeActions.startAutoRefreshRequested(),
      ])
    )
  );

  readonly refresh$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ForgeActions.refreshRequested),
      concatMap(() => [
        ForgeActions.loadHealthRequested(),
        ForgeActions.loadBootstrapRequested(),
      ])
    )
  );

  readonly autoRefresh$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ForgeActions.startAutoRefreshRequested),
      exhaustMap(() =>
        timer(10000, 10000).pipe(map(() => ForgeActions.refreshRequested()))
      )
    )
  );

  readonly loadHealth$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ForgeActions.loadHealthRequested),
      mergeMap(() =>
        this.forgeApi.getHealth().pipe(
          map((health) => ForgeActions.loadHealthSucceeded({ health })),
          catchError((error: unknown) =>
            of(
              ForgeActions.loadHealthFailed({
                error: this.toMessage(error),
              })
            )
          )
        )
      )
    )
  );

  readonly loadBootstrap$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ForgeActions.loadBootstrapRequested),
      mergeMap(() =>
        this.forgeApi.getWorkbenchBootstrap().pipe(
          map((payload) => ForgeActions.loadBootstrapSucceeded({ payload })),
          catchError((error: unknown) =>
            of(
              ForgeActions.loadBootstrapFailed({
                error: this.toMessage(error),
              })
            )
          )
        )
      )
    )
  );

  readonly createCutoutJob$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ForgeActions.createCutoutJobRequested),
      mergeMap(({ input }) =>
        this.forgeApi.createCutoutJob(input).pipe(
          concatMap((payload) => [
            ForgeActions.createCutoutJobSucceeded({ payload }),
            ForgeActions.loadBootstrapRequested(),
          ]),
          catchError((error: unknown) =>
            of(
              ForgeActions.createCutoutJobFailed({
                error: this.toMessage(error),
              })
            )
          )
        )
      )
    )
  );

  readonly cancelJob$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ForgeActions.cancelJobRequested),
      mergeMap(({ jobId }) =>
        this.forgeApi.cancelJob(jobId).pipe(
          concatMap((payload) => [
            ForgeActions.cancelJobSucceeded({ payload }),
            ForgeActions.loadBootstrapRequested(),
          ]),
          catchError((error: unknown) =>
            of(
              ForgeActions.cancelJobFailed({
                error: this.toMessage(error),
              })
            )
          )
        )
      )
    )
  );

  readonly retryJob$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ForgeActions.retryJobRequested),
      mergeMap(({ jobId }) =>
        this.forgeApi.retryJob(jobId).pipe(
          concatMap((payload) => [
            ForgeActions.retryJobSucceeded({ payload }),
            ForgeActions.loadBootstrapRequested(),
          ]),
          catchError((error: unknown) =>
            of(
              ForgeActions.retryJobFailed({
                error: this.toMessage(error),
              })
            )
          )
        )
      )
    )
  );

  readonly cacheImageArtifact$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ForgeActions.cacheImageArtifactRequested),
      mergeMap(({ imageId }) =>
        this.forgeApi.cacheImageArtifact(imageId).pipe(
          concatMap((payload) => [
            ForgeActions.cacheImageArtifactSucceeded({ payload }),
            ForgeActions.loadBootstrapRequested(),
          ]),
          catchError((error: unknown) =>
            of(
              ForgeActions.cacheImageArtifactFailed({
                error: this.toMessage(error),
              })
            )
          )
        )
      )
    )
  );

  private toMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const graphqlMessage = this.readGraphqlErrorMessage(error.error);
      if (graphqlMessage) {
        return graphqlMessage;
      }
    }

    if (error && typeof error === "object" && "message" in error) {
      return String((error as { message?: unknown }).message ?? error);
    }

    return String(error);
  }

  private readGraphqlErrorMessage(errorBody: unknown): string | null {
    if (!errorBody || typeof errorBody !== "object" || !("errors" in errorBody)) {
      return null;
    }

    const errors = (errorBody as { errors?: unknown }).errors;
    if (!Array.isArray(errors) || errors.length === 0) {
      return null;
    }

    const first = errors[0];
    if (first && typeof first === "object" && "message" in first) {
      return String((first as { message?: unknown }).message ?? "");
    }

    return null;
  }
}
