import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NO_ERRORS_SCHEMA } from "@angular/core";
import { JobsComponent } from "./jobs.component";
import { JobsService, JobStatus } from "../../services/jobs.service";
import { of, EMPTY } from "rxjs";
import { HttpErrorResponse } from "@angular/common/http";
import { MatDialogModule } from "@angular/material/dialog";
import { MatSnackBarModule } from "@angular/material/snack-bar";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { HttpClientTestingModule } from "@angular/common/http/testing";
import { SnackService } from "../../services/snack.service";
import { FormsModule, ReactiveFormsModule } from "@angular/forms";
import { NoopAnimationsModule } from "@angular/platform-browser/animations";

class StubJobsService {
  listHot() {
    return of({
      ok: true as const,
      value: [
        {
          jobId: "1",
          workflow: "x",
          status: "QUEUED",
          lineage: { parentJobId: "p" },
        } satisfies JobStatus,
      ],
    });
  }
  getDispatchConfig() {
    // return minimal config object expected by component
    return of({ intervalSeconds: 0, scannedCount: 0, dispatchedCount: 0 });
  }
  watchJob() {
    return EMPTY;
  }
  list() {
    return of([] as JobStatus[]);
  }
  invalidateList() {
    return;
  }
  get(id: string) {
    return of({
      jobId: id,
      workflow: "x",
      status: "QUEUED",
      lineage: { parentJobId: "p" },
    } satisfies JobStatus);
  }
  updateLineage() {
    return of(undefined);
  }
  getLogs() {
    return of([] as string[]);
  }
  artifacts() {
    return of([] as { name: string; url: string }[]);
  }
  releaseDeferred() {
    return of({ released: 2 });
  }
  setDispatchInterval() {
    return of(undefined);
  }
  transition() {
    return of(undefined);
  }
  submitJob() {
    return of(undefined);
  }
  validate() {
    return of(undefined);
  }
  deleteJob() {
    return of(undefined);
  }
  invalidateJob() {
    return;
  }
}

