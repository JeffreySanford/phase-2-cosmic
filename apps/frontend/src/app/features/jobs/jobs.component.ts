import { Component, OnInit, OnDestroy } from "@angular/core";
import { HttpErrorResponse, HttpClient } from "@angular/common/http";
import {
  JobsService,
  JobStatus,
  JobSubmitRequest,
} from "../../services/jobs.service";
import { MatDialog } from "@angular/material/dialog";
import { MatSnackBar } from "@angular/material/snack-bar";
import { forkJoin, interval, of, Subject, Subscription } from "rxjs";
import { catchError, startWith, switchMap, takeUntil } from "rxjs/operators";
import { JobsSubmitDialogComponent } from "./jobs-submit-dialog.component";

type ErrorDetail = { ruleId?: string };
type ErrorBody = {
  error?: string;
  details?: ErrorDetail[];
};

type ProductCategory = "fits" | "votable" | "csv" | "json" | "archive" | "preview" | "other";
interface JobProduct {
  name: string;
  url: string;
  mimeType: string;
  category: ProductCategory;
  label: string;
  icon: string;
  size?: string;
}

@Component({
  selector: "app-jobs",
  templateUrl: "./jobs.component.html",
  styleUrls: ["./jobs.component.scss"],
})
export class JobsComponent implements OnInit, OnDestroy {
  jobs: JobStatus[] = [];
  loading = false;
  error: string | null = null;
  initialLoadSettled = false;
  // filter UI
  filterVisible = false;
  filterWorkflow: string | null = null;
  filterState: string | null = null;
  // completed-job visibility
  showCompleted = true;

  readonly TERMINAL_STATUSES = new Set([
    "COMPLETED",
    "FAILED",
    "CANCELED",
    "TIMED_OUT",
  ]);
  // scanner admin info
  scannerIntervalSeconds: number | null = null;
  scannedCount = 0;
  dispatchedCount = 0;

  // Vibrant color map by workflow type
  readonly WORKFLOW_COLORS: Record<string, string> = {
    // General workflows
    import: "#2979FF",
    export: "#FF9100",
    reindex: "#D500F9",
    cleanup: "#FF1744",
    diagnostics: "#00BCD4",
    transform: "#1DE9B6",
    archive: "#7C4DFF",
    snapshot: "#FF80AB",
    analyze: "#69F0AE",
    train: "#EA80FC",
    notify: "#FFD740",
    backup: "#FF6E40",
    restore: "#40C4FF",
    publish: "#B2FF59",
    fetch: "#FF6D00",
    scheduler: "#E040FB",
    // VO workflow family
    "vo.cone-search": "#76FF03",
    "vo.adql.query": "#FFD600",
    "vo.obscore.search": "#00E676",
    "vo.votable.fetch": "#FF4081",
    "vo.datalink.resolve": "#FF6D00",
    "vo.product.fetch": "#40C4FF",
    "vo.soda.cutout": "#3D5AFE",
    "vo.preview.fetch": "#F50057",
  };

  readonly LEGEND_ENTRIES: Array<{ label: string; color: string }> = [
    { label: "Import", color: "#2979FF" },
    { label: "Export", color: "#FF9100" },
    { label: "Reindex", color: "#D500F9" },
    { label: "Cleanup / Diagnostics", color: "#FF1744" },
    { label: "VO: Cone Search", color: "#76FF03" },
    { label: "VO: ADQL Query", color: "#FFD600" },
    { label: "VO: ObsCore", color: "#00E676" },
    { label: "VO: VOTable", color: "#FF4081" },
    { label: "VO: DataLink", color: "#FF6D00" },
    { label: "VO: Product Fetch", color: "#40C4FF" },
    { label: "VO: SODA Cutout", color: "#3D5AFE" },
    { label: "VO: Preview", color: "#F50057" },
    { label: "Other", color: "#78909C" },
  ];

  getJobColor(job: JobStatus): string {
    return this.WORKFLOW_COLORS[job.workflow] ?? "#78909C";
  }

