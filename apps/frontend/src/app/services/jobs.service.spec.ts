import {
  TestBed,
  fakeAsync,
  tick,
  discardPeriodicTasks,
} from "@angular/core/testing";
import {
  HttpClientTestingModule,
  HttpTestingController,
} from "@angular/common/http/testing";
import { JobsService, JobStatus } from "./jobs.service";

const MOCK_JOB: JobStatus = {
  jobId: "job-001",
  workflow: "ingest",
  status: "QUEUED",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

describe("JobsService", () => {
  let service: JobsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [JobsService],
    });
    service = TestBed.inject(JobsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  // ── list() ────────────────────────────────────────────────────────────────

  it("list() sends GET /api/v1/jobs without params", (done) => {
    service.list().subscribe((jobs) => {
      expect(jobs).toEqual([MOCK_JOB]);
      done();
    });
    const req = httpMock.expectOne("/api/v1/jobs");
    expect(req.request.method).toBe("GET");
    expect(req.request.params.keys().length).toBe(0);
    req.flush([MOCK_JOB]);
  });

  it("list() passes workflow and state query params", (done) => {
    service.list("ingest", "RUNNING").subscribe(() => done());
    const req = httpMock.expectOne(
      (r) =>
        r.url === "/api/v1/jobs" &&
        r.params.get("workflow") === "ingest" &&
        r.params.get("state") === "RUNNING"
    );
    expect(req.request.method).toBe("GET");
    req.flush([]);
  });

  it("list() passes page and size as string params", (done) => {
    service.list(undefined, undefined, 2, 25).subscribe(() => done());
    const req = httpMock.expectOne(
      (r) =>
        r.url === "/api/v1/jobs" &&
        r.params.get("page") === "2" &&
        r.params.get("size") === "25"
    );
    req.flush([]);
  });

  // ── get() ─────────────────────────────────────────────────────────────────

  it("get() sends GET /api/v1/jobs/:id", (done) => {
    service.get("job-001").subscribe((job) => {
      expect(job).toEqual(MOCK_JOB);
      done();
    });
    const req = httpMock.expectOne("/api/v1/jobs/job-001");
    expect(req.request.method).toBe("GET");
    req.flush(MOCK_JOB);
  });

  // ── submit() ──────────────────────────────────────────────────────────────

  it("submit() sends POST /api/v1/jobs with body", (done) => {
    const body = { type: "ingest", payload: { key: "val" } };
    service.submit(body).subscribe((result) => {
      expect(result.jobId).toBe("job-001");
      done();
    });
    const req = httpMock.expectOne("/api/v1/jobs");
    expect(req.request.method).toBe("POST");
    expect(req.request.body).toEqual(body);
    req.flush(MOCK_JOB);
  });

  // ── submitJob() ───────────────────────────────────────────────────────────

  it("submitJob() sends POST /api/v1/jobs and returns JobSubmitResponse", (done) => {
    const request = { workflow: "export", datasetId: "ds-42" };
    const response = {
      jobId: "job-002",
      status: "QUEUED",
      queuedAt: "2024-01-01T00:00:00Z",
    };
    service.submitJob(request).subscribe((res) => {
      expect(res).toEqual(response);
      done();
    });
    const req = httpMock.expectOne("/api/v1/jobs");
    expect(req.request.method).toBe("POST");
    expect(req.request.body).toEqual(request);
    req.flush(response);
  });

  // ── transition() ──────────────────────────────────────────────────────────

  it("transition() POSTs state change to /api/v1/jobs/:id/transition", (done) => {
    service.transition("job-001", "RUNNING").subscribe((job) => {
      expect(job.status).toBe("RUNNING");
      done();
    });
    const req = httpMock.expectOne("/api/v1/jobs/job-001/transition");
    expect(req.request.method).toBe("POST");
    expect(req.request.body).toEqual({ state: "RUNNING" });
    req.flush({ ...MOCK_JOB, status: "RUNNING" });
  });

  // ── types() ───────────────────────────────────────────────────────────────

  it("types() sends GET /api/v1/jobs/types", (done) => {
    const typeList = ["import", "ingest", "export"];
    service.types().subscribe((t) => {
      expect(t).toEqual(typeList);
      done();
    });
    const req = httpMock.expectOne("/api/v1/jobs/types");
    expect(req.request.method).toBe("GET");
    req.flush(typeList);
  });

  // ── getLogs() ─────────────────────────────────────────────────────────────

  it("getLogs() sends GET /api/v1/jobs/:id/logs", (done) => {
    const logs = ["2024-01-01T00:00:00Z status=QUEUED"];
    service.getLogs("job-001").subscribe((l) => {
      expect(l).toEqual(logs);
      done();
    });
    const req = httpMock.expectOne("/api/v1/jobs/job-001/logs");
    expect(req.request.method).toBe("GET");
    req.flush(logs);
  });

  // ── artifacts() ───────────────────────────────────────────────────────────

  it("artifacts() returns artifacts with absolute URLs unchanged", (done) => {
    const raw = [
      { name: "result.fits", url: "https://cdn.example.com/result.fits" },
    ];
    service.artifacts("job-001").subscribe((a) => {
      expect(a[0].url).toBe("https://cdn.example.com/result.fits");
      done();
    });
    const req = httpMock.expectOne("/api/v1/jobs/job-001/artifacts");
    expect(req.request.method).toBe("GET");
    req.flush(raw);
  });

  it("artifacts() prepends window.location.origin to relative URLs", (done) => {
    const raw = [
      {
        name: "result.fits",
        url: "/api/v1/jobs/job-001/artifacts/result.fits",
      },
    ];
    service.artifacts("job-001").subscribe((a) => {
      expect(a[0].url).toBe(
        window.location.origin + "/api/v1/jobs/job-001/artifacts/result.fits"
      );
      done();
    });
    const req = httpMock.expectOne("/api/v1/jobs/job-001/artifacts");
    req.flush(raw);
  });

  it("artifacts() returns empty array for null response", (done) => {
    service.artifacts("job-001").subscribe((a) => {
      expect(a).toEqual([]);
      done();
    });
    const req = httpMock.expectOne("/api/v1/jobs/job-001/artifacts");
    req.flush(null);
  });

  // ── validate() ────────────────────────────────────────────────────────────

  it("validate() POSTs type+payload to /api/v1/jobs/validate", (done) => {
    service.validate("ingest", { key: "val" }).subscribe((r) => {
      expect(r).toEqual({ valid: true });
      done();
    });
    const req = httpMock.expectOne("/api/v1/jobs/validate");
    expect(req.request.method).toBe("POST");
    expect(req.request.body).toEqual({
      type: "ingest",
      payload: { key: "val" },
    });
    req.flush({ valid: true });
  });

  // ── deleteJob() ───────────────────────────────────────────────────────────

  it("deleteJob() sends DELETE /api/v1/jobs/:id", (done) => {
    service.deleteJob("job-001").subscribe(() => done());
    const req = httpMock.expectOne("/api/v1/jobs/job-001");
    expect(req.request.method).toBe("DELETE");
    req.flush(null, { status: 204, statusText: "No Content" });
  });

  // ── getLineage() ──────────────────────────────────────────────────────────

  it("getLineage() sends GET /api/v1/jobs/:id/lineage", (done) => {
    const lineage = { parentJobId: "job-000" };
    service.getLineage("job-001").subscribe((l) => {
      expect(l).toEqual(lineage);
      done();
    });
    const req = httpMock.expectOne("/api/v1/jobs/job-001/lineage");
    expect(req.request.method).toBe("GET");
    req.flush(lineage);
  });

  // ── updateLineage() ───────────────────────────────────────────────────────

  it("updateLineage() sends PUT /api/v1/jobs/:id/lineage", (done) => {
    const lineage = {
      parentJobId: "parent-456",
      grandparentJobId: "grandparent-789",
    };
    service.updateLineage("job-001", lineage).subscribe((result) => {
      expect(result).toBeDefined();
      done();
    });
    const req = httpMock.expectOne("/api/v1/jobs/job-001/lineage");
    expect(req.request.method).toBe("PUT");
    expect(req.request.body).toEqual(lineage);
    req.flush({ status: "updated" });
  });

  it("updateLineage() propagates 404 error", (done) => {
    service.updateLineage("nonexistent", { parentJobId: "x" }).subscribe({
      next: () => fail("Should have failed"),
      error: (err) => {
        expect(err).toBeDefined();
        done();
      },
    });
    const req = httpMock.expectOne("/api/v1/jobs/nonexistent/lineage");
    req.flush("Not found", { status: 404, statusText: "Not Found" });
  });

  // ── publicSources() ───────────────────────────────────────────────────────

  it("publicSources() sends GET /api/v1/public-sources", (done) => {
    const sources = [{ name: "HEASARC", url: "https://heasarc.gsfc.nasa.gov" }];
    service.publicSources().subscribe((s) => {
      expect(s).toEqual(sources);
      done();
    });
    const req = httpMock.expectOne("/api/v1/public-sources");
    expect(req.request.method).toBe("GET");
    req.flush(sources);
  });

  // ── getDispatchConfig() ───────────────────────────────────────────────────

  it("getDispatchConfig() sends GET /api/v1/admin/dispatch", (done) => {
    const config = { intervalSeconds: 5, scannedCount: 10, dispatchedCount: 3 };
    service.getDispatchConfig().subscribe((c) => {
      expect(c).toEqual(config);
      done();
    });
    const req = httpMock.expectOne("/api/v1/admin/dispatch");
    expect(req.request.method).toBe("GET");
    req.flush(config);
  });

  // ── setDispatchInterval() ─────────────────────────────────────────────────

  it("setDispatchInterval() POSTs intervalSeconds to /api/v1/admin/dispatch", (done) => {
    service.setDispatchInterval(30).subscribe(() => done());
    const req = httpMock.expectOne("/api/v1/admin/dispatch");
    expect(req.request.method).toBe("POST");
    expect(req.request.body).toEqual({ intervalSeconds: 30 });
    req.flush({ intervalSeconds: 30, scannedCount: 0, dispatchedCount: 0 });
  });

  // ── releaseDeferred() ─────────────────────────────────────────────────────

  it("releaseDeferred() POSTs to /api/v1/admin/release-deferred", (done) => {
    service.releaseDeferred().subscribe((result) => {
      expect(result).toEqual({ released: 2 });
      done();
    });
    const req = httpMock.expectOne("/api/v1/admin/release-deferred");
    expect(req.request.method).toBe("POST");
    expect(req.request.body).toEqual({});
    req.flush({ released: 2 });
  });

  // ── listHot() and cache ───────────────────────────────────────────────────

  it("listHot() returns ok Result wrapping the job array", (done) => {
    service.listHot().subscribe((result) => {
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([MOCK_JOB]);
      }
      done();
    });
    const req = httpMock.expectOne("/api/v1/jobs");
    req.flush([MOCK_JOB]);
  });

  it("listHot() reuses the cache on second call (no force reload)", fakeAsync(() => {
    let callCount = 0;
    const firstSub = service.listHot().subscribe(() => callCount++);
    const secondSub = service.listHot().subscribe(() => callCount++);

    // Both subscriptions share the same observable; only one HTTP request
    httpMock.expectOne("/api/v1/jobs").flush([MOCK_JOB]);
    tick(0);
    expect(callCount).toBe(2);
    firstSub.unsubscribe();
    secondSub.unsubscribe();
    discardPeriodicTasks();
  }));

  it("listHot(forceReload=true) creates a new polling stream", fakeAsync(() => {
    // First call — prime the cache
    const firstSub = service.listHot().subscribe();
    httpMock.expectOne("/api/v1/jobs").flush([MOCK_JOB]);
    tick(0);

    // Second call with forceReload — a fresh stream means a new request
    const secondSub = service.listHot(true).subscribe();
    httpMock.expectOne("/api/v1/jobs").flush([MOCK_JOB]);
    tick(0);

    firstSub.unsubscribe();
    secondSub.unsubscribe();
    discardPeriodicTasks();
    httpMock.verify();
  }));

  it("invalidateList() clears the cache so next listHot() makes a new request", fakeAsync(() => {
    const firstSub = service.listHot().subscribe();
    httpMock.expectOne("/api/v1/jobs").flush([MOCK_JOB]);
    tick(0);

    service.invalidateList();
    firstSub.unsubscribe();

    const secondSub = service.listHot().subscribe();
    httpMock.expectOne("/api/v1/jobs").flush([MOCK_JOB]);
    tick(0);

    secondSub.unsubscribe();
    discardPeriodicTasks();
    httpMock.verify();
  }));

  // ── watchJob() and invalidateJob() ───────────────────────────────────────

  it("watchJob() polls the job endpoint and emits the job", (done) => {
    service.watchJob("job-001").subscribe((job) => {
      expect(job.jobId).toBe("job-001");
      done();
    });
    httpMock.expectOne("/api/v1/jobs/job-001").flush(MOCK_JOB);
  });

  it("watchJob() reuses the cache for the same id", fakeAsync(() => {
    let count = 0;
    const firstSub = service.watchJob("job-001").subscribe(() => count++);
    const secondSub = service.watchJob("job-001").subscribe(() => count++);
    httpMock.expectOne("/api/v1/jobs/job-001").flush(MOCK_JOB);
    tick(0);
    expect(count).toBe(2);
    firstSub.unsubscribe();
    secondSub.unsubscribe();
    discardPeriodicTasks();
  }));

  it("invalidateJob() removes the job from cache so next watchJob() re-fetches", fakeAsync(() => {
    const firstSub = service.watchJob("job-001").subscribe();
    httpMock.expectOne("/api/v1/jobs/job-001").flush(MOCK_JOB);
    tick(0);

    service.invalidateJob("job-001");
    firstSub.unsubscribe();

    const secondSub = service.watchJob("job-001").subscribe();
    httpMock.expectOne("/api/v1/jobs/job-001").flush(MOCK_JOB);
    tick(0);

    secondSub.unsubscribe();
    discardPeriodicTasks();
    httpMock.verify();
  }));
});
