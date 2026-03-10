import { Component, Inject, OnInit } from "@angular/core";
import { FormBuilder, FormGroup, Validators } from "@angular/forms";
import { MAT_DIALOG_DATA, MatDialogRef } from "@angular/material/dialog";
import { JobsService } from "../../services/jobs.service";
import { VoService } from "../../services/vo.service";

export interface JobsSubmitData {
  workflow?: string;
  parameters?: Record<string, unknown> | undefined;
}

@Component({
  selector: "app-jobs-submit-dialog",
  templateUrl: "./jobs-submit-dialog.component.html",
  styleUrls: ["./jobs-submit-dialog.component.scss"],
  standalone: false,
})
export class JobsSubmitDialogComponent implements OnInit {
  workflow = "ingest";
  payloadText = "";
  lineageObj: Record<string, unknown> | undefined;
  datasetId = "";
  requestedBy = "";
  error: string | null = null;
  lastSampleDescription = "";

  voProviders: Array<{ name: string; tapUrl: string; dataLinkUrl: string }> = [
    {
      name: "NRAO",
      tapUrl: "https://data-query.nrao.edu/tap/sync",
      dataLinkUrl: "https://data-query.nrao.edu/datalink",
    },
    {
      name: "HEASARC",
      tapUrl: "https://heasarc.gsfc.nasa.gov/xamin/tap/sync",
      dataLinkUrl: "",
    },
    {
      name: "ESO",
      tapUrl: "https://archive.eso.org/tap_obs/sync",
      dataLinkUrl: "",
    },
    {
      name: "CADC",
      tapUrl: "https://ws.cadc-ccda.hia-iha.nrc-cnrc.gc.ca/tap/sync",
      dataLinkUrl: "",
    },
    { name: "Custom", tapUrl: "", dataLinkUrl: "" },
  ];

  voForm!: FormGroup;

  workflowGroups: Array<{
    label: string;
    types: Array<{ value: string; label: string }>;
  }> = [
    {
      label: "Data Management",
      types: [
        { value: "ingest", label: "Import" },
        { value: "export", label: "Export" },
        { value: "reindex", label: "Reindex" },
        { value: "cleanup", label: "Cleanup" },
        { value: "diagnostics", label: "Diagnostics" },
      ],
    },
    {
      label: "VO: Catalog",
      types: [
        { value: "vo.cone-search", label: "Cone Search" },
        { value: "vo.adql.query", label: "ADQL Query" },
        { value: "vo.obscore.search", label: "ObsCore" },
        { value: "vo.votable.fetch", label: "VOTable" },
      ],
    },
    {
      label: "VO: Data Access",
      types: [
        { value: "vo.datalink.resolve", label: "DataLink" },
        { value: "vo.product.fetch", label: "Product Fetch" },
        { value: "vo.soda.cutout", label: "SODA Cutout" },
        { value: "vo.preview.fetch", label: "Preview" },
      ],
    },
  ];

  availableTypes: string[] = this.workflowGroups.flatMap((g) =>
    g.types.map((t) => t.value)
  );

  private requiredFields: Record<string, string[]> = {
    import: ["source"],
    ingest: ["source"],
    export: ["destination"],
    reindex: ["indexName"],
    cleanup: ["olderThanDays"],
    diagnostics: [],
    transform: ["script"],
    validate: ["rules"],
    archive: ["target"],
    snapshot: ["snapshotName"],
    analyze: ["query"],
    train: ["modelName"],
    notify: ["channel"],
    backup: ["target"],
    restore: ["source"],
    publish: ["destination"],
    fetch: ["uri"],
    scheduler: ["cron"],
    "vo.cone-search": ["provider", "serviceUrl"],
    "vo.adql.query": ["provider", "tapUrl", "adql"],
    "vo.obscore.search": ["provider", "tapUrl"],
    "vo.votable.fetch": ["provider"],
    "vo.datalink.resolve": ["provider"],
    "vo.product.fetch": ["provider", "productUrl"],
    "vo.soda.cutout": ["provider"],
    "vo.preview.fetch": ["provider"],
  };

  public publicSources: Array<{ name: string; url: string }> = [];