  get filteredJobs(): JobStatus[] {
    if (this.showCompleted) return this.jobs;
    return this.jobs.filter((j) => !this.TERMINAL_STATUSES.has(j.status));
  }

  clearCompleted(): void {
    const toRemove = this.jobs.filter((j) =>
      this.TERMINAL_STATUSES.has(j.status)
    );
    if (!toRemove.length) {
      this.snackBar.open("No completed jobs to clear", undefined, {
        duration: 3000,
      });
      return;
    }
    const deletes$ = forkJoin(
      toRemove.map((j) =>
        this.jobsSvc.deleteJob(j.jobId).pipe(catchError(() => of(null)))
      )
    );
    deletes$.subscribe(() => {
      const removed = new Set(toRemove.map((j) => j.jobId));
      this.jobs = this.jobs.filter((j) => !removed.has(j.jobId));
      if (this.selectedJob && removed.has(this.selectedJob.jobId)) {
        this.collapseJob();
      }
      this.snackBar.open(
        `Cleared ${toRemove.length} completed job(s)`,
        undefined,
        { duration: 5000 }
      );
    });
  }

  private destroy$ = new Subject<void>();
  private pollSub: Subscription | null = null;
  private logsSub: Subscription | null = null;

  selectedJob: JobStatus | null = null;
  expandedJobId: string | null = null;
  logs: string[] = [];
  artifacts: { name: string; url: string }[] = [];
  products: JobProduct[] = [];
  externalSources: Array<Record<string, unknown>> = [];
  voTableResult: {
    fields: string[];
    rows: unknown[][];
    links: { accessUrl: string; semantics: string; contentType?: string }[];
  } | null = null;

  constructor(
    private jobsSvc: JobsService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private http: HttpClient
  ) {}

  ngOnInit(): void {
    // subscribe to the shared hot list observable; it will poll automatically
    this.jobsSvc
      .listHot()
      .pipe(takeUntil(this.destroy$))
      .subscribe(
        (result) => {
          if (result.ok) {
            this.jobs = result.value || [];
          } else {
            this.error = this.errMsg(result.error);
          }
          this.loading = false;
          this.initialLoadSettled = true;
        },
        (err) => {
          this.error = this.errMsg(err);
          this.loading = false;
          this.initialLoadSettled = true;
        }
      );

    this.loadDispatchConfig();
  }

  reload() {
    // trigger the cached stream to refetch and show loader until the
    // next value arrives
    this.loading = true;
    this.error = null;
    this.jobsSvc.invalidateList();
    // subscriber already exists from ngOnInit so we don't need to re-subscribe.
  }

  openSubmit() {
    const ref = this.dialog.open(JobsSubmitDialogComponent, {
      width: "520px",
      data: { workflow: "import", parameters: {} },
    });

    ref.afterClosed().subscribe((result) => {
      if (!result) return;
      // build JobSubmitRequest from dialog result
      const req: JobSubmitRequest = {
        workflow: result.workflow,
        datasetId: result.datasetId || "ui",
        lineage: result.lineage,
        parameters: result.parameters || {},
        requestedBy: result.requestedBy || "ui",
      };
      // validate server-side and submit; after submit fetch full job status and prepend to list
      this.jobsSvc.validate(req.workflow, req.parameters ?? {}).subscribe(
        () => {
          this.jobsSvc.submitJob(req).subscribe(
            (created) => {
              // created contains jobId; force a list refresh so the new job
              // will appear (polling will also pick it up shortly).
              this.jobsSvc.invalidateList();
              if (created?.jobId) {
                // optionally fetch the individual record and prepend to
                // the list immediately
                this.jobsSvc
                  .get(created.jobId)
                  .subscribe((full) => (this.jobs = [full, ...this.jobs]));
              }
            },
            (e) => (this.error = this.errMsg(e))
          );
        },
        (err) => (this.error = this.errMsg(err))
      );
    });
  }

