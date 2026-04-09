import { CommonModule } from "@angular/common";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ReactiveFormsModule } from "@angular/forms";
import { RouterTestingModule } from "@angular/router/testing";
import { BehaviorSubject, of, throwError } from "rxjs";
import { ForgeComponent } from "./forge.component";
import { ForgeApiService } from "./state/forge-api.service";
import { ForgeFacade } from "./state/forge.facade";
import { ForgeImageProductDto, ForgeJobDto, ForgeSurveyDto } from "./state/forge.models";

const surveys: readonly ForgeSurveyDto[] = [
  {
    id: "legacy",
    name: "Legacy Surveys",
    providerName: "NOIRLab / Legacy Surveys",
    waveband: "optical",
    supportsFits: true,
    supportsCutout: true,
    supportsPreview: true,
    previewReady: true,
    citationUrl: "https://www.legacysurvey.org/viewer",
  },
  {
    id: "allwise",
    name: "AllWISE",
    providerName: "NASA/IPAC IRSA",
    waveband: "infrared",
    supportsFits: true,
    supportsCutout: true,
    supportsPreview: true,
    previewReady: true,
    citationUrl: "https://irsa.ipac.caltech.edu/Missions/wise.html",
  },
  {
    id: "esasky",
    name: "ESASky",
    providerName: "ESA ESASky",
    waveband: "mixed",
    supportsFits: false,
    supportsCutout: true,
    supportsPreview: true,
    previewReady: false,
    citationUrl: "https://open.esa.int/esasky/",
  },
  {
    id: "dss2",
    name: "DSS2 Preview",
    providerName: "NASA GSFC SkyView",
    waveband: "optical",
    supportsFits: false,
    supportsCutout: true,
    supportsPreview: true,
    previewReady: true,
    citationUrl: "https://skyview.gsfc.nasa.gov/current/cgi/query.pl",
  },
];

const externalLegacyImage: ForgeImageProductDto = {
  id: "forge-image-legacy",
  jobId: "forge-job-legacy",
  surveyId: "legacy",
  providerName: "NOIRLab / Legacy Surveys",
  artifactMode: "external",
  format: "jpeg",
  previewUrl: "https://example.invalid/legacy-preview.jpg",
  fitsUrl: "https://example.invalid/legacy-preview.fits",
  authoritativeUrl: "https://example.invalid/legacy-preview.jpg",
  accessedAt: "2026-03-28T18:00:00.000Z",
  cacheKey: null,
  cacheStatus: "external-only",
  provenance: {
    sourceSurvey: "Legacy Surveys DR10",
    providerName: "NOIRLab / Legacy Surveys",
    citationUrl: "https://www.legacysurvey.org/viewer",
    authoritativeUrl: "https://example.invalid/legacy-preview.jpg",
    accessedAt: "2026-03-28T18:00:00.000Z",
    transformChain: ["external-cutout-request"],
    artifactMode: "external",
    layer: "ls-dr10",
    bandSet: ["g", "r", "z"],
    ra: 187.70593,
    dec: 12.39112,
    pixscale: 0.262,
    size: 512,
    width: 512,
    height: 512,
  },
  createdAt: "2026-03-28T18:00:00.000Z",
};

const selectedLegacyJob: ForgeJobDto = {
  id: "forge-job-legacy",
  type: "cutout",
  status: "COMPLETED",
  progressPercent: 100,
  requestedBy: "jeffreysanford",
  targetName: "M87",
  ra: 187.70593,
  dec: 12.39112,
  radiusArcmin: 15,
  requestedSurveyIds: ["legacy"],
  resultImageIds: ["forge-image-legacy"],
  errorCode: null,
  errorMessage: null,
  request: {
    providerAdapter: "legacy-surveys",
    sourceService: "viewer-cutout",
    layer: "ls-dr10",
    bands: ["g", "r", "z"],
    ra: 187.70593,
    dec: 12.39112,
    radiusArcmin: 15,
    pixscale: 0.262,
    size: 512,
    width: 512,
    height: 512,
    jpegCutoutUrl: "https://example.invalid/legacy-preview.jpg",
    fitsCutoutUrl: "https://example.invalid/legacy-preview.fits",
  },
  createdAt: "2026-03-28T18:00:00.000Z",
  updatedAt: "2026-03-28T18:01:00.000Z",
};

