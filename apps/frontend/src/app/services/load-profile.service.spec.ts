import { TestBed } from "@angular/core/testing";
import {
  HttpClientTestingModule,
  HttpTestingController,
} from "@angular/common/http/testing";
import { LoadProfileService } from "./load-profile.service";

describe("LoadProfileService", () => {
  let service: LoadProfileService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
    });
    service = TestBed.inject(LoadProfileService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it("should bootstrap profile/mode from runtime status endpoint", () => {
    const req = httpMock.expectOne("/api/load-profile");
    expect(req.request.method).toBe("GET");
    req.flush({ profilePct: 25, mode: "runtime-controlled" });

    let mode: "baseline" | "runtime-controlled" | undefined;
    service.mode$.subscribe((v) => (mode = v));
    expect(service.current).toBe(25);
    expect(mode).toBe("runtime-controlled");
  });

  it("should apply server response when setting profile", () => {
    httpMock
      .expectOne("/api/load-profile")
      .flush({ profilePct: 10, mode: "baseline" });

    service.setProfile(50);
    const req = httpMock.expectOne("/api/load-profile");
    expect(req.request.method).toBe("POST");
    expect(req.request.body).toEqual({ profilePct: 50 });
    req.flush({ profilePct: 50, mode: "runtime-controlled" });

    let mode: "baseline" | "runtime-controlled" | undefined;
    service.mode$.subscribe((v) => (mode = v));
    expect(service.current).toBe(50);
    expect(mode).toBe("runtime-controlled");
  });

  it("should fall back to local state when runtime apply fails", () => {
    httpMock
      .expectOne("/api/load-profile")
      .flush({}, { status: 500, statusText: "error" });

    service.setProfile(25);
    const req = httpMock.expectOne("/api/load-profile");
    expect(req.request.method).toBe("POST");
    req.flush({ message: "failed" }, { status: 500, statusText: "error" });

    let mode: "baseline" | "runtime-controlled" | undefined;
    service.mode$.subscribe((v) => (mode = v));
    expect(service.current).toBe(25);
    expect(mode).toBe("runtime-controlled");
  });
});