  // 5 unique VO sample jobs representing the discovery → retrieval chain
  private readonly SAMPLE_JOB_REQUESTS: JobSubmitRequest[] = [
    {
      workflow: "vo.cone-search",
      datasetId: "heasarc-3c273",
      requestedBy: "ui-sample",
      lineage: { chain: "vo-discovery", step: 1 },
      parameters: {
        provider: "HEASARC",
        serviceUrl: "https://heasarc.gsfc.nasa.gov/xamin/vo/cone",
        target: "3C273",
        radius: 0.1,
        format: "votable",
        liveMode: true,
        mission: "ngvla-mvp",
      },
    },
    {
      workflow: "vo.adql.query",
      datasetId: "nrao-chanmaster-tap",
      requestedBy: "ui-sample",
      lineage: { chain: "vo-discovery", step: 2 },
      parameters: {
        provider: "NRAO",
        tapUrl: "https://data-query.nrao.edu/tap/sync",
        adql: "SELECT TOP 100 * FROM chanmaster WHERE 1=CONTAINS(POINT('ICRS',ra,dec),CIRCLE('ICRS',187.277915,2.052389,0.1))",
        limit: 100,
        liveMode: true,
        mission: "ngvla-mvp",
      },
    },
    {
      workflow: "vo.obscore.search",
      datasetId: "obscore-m87-cube",
      requestedBy: "ui-sample",
      lineage: { chain: "vo-discovery", step: 3 },
      parameters: {
        provider: "NRAO",
        tapUrl: "https://data-query.nrao.edu/tap/sync",
        position: { ra: 187.7059, dec: 12.3911, radius: 0.2 },
        dataproductType: "cube",
        liveMode: true,
        mission: "ngvla-mvp",
      },
    },
    {
      workflow: "vo.datalink.resolve",
      datasetId: "datalink-ngvla-pilot",
      requestedBy: "ui-sample",
      lineage: { chain: "vo-retrieval", step: 1 },
      parameters: {
        provider: "NRAO",
        datalinkUrl: "https://data-query.nrao.edu/datalink",
        datasetIdentifier: "ngvla-pilot-ms-0001",
        liveMode: true,
        mission: "ngvla-mvp",
      },
    },
    {
      workflow: "vo.product.fetch",
      datasetId: "product-ngvla-fits",
      requestedBy: "ui-sample",
      lineage: { chain: "vo-retrieval", step: 2 },
      parameters: {
        provider: "NRAO",
        productUrl:
          "https://data-query.nrao.edu/products/ngvla-pilot-ms-0001.fits",
        expectedMimeType: "application/fits",
        liveMode: true,
        mission: "ngvla-mvp",
      },
    },
  ];

  addFiveJobs() {
    this.loading = true;
    this.error = null;
    this.snackBar.open("Submitting 5 sample jobs...", undefined, {
      duration: 10000,
    });

    // Step 1: prune all current jobs from storage
    const deletions = this.jobs.map((j) =>
      this.jobsSvc
        .deleteJob(j.jobId)
        .toPromise()
        .catch(() => null)
    );

    Promise.allSettled(deletions).then(() => {
      this.jobs = [];

      // Step 2: submit the 5 unique VO sample jobs
      const submissions: Promise<unknown>[] = this.SAMPLE_JOB_REQUESTS.map(
        (req) =>
          this.jobsSvc
            .submitJob(req)
            .toPromise()
            .then((created) => {
              if (created && created.jobId) {
                const jobId = created.jobId;
                // Step 3: auto-start each queued job immediately
                this.jobsSvc.transition(jobId, "RUNNING").subscribe(
                  (updated) => {
                    if (updated) {
                      this.jobs = [
                        updated,
                        ...this.jobs.filter((j) => j.jobId !== jobId),
                      ];
                    } else {
                      this.jobsSvc
                        .get(jobId)
                        .subscribe(
                          (full) =>
                            (this.jobs = [
                              full,
                              ...this.jobs.filter((j) => j.jobId !== jobId),
                            ])
                        );
                    }
                  },
                  () => {
                    // transition failed — still show the queued job
                    this.jobsSvc
                      .get(jobId)
                      .subscribe(
                        (full) =>
                          (this.jobs = [
                            full,
                            ...this.jobs.filter((j) => j.jobId !== jobId),
                          ])
                      );
                  }
                );
              }
            })
            .catch((e) => (this.error = this.errMsg(e)))
      );

      Promise.allSettled(submissions).then(
        (results: PromiseSettledResult<unknown>[]) => {
          this.loading = false;
          this.jobsSvc.invalidateList();
          const ok = results.filter((r) => r.status === "fulfilled").length;
          const failed = results.length - ok;
          this.snackBar.open(
            `Submitted ${ok} jobs${failed ? `, ${failed} failed` : ""}`,
            undefined,
            { duration: 10000 }
          );
        }
      );
    });
  }

