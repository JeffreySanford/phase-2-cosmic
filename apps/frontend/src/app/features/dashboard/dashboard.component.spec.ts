import { ComponentFixture, TestBed } from "@angular/core/testing";
import { Component, NO_ERRORS_SCHEMA } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { BehaviorSubject, of } from "rxjs";
import { HttpClientTestingModule } from "@angular/common/http/testing";
import { DashboardComponent } from "./dashboard.component";
import { ReplayMode } from "../../services/load-profile.service";

@Component({ selector: "app-promql-card", template: "" })
class PromqlCardStubComponent {}

type DashboardComponentWithLoadProfile = DashboardComponent & {
  loadProfile: {
    isReplayScheduled: boolean;
  };
};

describe("DashboardComponent", () => {
  let component: DashboardComponent;
  let fixture: ComponentFixture<DashboardComponent>;
  let replaySpy: jest.SpyInstance;
  let startSpy: jest.SpyInstance;
  let stopSpy: jest.SpyInstance;
  let setIntervalSpy: jest.SpyInstance;
  let setModeSpy: jest.SpyInstance;

  beforeEach(async () => {
    const replayInterval$ = new BehaviorSubject(5000);
    const mockLoadProfileService = {
      profile$: of(10),
      stress$: of(false),
      workers$: of(0),
      note$: of(""),
      pollingMs$: of(30000),
      replayInterval$: replayInterval$.asObservable(),
      replayMode$: of("loop" as ReplayMode),
      autoReplay$: of(false),
      nextReplayAt$: of(null),
      replayRunTimestamps$: of([]),
      isReplayScheduled: false,
      replayHistory: jest.fn<(intervalMs?: number) => void>(),
      startReplaySchedule: jest.fn<(intervalMs: number) => void>(),
      stopReplaySchedule: jest.fn<() => void>(),
      setReplayIntervalMs: jest.fn<(ms: number) => void>((ms) => {
        replayInterval$.next(ms);
      }),
      setReplayMode: jest.fn<(mode: ReplayMode) => void>(),
    };

    replaySpy = jest.spyOn(mockLoadProfileService, "replayHistory");
    startSpy = jest.spyOn(mockLoadProfileService, "startReplaySchedule");
    stopSpy = jest.spyOn(mockLoadProfileService, "stopReplaySchedule");
    setIntervalSpy = jest.spyOn(mockLoadProfileService, "setReplayIntervalMs");
    setModeSpy = jest.spyOn(mockLoadProfileService, "setReplayMode");

    await TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, FormsModule, PromqlCardStubComponent],
      declarations: [DashboardComponent],
      schemas: [NO_ERRORS_SCHEMA],
      providers: [
        {
          provide: (
            await import("../../services/data-source.service")
          ).DataSourceService,
          useValue: { mode: "live", mode$: of("live") },
        },
        {
          provide: (
            await import("../../services/mock-data.service")
          ).MockDataService,
          useValue: { diagnosticsIndex: () => of({ path: "", files: [] }) },
        },
        {
          provide: (
            await import("../../services/load-profile.service")
          ).LoadProfileService,
          useValue: mockLoadProfileService,
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("renders container and header", () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector("h1")?.textContent).toContain("Dashboard");
  });

  it("calls replayHistory when replay button is clicked", () => {
    const el: HTMLElement = fixture.nativeElement;
    const button = el.querySelector("button.replay-history");
    expect(button).toBeTruthy();
    button?.dispatchEvent(new Event("click"));

    expect(replaySpy).toHaveBeenCalled();
  });

  it("toggles auto-replay on and off", () => {
    const el: HTMLElement = fixture.nativeElement;
    const button = el.querySelector("button.auto-replay");
    expect(button).toBeTruthy();

    // adjust interval and start
    component.onReplayIntervalChange(1234);
    expect(setIntervalSpy).toHaveBeenCalledWith(1234);

    button?.dispatchEvent(new Event("click"));
    expect(startSpy).toHaveBeenCalledWith(1234);

    // simulate the service becoming enabled
    (
      component as DashboardComponentWithLoadProfile
    ).loadProfile.isReplayScheduled = true;
    fixture.detectChanges();

    button?.dispatchEvent(new Event("click"));
    expect(stopSpy).toHaveBeenCalled();
  });

  it("changes replay mode", () => {
    const select: HTMLElement | null =
      fixture.nativeElement.querySelector("mat-select");
    expect(select).toBeTruthy();

    component.onReplayModeChange("random");
    expect(setModeSpy).toHaveBeenCalledWith("random");
  });

  it("does not start auto-replay when interval is invalid", () => {
    const el: HTMLElement = fixture.nativeElement;
    const button = el.querySelector("button.auto-replay");
    expect(button).toBeTruthy();

    component.replayIntervalMs = 10; // below min
    fixture.detectChanges();

    button?.dispatchEvent(new Event("click"));
    expect(startSpy).not.toHaveBeenCalled();
  });

  it("renders the governance Pulsar ingest summary field", () => {
    component.governanceSummary = {
      completedTotal: 3,
      failedTotal: 1,
      redisReadRate: "1.20 req/s",
      objectWriteRate: "512.00 B/s",
      pulsarIngestRate: "0.80 req/s",
      proxyRate: "2.40 req/s",
      source: "live",
    };

    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain("Pulsar ingest:");
    expect(el.textContent).toContain("0.80 req/s");
  });
});
