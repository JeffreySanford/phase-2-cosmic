import {
  ForgeImageProductDto,
  ForgeJobDto,
  ForgeSurveyDto,
} from "./state/forge.models";
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  DestroyRef,
  inject,
  signal,
} from "@angular/core";
import { FormBuilder } from "@angular/forms";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { combineLatest, distinctUntilChanged, map, shareReplay, startWith } from "rxjs";
import { ForgeFacade } from "./state/forge.facade";

const EXPECTED_FORGE_CONTRACT_VERSION = "forge-workbench.v1";

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
  private readonly destroyRef = inject(DestroyRef);
  private readonly previewLoadErrorImageId = signal<string | null>(null);

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
    this.vm$
      .pipe(
        map((vm) => vm.selectedJob),
        distinctUntilChanged((previous, current) => previous?.id === current?.id),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((selectedJob) => {
        if (!selectedJob) {
          return;
        }

        this.workbenchForm.patchValue({
          target: selectedJob.targetName,
          ra: String(selectedJob.ra),
          dec: String(selectedJob.dec),
          radiusArcmin: String(selectedJob.radiusArcmin),
          surveyIds: [...selectedJob.requestedSurveyIds],
        });
      });

    this.vm$
      .pipe(
        map((vm) => vm.selectedImage?.id ?? null),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => {
        this.previewLoadErrorImageId.set(null);
      });
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
    if (survey.id === "skyview" && this.isSurveySelectable(survey)) {
      return "derived";
    }

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

  selectedArtifactSummary(selectedImage: ForgeImageProductDto | null): string {
    if (!selectedImage) {
      return "preview image, provenance";
    }

    return selectedImage.fitsUrl
      ? "preview image, FITS cutout URL, provenance"
      : "derived preview image, provenance";
  }

  selectedPixscaleLabel(
    selectedJob: ForgeJobDto | null,
    selectedImage: ForgeImageProductDto | null
  ): string {
    const pixscale = selectedJob?.request?.pixscale ?? selectedImage?.provenance.pixscale ?? null;
    return pixscale === null ? "derived / not reported" : String(pixscale);
  }

  selectedProvenancePixscaleLabel(selectedImage: ForgeImageProductDto | null): string {
    return selectedImage?.provenance.pixscale === null || !selectedImage
      ? "derived / not reported"
      : String(selectedImage.provenance.pixscale);
  }

  isDerivedPreview(selectedImage: ForgeImageProductDto | null): boolean {
    return selectedImage?.provenance.transformChain.includes("skyview-derived-image") ?? false;
  }

  hasSupportedContract(vm: { serviceInfo: { contractVersion: string } | null }): boolean {
    return vm.serviceInfo?.contractVersion === EXPECTED_FORGE_CONTRACT_VERSION;
  }

  isShellOffline(vm: { graphqlState: { error: string | null; loading: boolean } }): boolean {
    return !vm.graphqlState.loading && !!vm.graphqlState.error;
  }

  shellStatusTitle(vm: {
    graphqlState: { error: string | null; loading: boolean };
    serviceInfo: { graphReady: boolean; contractVersion: string } | null;
  }): string {
    if (this.isShellOffline(vm)) {
      return "Forge read model is offline through the SSR seam";
    }

    if (!vm.serviceInfo?.graphReady) {
      return "Forge read model is not ready";
    }

    if (!this.hasSupportedContract(vm)) {
      return "Forge contract version mismatch";
    }

    return "Forge runtime is available";
  }

  shellStatusMessage(vm: {
    graphqlState: { error: string | null; loading: boolean };
    serviceInfo: {
      name?: string;
      status: string;
      graphReady: boolean;
      contractVersion: string;
    } | null;
  }): string {
    if (this.isShellOffline(vm)) {
      return "GraphQL bootstrap failed. You can still inspect the form shell, but live queue data and artifacts are unavailable until the Forge API read model is reachable again.";
    }

    if (!vm.serviceInfo?.graphReady) {
      return "The Forge API responded, but the read model is not marked graph-ready yet. Treat the shell as degraded until the contract stabilizes.";
    }

    if (!this.hasSupportedContract(vm)) {
      return `The Forge API responded with contract version ${
        vm.serviceInfo?.contractVersion || "unknown"
      }, but the UI expects ${EXPECTED_FORGE_CONTRACT_VERSION}. Treat the shell as degraded until the UI and API are aligned.`;
    }

    return `Forge is bootstrapping entirely from the GraphQL read model exposed by ${
      vm.serviceInfo?.name || "the SSR proxy"
    }.`;
  }

  readModelStatus(vm: {
    graphqlState: { error: string | null; loading: boolean };
    serviceInfo: { graphReady: boolean; contractVersion: string } | null;
  }): "offline" | "degraded" | "ready" {
    if (this.isShellOffline(vm)) {
      return "offline";
    }

    if (!vm.serviceInfo?.graphReady || !this.hasSupportedContract(vm)) {
      return "degraded";
    }

    return "ready";
  }

  handlePreviewLoaded(imageId: string | null): void {
    if (imageId && this.previewLoadErrorImageId() === imageId) {
      this.previewLoadErrorImageId.set(null);
    }
  }

  handlePreviewFailed(imageId: string | null): void {
    if (imageId) {
      this.previewLoadErrorImageId.set(imageId);
    }
  }

  previewUnavailableForSelectedImage(selectedImage: ForgeImageProductDto | null): boolean {
    return !!selectedImage && this.previewLoadErrorImageId() === selectedImage.id;
  }

  selectedTargetLabel(selectedJob: ForgeJobDto | null, formTarget: string | null | undefined): string {
    return selectedJob?.targetName || formTarget || "n/a";
  }

  selectedCitationLabel(selectedImage: ForgeImageProductDto | null): string {
    return selectedImage ? `${selectedImage.provenance.providerName} citation` : "source citation";
  }

  selectedAuthoritativeSourceLabel(selectedImage: ForgeImageProductDto | null): string {
    if (!selectedImage) {
      return "provider asset";
    }

    if (selectedImage.provenance.retrievalPathType === "skyview-query") {
      return `Open in ${selectedImage.provenance.providerName} for this target`;
    }

    return `${selectedImage.provenance.providerName} source asset`;
  }
}