  releaseDeferred() {
    this.loading = true;
    this.jobsSvc.releaseDeferred().subscribe(
      (res) => {
        this.loading = false;
        this.snackBar.open(
          `Released ${res.released} deferred jobs`,
          undefined,
          { duration: 10000 }
        );
        this.jobsSvc.invalidateList();
      },
      (err) => {
        this.loading = false;
        this.snackBar.open(
          `Failed to release deferred jobs: ${this.errMsg(err)}`,
          undefined,
          { duration: 10000 }
        );
      }
    );
  }

  view(job: JobStatus) {
    if (this.expandedJobId === job.jobId) {
      this.collapseJob();
      return;
    }

    this.selectedJob = job;
    this.expandedJobId = job.jobId;

    // use the shared hot observable that polls a single job status
    this.pollSub?.unsubscribe();
    this.pollSub = this.jobsSvc.watchJob(job.jobId).subscribe(
      (j) => (this.selectedJob = j),
      (err) => (this.error = this.errMsg(err))
    );

    // also fetch logs and artifacts initially
    this.fetchLogs(job.jobId);
    this.fetchArtifacts(job.jobId);
    this.startLogPolling(job.jobId);
  }

  collapseJob() {
    this.pollSub?.unsubscribe();
    this.logsSub?.unsubscribe();
    this.selectedJob = null;
    this.expandedJobId = null;
    this.logs = [];
    this.artifacts = [];
    this.products = [];
    this.externalSources = [];
    this.voTableResult = null;
  }

  isExpanded(job: JobStatus): boolean {
    return this.expandedJobId === job.jobId;
  }

  isDeferred(job: JobStatus): boolean {
    const params = job.parameters;
    const deferred = params?.["deferred"];
    return deferred === true || String(deferred).toLowerCase() === "true";
  }

  stepsCount(job: JobStatus): number {
    const s = job["steps"];
    return Array.isArray(s) ? s.length : 0;
  }

  artifactsCount(job: JobStatus): number {
    const a = job["artifacts"];
    return Array.isArray(a) ? a.length : 0;
  }

  saveLineage() {
    const selectedJob = this.selectedJob;
    if (!selectedJob) return;
    this.jobsSvc
      .updateLineage(selectedJob.jobId, selectedJob.lineage || {})
      .subscribe(
        () => {
          this.snackBar.open("Lineage saved successfully", undefined, {
            duration: 10000,
          });
          // Invalidate cache to ensure fresh data on next poll
          this.jobsSvc.invalidateJob(selectedJob.jobId);
        },
        (error) => {
          this.snackBar.open(
            "Failed to save lineage: " + error.message,
            undefined,
            { duration: 10000 }
          );
        }
      );
  }

  toggleFilter() {
    this.filterVisible = !this.filterVisible;
  }

  applyFilter() {
    this.loading = true;
    this.jobsSvc
      .list(this.filterWorkflow ?? undefined, this.filterState ?? undefined)
      .subscribe(
        (list) => {
          this.jobs = list || [];
          this.loading = false;
          this.filterVisible = false;
        },
        (e) => {
          this.error = this.errMsg(e);
          this.loading = false;
        }
      );
  }

