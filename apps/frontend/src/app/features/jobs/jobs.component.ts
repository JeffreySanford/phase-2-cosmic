import { Component, OnInit, OnDestroy } from "@angular/core";
import {
  JobsService,
  JobStatus,
  JobSubmitRequest,
} from "../../services/jobs.service";
import { MatDialog } from "@angular/material/dialog";
import { MatSnackBar } from "@angular/material/snack-bar";
import { interval, Subject, Subscription } from "rxjs";
import { startWith, switchMap, takeUntil } from "rxjs/operators";
import { JobsSubmitDialogComponent } from "./jobs-submit-dialog.component";

@Component({
  selector: "app-jobs",
  templateUrl: "./jobs.component.html",
  styleUrls: ["./jobs.component.scss"],
})
export class JobsComponent implements OnInit, OnDestroy {
  jobs: JobStatus[] = [];
  loading = false;
  error: string | null = null;
  // filter UI
  filterVisible = false;
  filterWorkflow: string | null = null;
  filterState: string | null = null;
  // scanner admin info
  scannerIntervalSeconds: number | null = null;
  scannedCount = 0;
  dispatchedCount = 0;

  private destroy$ = new Subject<void>();
  private pollSub: Subscription | null = null;
  private logsSub: Subscription | null = null;

  selectedJob: JobStatus | null = null;
  logs: string[] = [];
  artifacts: { name: string; url: string }[] = [];

  constructor(
    private jobsSvc: JobsService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar
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
        },
        (err) => {
          this.error = this.errMsg(err);
          this.loading = false;
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

  addFiveJobs() {
    this.loading = true;
    this.error = null;
    this.snackBar.open("Submitting 5 sample jobs…", undefined, {
      duration: 3000,
    });
    const submissions: Promise<unknown>[] = [];
    for (let i = 1; i <= 5; i++) {
      const req: JobSubmitRequest = {
        workflow: "import",
        datasetId: `sample-ds-${Date.now()}-${i}`,
        lineage: { parentJobId: `ui-sample-${i}` },
        requestedBy: "ui-sample",
        parameters: this.generateComplexParameters(i),
      };
      const p = this.jobsSvc
        .submitJob(req)
        .toPromise()
        .then((created) => {
          if (created && created.jobId) {
            // fetch full job record and prepend
            this.jobsSvc
              .get(created.jobId)
              .subscribe((full) => (this.jobs = [full, ...this.jobs]));
          }
        })
        .catch((e) => (this.error = this.errMsg(e)))
        .finally(() => void 0);
      submissions.push(p);
    }
    Promise.allSettled(submissions).then(
      (results: PromiseSettledResult<unknown>[]) => {
        this.loading = false;
        this.jobsSvc.invalidateList();
        const ok = results.filter((r) => r.status === "fulfilled").length;
        const failed = results.length - ok;
        this.snackBar.open(
          `Submitted ${ok} jobs${failed ? `, ${failed} failed` : ""}`,
          undefined,
          { duration: 4000 }
        );
      }
    );
  }

  releaseDeferred() {
    this.loading = true;
    this.jobsSvc.releaseDeferred().subscribe(
      (res) => {
        this.loading = false;
        this.snackBar.open(
          `Released ${res.released} deferred jobs`,
          undefined,
          { duration: 3000 }
        );
        this.jobsSvc.invalidateList();
      },
      (err) => {
        this.loading = false;
        this.snackBar.open(
          `Failed to release deferred jobs: ${this.errMsg(err)}`,
          undefined,
          { duration: 5000 }
        );
      }
    );
  }

  private generateComplexParameters(index: number): Record<string, unknown> {
    // emulate NGVLA-like complex job parameters: observation window, antennas, frequency selection, provenance flags
    const now = new Date().toISOString();
    return {
      mission: "ngvla-mvp",
      observation: {
        requestId: `sample-${now}-${index}`,
        arraySegment:
          index % 3 === 0 ? "SBA" : index % 3 === 1 ? "Main" : "Long Baseline",
        antennaClass: index % 2 === 0 ? "18m" : "6m",
        frequencyBandGHz: { low: 1.2, high: 50 + index },
        startTime: now,
        durationSeconds: 120 + index * 30,
        pointing: { ra: 123.45 + index, dec: -23.45 + index },
      },
      provenance: {
        capture: true,
        includeRaw: false,
        lineageTag: `sample-${index}`,
      },
      priority: index <= 2 ? "high" : "normal",
      runtimeHints: { executor: "simulator" },
    };
  }

  view(job: JobStatus) {
    this.selectedJob = job;

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

  saveLineage() {
    if (!this.selectedJob) return;
    // currently the server has no explicit update endpoint; invalidate so
    // polling will refetch the object which may have been changed externally.
    this.jobsSvc.invalidateJob(this.selectedJob.jobId);
    this.snackBar.open('Lineage saved (cached)', undefined, { duration: 2000 });
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
        this.selectedJob = null;
        this.snackBar.open("Job removed", undefined, { duration: 2000 });
      },
      (e) =>
        this.snackBar.open(
          `Failed to remove job: ${this.errMsg(e)}`,
          undefined,
          { duration: 4000 }
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

  fetchArtifacts(id: string) {
    this.jobsSvc.artifacts(id).subscribe(
      (a) => (this.artifacts = a || []),
      (e) => (this.error = this.errMsg(e))
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
