import { provideHttpClient } from "@angular/common/http";
import { TestBed } from "@angular/core/testing";
import { PipelineTelemetryComponent } from "./pipeline-telemetry.component";

describe("PipelineTelemetryComponent", () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PipelineTelemetryComponent],
      providers: [provideHttpClient()],
    }).compileComponents();
  });

  it("keeps unimplemented Lakehouse stages explicit", () => {
    const fixture = TestBed.createComponent(PipelineTelemetryComponent);
    const component = fixture.componentInstance;

    expect(component.lakehouseStages.map((stage) => stage.status)).toEqual([
      "Not implemented",
      "Not implemented",
      "Not implemented",
    ]);
  });

  it("labels authoritative telemetry sources as measured", () => {
    const fixture = TestBed.createComponent(PipelineTelemetryComponent);
    const component = fixture.componentInstance;

    expect(component.sourceLabel("prometheus")).toContain("Measured");
    expect(component.sourceLabel("admin")).toContain("Measured");
    expect(component.sourceLabel("mock")).toContain("test/demo only");
    expect(component.sourceLabel("unavailable")).toBe("Unavailable");
  });

  it("models the configured segment distribution as 48:24:21", () => {
    const fixture = TestBed.createComponent(PipelineTelemetryComponent);
    const component = fixture.componentInstance;

    const total = component.segments.reduce(
      (sum, segment) => sum + segment.expectedPct,
      0
    );
    expect(total).toBeCloseTo(100, 5);
    expect(component.segments[0].name).toBe("main");
    expect(component.segments[0].expectedPct).toBeCloseTo((48 / 93) * 100, 5);
  });

  it("uses the Prometheus scrape cadence for raw sample evidence", () => {
    const fixture = TestBed.createComponent(PipelineTelemetryComponent);
    const component = fixture.componentInstance;

    expect(component.prometheusScrapeIntervalSec).toBe(15);
  });
});