  clearFilter() {
    this.filterWorkflow = null;
    this.filterState = null;
    this.reload();
    this.filterVisible = false;
  }

  removeViewed() {
    if (!this.selectedJob) return;
    const id = this.selectedJob.jobId;
    this.jobsSvc.deleteJob(id).subscribe(
      () => {
        // remove from UI list and clear selected
        this.jobs = this.jobs.filter((j) => j.jobId !== id);
        this.collapseJob();
        this.snackBar.open("Job removed", undefined, { duration: 10000 });
      },
      (e) =>
        this.snackBar.open(
          `Failed to remove job: ${this.errMsg(e)}`,
          undefined,
          { duration: 10000 }
        )
    );
  }

  loadDispatchConfig() {
    this.jobsSvc.getDispatchConfig().subscribe(
      (c) => {
        this.scannerIntervalSeconds = c.intervalSeconds;
        this.scannedCount = c.scannedCount;
        this.dispatchedCount = c.dispatchedCount;
      },
      (e) => (this.error = this.errMsg(e))
    );
  }

  setScannerInterval() {
    if (!this.scannerIntervalSeconds || this.scannerIntervalSeconds <= 0)
      return;
    this.jobsSvc.setDispatchInterval(this.scannerIntervalSeconds).subscribe(
      () => this.loadDispatchConfig(),
      (e) => (this.error = this.errMsg(e))
    );
  }

  fetchLogs(id: string) {
    this.jobsSvc.getLogs(id).subscribe(
      (lines) => (this.logs = lines || []),
      (e) => (this.error = this.errMsg(e))
    );
  }

  private classifyArtifact(a: { name: string; url: string; mimeType?: string; size?: string }): JobProduct {
    const n = (a.name || "").toLowerCase();
    const m = (a.mimeType || "").toLowerCase();
    if (/\.fit(s|sz?)?$|\.fz$/.test(n) || m.includes("fits")) {
      return { name: a.name, url: a.url, size: a.size, mimeType: m || "application/fits",            category: "fits",    label: "FITS Image / Cube",     icon: "image" };
    }
    if (/\.(votable|vot|xml)$/.test(n) || m.includes("votable") || m.includes("xml")) {
      return { name: a.name, url: a.url, size: a.size, mimeType: m || "application/x-votable+xml",   category: "votable", label: "VOTable Catalog",       icon: "table_chart" };
    }
    if (/\.csv$/.test(n) || m.includes("csv")) {
      return { name: a.name, url: a.url, size: a.size, mimeType: m || "text/csv",                    category: "csv",     label: "CSV Table",            icon: "grid_on" };
    }
    if (/\.json$/.test(n) || m.includes("json")) {
      return { name: a.name, url: a.url, size: a.size, mimeType: m || "application/json",            category: "json",    label: "Report / Metadata",    icon: "code" };
    }
    if (/\.(tar\.gz|tar|zip|gz)$|\.ms\.tar/.test(n) || m.includes("tar") || m.includes("zip")) {
      const isMs = /\.ms\.tar/.test(n);
      return { name: a.name, url: a.url, size: a.size, mimeType: m || "application/x-tar",           category: "archive", label: isMs ? "Measurement Set" : "Data Archive", icon: "folder_zip" };
    }
    if (/\.(png|jpg|jpeg|svg|webp)$/.test(n) || m.startsWith("image/")) {
      return { name: a.name, url: a.url, size: a.size, mimeType: m || "image/png",                   category: "preview", label: "Preview Image",        icon: "photo" };
    }
    return   { name: a.name, url: a.url, size: a.size, mimeType: m || "application/octet-stream",    category: "other",   label: "File",                 icon: "insert_drive_file" };
  }