  constructor(
    public dialogRef: MatDialogRef<JobsSubmitDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: JobsSubmitData,
    private jobsSvc: JobsService,
    private voSvc: VoService,
    private fb: FormBuilder
  ) {
    this.workflow = data?.workflow || "ingest";
    this.payloadText = data?.parameters
      ? JSON.stringify(data.parameters, null, 2)
      : "";
    this._buildVoForm();
  }

  get isVoWorkflow(): boolean {
    return this.workflow.startsWith("vo.");
  }

  get showConeFields(): boolean {
    return this.workflow === "vo.cone-search";
  }

  get showAdqlFields(): boolean {
    return this.workflow === "vo.adql.query";
  }

  get showObscoreFields(): boolean {
    return this.workflow === "vo.obscore.search";
  }

  get showVotableFields(): boolean {
    return this.workflow === "vo.votable.fetch";
  }

  get showDatalinkFields(): boolean {
    return this.workflow === "vo.datalink.resolve";
  }

  get showProductFields(): boolean {
    return this.workflow === "vo.product.fetch";
  }

  get showSodaFields(): boolean {
    return this.workflow === "vo.soda.cutout";
  }

  get showPreviewFields(): boolean {
    return this.workflow === "vo.preview.fetch";
  }

  // URL-field visibility helpers used by the template
  get showTapUrl(): boolean {
    return this.showAdqlFields || this.showObscoreFields;
  }
  get showDatalinkUrl(): boolean {
    return this.showDatalinkFields;
  }
  get showServiceUrl(): boolean {
    return this.showConeFields;
  }
  get showVotableUrl(): boolean {
    return this.showVotableFields;
  }
  get showProductUrl(): boolean {
    return this.showProductFields;
  }
  get showSodaUrl(): boolean {
    return this.showSodaFields;
  }
  get showPreviewUrl(): boolean {
    return this.showPreviewFields;
  }

  ngOnInit(): void {
    this.jobsSvc.types().subscribe(
      (list) => {
        const voTypes = this.availableTypes.filter((type) =>
          type.startsWith("vo.")
        );
        if (Array.isArray(list) && list.length) {
          const merged = [...list];
          for (const voType of voTypes) {
            if (!merged.includes(voType)) {
              merged.push(voType);
            }
          }
          this.availableTypes = merged;
        }
        if (!this.payloadText && !this.isVoWorkflow) {
          this.generateSample();
        }
      },
      () => {
        if (!this.payloadText && !this.isVoWorkflow) {
          this.generateSample();
        }
      }
    );

    this.jobsSvc.publicSources().subscribe(
      (sources) => (this.publicSources = sources),
      () => (this.publicSources = [])
    );

    this.voSvc.getServices().subscribe(
      (service) => {
        if (!service?.tapUrl) {
          return;
        }
        const existing = this.voProviders.find(
          (provider) => provider.tapUrl === service.tapUrl
        );
        if (existing) {
          return;
        }
        this.voProviders = [
          {
            name: "Configured",
            tapUrl: service.tapUrl,
            dataLinkUrl: service.dataLinkUrl ?? "",
          },
          ...this.voProviders,
        ];
        this.voForm.patchValue({
          provider: "Configured",
          tapUrl: service.tapUrl,
          datalinkUrl: service.dataLinkUrl ?? "",
        });
      },
      () => null
    );
  }

  cancel(): void {
    this.dialogRef.close(null);
  }

  submit(): void {
    this.error = null;

    if (this.isVoWorkflow) {
      if (this.voForm.invalid) {
        this.error = "Please fill in all required fields.";
        return;
      }
      const parameters = this._voFormToParams(
        this.voForm.value as Record<string, unknown>
      );
      this.dialogRef.close({
        workflow: this.workflow,
        datasetId: this.datasetId || `${this.workflow}-${Date.now()}`,
        lineage: this.lineageObj,
        parameters,
        requestedBy: this.requestedBy || "ui",
      });
      return;
    }

    try {
      const raw: unknown = this.payloadText
        ? JSON.parse(this.payloadText)
        : undefined;
      const parameters =
        raw && typeof raw === "object"
          ? (raw as Record<string, unknown>)
          : undefined;
      for (const key of this.requiredFields[this.workflow] || []) {
        if (!parameters || !(key in parameters)) {
          this.error = `Missing required field for workflow '${this.workflow}': ${key}`;
          return;
        }
      }
      this.dialogRef.close({
        workflow: this.workflow,
        datasetId: this.datasetId,
        lineage: this.lineageObj,
        parameters,
        requestedBy: this.requestedBy,
      });
    } catch (error: unknown) {
      this.error =
        error && typeof error === "object" && "message" in error
          ? String((error as { message?: unknown }).message ?? error)
          : String(error);
    }
  }

