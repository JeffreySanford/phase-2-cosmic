import { TestBed } from "@angular/core/testing";
import {
  HttpClientTestingModule,
  HttpTestingController,
} from "@angular/common/http/testing";

import {
  TridentAllocatorService,
  AllocateError,
} from "./trident-allocator.service";
import { FspAllocationPlan, SchedulingBlock } from "../shared/trident.types";

const SB: SchedulingBlock = {
  id: "sb-test",
  startTime: "2026-04-01T08:00:00Z",
  endTime: "2026-04-01T10:00:00Z",
  subarray: "subarray-1",
};

const MOCK_PLAN: FspAllocationPlan = {
  planId: "plan-sb-test-12345",
  subarray: "subarray-1",
  allocations: [
    {
      fspId: "fsp-001",
      startTime: "2026-04-01T08:00:00Z",
      endTime: "2026-04-01T10:00:00Z",
    },
  ],
};

describe("TridentAllocatorService", () => {
  let service: TridentAllocatorService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
    });
    service = TestBed.inject(TridentAllocatorService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it("should be created", () => {
    expect(service).toBeTruthy();
  });

  it("allocate() posts to /allocate and returns the plan on success", (done) => {
    service.allocate({ schedulingBlock: SB }).subscribe((plan) => {
      expect(plan.planId).toBe(MOCK_PLAN.planId);
      expect(plan.subarray).toBe("subarray-1");
      done();
    });

    const req = httpMock.expectOne(`${service.allocatorBase}/allocate`);
    expect(req.request.method).toBe("POST");
    expect(req.request.body.schedulingBlock.id).toBe(SB.id);
    req.flush(MOCK_PLAN);
  });

  it("allocate() emits the typed AllocateError on 409 Conflict (CONTENTION)", (done) => {
    const conflictError: AllocateError = {
      code: "CONTENTION",
      message: "Subarray contention detected",
      conflicts: ['Subarray "subarray-1" is already allocated'],
    };

    service.allocate({ schedulingBlock: SB }).subscribe({
      next: () => fail("Expected error, got success"),
      error: (err: AllocateError) => {
        expect(err.code).toBe("CONTENTION");
        expect(err.conflicts?.length).toBeGreaterThan(0);
        done();
      },
    });

    httpMock
      .expectOne(`${service.allocatorBase}/allocate`)
      .flush(conflictError, { status: 409, statusText: "Conflict" });
  });

  it("allocate() emits the typed AllocateError on 422 (INVALID_SPECTRAL)", (done) => {
    const spectralError: AllocateError = {
      code: "INVALID_SPECTRAL",
      message: "Spectral plan exceeds FSP bandwidth limit",
    };

    service.allocate({ schedulingBlock: SB }).subscribe({
      next: () => fail("Expected error"),
      error: (err: AllocateError) => {
        expect(err.code).toBe("INVALID_SPECTRAL");
        done();
      },
    });

    httpMock
      .expectOne(`${service.allocatorBase}/allocate`)
      .flush(spectralError, {
        status: 422,
        statusText: "Unprocessable Entity",
      });
  });

  it("health() calls GET /health", (done) => {
    service.health().subscribe((res) => {
      expect(res.status).toBe("ok");
      done();
    });

    const req = httpMock.expectOne(`${service.allocatorBase}/health`);
    expect(req.request.method).toBe("GET");
    req.flush({ status: "ok", service: "trident-allocator" });
  });
});