  get productGroups(): Array<{ category: string; label: string; icon: string; items: JobProduct[] }> {
    const ORDER: ProductCategory[] = ["fits", "votable", "csv", "json", "archive", "preview", "other"];
    const map = new Map<ProductCategory, JobProduct[]>();
    for (const p of this.products) {
      if (!map.has(p.category)) map.set(p.category, []);
      map.get(p.category)!.push(p);
    }
    return ORDER.filter((c) => map.has(c)).map((c) => ({
      category: c,
      label:    map.get(c)![0].label,
      icon:     map.get(c)![0].icon,
      items:    map.get(c)!,
    }));
  }

  fetchArtifacts(id: string) {
    this.products = [];
    this.externalSources = [];
    this.voTableResult = null;  // reset before refetch
    // single request, then classify each artifact by type
    this.jobsSvc.artifacts(id).subscribe(
      (rawList) => {
        const a = (rawList || []) as Array<{ name: string; url: string; mimeType?: string; size?: string }>;
        this.artifacts = a;
        this.products = a.map((af) => this.classifyArtifact(af));
      },
      (e) => (this.error = this.errMsg(e))
    );
    // also fetch any JSON artifact that may contain external-source or VOTable metadata
    this.externalSources = [];
    this.voTableResult = null;
    this.jobsSvc.artifacts(id).subscribe(
      (a) => {
        (a || [])
          .filter((af) => af && af.name && af.name.endsWith(".json"))
          .forEach((af) => {
            try {
              this.http.get<Record<string, unknown>>(af.url).subscribe(
                (body) => {
                  if (!body) return;
                  // VOTable JSON result (fields + rows structure)
                  if (
                    !this.voTableResult &&
                    Array.isArray(body["fields"]) &&
                    Array.isArray(body["rows"])
                  ) {
                    this.voTableResult = {
                      fields: body["fields"] as string[],
                      rows: body["rows"] as unknown[][],
                      links: Array.isArray(body["links"])
                        ? (body["links"] as {
                            accessUrl: string;
                            semantics: string;
                            contentType?: string;
                          }[])
                        : [],
                    };
                  }
                  // external-source metadata
                  if (
                    body["type"] === "external-source" ||
                    body["type"] === "external-sources" ||
                    body["provider"]
                  ) {
                    this.externalSources.push(body);
                  }
                },
                () => null
              );
            } catch {
              // ignore
            }
          });
      },
      () => null
    );
  }

  transition(job: JobStatus, next: string) {
    this.jobsSvc.transition(job.jobId, next).subscribe(
      (updated) => {
        if (!updated) return;
        this.jobs = this.jobs.map((j) =>
          j.jobId === updated.jobId ? updated : j
        );
        if (this.selectedJob && this.selectedJob.jobId === updated.jobId)
          this.selectedJob = updated;
      },
      (e) => (this.error = this.errMsg(e))
    );
  }

  ngOnDestroy(): void {
    this.pollSub?.unsubscribe();
    this.logsSub?.unsubscribe();
    this.destroy$.next();
    this.destroy$.complete();
  }

  private errMsg(err: unknown): string {
    // special case for HTTP errors so we can show structured details
    if (err instanceof HttpErrorResponse) {
      const body = err.error as ErrorBody | null;
      if (body && typeof body === "object") {
        const code = body.error || err.statusText || "error";
        if (Array.isArray(body.details) && body.details.length > 0) {
          const rules = body.details.map(
            (detail) => detail.ruleId || JSON.stringify(detail)
          );
          return `${code}: ${rules.join(", ")}`;
        }
        return String(code);
      }
      return `${err.status} ${err.statusText}`;
    }
    if (err && typeof err === "object" && "message" in err) {
      const m = (err as { message?: unknown }).message;
      return String(m ?? err);
    }
    return String(err);
  }

  startLogPolling(id: string) {
    this.logsSub?.unsubscribe();
    this.logsSub = interval(3000)
      .pipe(
        startWith(0),
        switchMap(() => this.jobsSvc.getLogs(id))
      )
      .subscribe((lines) => (this.logs = lines || []));
  }
}
