import { Component, OnInit, OnDestroy } from '@angular/core';
import { JobsService, JobStatus, JobSubmitRequest } from '../../services/jobs.service';
import { MatDialog } from '@angular/material/dialog';
import { interval, Subscription } from 'rxjs';
import { startWith, switchMap } from 'rxjs/operators';
import { JobsSubmitDialogComponent } from './jobs-submit-dialog.component';

@Component({
  selector: 'app-jobs',
  templateUrl: './jobs.component.html',
  styleUrls: ['./jobs.component.scss'],
})
export class JobsComponent implements OnInit, OnDestroy {
  jobs: JobStatus[] = [];
  loading = false;
  error: string | null = null;
  // scanner admin info
  scannerIntervalSeconds: number | null = null;
  scannedCount = 0;
  dispatchedCount = 0;

  private pollSub: Subscription | null = null;

  selectedJob: JobStatus | null = null;
  logs: string[] = [];
  artifacts: { name: string; url: string }[] = [];

  constructor(private jobsSvc: JobsService, private dialog: MatDialog) {}

  ngOnInit(): void {
    // subscribe to the shared hot list observable; it will poll automatically
    this.jobsSvc.listHot().subscribe(
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
      width: '520px',
      data: { workflow: 'import', parameters: {} },
    });

    ref.afterClosed().subscribe((result) => {
      if (!result) return;
      // build JobSubmitRequest from dialog result
      const req: JobSubmitRequest = {
        workflow: result.workflow,
        datasetId: result.datasetId || 'ui',
        parameters: result.parameters || {},
        requestedBy: result.requestedBy || 'ui'
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
                this.jobsSvc.get(created.jobId).subscribe((full) => (this.jobs = [full, ...this.jobs]));
              }
            },
            (e) => (this.error = this.errMsg(e))
          );
        },
        (err) => (this.error = this.errMsg(err))
      );
    });
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
    if (!this.scannerIntervalSeconds || this.scannerIntervalSeconds <= 0) return;
    this.jobsSvc.setDispatchInterval(this.scannerIntervalSeconds).subscribe(
      () => this.loadDispatchConfig(),
      (e) => (this.error = this.errMsg(e))
    );
  }

  fetchLogs(id: string) {
    this.jobsSvc.getLogs(id).subscribe((lines) => (this.logs = lines || []), (e) => (this.error = this.errMsg(e)));
  }

  fetchArtifacts(id: string) {
    this.jobsSvc.artifacts(id).subscribe((a) => (this.artifacts = a || []), (e) => (this.error = this.errMsg(e)));
  }

  transition(job: JobStatus, next: string) {
    this.jobsSvc.transition(job.jobId, next).subscribe(
      (updated) => {
        if (!updated) return;
        this.jobs = this.jobs.map((j) => (j.jobId === updated.jobId ? updated : j));
        if (this.selectedJob && this.selectedJob.jobId === updated.jobId) this.selectedJob = updated;
      },
      (e) => (this.error = this.errMsg(e))
    );
  }

  ngOnDestroy(): void {
    this.pollSub?.unsubscribe();
  }

  private errMsg(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err) {
      const m = (err as { message?: unknown }).message;
      return String(m ?? err);
    }
    return String(err);
  }

  // periodically refresh logs while a job is selected
  private logsSub: Subscription | null = null;

  startLogPolling(id: string) {
    this.logsSub?.unsubscribe();
    this.logsSub = interval(3000)
      .pipe(startWith(0), switchMap(() => this.jobsSvc.getLogs(id)))
      .subscribe((lines) => (this.logs = lines || []));
  }
}
