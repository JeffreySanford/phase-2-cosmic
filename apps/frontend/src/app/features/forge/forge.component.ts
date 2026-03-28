import {
  ForgeImageProductDto,
  ForgeJobDto,
  ForgeSurveyDto,
} from "./state/forge.models";
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
} from "@angular/core";
import { FormBuilder } from "@angular/forms";
import { combineLatest, map, shareReplay, startWith } from "rxjs";
import { ForgeFacade } from "./state/forge.facade";

@Component({
  selector: "app-forge",
  templateUrl: "./forge.component.html",
  styleUrls: ["./forge.component.scss"],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForgeComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly forgeFacade = inject(ForgeFacade);

  readonly workbenchForm = this.fb.group({
    target: ["M87"],
    ra: ["187.70593"],
    dec: ["12.39112"],
    radiusArcmin: ["15"],
    surveyIds: [["legacy"]],
  });

  readonly vm$ = combineLatest([
    this.forgeFacade.vm$,
    this.workbenchForm.valueChanges.pipe(startWith(this.workbenchForm.getRawValue())),
  ]).pipe(
    map(([forgeVm, formValue]) => ({
      ...forgeVm,
      formValue,
    })),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  ngOnInit(): void {
    this.forgeFacade.initialize();
  }

  reload(): void {
    this.forgeFacade.refresh();
  }

  submitCutoutJob(): void {
    const rawValue = this.workbenchForm.getRawValue();
    const surveyIds = Array.isArray(rawValue.surveyIds)
      ? rawValue.surveyIds.filter((value): value is string => typeof value === "string")
      : [];

    this.forgeFacade.createCutoutJob({
      requestedBy: "jeffreysanford",
      targetName: String(rawValue.target ?? ""),
      ra: Number(rawValue.ra ?? 0),
      dec: Number(rawValue.dec ?? 0),
      radiusArcmin: Number(rawValue.radiusArcmin ?? 0),
      surveyIds,
    });
  }

  toggleSurveySelection(surveyId: string): void {
    const selected = this.workbenchForm.controls.surveyIds.getRawValue() ?? [];
    const nextSelection = selected.includes(surveyId)
      ? selected.filter((id) => id !== surveyId)
      : [...selected, surveyId];
    this.workbenchForm.controls.surveyIds.setValue(nextSelection);
  }

  isSurveySelected(surveyId: string): boolean {
    return (this.workbenchForm.controls.surveyIds.getRawValue() ?? []).includes(surveyId);
  }

  isSurveySelectable(survey: ForgeSurveyDto): boolean {
    return survey.supportsCutout && survey.previewReady;
  }

  surveyAvailabilityLabel(survey: ForgeSurveyDto): string {
    if (this.isSurveySelectable(survey)) {
      return "live";
    }

    if (survey.supportsCutout) {
      return "planned";
    }

    return "registered";
  }

  selectedSurveysIncludeLiveAdapter(surveys: readonly ForgeSurveyDto[]): boolean {
    const selectedSurveyIds = this.workbenchForm.controls.surveyIds.getRawValue() ?? [];
    return surveys.some(
      (survey) =>
        selectedSurveyIds.includes(survey.id) && this.isSurveySelectable(survey)
    );
  }

  cancelJob(jobId: string): void {
    this.forgeFacade.cancelJob(jobId);
  }

  retryJob(jobId: string): void {
    this.forgeFacade.retryJob(jobId);
  }

  cacheImageArtifact(imageId: string): void {
    this.forgeFacade.cacheImageArtifact(imageId);
  }

  selectJob(jobId: string): void {
    this.forgeFacade.selectJob(jobId);
  }

  isSelectedJob(selectedJobId: string | null, jobId: string): boolean {
    return selectedJobId === jobId;
  }

  jobHasPreview(
    job: ForgeJobDto,
    imageProducts: readonly ForgeImageProductDto[]
  ): boolean {
    return (
      job.resultImageIds.length > 0 ||
      imageProducts.some((imageProduct) => imageProduct.jobId === job.id)
    );
  }

  canCacheSelectedImage(
    selectedJob: ForgeJobDto | null,
    selectedImage: ForgeImageProductDto | null
  ): boolean {
    return (
      selectedJob?.status === "COMPLETED" &&
      !!selectedImage &&
      selectedImage.artifactMode === "external"
    );
  }

  selectedBands(job: ForgeJobDto | null): string {
    return job?.request?.bands.join(", ") || "n/a";
  }

  selectedBandSet(selectedImage: ForgeImageProductDto | null): string {
    return selectedImage?.provenance.bandSet.join(", ") || "n/a";
  }
}
