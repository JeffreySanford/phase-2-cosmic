import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NO_ERRORS_SCHEMA } from "@angular/core";
import { JobsComponent } from "./jobs.component";
import { JobsService, JobStatus } from "../../services/jobs.service";
import { of, EMPTY } from "rxjs";
import { HttpErrorResponse } from "@angular/common/http";
import { MatDialogModule } from "@angular/material/dialog";
import { MatSnackBarModule } from "@angular/material/snack-bar";
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
});
