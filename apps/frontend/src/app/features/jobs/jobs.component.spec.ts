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
      providers: [{ provide: JobsService, useClass: StubJobsService }],
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
    const snackBarSpy = jest.spyOn(component["snackBar"], "open");
    component.view(job);
    fixture.detectChanges();
    component.selectedJob = job;
    component.saveLineage();
    expect(updateLineageSpy).toHaveBeenCalledWith("321", {
      parentJobId: "orig",
    });
    expect(snackBarSpy).toHaveBeenCalledWith(
      "Lineage saved successfully",
      undefined,
      { duration: 10000 }
    );
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
    const snackSpy = jest.spyOn(component["snackBar"], "open");

    component.clearCompleted();

    expect(deleteSpy).toHaveBeenCalledTimes(2);
    expect(deleteSpy).toHaveBeenCalledWith("done1");
    expect(deleteSpy).toHaveBeenCalledWith("done2");
    expect(component.jobs.length).toBe(1);
    expect(component.jobs[0].jobId).toBe("running");
    expect(snackSpy).toHaveBeenCalledWith(
      "Cleared 2 completed job(s)",
      undefined,
      { duration: 5000 }
    );
  });

  it("clearCompleted notifies when there are no completed jobs", () => {
    component.jobs = [
      { jobId: "running", workflow: "x", status: "RUNNING" } as JobStatus,
    ];
    const snackSpy = jest.spyOn(component["snackBar"], "open");
    component.clearCompleted();
    expect(snackSpy).toHaveBeenCalledWith(
      "No completed jobs to clear",
      undefined,
      { duration: 3000 }
    );
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
});
