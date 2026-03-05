import { ComponentFixture, TestBed } from "@angular/core/testing";
import {
  HttpClientTestingModule,
  HttpTestingController,
} from "@angular/common/http/testing";
import { Component } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { TopologyComponent } from "./topology.component";
import { PageStateModule } from "../../shared/page-state/page-state.module";
import { DataSourceService } from "../../services/data-source.service";
import { MockDataService } from "../../services/mock-data.service";

@Component({ selector: "app-disclaimer-banner", template: "" })
class DisclaimerBannerStubComponent {}

describe("TopologyComponent", () => {
  let component: TopologyComponent;
  let fixture: ComponentFixture<TopologyComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, FormsModule, PageStateModule],
      declarations: [TopologyComponent, DisclaimerBannerStubComponent],
      providers: [
        { provide: DataSourceService, useValue: { mode: "live" } },
        {
          provide: MockDataService,
          useValue: { topologyMetricsForLinks: jest.fn() },
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

  it("should create", () => {
    httpMock.expectOne("/api/topology").flush({ nodes: [], links: [] });
    httpMock.expectOne("/api/metrics/topology").flush({});
    expect(component).toBeTruthy();
  });

  it("renders header text", () => {
    httpMock.expectOne("/api/topology").flush({ nodes: [], links: [] });
    httpMock.expectOne("/api/metrics/topology").flush({});
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector("h1")?.textContent).toContain("Topology");
  });

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
