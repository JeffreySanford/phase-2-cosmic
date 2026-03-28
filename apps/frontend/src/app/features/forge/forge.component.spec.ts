import { CommonModule } from "@angular/common";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ReactiveFormsModule } from "@angular/forms";
import { BehaviorSubject } from "rxjs";
import { ForgeComponent } from "./forge.component";
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
  readonly selectJob = jest.fn();
  readonly cancelJob = jest.fn();
  readonly retryJob = jest.fn();
  readonly cacheImageArtifact = jest.fn();
}

describe("ForgeComponent", () => {
  let component: ForgeComponent;
  let fixture: ComponentFixture<ForgeComponent>;
  let facade: ForgeFacadeStub;

  beforeEach(async () => {
    facade = new ForgeFacadeStub();

    await TestBed.configureTestingModule({
      declarations: [ForgeComponent],
      imports: [CommonModule, ReactiveFormsModule],
      providers: [{ provide: ForgeFacade, useValue: facade }],
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

    const button = Array.from(fixture.nativeElement.querySelectorAll("button")).find(
      (element: Element) => element.textContent?.includes("Cache artifact")
    ) as HTMLButtonElement | undefined;

    expect(button).toBeTruthy();
    button?.click();
    expect(facade.cacheImageArtifact).toHaveBeenCalledWith("forge-image-legacy");
  });
});
