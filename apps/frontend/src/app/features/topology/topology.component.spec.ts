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
import { MatDialog } from "@angular/material/dialog";
import { MatTabsModule } from "@angular/material/tabs";
import { NoopAnimationsModule } from "@angular/platform-browser/animations";
import { TopologyComponent } from "./topology.component";
import { PageStateModule } from "../../shared/page-state/page-state.module";
import { SharedModule } from "../../shared/shared.module";
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
  let matDialog: { open: jest.Mock };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        HttpClientTestingModule,
        FormsModule,
        PageStateModule,
        SharedModule,
        MatTabsModule,
        NoopAnimationsModule,
        DisclaimerBannerStubComponent,
      ],
      declarations: [TopologyComponent],
      providers: [
        { provide: DataSourceService, useValue: { mode: "live" } },
        {
          provide: MatDialog,
          useValue: { open: jest.fn() },
        },
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
    matDialog = TestBed.inject(MatDialog) as unknown as { open: jest.Mock };
  });

  beforeEach(fakeAsync(() => {
    fixture.detectChanges();
    tick();
  }));

  afterEach(() => {
    // some tests trigger a metrics request that isn't explicitly flushed;
    // clear any lingering requests so verify() doesn't complain.
    httpMock.match("/api/env").forEach((req) =>
      req.flush({
        GRAFANA_DASHBOARD_URL:
          "http://localhost:3000/d/phase2-topology-ops/phase2-topology-operations?orgId=1&kiosk",
        GRAFANA_DASHBOARD_ENABLED: "true",
        GRAFANA_DASHBOARD_ACCESS_MODE: "local-anonymous",
        GRAFANA_DASHBOARD_EMBED_MODE: "direct",
      })
    );
    httpMock.match("/api/metrics/topology").forEach((req) => req.flush({}));
    httpMock.verify();
    matDialog.open.mockReset();
  });

  function settleTopologyView(ms = 0): void {
    tick(ms);
    fixture.detectChanges();
  }

  function flushLiveTopology(
    topology: { nodes: unknown[]; links: unknown[] },
    metrics: Record<string, unknown>
  ): void {
    httpMock.expectOne("/api/topology").flush(topology);
    settleTopologyView();
    httpMock.expectOne("/api/metrics/topology").flush(metrics);
    settleTopologyView();
  }

  function loadTopologyWithProvenanceMix(): void {
    flushLiveTopology(
      {
        nodes: [
          { id: "frontend", label: "Frontend" },
          { id: "backend", label: "Backend" },
          { id: "java-governance", label: "Java Governance" },
          { id: "redis", label: "Redis" },
        ],
        links: [
          { source: "frontend", target: "backend" },
          { source: "backend", target: "java-governance" },
          { source: "java-governance", target: "redis" },
        ],
      },
      {
        links: {
          "frontend->backend": {
            currentMBps: 12,
            maxMBps: 20,
            confidencePct: 96,
            source: "prometheus",
          },
          "backend->java-governance": {
            currentMBps: 6,
            maxMBps: 12,
            confidencePct: 84,
            source: "admin",
          },
          "java-governance->redis": {
            currentMBps: 1,
            maxMBps: 10,
            confidencePct: 48,
            source: "derived",
          },
        },
      }
    );
    component["stopLivePoll"]();
    fixture.detectChanges();
    tick(1000);
  }

  it("should create", fakeAsync(() => {
    flushLiveTopology(
      { nodes: [], links: [] },
      { timing_drift_ns: 0, rfi_event_rate: 0 }
    );
    // stop live polling to avoid leftover timers
    component["stopLivePoll"]();
    fixture.detectChanges();
    tick(1000);
    expect(component).toBeTruthy();
    expect(component.timingDriftNs).toBe(0);
    expect(component.rfiEventRate).toBe(0);
    // ensure timers cleared
    tick();
  }));

  it("loads the Grafana dashboard URL from runtime environment config", fakeAsync(() => {
    httpMock.expectOne("/api/env").flush({
      GRAFANA_DASHBOARD_URL:
        "http://localhost:3000/d/phase2-topology-ops/phase2-topology-operations?orgId=1&kiosk",
      GRAFANA_DASHBOARD_ENABLED: "true",
      GRAFANA_DASHBOARD_ACCESS_MODE: "local-anonymous",
      GRAFANA_DASHBOARD_EMBED_MODE: "direct",
    });
    tick();
    fixture.detectChanges();

    expect(component.grafanaDashboardEnabled).toBe(true);
    expect(component.grafanaDashboardUrl).toContain("phase2-topology-ops");
    expect(component.grafanaDashboardSafeUrl).toBeTruthy();
    expect(component.grafanaDashboardStatus).toBe("loading");
    expect(component.grafanaDashboardAccessMode).toBe("local-anonymous");
    expect(component.grafanaDashboardEmbedMode).toBe("direct");

    component.onGrafanaDashboardLoad();
    expect(component.grafanaDashboardStatus).toBe("ready");

    flushLiveTopology({ nodes: [], links: [] }, {});
    component["stopLivePoll"]();
    tick();
  }));

  it("hides the Grafana dashboard tab when runtime config disables it", fakeAsync(() => {
    httpMock.expectOne("/api/env").flush({
      GRAFANA_DASHBOARD_ENABLED: "false",
      GRAFANA_DASHBOARD_ACCESS_MODE: "production-proxy",
      GRAFANA_DASHBOARD_EMBED_MODE: "proxy",
    });
    tick();
    fixture.detectChanges();

    expect(component.grafanaDashboardEnabled).toBe(false);
    expect(component.grafanaDashboardSafeUrl).toBeNull();
    expect(component.grafanaDashboardStatus).toBe("error");
    expect(component.grafanaDashboardError).toBe(
      "Grafana dashboard is disabled."
    );
    expect(component.grafanaDashboardAccessMode).toBe("production-proxy");
    expect(component.grafanaDashboardEmbedMode).toBe("proxy");
    expect(fixture.nativeElement.textContent).not.toContain(
      "Metrics Dashboard"
    );

    flushLiveTopology({ nodes: [], links: [] }, {});
    component["stopLivePoll"]();
    tick();
  }));

  it("renders header text and captures mission metrics", fakeAsync(() => {
    flushLiveTopology(
      {
        nodes: [{ id: "frontend" }, { id: "backend" }],
        links: [{ source: "frontend", target: "backend" }],
      },
      {
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
      }
    );
    component["stopLivePoll"]();
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector("h1")?.textContent).toContain("Topology");
    expect(component.timingDriftNs).toBe(42);
    expect(component.rfiEventRate).toBe(7);
    expect(el.textContent).toContain("Live links: 1");
    expect(el.textContent).toContain("Derived links: 0");
    expect(el.textContent).toContain("Snapshot Fidelity");
    expect(component.effectiveProvenanceFilters()).toEqual([
      "prometheus",
      "admin",
      "derived",
    ]);
    component.toggleProvenanceFilter("admin");
    expect(component.effectiveProvenanceFilters()).toEqual([
      "prometheus",
      "derived",
    ]);
    expect(component.activeProvenanceFilterSummary()).toBe(
      "Filtered: Live + Derived"
    );
    component.toggleProvenanceFilter("admin");
    expect(component.allProvenanceFiltersActive()).toBe(true);
    expect(component.activeProvenanceFilterSummary()).toBe("All visible");
    expect(component.showProvenanceFilterHelper).toBe(true);
    expect(component["fullTopologyLinks"]).toHaveLength(1);
    expect(component.topologyFidelityLabel()).toBe("Partial live coverage");
    expect(component.measuredCoveragePct()).toBe(100);
    expect(component.derivedCoveragePct()).toBe(0);
    expect(component.confidenceBand()).toBe("Moderate confidence");
    expect(component.nodeSummaries.length).toBeGreaterThan(0);
    expect(el.textContent).toContain("Force Network");
    expect(el.textContent).toContain(
      "Use the provenance filters to isolate measured, health-backed, or inferred paths."
    );
    tick(5000);
  }));

  it("shows an explicit unavailable state instead of falling back to mock in live mode", fakeAsync(() => {
    httpMock
      .expectOne("/api/topology")
      .flush("missing", { status: 503, statusText: "Service Unavailable" });
    settleTopologyView();

    const el: HTMLElement = fixture.nativeElement;
    expect(component.topologySource).toBe("unavailable");
    expect(component.hasTopologyData).toBe(false);
    expect(component.lastError).toContain("Live topology data is unavailable");
    expect(el.textContent).toContain("Live topology data is unavailable");
  }));

  it("defaults to all provenance filters active", fakeAsync(() => {
    loadTopologyWithProvenanceMix();

    expect(component.effectiveProvenanceFilters()).toEqual([
      "prometheus",
      "admin",
      "derived",
    ]);
    expect(component.allProvenanceFiltersActive()).toBe(true);
    expect(component.activeProvenanceFilterSummary()).toBe("All visible");
    expect(component["lastLinks"]).toHaveLength(3);
    expect(component.summaryScopeNotice()).toBe(
      "These counts and fidelity metrics describe the full topology snapshot."
    );
    expect(component.provenanceFilterAriaLabel("prometheus")).toBe(
      "Hide Live links in the force network"
    );
    // clear timers before finishing
    component["stopLivePoll"]();
    tick();
  }));

  it("shows helper copy for five seconds after a filter change", fakeAsync(() => {
    loadTopologyWithProvenanceMix();

    expect(component.showProvenanceFilterHelper).toBe(false);

    component.toggleProvenanceFilter("admin");
    fixture.detectChanges();

    expect(component.showProvenanceFilterHelper).toBe(true);
    expect(component.provenanceFilterHelperText()).toBe(
      "Showing Live + Derived links. Turning the last active filter off restores the full graph."
    );

    tick(4900);
    fixture.detectChanges();
    expect(component.showProvenanceFilterHelper).toBe(true);

    tick(100);
    fixture.detectChanges();
    expect(component.showProvenanceFilterHelper).toBe(false);
  }));

  it("supports single-filter Live behavior", fakeAsync(() => {
    loadTopologyWithProvenanceMix();

    component.toggleProvenanceFilter("admin");
    component.toggleProvenanceFilter("derived");
    fixture.detectChanges();

    expect(component.effectiveProvenanceFilters()).toEqual(["prometheus"]);
    expect(component["lastLinks"]).toHaveLength(1);
    expect(
      component["lastNodes"].map((node: { id: string }) => node.id)
    ).toEqual(["frontend", "backend"]);
    expect(component.graphFilterNotice()).toBe(
      "Filtered: Live. Counts, rankings, and Snapshot Fidelity still describe the full topology snapshot."
    );
    expect(component.provenanceFilterAriaLabel("admin")).toBe(
      "Show only Admin links in the force network"
    );
    tick(5000);
  }));

  it("supports single-filter Admin behavior", fakeAsync(() => {
    loadTopologyWithProvenanceMix();

    component.toggleProvenanceFilter("prometheus");
    component.toggleProvenanceFilter("derived");
    fixture.detectChanges();

    expect(component.effectiveProvenanceFilters()).toEqual(["admin"]);
    expect(component["lastLinks"]).toHaveLength(1);
    expect(
      component["lastNodes"].map((node: { id: string }) => node.id)
    ).toEqual(["backend", "java-governance"]);
    tick(5000);
  }));

  it("supports single-filter Derived behavior", fakeAsync(() => {
    loadTopologyWithProvenanceMix();

    component.toggleProvenanceFilter("prometheus");
    component.toggleProvenanceFilter("admin");
    fixture.detectChanges();

    expect(component.effectiveProvenanceFilters()).toEqual(["derived"]);
    expect(component["lastLinks"]).toHaveLength(1);
    expect(
      component["lastNodes"].map((node: { id: string }) => node.id)
    ).toEqual(["java-governance", "redis"]);
    tick(5000);
  }));

  it("supports two-filter union behavior", fakeAsync(() => {
    loadTopologyWithProvenanceMix();

    component.toggleProvenanceFilter("derived");
    fixture.detectChanges();

    expect(component.effectiveProvenanceFilters()).toEqual([
      "prometheus",
      "admin",
    ]);
    expect(component["lastLinks"]).toHaveLength(2);
    expect(
      component["lastNodes"].map((node: { id: string }) => node.id)
    ).toEqual(["frontend", "backend", "java-governance"]);
    tick(5000);
  }));

  it("supports the all-three-active state explicitly", fakeAsync(() => {
    loadTopologyWithProvenanceMix();

    component.toggleProvenanceFilter("derived");
    component.toggleProvenanceFilter("derived");
    fixture.detectChanges();

    expect(component.effectiveProvenanceFilters()).toEqual([
      "prometheus",
      "admin",
      "derived",
    ]);
    expect(component.allProvenanceFiltersActive()).toBe(true);
    expect(component["lastLinks"]).toHaveLength(3);
    tick(5000);
  }));

  it("supports toggle-off behavior on second click", fakeAsync(() => {
    loadTopologyWithProvenanceMix();

    component.toggleProvenanceFilter("admin");
    fixture.detectChanges();
    expect(component.isProvenanceFilterActive("admin")).toBe(false);

    component.toggleProvenanceFilter("admin");
    fixture.detectChanges();
    expect(component.isProvenanceFilterActive("admin")).toBe(true);
    tick(5000);
  }));

  it("resets to all when the last active filter is turned off", fakeAsync(() => {
    loadTopologyWithProvenanceMix();

    component.toggleProvenanceFilter("admin");
    component.toggleProvenanceFilter("derived");
    fixture.detectChanges();
    expect(component.effectiveProvenanceFilters()).toEqual(["prometheus"]);

    component.toggleProvenanceFilter("prometheus");
    fixture.detectChanges();

    expect(component.effectiveProvenanceFilters()).toEqual([
      "prometheus",
      "admin",
      "derived",
    ]);
    expect(component["lastLinks"]).toHaveLength(3);
    tick(5000);
  }));

  it("filters the visible graph in memory without losing the canonical topology", fakeAsync(() => {
    flushLiveTopology(
      {
        nodes: [
          { id: "frontend" },
          { id: "backend" },
          { id: "java-governance" },
        ],
        links: [
          { source: "frontend", target: "backend" },
          { source: "backend", target: "java-governance" },
        ],
      },
      {
        links: {
          "frontend->backend": {
            currentMBps: 10,
            maxMBps: 25,
            source: "prometheus",
          },
        },
      }
    );
    component["stopLivePoll"]();
    fixture.detectChanges();

    expect(component["fullTopologyLinks"]).toHaveLength(2);
    expect(component["lastLinks"]).toHaveLength(2);
    expect(component["lastNodes"]).toHaveLength(3);

    (
      component["fullTopologyLinks"][0] as unknown as {
        _stats: { source: string };
      }
    )._stats.source = "prometheus";
    component.toggleProvenanceFilter("prometheus");
    fixture.detectChanges();

    expect(component["fullTopologyLinks"]).toHaveLength(2);
    expect(component["lastLinks"]).toHaveLength(1);
    expect(component["lastNodes"]).toHaveLength(2);
    expect(
      component["lastNodes"].map((node: { id: string }) => node.id)
    ).toEqual(["backend", "java-governance"]);
    tick(5000);
  }));

  it("supports phase 5 toggle rules and preserves filters across refresh", fakeAsync(() => {
    flushLiveTopology(
      {
        nodes: [
          { id: "frontend" },
          { id: "backend" },
          { id: "java-governance" },
        ],
        links: [
          { source: "frontend", target: "backend" },
          { source: "backend", target: "java-governance" },
        ],
      },
      {
        links: {
          "frontend->backend": {
            currentMBps: 10,
            maxMBps: 25,
            source: "prometheus",
          },
        },
      }
    );
    component["stopLivePoll"]();

    (
      component["fullTopologyLinks"][0] as unknown as {
        _stats: { source: string };
      }
    )._stats.source = "prometheus";
    (
      component["fullTopologyLinks"][1] as unknown as {
        _stats: { source: string };
      }
    )._stats.source = "admin";

    component.toggleProvenanceFilter("admin");
    component.toggleProvenanceFilter("derived");
    fixture.detectChanges();

    expect(component.effectiveProvenanceFilters()).toEqual(["prometheus"]);

    component.toggleProvenanceFilter("admin");
    fixture.detectChanges();

    expect(component.effectiveProvenanceFilters()).toEqual([
      "prometheus",
      "admin",
    ]);

    component.toggleProvenanceFilter("admin");
    fixture.detectChanges();

    expect(component.effectiveProvenanceFilters()).toEqual(["prometheus"]);

    component.toggleProvenanceFilter("prometheus");
    fixture.detectChanges();

    expect(component.allProvenanceFiltersActive()).toBe(true);
    expect(component.effectiveProvenanceFilters()).toEqual([
      "prometheus",
      "admin",
      "derived",
    ]);

    component.toggleProvenanceFilter("admin");
    component.toggleProvenanceFilter("derived");
    fixture.detectChanges();

    expect(component.effectiveProvenanceFilters()).toEqual(["prometheus"]);

    component.refresh();
    flushLiveTopology(
      {
        nodes: [
          { id: "frontend" },
          { id: "backend" },
          { id: "java-governance" },
        ],
        links: [
          { source: "frontend", target: "backend" },
          { source: "backend", target: "java-governance" },
        ],
      },
      {}
    );
    component["stopLivePoll"]();

    (
      component["fullTopologyLinks"][0] as unknown as {
        _stats: { source: string };
      }
    )._stats.source = "prometheus";
    (
      component["fullTopologyLinks"][1] as unknown as {
        _stats: { source: string };
      }
    )._stats.source = "admin";
    component["applyCurrentTopologyView"](true);
    fixture.detectChanges();

    expect(component.effectiveProvenanceFilters()).toEqual(["prometheus"]);
    tick(5000);
  }));

  it("integrates filter messaging and viewport controls into the force-network UI", fakeAsync(() => {
    flushLiveTopology(
      {
        nodes: [{ id: "frontend" }, { id: "backend" }],
        links: [{ source: "frontend", target: "backend" }],
      },
      {}
    );
    component["stopLivePoll"]();
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain(
      "Showing Live, Admin, and Derived links together."
    );
    expect(el.textContent).toContain("Fit");

    component.toggleProvenanceFilter("admin");
    fixture.detectChanges();

    expect(component.graphFilterNotice()).toContain(
      "Snapshot Fidelity still describe the full topology snapshot."
    );

    component["fitViewport"] = { scale: 0.9, x: 12, y: 18 };
    component.zoomIn();
    expect(component.viewportScale).toBeGreaterThan(1);
    component.zoomOut();
    component.resetViewport();
    expect(component.viewportScale).toBe(0.9);
    expect(component.viewportTranslateX).toBe(12);
    expect(component.viewportTranslateY).toBe(18);
    tick(5000);
  }));

  it("keeps fidelity totals and summary counts based on the full snapshot while the graph is filtered", fakeAsync(() => {
    flushLiveTopology(
      {
        nodes: [
          { id: "frontend", label: "Frontend" },
          { id: "backend", label: "Backend" },
          { id: "java-governance", label: "Java Governance" },
        ],
        links: [
          { source: "frontend", target: "backend" },
          { source: "backend", target: "java-governance" },
        ],
      },
      {
        links: {
          "frontend->backend": {
            currentMBps: 10,
            maxMBps: 20,
            confidencePct: 96,
            source: "prometheus",
          },
          "backend->java-governance": {
            currentMBps: 0,
            maxMBps: 18,
            confidencePct: 48,
            source: "derived",
          },
        },
      }
    );
    component["stopLivePoll"]();
    fixture.detectChanges();

    expect(component.totalLinkCount).toBe(2);
    expect(component.liveLinkCount).toBe(1);
    expect(component.derivedLinkCount).toBe(1);
    expect(component.averageConfidencePct).toBe(72);
    expect(component.measuredCoveragePct()).toBe(50);
    expect(component.derivedCoveragePct()).toBe(50);
    expect(component.summaryScopeNotice()).toBe(
      "These counts and fidelity metrics describe the full topology snapshot."
    );
    expect(component.topologyFidelityMessage()).toContain(
      "Some edges in this snapshot are measured"
    );

    component.toggleProvenanceFilter("admin");
    component.toggleProvenanceFilter("derived");
    fixture.detectChanges();

    expect(component["lastLinks"]).toHaveLength(1);
    expect(component.totalLinkCount).toBe(2);
    expect(component.liveLinkCount).toBe(1);
    expect(component.derivedLinkCount).toBe(1);
    expect(component.averageConfidencePct).toBe(72);
    expect(component.measuredCoveragePct()).toBe(50);
    expect(component.derivedCoveragePct()).toBe(50);
    expect(component.summaryScopeNotice()).toBe(
      "Graph filtered. These counts and fidelity metrics still describe the full topology snapshot."
    );

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain(
      "Graph filtered. These counts and fidelity metrics still describe the full topology snapshot."
    );
    expect(el.textContent).toContain(
      "Counts, rankings, and Snapshot Fidelity still describe the full topology snapshot."
    );
    tick(5000);
  }));

  it("keeps node summaries, dialog behavior, and fidelity messaging working while filtered", fakeAsync(() => {
    loadTopologyWithProvenanceMix();

    component.toggleProvenanceFilter("prometheus");
    component.toggleProvenanceFilter("admin");
    fixture.detectChanges();

    expect(component.effectiveProvenanceFilters()).toEqual(["derived"]);
    expect(component.nodeSummaries.length).toBeGreaterThan(0);
    expect(component.coverageFocusNodes().length).toBeGreaterThan(0);
    expect(component.graphFilterNotice()).toContain(
      "Counts, rankings, and Snapshot Fidelity still describe the full topology snapshot."
    );
    expect(component.topologyFidelityMessage()).toContain("snapshot");

    component["openNodeInfo"]({
      id: "java-governance",
      label: "Java Governance",
    });
    expect(matDialog.open).toHaveBeenCalled();
    tick(5000);
  }));

  it("parses Phase 15/16 diagnostics block and exposes structural and fallback-derived counts", fakeAsync(() => {
    flushLiveTopology(
      {
        nodes: [
          { id: "frontend", label: "Frontend" },
          { id: "backend", label: "Backend" },
          { id: "zookeeper", label: "Zookeeper" },
          { id: "kafka", label: "Kafka" },
        ],
        links: [
          { source: "frontend", target: "backend" },
          { source: "zookeeper", target: "kafka" },
        ],
      },
      {
        timing_drift_ns: 5,
        diagnostics: {
          structuralDerivedLinkCount: 3,
          fallbackDerivedLinkCount: 2,
          fallbackDerivedLinks: ["zookeeper->kafka", "prom->grafana"],
          measurementPathCounts: {
            "direct-prometheus": 18,
            "derived-model": 5,
          },
        },
        links: {
          "frontend->backend": {
            currentMBps: 10,
            maxMBps: 20,
            confidencePct: 96,
            source: "prometheus",
            measurementPath: "direct-prometheus",
          },
          "zookeeper->kafka": {
            currentMBps: 0,
            maxMBps: 5,
            confidencePct: 48,
            source: "derived",
            measurementPath: "derived-model",
          },
        },
      }
    );
    component["stopLivePoll"]();
    fixture.detectChanges();

    expect(component.hasDiagnosticsData).toBe(true);
    expect(component.structuralDerivedLinkCount).toBe(3);
    expect(component.fallbackDerivedLinkCount).toBe(2);
    // DOM rendering is inside the Snapshot Fidelity tab panel which is only
    // materialised after the tab is selected; verify component state reflects
    // the parsed backend diagnostics contract rather than checking inactive-tab
    // text content in the unit test environment.
    tick(5000);
  }));
});
