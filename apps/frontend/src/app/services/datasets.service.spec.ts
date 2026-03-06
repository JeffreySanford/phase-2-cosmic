import {
  HttpClientTestingModule,
  HttpTestingController,
} from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { DatasetsService } from "./datasets.service";

describe("DatasetsService", () => {
  let service: DatasetsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
    });

    service = TestBed.inject(DatasetsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it("flattens metadata fields when listing datasets", () => {
    let value: unknown;

    service.list().subscribe((result) => {
      value = result;
    });

    const req = httpMock.expectOne("/api/v1/datasets");
    req.flush([
      {
        id: "dataset-1",
        name: "Dataset 1",
        metadata: {
          workflow: "spectral-line",
          jobId: "job-1",
        },
      },
    ]);

    expect(value).toEqual([
      expect.objectContaining({
        id: "dataset-1",
        workflow: "spectral-line",
        jobId: "job-1",
      }),
    ]);
  });

  it("merges metadata into the created dataset response", () => {
    let created: unknown;

    service
      .create({
        name: "Created Dataset",
        description: "desc",
      })
      .subscribe((result) => {
        created = result;
      });

    const req = httpMock.expectOne("/api/v1/datasets");
    expect(req.request.method).toBe("POST");
    expect(req.request.body).toEqual({
      name: "Created Dataset",
      description: "desc",
    });

    req.flush({
      id: "dataset-2",
      name: "Created Dataset",
      metadata: {
        workflow: "continuum",
        sourceDatasetId: "dataset-1",
      },
    });

    expect(created).toEqual(
      expect.objectContaining({
        id: "dataset-2",
        workflow: "continuum",
        sourceDatasetId: "dataset-1",
      })
    );
  });

  it("caches listHot results until forceReload is requested", () => {
    const results: unknown[] = [];

    service.listHot().subscribe((value) => results.push(value));
    const req = httpMock.expectOne("/api/v1/datasets");
    req.flush([{ id: "dataset-1", name: "Cached Dataset" }]);

    service.listHot().subscribe((value) => results.push(value));
    httpMock.expectNone("/api/v1/datasets");

    service
      .listHot(true)
      .subscribe((value) => results.push({ reload: true, value }));
    const reloadReq = httpMock.expectOne("/api/v1/datasets");
    reloadReq.flush([{ id: "dataset-2", name: "Reloaded Dataset" }]);

    expect(results[0]).toEqual({
      ok: true,
      value: [{ id: "dataset-1", name: "Cached Dataset" }],
    });
    expect(results[1]).toEqual({
      ok: true,
      value: [{ id: "dataset-1", name: "Cached Dataset" }],
    });
    expect(results[2]).toEqual({
      reload: true,
      value: {
        ok: true,
        value: [{ id: "dataset-2", name: "Reloaded Dataset" }],
      },
    });
  });

  it("returns a failed Result from listHot when the request errors", () => {
    let value: unknown;

    service.listHot(true).subscribe((result) => {
      value = result;
    });

    const req = httpMock.expectOne("/api/v1/datasets");
    req.flush({ error: "boom" }, { status: 500, statusText: "Server Error" });

    expect(value).toEqual({
      ok: false,
      error: expect.objectContaining({ status: 500 }),
    });
  });
});
