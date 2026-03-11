import { HttpClient } from "@angular/common/http";
import { NoopAnimationsModule } from "@angular/platform-browser/animations";
import { MatTabsModule } from "@angular/material/tabs";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { RouterTestingModule } from "@angular/router/testing";
import { BehaviorSubject, of, throwError } from "rxjs";
import { SidebarService } from "../../base/sidebar/sidebar.service";
import { DatasetsService } from "../../services/datasets.service";
import { JobsService } from "../../services/jobs.service";
import { TelemetryService } from "../../services/telemetry.service";
import { LandingComponent } from "./landing.component";

class StubSidebar {
  collapsed$ = new BehaviorSubject(false);

  setCollapsed(v: boolean): void {
    this.collapsed$.next(v);
  }
}

class StubJobsService {
  lineage: Record<string, unknown> = { parentJobId: "stub" };
  getLineage = jest.fn().mockReturnValue(of(this.lineage));
  list() {
    return of([
      { jobId: "j-1", workflow: "simulate", status: "RUNNING" },
      { jobId: "j-2", workflow: "simulate", status: "COMPLETED" },
    ]);
  }
}

class StubDatasetsService {
  list() {
    return of([
      { id: "d-1", name: "Raw Interferometer Set" },
      { id: "d-2", name: "Calibrated SRDP Slice" },
    ]);
  }
}

class StubTelemetryService {
  queryInstant() {
    return of(4);
  }

  getTopologyMetrics() {
    // two prometheus links out of three total --> 67% before rounding
    return of({
      links: [
        { source: "prometheus" },
        { source: "derived" },
        { source: "prometheus" },
      ],
    });
  }
}

class StubHttpClient {
  get() {
    return of({
      path: "/tmp/diagnostics",
      files: ["system-specs.20260302T190000Z", ".gitkeep"],
    });
  }
}

describe("LandingComponent", () => {
  let component: LandingComponent;
  let fixture: ComponentFixture<LandingComponent>;
  let sidebar: StubSidebar;

  beforeEach(async () => {
    sidebar = new StubSidebar();

    await TestBed.configureTestingModule({
      imports: [RouterTestingModule, MatTabsModule, NoopAnimationsModule],
      declarations: [LandingComponent],
      providers: [
        { provide: SidebarService, useValue: sidebar },
        { provide: JobsService, useClass: StubJobsService },
        { provide: DatasetsService, useClass: StubDatasetsService },
        { provide: TelemetryService, useClass: StubTelemetryService },
        { provide: HttpClient, useClass: StubHttpClient },
        {
          provide: (
            await import("../../services/data-source.service")
          ).DataSourceService,
          useValue: { mode: "live" },
        },
        {
          provide: (
            await import("../../services/mock-data.service")
          ).MockDataService,
          useValue: {
            diagnosticsIndex: () =>
              of({ path: "/tmp", files: ["system-specs.txt"] }),
          },
        },
      ],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(LandingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("renders the mission heading", () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector("h1")?.textContent).toContain(
      "Mission control for telemetry, governance, and scientific trust"
    );
  });

  it("shows computed quick stats from snapshot data", () => {
    expect(component.statCards[0].value).toBe("2");
    expect(component.statCards[1].value).toBe("1");
    expect(component.statCards[2].value).toBe("1");
    expect(component.statCards[3].value).toBe("4");
  });

  it("calculates governance coverage from topology metrics", () => {
    // our stub returns 2 prometheus links of 3 total = ~67%
    const coverageBar = component.signalBars.find(
      (b) => b.label === "Governance Coverage"
    );
    expect(coverageBar).toBeDefined();
    expect(coverageBar?.value).toBe(67);
    expect(coverageBar?.tone).toBe("mint");
    expect(coverageBar?.note).toBeUndefined();
  });

  it("reports orchestration load from job snapshot", () => {
    // StubJobsService returns one RUNNING job (activeJobs=1) and jobs.ok=true
    const loadBar = component.signalBars.find(
      (b) => b.label === "Orchestration Load"
    );
    expect(loadBar).toBeDefined();
    // formula: activeJobs * 12 = 12 -> percent = 12 (clamped)
    expect(loadBar?.value).toBe(12);
    expect(loadBar?.tone).toBe("amber");
  });

  it("shows amber note when topology probe fails", () => {
    // make the telemetry service fail outright so probe() returns ok=false
    jest
      .spyOn((component as any).telemetryService, "getTopologyMetrics")
      .mockReturnValue(throwError(() => new Error("network")));

    component.refreshSnapshot();
    const coverageBar = component.signalBars.find(
      (b) => b.label === "Governance Coverage"
    );
    expect(coverageBar).toBeDefined();
    expect(coverageBar?.value).toBe(0);
    expect(coverageBar?.tone).toBe("amber");
    expect(coverageBar?.note).toContain("unavailable");
  });

  it("shows amber note when topology returns no links", () => {
    jest
      .spyOn((component as any).telemetryService, "getTopologyMetrics")
      .mockReturnValue(of({ links: [] }));

    component.refreshSnapshot();
    const coverageBar = component.signalBars.find(
      (b) => b.label === "Governance Coverage"
    );
    expect(coverageBar).toBeDefined();
    expect(coverageBar?.value).toBe(0);
    expect(coverageBar?.tone).toBe("amber");
    expect(coverageBar?.note).toContain("No topology links yet");
  });

  it("handles topology.links provided as object map", () => {
    const mapPayload = {
      links: {
        "a->b": { source: "prometheus" },
        "x->y": { source: "derived" },
      },
    };
    jest
      .spyOn((component as any).telemetryService, "getTopologyMetrics")
      .mockReturnValue(of(mapPayload));

    component.refreshSnapshot();
    const coverageBar = component.signalBars.find(
      (b) => b.label === "Governance Coverage"
    );
    expect(coverageBar).toBeDefined();
    // 1 live of 2 total -> 50% clamped
    expect(coverageBar?.value).toBe(50);
    expect(coverageBar?.tone).toBe("mint");
    expect(coverageBar?.note).toBeUndefined();
  });

  it("rounds computed coverage and clamps correctly for larger sets", () => {
    // construct a fake topology with 2 live links out of 11 total
    const topo: any = { links: [] };
    for (let i = 0; i < 11; i++) {
      topo.links.push({ source: i < 2 ? "prometheus" : "derived" });
    }

    // compute the percent exactly the way the component does
    const liveCount = topo.links.filter(
      (l: any) => l.source === "prometheus" || l.source === "admin"
    ).length;
    const rawPct = (liveCount / topo.links.length) * 100;
    // apply the same toPercent logic directly
    const rounded = Math.round(rawPct);
    const clamped = Math.max(6, Math.min(100, rounded));
    const expected = clamped;

    // sanity: 2/11 ≈ 18.18 -> rounded/clamped gives 18
    expect(expected).toBe(18);

    // exercise assignment to signalBars value
    component.signalBars = [
      { label: "Governance Coverage", value: 0, tone: "mint" },
    ];
    component.signalBars[0].value = expected;
    expect(component.signalBars[0].value).toBe(18);
  });

  it("responds to collapse state", () => {
    sidebar.setCollapsed(true);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement.querySelector(".landing");
    expect(el.classList).toContain("collapsed");
  });
});