function createVm(overrides: Partial<ReturnType<typeof baseVm>> = {}) {
  return { ...baseVm(), ...overrides };
}

function baseVm() {
  return {
    graphqlState: {
      loading: false,
      payload: { data: {} },
      error: null as string | null,
    },
    currentUserId: "jeffreysanford",
    selectedJobId: selectedLegacyJob.id,
    serviceInfo: {
      name: "cosmic-forge-api",
      status: "graphql-live",
      operationName: "ForgeWorkbenchBootstrap",
      graphReady: true,
      contractVersion: "forge-workbench.v1",
    },
    surveys,
    jobs: [selectedLegacyJob],
    myJobs: [selectedLegacyJob],
    globalJobs: [selectedLegacyJob],
    imageProducts: [externalLegacyImage],
    latestJob: selectedLegacyJob,
    latestMyJob: selectedLegacyJob,
    latestMyImage: externalLegacyImage,
    selectedJob: selectedLegacyJob,
    selectedImage: externalLegacyImage,
    createJobLoading: false,
    createJobError: null as string | null,
    diagnostics: {
      queueDepth: 0,
      runningCount: 0,
      runningJobs: 0,
      failedJobs: 0,
      completedJobs: 1,
      blockedJobs: 0,
      delayedJobs: 0,
      retryingJobs: 0,
    },
    metrics: {
      totalJobs: 1,
      avgRunTimeSec: 5,
      successRate: 1,
      queueDepth: 0,
      successCount: 1,
      failureCount: 0,
      cachedArtifactCount: 0,
    },
    jobEvents: [
      {
        id: "forge-event-1",
        jobId: selectedLegacyJob.id,
        eventType: "JOB_COMPLETED",
        fromStatus: "RUNNING",
        toStatus: "COMPLETED",
        message: "Job completed",
        errorCode: null,
        createdAt: "2026-03-28T18:01:00.000Z",
      },
    ],
    cacheArtifactLoading: false,
    cacheArtifactError: null as string | null,
    queueSummary: {
      queuedCount: 0,
      runningCount: 0,
      completedCount: 1,
    },
  };
}

class ForgeFacadeStub {
  readonly vmSubject = new BehaviorSubject(createVm());
  readonly vm$ = this.vmSubject.asObservable();
  readonly initialize = jest.fn();
  readonly refresh = jest.fn();
  readonly createCutoutJob = jest.fn();
  readonly createCompositeJob = jest.fn();
  readonly selectJob = jest.fn();
  readonly cancelJob = jest.fn();
  readonly retryJob = jest.fn();
  readonly cacheImageArtifact = jest.fn();
}

class ForgeApiServiceStub {
  readonly resolveTarget = jest.fn(() =>
    of({
      data: {
        query: "Cygnus A",
        canonicalName: "Cygnus A",
        providerName: "CDS Sesame / SIMBAD",
        sourceUrl: "https://cds.unistra.fr/cgi-bin/nph-sesame/-oxp/SNV?Cygnus%20A",
        ra: 299.86815,
        dec: 40.73391,
        suggestedRadiusArcmin: 12,
      },
    })
  );
}

