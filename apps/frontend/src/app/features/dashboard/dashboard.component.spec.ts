/* eslint-disable @angular-eslint/component-selector */
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { Component, Input, NO_ERRORS_SCHEMA } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { BehaviorSubject, of } from "rxjs";
import { HttpClientTestingModule } from "@angular/common/http/testing";
import { RouterTestingModule } from "@angular/router/testing";
import { MatTabsModule } from "@angular/material/tabs";
import { DashboardComponent } from "./dashboard.component";
import { ReplayMode } from "../../services/load-profile.service";
import { LakehousePanelComponent } from "../../shared/lakehouse-panel/lakehouse-panel.component";

@Component({ selector: "app-promql-card", template: "" })
class PromqlCardStubComponent {}

@Component({
  selector: "mat-tab-group",
  template: "<ng-content></ng-content>",
  standalone: true,
})
class MatTabGroupStubComponent {
  @Input() animationDuration?: string;
  @Input() dynamicHeight?: boolean;
}

@Component({
  selector: "mat-tab",
  template: "<ng-content></ng-content>",
  standalone: true,
})
class MatTabStubComponent {
  @Input() label?: string;
}

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
      imports: [
        HttpClientTestingModule,
        RouterTestingModule,
        FormsModule,
        PromqlCardStubComponent,
        LakehousePanelComponent,
        DashboardComponent,
      ],
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
    })
      .overrideComponent(DashboardComponent, {
        remove: {
          imports: [MatTabsModule],
        },
        add: {
          imports: [MatTabGroupStubComponent, MatTabStubComponent],
        },
      })
      .compileComponents();

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

  it("renders a Lakehouse operations panel for the proof slice", () => {
    component.lakehouseSummary = {
      source: "live",
      bronzeState: "Public source proof only; Bronze Delta not implemented",
      silverQuality:
        "Evidence state only; Silver quality tables not implemented",
      goldReadiness: "Gold readiness not implemented",
      evidence: "ESO ObsCore proof slice",
    };

    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain("Lakehouse");
    expect(el.textContent).toContain("Proof boundary");
    expect(el.textContent).toContain("Public source proof only");
    expect(el.textContent).toContain("ESO ObsCore proof slice");
  });

  it("exposes the diagnostics workspace link from the operations panel", () => {
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector(
      "a.diagnostics-link"
    ) as HTMLAnchorElement | null;
    expect(link).toBeTruthy();
    expect(link?.textContent).toContain("Open diagnostics workspace");
    expect(link?.classList.contains("diagnostics-link")).toBe(true);
  });
});
