import { HttpErrorResponse } from "@angular/common/http";
import { TestBed } from "@angular/core/testing";
import { provideMockActions } from "@ngrx/effects/testing";
import { Observable, ReplaySubject, firstValueFrom, throwError } from "rxjs";
import { take } from "rxjs/operators";
import { ForgeApiService } from "./forge-api.service";
import { ForgeActions } from "./forge.actions";
import { ForgeEffects } from "./forge.effects";

describe("ForgeEffects", () => {
  let actions$: ReplaySubject<ReturnType<typeof ForgeActions.createCutoutJobRequested>>;
  let effects: ForgeEffects;
  let forgeApi: jest.Mocked<ForgeApiService>;

  beforeEach(() => {
    actions$ = new ReplaySubject(1);
    forgeApi = {
      getHealth: jest.fn(),
      getWorkbenchBootstrap: jest.fn(),
      createCutoutJob: jest.fn(),
      cancelJob: jest.fn(),
      retryJob: jest.fn(),
      cacheImageArtifact: jest.fn(),
    } as unknown as jest.Mocked<ForgeApiService>;

    TestBed.configureTestingModule({
      providers: [
        ForgeEffects,
        provideMockActions(() => actions$ as unknown as Observable<never>),
        {
          provide: ForgeApiService,
          useValue: forgeApi,
        },
      ],
    });

    effects = TestBed.inject(ForgeEffects);
  });

  it("uses the normalized GraphQL error message for failed create-cutout requests", async () => {
    forgeApi.createCutoutJob.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            error: {
              data: null,
              errors: [
                {
                  message: "At least one survey must be selected for a Forge cutout job.",
                  extensions: {
                    code: "FORGE_VALIDATION_ERROR",
                    retryable: false,
                    details: null,
                  },
                },
              ],
            },
          })
      )
    );

    actions$.next(
      ForgeActions.createCutoutJobRequested({
        input: {
          requestedBy: "tester",
          targetName: "M87",
          ra: 187.70593,
          dec: 12.39112,
          radiusArcmin: 15,
          surveyIds: [],
        },
      })
    );

    const result = await firstValueFrom(effects.createCutoutJob$.pipe(take(1)));

    expect(result).toEqual(
      ForgeActions.createCutoutJobFailed({
        error: "At least one survey must be selected for a Forge cutout job.",
      })
    );
  });
});