describe("ForgeComponent", () => {
  let component: ForgeComponent;
  let fixture: ComponentFixture<ForgeComponent>;
  let facade: ForgeFacadeStub;
  let forgeApi: ForgeApiServiceStub;

  beforeEach(async () => {
    facade = new ForgeFacadeStub();
    forgeApi = new ForgeApiServiceStub();

    await TestBed.configureTestingModule({
      declarations: [ForgeComponent],
      imports: [CommonModule, ReactiveFormsModule, RouterTestingModule],
      providers: [
        { provide: ForgeFacade, useValue: facade },
        { provide: ForgeApiService, useValue: forgeApi },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ForgeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("initializes the workbench through the facade", () => {
    expect(facade.initialize).toHaveBeenCalled();
  });

  it("shows validation guidance when the coordinate form is invalid", () => {
    component.workbenchForm.patchValue({
      target: "",
      ra: "361",
      dec: "-91",
      radiusArcmin: "0",
      surveyIds: [],
    });

    component.submitCutoutJob();
    fixture.detectChanges();

    expect(facade.createCutoutJob).not.toHaveBeenCalled();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain("Target/source is required");
    expect(text).toContain("RA must be a decimal degree value between 0 and 360.");
    expect(text).toContain("Dec must be a decimal degree value between -90 and 90.");
    expect(text).toContain("Radius must be a positive value up to 60 arcmin.");
    expect(text).toContain("Select at least one live adapter to create a cutout job.");
  });

  it("dispatches a create action when the form and survey selection are valid", () => {
    component.workbenchForm.patchValue({
      target: "M87",
      ra: "187.70593",
      dec: "12.39112",
      radiusArcmin: "15",
      surveyIds: ["legacy"],
    });

    component.submitCutoutJob();

    expect(facade.createCutoutJob).toHaveBeenCalledWith({
      requestedBy: "jeffreysanford",
      targetName: "M87",
      ra: 187.70593,
      dec: 12.39112,
      radiusArcmin: 15,
      surveyIds: ["legacy"],
    });
  });

  it("dispatches a composite create action when two live surveys are selected", () => {
    facade.vmSubject.next(
      createVm({
        surveys: [
          ...surveys,
          {
            id: "allwise",
            name: "AllWISE",
            providerName: "NASA/IPAC IRSA",
            waveband: "infrared",
            supportsFits: true,
            supportsCutout: true,
            supportsPreview: true,
            previewReady: true,
            citationUrl: "https://irsa.ipac.caltech.edu/Missions/wise.html",
          },
        ],
      })
    );
    fixture.detectChanges();
    component.workbenchForm.patchValue({
      target: "NGC 1275",
      ra: "49.9507",
      dec: "41.5117",
      radiusArcmin: "12",
      surveyIds: ["legacy", "allwise"],
    });

    component.submitCompositeJob();

    expect(facade.createCompositeJob).toHaveBeenCalledWith(
      expect.objectContaining({
        requestedBy: "jeffreysanford",
        targetName: "NGC 1275",
        surveyIds: ["legacy", "allwise"],
      })
    );
  });

  it("renders the external artifact mode and cache action clearly", () => {
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain("Artifact delivery: External provider asset");
    expect(text).toContain("Cache status: External-only until cached");
  });

  it("shows cache action for an external completed image", () => {
    facade.vmSubject.next(
      createVm({
        selectedImage: externalLegacyImage,
      })
    );
    fixture.detectChanges();

    const button = Array.from(fixture.nativeElement.querySelectorAll("button"))
      .find((element): element is HTMLButtonElement =>
        (element as HTMLButtonElement).textContent?.includes("Cache artifact")
      );

    expect(button).toBeTruthy();
    button?.click();
    expect(facade.cacheImageArtifact).toHaveBeenCalledWith("forge-image-legacy");
  });

  it("triggers a cache request when preview fails for external image once", () => {
    const previewUrl = "https://www.legacysurvey.org/jpeg-cutout?ra=49.95067&dec=41.5117";
    component.handlePreviewFailed("forge-image-legacy", previewUrl);
    expect(facade.cacheImageArtifact).toHaveBeenCalledTimes(1);
    expect(facade.cacheImageArtifact).toHaveBeenCalledWith("forge-image-legacy");
    expect(component.previewUnavailableForSelectedImage({
      ...externalLegacyImage,
      id: "forge-image-legacy",
      previewUrl,
    })).toBe(true);

    // Subsequent failures should not re-trigger additional cache requests
    component.handlePreviewFailed("forge-image-legacy", previewUrl);
    expect(facade.cacheImageArtifact).toHaveBeenCalledTimes(1);
  });

  it("allows cached preview URL updates after loading successfully", () => {
    const legacyImage = { ...externalLegacyImage, id: "forge-image-legacy", previewUrl: "https://old.url/1.jpg" };
    component.handlePreviewFailed("forge-image-legacy", legacyImage.previewUrl);
    expect(component.previewUnavailableForSelectedImage(legacyImage)).toBe(true);

    const cachedUrl = "http://localhost/api/forge/artifacts/forge-image-legacy/preview";
    component.handlePreviewLoaded("forge-image-legacy", cachedUrl);

    // old key should be cleared so new URL can show
    expect(component.previewUnavailableForSelectedImage({ ...legacyImage, previewUrl: cachedUrl })).toBe(false);
  });

  it("prepopulates the workbench form from the selected job", () => {
    facade.vmSubject.next(
      createVm({
        selectedJob: {
          ...selectedLegacyJob,
          id: "forge-job-cygnus-a",
          targetName: "Cygnus A",
          ra: 299.86815,
          dec: 40.73391,
          radiusArcmin: 10,
          requestedSurveyIds: ["allwise"],
        },
      })
    );
    fixture.detectChanges();

    expect(component.workbenchForm.getRawValue()).toMatchObject({
      target: "Cygnus A",
      ra: "299.86815",
      dec: "40.73391",
      radiusArcmin: "10",
      surveyIds: ["allwise"],
    });
  });

  it("applies a preset target into the workbench form", () => {
    component.workbenchForm.patchValue({
      target: "M87",
      ra: "0",
      dec: "0",
      radiusArcmin: "1",
    });

    component.applyPresetTarget("eta-carinae");

    expect(component.workbenchForm.getRawValue()).toMatchObject({
      target: "Eta Carinae",
      ra: "161.265",
      dec: "-59.6844",
      radiusArcmin: "20",
    });
    expect(component.targetLookupSummary()).toBe("Preset applied: Eta Carinae");
    expect(component.targetLookupError()).toBeNull();
  });

  it("resolves a typed target and populates coordinates and radius", () => {
    component.workbenchForm.patchValue({
      target: "Cygnus A",
      ra: "",
      dec: "",
      radiusArcmin: "",
    });

    component.resolveTypedTarget();
    fixture.detectChanges();

    expect(forgeApi.resolveTarget).toHaveBeenCalledWith("Cygnus A");
    expect(component.workbenchForm.getRawValue()).toMatchObject({
      target: "Cygnus A",
      ra: "299.86815",
      dec: "40.73391",
      radiusArcmin: "12",
    });
    expect(component.targetLookupSummary()).toBe("Resolved via CDS Sesame / SIMBAD: Cygnus A");
    expect(component.targetLookupError()).toBeNull();
  });

  it("shows a target lookup error when resolution fails", () => {
    forgeApi.resolveTarget.mockReturnValueOnce(
      throwError(() => ({
        error: {
          message: "No target coordinates were resolved for \"Unknown Source\".",
        },
      }))
    );
    component.workbenchForm.patchValue({ target: "Unknown Source" });

    component.resolveTypedTarget();
    fixture.detectChanges();

    expect(component.targetLookupError()).toBe(
      'No target coordinates were resolved for "Unknown Source".'
    );
    expect(component.targetLookupSummary()).toBeNull();
  });

  it("renders provider-specific citation and source labels for the selected image", () => {
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain("NOIRLab / Legacy Surveys citation");
    expect(text).toContain("NOIRLab / Legacy Surveys source asset");
  });

  it("labels SkyView-backed presets as derived instead of planned", () => {
    const dss2Survey = surveys.find((survey) => survey.id === "dss2") as ForgeSurveyDto;

    expect(component.surveyAvailabilityLabel(dss2Survey)).toBe("derived");
    expect(component.isSurveySelectable(dss2Survey)).toBe(true);
  });

  it("builds a viewer handoff query from the selected job", () => {
    const params = component.selectedViewerQueryParams(selectedLegacyJob, externalLegacyImage);

    expect(params).toEqual({
      target: "M87",
      ra: 187.70593,
      dec: 12.39112,
      fov: 0.5,
      survey: "P/DSS2/color",
    });
  });

  it("surfaces bootstrap refresh semantics when subscriptions are deferred", () => {
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain("refresh mode: GraphQL bootstrap + 10s auto-refresh");
    expect(text).toContain("subscriptions: Deferred for this PI");
    expect(text).toContain("Available now: queue diagnostics, metrics, recent job events");
    expect(text).toContain("freshest event timestamp: 2026-03-28T18:01:00.000Z");
  });
});