describe("JobsComponent", () => {
  let component: JobsComponent;
  let fixture: ComponentFixture<JobsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [JobsComponent],
      imports: [
        NoopAnimationsModule,
        HttpClientTestingModule,
        MatDialogModule,
        MatSnackBarModule,
        MatCheckboxModule,
        FormsModule,
        ReactiveFormsModule,
      ],
      providers: [
        { provide: JobsService, useClass: StubJobsService },
        SnackService,
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(JobsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should expose lineage data when a job is selected", () => {
    const job: JobStatus = {
      jobId: "123",
      workflow: "foo",
      status: "QUEUED",
      lineage: { parentJobId: "abc" },
    } as JobStatus;
    component.view(job);
    fixture.detectChanges();
    expect(component.selectedJob?.jobId).toBe("123");
    expect(component.expandedJobId).toBe("123");
    expect(component.selectedJob?.lineage?.["parentJobId"]).toBe("abc");
  });

  it("collapses an already expanded job when clicked again", () => {
    const job: JobStatus = {
      jobId: "123",
      workflow: "foo",
      status: "QUEUED",
    } as JobStatus;
    component.view(job);
    component.view(job);
    expect(component.selectedJob).toBeNull();
    expect(component.expandedJobId).toBeNull();
  });

  it("allows editing lineage and saving", () => {
    const job: JobStatus = {
      jobId: "321",
      workflow: "bar",
      status: "QUEUED",
      lineage: { parentJobId: "orig" },
    } as JobStatus;
    const updateLineageSpy = jest
      .spyOn(component["jobsSvc"], "updateLineage")
      .mockReturnValue(of(undefined));
    const snackSpy = jest.spyOn(component["snack"], "showSuccess");
    component.view(job);
    fixture.detectChanges();
    component.selectedJob = job;
    component.saveLineage();
    expect(updateLineageSpy).toHaveBeenCalledWith("321", {
      parentJobId: "orig",
    });
    expect(snackSpy).toHaveBeenCalledWith("Lineage saved successfully", 10000);
  });

  it("formats quality gate error objects into a user message", () => {
    const fakeError = new HttpErrorResponse({
      status: 400,
      statusText: "Bad Request",
      error: {
        error: "etl_quality_gate_failed",
        details: [{ ruleId: "DQ-TIM-001" }],
      },
    });
    const msg = component["errMsg"](fakeError);
    expect(msg).toContain("etl_quality_gate_failed");
    expect(msg).toContain("DQ-TIM-001");
  });

  it("identifies deferred jobs from parameters", () => {
    const job: JobStatus = {
      jobId: "deferred-1",
      workflow: "foo",
      status: "QUEUED",
      parameters: { deferred: true },
    } as JobStatus;
    expect(component.isDeferred(job)).toBe(true);
  });

  it("isDeferred returns false once the job reaches a terminal status", () => {
    const mkJob = (status: string): JobStatus =>
      ({
        jobId: "d",
        workflow: "foo",
        status,
        parameters: { deferred: true },
      } as JobStatus);
    expect(component.isDeferred(mkJob("COMPLETED"))).toBe(false);
    expect(component.isDeferred(mkJob("FAILED"))).toBe(false);
    expect(component.isDeferred(mkJob("CANCELED"))).toBe(false);
    expect(component.isDeferred(mkJob("TIMED_OUT"))).toBe(false);
  });

  it("only queued jobs are treated as deferred", () => {
    const mkJob = (status: string): JobStatus =>
      ({
        jobId: "d",
        workflow: "foo",
        status,
        parameters: { deferred: true },
      } as JobStatus);
    expect(component.isDeferred(mkJob("QUEUED"))).toBe(true);
    expect(component.isDeferred(mkJob("RUNNING"))).toBe(false);
  });

  it("formats durations and runTime correctly", () => {
    const now = Date.now();
    const job: JobStatus = {
      jobId: "foo",
      workflow: "x",
      status: "RUNNING",
      createdAt: new Date(now - 120_000).toISOString(),
      updatedAt: new Date(now - 30_000).toISOString(),
    } as JobStatus;
    component.jobs = [job];
    expect(component.jobDuration(job)).toMatch(/^[0-9]+:[0-5][0-9]$/);
    component.currentTime = now;
    expect(component.runTime("foo")).toMatch(/^[0-9]+:[0-5][0-9]$/);
  });

  it("does not emit console logs when submitting sample jobs", (done) => {
    const logSpy = jest.spyOn(console, "log");
    const sample: any = {
      jobId: "j1",
      status: "QUEUED",
      queuedAt: new Date().toISOString(),
    };
    jest.spyOn(component["jobsSvc"], "submitJob").mockReturnValue(of(sample));
    jest
      .spyOn(component["jobsSvc"], "transition")
      .mockReturnValue(
        of({ jobId: "j1", workflow: "x", status: "RUNNING" } as JobStatus)
      );
    jest
      .spyOn(component["jobsSvc"], "watchJob")
      .mockReturnValue(of({ jobId: "j1", status: "RUNNING" } as JobStatus));

    component.addFiveJobs();
    expect(logSpy).not.toHaveBeenCalled();
    done();
  });

  it("filteredJobs returns all jobs when showCompleted is true", () => {
    component.jobs = [
      { jobId: "a", workflow: "x", status: "COMPLETED" } as JobStatus,
      { jobId: "b", workflow: "x", status: "QUEUED" } as JobStatus,
      { jobId: "c", workflow: "x", status: "FAILED" } as JobStatus,
    ];
    component.showCompleted = true;
    expect(component.filteredJobs.length).toBe(3);
  });

  it("filteredJobs hides terminal-state jobs when showCompleted is false", () => {
    component.jobs = [
      { jobId: "a", workflow: "x", status: "COMPLETED" } as JobStatus,
      { jobId: "b", workflow: "x", status: "QUEUED" } as JobStatus,
      { jobId: "c", workflow: "x", status: "FAILED" } as JobStatus,
      { jobId: "d", workflow: "x", status: "CANCELED" } as JobStatus,
      { jobId: "e", workflow: "x", status: "RUNNING" } as JobStatus,
      { jobId: "f", workflow: "x", status: "TIMED_OUT" } as JobStatus,
    ];
    component.showCompleted = false;
    const visible = component.filteredJobs;
    expect(visible.length).toBe(2);
    expect(visible.map((j) => j.jobId)).toEqual(["b", "e"]);
  });

  it("filteredJobs reflects live jobs from the service when showCompleted is false", () => {
    // jobs loaded in ngOnInit via StubJobsService returns a single QUEUED job
    component.showCompleted = false;
    fixture.detectChanges();
    expect(component.filteredJobs.length).toBe(1);
    expect(component.filteredJobs[0].status).toBe("QUEUED");
  });

  it("clearCompleted removes terminal jobs via deleteJob and updates the list", () => {
    component.jobs = [
      { jobId: "done1", workflow: "x", status: "COMPLETED" } as JobStatus,
      { jobId: "running", workflow: "x", status: "RUNNING" } as JobStatus,
      { jobId: "done2", workflow: "x", status: "FAILED" } as JobStatus,
    ];
    const deleteSpy = jest
      .spyOn(component["jobsSvc"], "deleteJob")
      .mockReturnValue(of(undefined));
    const snackSpy = jest.spyOn(component["snack"], "showSuccess");

    component.clearCompleted();

    expect(deleteSpy).toHaveBeenCalledTimes(2);
    expect(deleteSpy).toHaveBeenCalledWith("done1");
    expect(deleteSpy).toHaveBeenCalledWith("done2");
    expect(component.jobs.length).toBe(1);
    expect(component.jobs[0].jobId).toBe("running");
    expect(snackSpy).toHaveBeenCalledWith("Cleared 2 completed job(s)", 5000);
  });

  it("clearCompleted notifies when there are no completed jobs", () => {
    component.jobs = [
      { jobId: "running", workflow: "x", status: "RUNNING" } as JobStatus,
    ];
    const snackSpy = jest.spyOn(component["snack"], "showInfo");
    component.clearCompleted();
    expect(snackSpy).toHaveBeenCalledWith("No completed jobs to clear", 3000);
  });

  it("clearCompleted also collapses if the selected job is among the cleared ones", () => {
    const selectedJob: JobStatus = {
      jobId: "done1",
      workflow: "x",
      status: "COMPLETED",
    } as JobStatus;
    component.jobs = [selectedJob];
    component.selectedJob = selectedJob;
    component.expandedJobId = "done1";
    jest
      .spyOn(component["jobsSvc"], "deleteJob")
      .mockReturnValue(of(undefined));

    component.clearCompleted();

    expect(component.selectedJob).toBeNull();
    expect(component.expandedJobId).toBeNull();
  });

  describe("activeLegendEntries", () => {
    it("returns an empty array when there are no jobs", () => {
      component.jobs = [];
      expect(component.activeLegendEntries).toEqual([]);
    });

    it("returns one entry per unique workflow in jobs", () => {
      component.jobs = [
        { jobId: "1", workflow: "ingest", status: "QUEUED" } as JobStatus,
        { jobId: "2", workflow: "ingest", status: "COMPLETED" } as JobStatus,
        { jobId: "3", workflow: "export", status: "RUNNING" } as JobStatus,
      ];
      const entries = component.activeLegendEntries;
      expect(entries.length).toBe(2);
      expect(entries[0].label).toBe("Import");
      expect(entries[1].label).toBe("Export");
    });

    it("maps known VO workflow keys to display labels", () => {
      component.jobs = [
        {
          jobId: "1",
          workflow: "vo.cone-search",
          status: "QUEUED",
        } as JobStatus,
        {
          jobId: "2",
          workflow: "vo.adql.query",
          status: "QUEUED",
        } as JobStatus,
        {
          jobId: "3",
          workflow: "vo.soda.cutout",
          status: "QUEUED",
        } as JobStatus,
      ];
      const labels = component.activeLegendEntries.map((e) => e.label);
      expect(labels).toEqual(["Cone Search", "ADQL Query", "SODA Cutout"]);
    });

    it("falls back to the raw workflow string for unknown types", () => {
      component.jobs = [
        { jobId: "1", workflow: "unknown-type", status: "QUEUED" } as JobStatus,
      ];
      expect(component.activeLegendEntries[0].label).toBe("unknown-type");
    });

    it("preserves order of first appearance across jobs", () => {
      component.jobs = [
        { jobId: "1", workflow: "cleanup", status: "QUEUED" } as JobStatus,
        { jobId: "2", workflow: "diagnostics", status: "QUEUED" } as JobStatus,
        { jobId: "3", workflow: "cleanup", status: "QUEUED" } as JobStatus,
      ];
      const labels = component.activeLegendEntries.map((e) => e.label);
      expect(labels).toEqual(["Cleanup", "Diagnostics"]);
    });
  });

  describe("runningCount", () => {
    it("returns 0 when no jobs are RUNNING", () => {
      component.jobs = [
        { jobId: "1", workflow: "x", status: "QUEUED" } as JobStatus,
        { jobId: "2", workflow: "x", status: "COMPLETED" } as JobStatus,
      ];
      expect(component.runningCount).toBe(0);
    });

    it("counts only RUNNING jobs", () => {
      component.jobs = [
        { jobId: "1", workflow: "x", status: "RUNNING" } as JobStatus,
        { jobId: "2", workflow: "x", status: "RUNNING" } as JobStatus,
        { jobId: "3", workflow: "x", status: "QUEUED" } as JobStatus,
        { jobId: "4", workflow: "x", status: "COMPLETED" } as JobStatus,
      ];
      expect(component.runningCount).toBe(2);
    });
  });

  describe("isDeferred", () => {
    it("returns false for a running job even if deferred flag is true", () => {
      const job = {
        jobId: "1",
        workflow: "x",
        status: "RUNNING",
        parameters: { deferred: true },
      } as JobStatus;
      expect(component.isDeferred(job)).toBe(false);
    });
  });

  describe("releaseDeferred", () => {
    it("calls releaseDeferred on the service and shows a snackbar", () => {
      const snackSpy = jest.spyOn(component["snack"], "showSuccess");
      component.releaseDeferred();
      expect(snackSpy).toHaveBeenCalledWith("Released 2 deferred jobs", 10000);
    });

    it("shows an error snackbar when the service call fails", () => {
      const { throwError } = require("rxjs");
      jest
        .spyOn(component["jobsSvc"], "releaseDeferred")
        .mockReturnValue(throwError(() => new Error("network error")));
      const snackSpy = jest.spyOn(component["snack"], "showError");
      component.releaseDeferred();
      expect(snackSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to release deferred jobs"),
        10000
      );
    });

    it("exposes a release button in the UI when a job is deferred and queued", () => {
      component.jobs = [
        {
          jobId: "1",
          workflow: "x",
          status: "QUEUED",
          parameters: { deferred: true },
        } as JobStatus,
      ];
      fixture.detectChanges();

      // expand the job
      const header: HTMLElement = fixture.nativeElement.querySelector(".meta");
      header.click();
      fixture.detectChanges();

      const btn: HTMLElement | null = fixture.nativeElement.querySelector(
        '.job-actions button[color="accent"]'
      );
      expect(btn).toBeTruthy();
      expect(btn?.textContent?.trim()).toBe("Release");

      const spy = jest.spyOn(component, "releaseDeferred");
      btn!.click();
      expect(spy).toHaveBeenCalled();
    });
  });
});