  onProviderChange(name: string): void {
    const provider = this.voProviders.find((entry) => entry.name === name);
    if (!provider) {
      return;
    }
    this.voForm.patchValue({
      tapUrl: provider.tapUrl,
      datalinkUrl: provider.dataLinkUrl,
      serviceUrl: provider.tapUrl,
      sodaUrl: provider.tapUrl,
    });
  }

  onTypeChange(newType: string): void {
    this.workflow = newType;
    this.lastSampleDescription = "";
    if (!this.isVoWorkflow) {
      this.generateSample();
    }
  }

  get hasSampleForType(): boolean {
    return !!this.voSvc.getSampleForType(this.workflow);
  }

  fillFromSample(): void {
    const sample = this.voSvc.getSampleForType(this.workflow);
    if (!sample) return;

    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(sample)) {
      if (k === "_description") continue;
      if (this.voForm.contains(k)) {
        patch[k] = v;
      }
    }

    // Add provider to the dropdown list if it isn't already present
    const providerName = sample["provider"] as string | undefined;
    if (
      providerName &&
      !this.voProviders.find((p) => p.name === providerName)
    ) {
      this.voProviders = [
        { name: providerName, tapUrl: "", dataLinkUrl: "" },
        ...this.voProviders,
      ];
    }

    this.voForm.patchValue(patch);
    this.lastSampleDescription = (sample["_description"] as string) || "";
    this.error = null;
  }

  generateSample(): void {
    const sample = this.sampleForType(this.workflow);
    if (!sample) {
      return;
    }
    this.payloadText = JSON.stringify(sample, null, 2);
    this.error = null;
  }

  private _buildVoForm(): void {
    this.voForm = this.fb.group({
      provider: [this.voProviders[0].name, Validators.required],
      tapUrl: [""],
      datalinkUrl: [""],
      serviceUrl: [""],
      votableUrl: [""],
      productUrl: [""],
      sodaUrl: [""],
      previewUrl: [""],
      target: [""],
      ra: [null],
      dec: [null],
      radius: [0.1, [Validators.min(0)]],
      adql: [""],
      limit: [100, [Validators.min(1), Validators.max(100000)]],
      asyncQuery: [false],
      dataproductType: [""],
      datasetIdentifier: [""],
      expectedMimeType: [""],
      spatialBoundsRa: [null],
      spatialBoundsDec: [null],
      spatialBoundsRadius: [null],
      spectralMin: [null],
      spectralMax: [null],
      outputFormat: ["fits"],
      format: ["votable"],
      liveMode: [true],
    });

    this.voForm.get("provider")?.valueChanges.subscribe((name: string) => {
      const provider = this.voProviders.find((entry) => entry.name === name);
      if (!provider) {
        return;
      }
      this.voForm.patchValue({
        tapUrl: provider.tapUrl,
        datalinkUrl: provider.dataLinkUrl,
      });
    });

    const defaultProvider = this.voProviders[0];
    this.voForm.patchValue({
      tapUrl: defaultProvider.tapUrl,
      datalinkUrl: defaultProvider.dataLinkUrl,
      serviceUrl: defaultProvider.tapUrl,
      sodaUrl: defaultProvider.tapUrl,
    });
  }

  private _voFormToParams(
    value: Record<string, unknown>
  ): Record<string, unknown> {
    const base: Record<string, unknown> = {
      provider: value["provider"],
      liveMode: value["liveMode"] ?? true,
    };

    switch (this.workflow) {
      case "vo.cone-search":
        return {
          ...base,
          serviceUrl: value["serviceUrl"],
          target: value["target"],
          radius: value["radius"],
          format: value["format"],
        };
      case "vo.adql.query":
        return {
          ...base,
          tapUrl: value["tapUrl"],
          adql: value["adql"],
          limit: value["limit"],
          async: value["asyncQuery"],
        };
      case "vo.obscore.search":
        return {
          ...base,
          tapUrl: value["tapUrl"],
          position: {
            ra: value["ra"],
            dec: value["dec"],
            radius: value["radius"],
          },
          dataproductType: value["dataproductType"] || undefined,
          spectralRange:
            value["spectralMin"] != null && value["spectralMax"] != null
              ? { min: value["spectralMin"], max: value["spectralMax"] }
              : undefined,
        };
      case "vo.votable.fetch":
        return {
          ...base,
          votableUrl: value["votableUrl"] || value["tapUrl"],
          format: value["format"],
        };
      case "vo.datalink.resolve":
        return {
          ...base,
          datalinkUrl: value["datalinkUrl"],
          datasetIdentifier: value["datasetIdentifier"],
        };
      case "vo.product.fetch":
        return {
          ...base,
          productUrl: value["productUrl"],
          expectedMimeType: value["expectedMimeType"] || undefined,
        };
      case "vo.soda.cutout":
        return {
          ...base,
          sodaUrl: value["sodaUrl"] || value["datalinkUrl"],
          datasetIdentifier: value["datasetIdentifier"],
          spatialBounds: {
            ra: value["spatialBoundsRa"],
            dec: value["spatialBoundsDec"],
            radius: value["spatialBoundsRadius"],
          },
          outputFormat: value["outputFormat"],
        };
      case "vo.preview.fetch":
        return {
          ...base,
          previewUrl: value["previewUrl"] || value["productUrl"],
        };
      default:
        return base;
    }
  }

  private sampleForType(type: string): Record<string, unknown> {
    switch (type) {
      case "import":
        return {
          source: "s3://bucket/path",
          format: "ndjson",
          options: { dedupe: true },
        };
      case "export":
        return {
          destination: "s3://bucket/out",
          query: "select * from dataset where ds='x'",
        };
      case "reindex":
        return { indexName: "records-2026", batchSize: 5000 };
      case "cleanup":
        return { olderThanDays: 90, dryRun: true };
      case "diagnostics":
        return { runIperf: false, collectSystemSpecs: true };
      case "vo.cone-search":
        return {
          provider: "HEASARC",
          serviceUrl: "https://heasarc.gsfc.nasa.gov/xamin/vo/cone",
          target: "3C273",
          radius: 0.1,
          format: "votable",
          liveMode: true,
        };
      case "vo.adql.query":
        return {
          provider: "NRAO",
          tapUrl: "https://data-query.nrao.edu/tap/sync",
          adql: "SELECT TOP 100 * FROM chanmaster WHERE 1=CONTAINS(POINT('ICRS',ra,dec),CIRCLE('ICRS',187.277915,2.052389,0.1))",
          limit: 100,
          liveMode: true,
        };
      case "vo.obscore.search":
        return {
          provider: "NRAO",
          tapUrl: "https://data-query.nrao.edu/tap/sync",
          position: { ra: 187.7059, dec: 12.3911, radius: 0.2 },
          dataproductType: "cube",
          liveMode: true,
        };
      case "vo.votable.fetch":
        return {
          provider: "HEASARC",
          votableUrl:
            "https://heasarc.gsfc.nasa.gov/xamin/query?table=chanmaster&position=3c273&format=votable",
          liveMode: true,
        };
      case "vo.datalink.resolve":
        return {
          provider: "NRAO",
          datalinkUrl: "https://data-query.nrao.edu/datalink",
          datasetIdentifier: "ngvla-pilot-ms-0001",
          liveMode: true,
        };
      case "vo.product.fetch":
        return {
          provider: "NRAO",
          productUrl:
            "https://data-query.nrao.edu/products/ngvla-pilot-ms-0001.fits",
          expectedMimeType: "application/fits",
          liveMode: true,
        };
      case "vo.soda.cutout":
        return {
          provider: "NRAO",
          sodaUrl: "https://data-query.nrao.edu/soda",
          datasetIdentifier: "ngvla-pilot-ms-0001",
          spatialBounds: { ra: 187.7059, dec: 12.3911, radius: 0.05 },
          outputFormat: "fits",
          liveMode: true,
        };
      case "vo.preview.fetch":
        return {
          provider: "NRAO",
          previewUrl:
            "https://data-query.nrao.edu/preview/ngvla-pilot-ms-0001.jpg",
          liveMode: true,
        };
      default:
        return { note: "custom payload" };
    }
  }
}
