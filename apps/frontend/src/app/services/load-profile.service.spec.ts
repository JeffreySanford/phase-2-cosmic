import { TestBed } from "@angular/core/testing";
import {
  HttpClientTestingModule,
  HttpTestingController,
} from "@angular/common/http/testing";
import { BehaviorSubject } from "rxjs";
import { LoadProfileService } from "./load-profile.service";
import { DataSourceService, DataMode } from "./data-source.service";

describe("LoadProfileService", () => {
  let service: LoadProfileService;
  let httpMock: HttpTestingController;
  let warnSpy: jest.SpyInstance;
  let mode$: BehaviorSubject<DataMode>;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    mode$ = new BehaviorSubject<DataMode>("live");
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        {
          provide: DataSourceService,
          useValue: {
            mode$: mode$.asObservable(),
            setMode: (mode: DataMode) => mode$.next(mode),
            get mode() {
              return mode$.value;
            },
          },
        },
      ],
    });
    service = TestBed.inject(LoadProfileService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    warnSpy.mockRestore();
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
    service.setStress(true);
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
    service.setStress(true);
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

  it("should stay local and skip runtime requests in mock mode", () => {
    httpMock.expectOne("/api/load-profile").flush({});
    mode$.next("mock");

    service.setProfile(50);

    httpMock.expectNone("/api/load-profile");

    let mode: "baseline" | "runtime-controlled" | undefined;
    service.mode$.subscribe((v) => (mode = v));
    expect(service.current).toBe(50);
    expect(mode).toBe("runtime-controlled");
  });

  it("should refresh runtime status after switching back to live mode", () => {
    httpMock
      .expectOne("/api/load-profile")
      .flush({ profilePct: 10, mode: "baseline" });
    mode$.next("mock");
    service.setProfile(25);
    httpMock.expectNone("/api/load-profile");

    mode$.next("live");

    const req = httpMock.expectOne("/api/load-profile");
    expect(req.request.method).toBe("GET");
    req.flush({ profilePct: 50, mode: "runtime-controlled" });

    expect(service.current).toBe(50);
  });

  it("should record profile history and replay it", () => {
    httpMock
      .expectOne("/api/load-profile")
      .flush({ profilePct: 10, mode: "baseline" });

    // enable stress mode to allow runtime calls and history tracking
    service.setStress(true);
    httpMock
      .expectOne("/api/load-profile")
      .flush({ profilePct: 10, mode: "baseline" });

    service.setProfile(25);
    let req = httpMock.expectOne("/api/load-profile");
    req.flush({ profilePct: 25, mode: "runtime-controlled" });

    service.setProfile(50);
    req = httpMock.expectOne("/api/load-profile");
    req.flush({ profilePct: 50, mode: "runtime-controlled" });

    // Replay should make the same calls again (in order)
    jest.useFakeTimers();
    service.replayHistory(0);
    jest.runAllTimers();

    const replayReqs = httpMock.match("/api/load-profile");
    expect(replayReqs).toHaveLength(3);
    const [replayStatusReq, replayReq1, replayReq2] = replayReqs;
    replayStatusReq.flush({ profilePct: 10, mode: "baseline" });
    replayReq1.flush({ profilePct: 25, mode: "runtime-controlled" });
    replayReq2.flush({ profilePct: 50, mode: "runtime-controlled" });

    jest.useRealTimers();
  });

  it("should schedule replay and stop it", () => {
    httpMock
      .expectOne("/api/load-profile")
      .flush({ profilePct: 10, mode: "baseline" });

    // enable stress mode to allow runtime calls and history tracking
    service.setStress(true);
    httpMock
      .expectOne("/api/load-profile")
      .flush({ profilePct: 10, mode: "baseline" });

    service.setProfile(25);
    let req = httpMock.expectOne("/api/load-profile");
    req.flush({ profilePct: 25, mode: "runtime-controlled" });

    service.setProfile(50);
    req = httpMock.expectOne("/api/load-profile");
    req.flush({ profilePct: 50, mode: "runtime-controlled" });

    jest.useFakeTimers();

    // Schedule replay; immediate replay should occur.
    service.startReplaySchedule(1);
    expect(service.isReplayScheduled).toBe(true);
    jest.advanceTimersByTime(1);
    const replayReqs = httpMock.match("/api/load-profile");
    expect(replayReqs.length).toBeGreaterThanOrEqual(2);
    replayReqs[0].flush({ profilePct: 25, mode: "runtime-controlled" });
    replayReqs[1].flush({ profilePct: 50, mode: "runtime-controlled" });

    service.stopReplaySchedule();
    expect(service.isReplayScheduled).toBe(false);

    // clear any remaining timers so they don't cause later HTTP calls
    jest.clearAllTimers();
    jest.useRealTimers();
  });
});
