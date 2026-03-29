import {
  ForgeCreateCompositeJobInputDto,
  ForgeImageProductDto,
  ForgeJobDto,
  ForgeResolvedTargetDto,
  ForgeSurveyDto,
  ForgeVmDiagnosticsDto,
  ForgeVmJobEventDto,
  ForgeVmMetricsDto,
} from "./state/forge.models";
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  DestroyRef,
  inject,
  signal,
} from "@angular/core";
import { FormBuilder, Validators } from "@angular/forms";
import { Params } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { combineLatest, distinctUntilChanged, map, shareReplay, startWith } from "rxjs";
import { ForgeFacade } from "./state/forge.facade";
import { ForgeApiService } from "./state/forge-api.service";

const EXPECTED_FORGE_CONTRACT_VERSION = "forge-workbench.v1";
const MAX_RADIUS_ARCMIN = 60;

type ForgeTargetPreset = Readonly<{
  id: string;
  label: string;
  targetName: string;
  ra: number;
  dec: number;
  radiusArcmin: number;
}>;

const FORGE_TARGET_PRESETS: readonly ForgeTargetPreset[] = [
  {
    id: "m87",
    label: "M87",
    targetName: "M87",
    ra: 187.70593,
    dec: 12.39112,
    radiusArcmin: 15,
  },
  {
    id: "cygnus-a",
    label: "Cygnus A",
    targetName: "Cygnus A",
    ra: 299.86815,
    dec: 40.73391,
    radiusArcmin: 12,
  },
  {
    id: "ngc-1275",
    label: "NGC 1275",
    targetName: "NGC 1275",
    ra: 49.95067,
    dec: 41.5117,
    radiusArcmin: 12,
  },
  {
    id: "eta-carinae",
    label: "Eta Carinae",
    targetName: "Eta Carinae",
    ra: 161.265,
    dec: -59.6844,
    radiusArcmin: 20,
  },
  {
    id: "horsehead",
    label: "Horsehead",
    targetName: "Horsehead",
    ra: 85.25208,
    dec: -2.46083,
    radiusArcmin: 18,
  },
];

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
  private readonly forgeApi = inject(ForgeApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly previewLoadErrorImageId = signal<string | null>(null);
  private readonly submitAttempted = signal(false);
  private readonly lastSuccessfulBootstrapAt = signal<string | null>(null);
  private readonly resolvingTarget = signal(false);
  private readonly targetResolutionError = signal<string | null>(null);
  private readonly targetResolutionSummary = signal<string | null>(null);
  readonly targetPresets = FORGE_TARGET_PRESETS;

  readonly workbenchForm = this.fb.group({
    target: ["M87", [Validators.required]],
    ra: [
      "187.70593",
      [Validators.required, Validators.pattern(/^-?(?:\d+\.?\d*|\.\d+)$/)],
    ],
    dec: [
      "12.39112",
      [Validators.required, Validators.pattern(/^-?(?:\d+\.?\d*|\.\d+)$/)],
    ],
    radiusArcmin: [
      "15",
      [Validators.required, Validators.pattern(/^(?:\d+\.?\d*|\.\d+)$/)],
    ],
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
        map((vm) => vm.graphqlState.payload),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((payload) => {
        if (payload) {
          this.lastSuccessfulBootstrapAt.set(new Date().toISOString());
        }
      });

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

  applyPresetTarget(presetId: string): void {
    const preset = this.targetPresets.find((item) => item.id === presetId);
    if (!preset) {
      return;
    }

    this.workbenchForm.patchValue({
      target: preset.targetName,
      ra: String(preset.ra),
      dec: String(preset.dec),
      radiusArcmin: String(preset.radiusArcmin),
    });
    this.targetResolutionError.set(null);
    this.targetResolutionSummary.set(`Preset applied: ${preset.label}`);
  }

  resolveTypedTarget(): void {
    const query = String(this.workbenchForm.controls.target.getRawValue() ?? "").trim();
    if (!query) {
      this.targetResolutionError.set("Enter a target name before resolving.");
      this.targetResolutionSummary.set(null);
      return;
    }

    this.resolvingTarget.set(true);
    this.targetResolutionError.set(null);
    this.targetResolutionSummary.set(null);

    this.forgeApi
      .resolveTarget(query)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (payload) => {
          this.resolvingTarget.set(false);
          this.applyResolvedTarget(payload.data);
        },
        error: (error: { error?: { message?: string }; message?: string }) => {
          this.resolvingTarget.set(false);
          this.targetResolutionError.set(
            error?.error?.message || error?.message || "Target lookup failed."
          );
        },
      });
  }

  submitCutoutJob(): void {
    this.submitAttempted.set(true);
    if (this.workbenchForm.invalid) {
      this.workbenchForm.markAllAsTouched();
      return;
    }

    const rawValue = this.workbenchForm.getRawValue();
    const surveyIds = Array.isArray(rawValue.surveyIds)
      ? rawValue.surveyIds.filter((value): value is string => typeof value === "string")
      : [];

    const ra = Number(rawValue.ra ?? 0);
    const dec = Number(rawValue.dec ?? 0);
    const radiusArcmin = Number(rawValue.radiusArcmin ?? 0);
    if (
      !Number.isFinite(ra) ||
      ra < 0 ||
      ra > 360 ||
      !Number.isFinite(dec) ||
      dec < -90 ||
      dec > 90 ||
      !Number.isFinite(radiusArcmin) ||
      radiusArcmin <= 0 ||
      radiusArcmin > MAX_RADIUS_ARCMIN
    ) {
      this.workbenchForm.markAllAsTouched();
      return;
    }

    this.forgeFacade.createCutoutJob({
      requestedBy: "jeffreysanford",
      targetName: String(rawValue.target ?? ""),
      ra,
      dec,
      radiusArcmin,
      surveyIds,
    });
  }

  submitCompositeJob(): void {
    this.submitAttempted.set(true);
    if (
      this.workbenchForm.invalid ||
      !this.hasValidRa() ||
      !this.hasValidDec() ||
      !this.hasValidRadius()
    ) {
      this.workbenchForm.markAllAsTouched();
      return;
    }

    const surveyIds = this.selectedLiveSurveyIds();
    if (surveyIds.length < 2) {
      this.workbenchForm.markAllAsTouched();
      return;
    }

    const rawValue = this.workbenchForm.getRawValue();
    const input: ForgeCreateCompositeJobInputDto = {
      requestedBy: "jeffreysanford",
      targetName: String(rawValue.target ?? ""),
      ra: Number(rawValue.ra ?? 0),
      dec: Number(rawValue.dec ?? 0),
      radiusArcmin: Number(rawValue.radiusArcmin ?? 0),
      surveyIds,
      compositeRequest: {
        operation: "survey-stack",
        inputs: [],
        parameters: {
          mode: "quicklook",
          sourceCount: surveyIds.length,
        },
      },
    };

    this.forgeFacade.createCompositeJob(input);
  }

  toggleSurveySelection(surveyId: string): void {
    const selected = this.workbenchForm.controls.surveyIds.getRawValue() ?? [];
    const nextSelection = selected.includes(surveyId)
      ? selected.filter((id) => id !== surveyId)
      : [...selected, surveyId];
    this.workbenchForm.controls.surveyIds.setValue(nextSelection);
    this.workbenchForm.controls.surveyIds.markAsDirty();
  }

  isSurveySelected(surveyId: string): boolean {
    return (this.workbenchForm.controls.surveyIds.getRawValue() ?? []).includes(surveyId);
  }

  isSurveySelectable(survey: ForgeSurveyDto): boolean {
    return survey.supportsCutout && survey.previewReady;
  }

  surveyAvailabilityLabel(survey: ForgeSurveyDto): string {
    if (survey.providerName === "NASA GSFC SkyView" && this.isSurveySelectable(survey)) {
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

  selectedSurveyCount(): number {
    return this.workbenchForm.controls.surveyIds.getRawValue()?.length ?? 0;
  }

  selectedLiveSurveyIds(): string[] {
    return (this.workbenchForm.controls.surveyIds.getRawValue() ?? []).filter(
      (value): value is string => typeof value === "string"
    );
  }

  showTargetValidation(): boolean {
    const control = this.workbenchForm.controls.target;
    return (control.touched || this.submitAttempted()) && control.invalid;
  }

  showRaValidation(): boolean {
    const control = this.workbenchForm.controls.ra;
    return (
      (control.touched || this.submitAttempted()) &&
      (control.invalid || !this.hasValidRa())
    );
  }

  showDecValidation(): boolean {
    const control = this.workbenchForm.controls.dec;
    return (
      (control.touched || this.submitAttempted()) &&
      (control.invalid || !this.hasValidDec())
    );
  }

  showRadiusValidation(): boolean {
    const control = this.workbenchForm.controls.radiusArcmin;
    return (
      (control.touched || this.submitAttempted()) &&
      (control.invalid || !this.hasValidRadius())
    );
  }

  showSurveyValidation(surveys: readonly ForgeSurveyDto[]): boolean {
    return this.submitAttempted() && !this.selectedSurveysIncludeLiveAdapter(surveys);
  }

  canSubmit(vm: {
    createJobLoading: boolean;
    surveys: readonly ForgeSurveyDto[];
  }): boolean {
    return (
      !vm.createJobLoading &&
      this.workbenchForm.valid &&
      this.hasValidRa() &&
      this.hasValidDec() &&
      this.hasValidRadius() &&
      this.selectedSurveysIncludeLiveAdapter(vm.surveys)
    );
  }

  canSubmitComposite(vm: {
    createJobLoading: boolean;
    surveys: readonly ForgeSurveyDto[];
  }): boolean {
    const selectedLiveCount = (this.workbenchForm.controls.surveyIds.getRawValue() ?? []).filter(
      (surveyId): surveyId is string =>
        typeof surveyId === "string" &&
        vm.surveys.some(
          (survey) => survey.id === surveyId && this.isSurveySelectable(survey)
        )
    ).length;

    return (
      !vm.createJobLoading &&
      this.workbenchForm.valid &&
      this.hasValidRa() &&
      this.hasValidDec() &&
      this.hasValidRadius() &&
      selectedLiveCount >= 2
    );
  }

  targetValidationMessage(): string {
    return "Target/source is required so the queue and provenance remain readable.";
  }

  raValidationMessage(): string {
    return "RA must be a decimal degree value between 0 and 360.";
  }

  decValidationMessage(): string {
    return "Dec must be a decimal degree value between -90 and 90.";
  }

  radiusValidationMessage(): string {
    return `Radius must be a positive value up to ${MAX_RADIUS_ARCMIN} arcmin.`;
  }

  surveyValidationMessage(): string {
    return "Select at least one live adapter to create a cutout job.";
  }

  compositeValidationMessage(): string {
    return "Select at least two live adapters to create a composite job.";
  }

  resolvingTargetLabel(): string {
    return this.resolvingTarget() ? "Resolving target..." : "Resolve target";
  }

  isResolvingTarget(): boolean {
    return this.resolvingTarget();
  }

  targetLookupSummary(): string | null {
    return this.targetResolutionSummary();
  }

  targetLookupError(): string | null {
    return this.targetResolutionError();
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

  jobPreviewMode(job: ForgeJobDto, imageProducts: readonly ForgeImageProductDto[]): string {
    const images = imageProducts.filter((image) => image.jobId === job.id);
    if (images.length === 0) {
      return "pending/no preview";
    }

    if (images.some((image) => image.artifactMode === "cached")) {
      return "cached by Forge";
    }

    return "external provider only";
  }

  hasMultipleSelectedSurveys(): boolean {
    return this.selectedSurveyCount() > 1;
  }

  readonly surveyPriorityGuidance =
    "Multiple surveys selected. Forge will prioritize the first available live preview " +
    "based on survey order and adapter readiness. Use the global queue to inspect " +
    "the chosen preview source.";

  selectedSurveyPriorityMessage(): string {
    return this.hasMultipleSelectedSurveys() ? this.surveyPriorityGuidance : "";
  }

  jobTimelineValues(jobs: readonly ForgeJobDto[]): number[] {
    return jobs
      .slice(-30)
      .map((job) => Math.min(100, Math.max(0, job.progressPercent ?? 0)));
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

  selectedArtifactModeLabel(selectedImage: ForgeImageProductDto | null): string {
    if (!selectedImage) {
      return "No artifact selected yet";
    }

    return selectedImage.artifactMode === "cached"
      ? "Cached locally through Forge"
      : "External provider asset";
  }

  selectedCacheStatusLabel(selectedImage: ForgeImageProductDto | null): string {
    if (!selectedImage) {
      return "No cache state yet";
    }

    return selectedImage.cacheStatus === "cached"
      ? "Cached and served by Forge"
      : "External-only until cached";
  }

  queueStateDescription(
    job: ForgeJobDto,
    imageProducts: readonly ForgeImageProductDto[]
  ): string {
    switch (job.status) {
      case "QUEUED":
        return "Waiting for worker claim";
      case "RUNNING":
        return "Worker is executing this request";
      case "COMPLETED":
        return this.jobHasPreview(job, imageProducts)
          ? "Result published"
          : "Completed without preview";
      case "FAILED":
        return job.errorCode ? `Failed with ${job.errorCode}` : "Failed";
      case "CANCELLED":
        return "Cancelled by operator";
      default:
        return job.status;
    }
  }

  resultPanelTitle(selectedJob: ForgeJobDto | null): string {
    if (!selectedJob) {
      return "Select a job to inspect its result";
    }

    return `${selectedJob.targetName} · ${selectedJob.status.toLowerCase()}`;
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

  isCompositePreview(selectedImage: ForgeImageProductDto | null): boolean {
    return (
      selectedImage?.provenance.transformChain.some((step) =>
        step.startsWith("composite-assembly:")
      ) ?? false
    );
  }

  diagnosticsSummary(diagnostics: ForgeVmDiagnosticsDto | null): string {
    if (!diagnostics) {
      return "Diagnostics unavailable until GraphQL bootstrap succeeds.";
    }

    return `${diagnostics.queueDepth} queued · ${diagnostics.runningJobs} running · ${diagnostics.retryingJobs} retrying`;
  }

  metricsSummary(metrics: ForgeVmMetricsDto | null): string {
    if (!metrics) {
      return "Metrics unavailable until GraphQL bootstrap succeeds.";
    }

    return `${metrics.successCount} success · ${metrics.failureCount} failed · ${metrics.cachedArtifactCount} cached`;
  }

  eventSummary(event: ForgeVmJobEventDto): string {
    return event.message || `${event.eventType} · ${event.jobId}`;
  }

  refreshModeLabel(): string {
    return "GraphQL bootstrap + 10s auto-refresh";
  }

  subscriptionModeLabel(): string {
    return "Deferred for this PI";
  }

  lastSuccessfulBootstrapLabel(): string {
    return this.lastSuccessfulBootstrapAt() || "Awaiting first successful bootstrap";
  }

  freshestEventLabel(jobEvents: readonly ForgeVmJobEventDto[]): string {
    if (jobEvents.length === 0) {
      return "No recent queue events returned yet";
    }

    const newestTimestamp = [...jobEvents]
      .map((event) => event.createdAt)
      .sort((left, right) => Date.parse(right) - Date.parse(left))[0];

    return newestTimestamp || "No recent queue events returned yet";
  }

  availableDataSummary(vm: {
    diagnostics: ForgeVmDiagnosticsDto | null;
    metrics: ForgeVmMetricsDto | null;
    jobEvents: readonly ForgeVmJobEventDto[];
  }): string {
    const sections = [
      vm.diagnostics ? "queue diagnostics" : null,
      vm.metrics ? "metrics" : null,
      vm.jobEvents.length > 0 ? "recent job events" : null,
    ].filter((value): value is string => typeof value === "string");

    return sections.length > 0
      ? `Available now: ${sections.join(", ")}`
      : "Available now: service info and bootstrap payload only";
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

  selectedViewerQueryParams(
    selectedJob: ForgeJobDto | null,
    selectedImage: ForgeImageProductDto | null
  ): Params | null {
    if (!selectedJob) {
      return null;
    }

    return {
      target: selectedJob.targetName,
      ra: selectedJob.ra,
      dec: selectedJob.dec,
      fov: Number(((selectedJob.radiusArcmin * 2) / 60).toFixed(3)),
      survey: this.viewerSurveyPreset(selectedImage?.surveyId ?? null),
    };
  }

  private hasValidRa(): boolean {
    const ra = Number(this.workbenchForm.controls.ra.getRawValue());
    return Number.isFinite(ra) && ra >= 0 && ra <= 360;
  }

  private hasValidDec(): boolean {
    const dec = Number(this.workbenchForm.controls.dec.getRawValue());
    return Number.isFinite(dec) && dec >= -90 && dec <= 90;
  }

  private hasValidRadius(): boolean {
    const radius = Number(this.workbenchForm.controls.radiusArcmin.getRawValue());
    return Number.isFinite(radius) && radius > 0 && radius <= MAX_RADIUS_ARCMIN;
  }

  private viewerSurveyPreset(surveyId: string | null): string {
    switch (surveyId) {
      case "allwise":
        return "P/allWISE/color";
      case "panstarrs":
        return "P/PanSTARRS/DR1/color-z-zg-g";
      default:
        return "P/DSS2/color";
    }
  }

  private applyResolvedTarget(resolvedTarget: ForgeResolvedTargetDto): void {
    const preset = this.matchPresetForResolvedTarget(resolvedTarget);
    const radiusArcmin =
      preset?.radiusArcmin ??
      resolvedTarget.suggestedRadiusArcmin ??
      Number(this.workbenchForm.controls.radiusArcmin.getRawValue() || 15);

    this.workbenchForm.patchValue({
      target: resolvedTarget.query,
      ra: String(Number(resolvedTarget.ra.toFixed(6))),
      dec: String(Number(resolvedTarget.dec.toFixed(6))),
      radiusArcmin: String(radiusArcmin),
    });
    this.targetResolutionSummary.set(
      `Resolved via ${resolvedTarget.providerName}: ${resolvedTarget.canonicalName}`
    );
  }

  private matchPresetForResolvedTarget(
    resolvedTarget: ForgeResolvedTargetDto
  ): ForgeTargetPreset | null {
    const normalizedNames = [
      resolvedTarget.query,
      resolvedTarget.canonicalName,
    ].map((value) => value.trim().toLowerCase());

    return (
      this.targetPresets.find((preset) =>
        normalizedNames.includes(preset.targetName.trim().toLowerCase())
      ) ?? null
    );
  }
}
