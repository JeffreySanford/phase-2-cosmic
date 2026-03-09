import {
  ComponentFixture,
  TestBed,
  fakeAsync,
  tick,
} from "@angular/core/testing";
import {
  HttpClientTestingModule,
  HttpTestingController,
} from "@angular/common/http/testing";
import { Component, Input } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatTabsModule } from "@angular/material/tabs";
import { NoopAnimationsModule } from "@angular/platform-browser/animations";
import { TopologyComponent } from "./topology.component";
import { PageStateModule } from "../../shared/page-state/page-state.module";
import { DataSourceService } from "../../services/data-source.service";
import { LoadProfileService } from "../../services/load-profile.service";
import { MockDataService } from "../../services/mock-data.service";
import { of } from "rxjs";

@Component({ selector: "app-disclaimer-banner", template: "" })
class DisclaimerBannerStubComponent {
  @Input() ready = true;
}

describe("TopologyComponent", () => {
  let component: TopologyComponent;
  let fixture: ComponentFixture<TopologyComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        HttpClientTestingModule,
        FormsModule,
        PageStateModule,
        MatTabsModule,
        NoopAnimationsModule,
      ],
      declarations: [TopologyComponent, DisclaimerBannerStubComponent],
      providers: [
        { provide: DataSourceService, useValue: { mode: "live" } },
        {
          provide: MockDataService,
          useValue: { topologyMetricsForLinks: jest.fn() },
        },
        {
          provide: LoadProfileService,
          useValue: { current: 50, profile$: of(50) },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(TopologyComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it("should create", fakeAsync(() => {
    httpMock.expectOne("/api/topology").flush({ nodes: [], links: [] });
    const req1 = httpMock.expectOne("/api/metrics/topology");
    req1.flush({ timing_drift_ns: 0, rfi_event_rate: 0 });
    tick();
    // stop live polling to avoid leftover timers
    component["stopLivePoll"]();
    fixture.detectChanges();
    expect(component).toBeTruthy();
    expect(component.timingDriftNs).toBe(0);
    expect(component.rfiEventRate).toBe(0);
  }));

  it("renders header text and captures mission metrics", fakeAsync(() => {
    httpMock.expectOne("/api/topology").flush({
      nodes: [{ id: "frontend" }, { id: "backend" }],
      links: [{ source: "frontend", target: "backend" }],
    });
    const req1 = httpMock.expectOne("/api/metrics/topology");
    req1.flush({
      timing_drift_ns: 42,
      rfi_event_rate: 7,
      nodeActivity: {
        backend: {
          businessRatePerSec: 4.5,
          businessBytesPerSec: 1048576,
          executorLabels: ["simulator 2.5/s", "vo 1.0/s"],
        },
      },
      links: {
        "frontend->backend": {
          currentMBps: 12,
          maxMBps: 40,
          latencyMs: 18,
          errorRatePct: 0.5,
          source: "prometheus",
        },
      },
    });
    tick();
    component["stopLivePoll"]();
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector("h1")?.textContent).toContain("Topology");
    expect(component.timingDriftNs).toBe(42);
    expect(component.rfiEventRate).toBe(7);
    expect(el.textContent).toContain("Derived links: 1");
    expect(component.nodeSummaries.length).toBeGreaterThan(0);
    expect(el.textContent).toContain("Force Network");
  }));

  it("shows an explicit unavailable state instead of falling back to mock in live mode", () => {
    httpMock
      .expectOne("/api/topology")
      .flush("missing", { status: 503, statusText: "Service Unavailable" });
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(component.topologySource).toBe("unavailable");
    expect(component.hasTopologyData).toBe(false);
    expect(component.lastError).toContain("Live topology data is unavailable");
    expect(el.textContent).toContain("Live topology data is unavailable");
  });
});
