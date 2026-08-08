import { ComponentFixture, TestBed } from "@angular/core/testing";
import { LakehousePanelComponent } from "./lakehouse-panel.component";

describe("LakehousePanelComponent", () => {
  let fixture: ComponentFixture<LakehousePanelComponent>;
  let component: LakehousePanelComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LakehousePanelComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(LakehousePanelComponent);
    component = fixture.componentInstance;
    component.summary = {
      source: "live",
      bronzeState: "Bronze ingest active",
      silverQuality: "97.4% pass",
      goldReadiness: "Ready for analyst review",
      evidence: "ESO ObsCore proof slice",
      bronzePercent: 86,
      silverPercent: 72,
      goldPercent: 41,
      qualityFailureRate: 1.2,
      transferTimeEstimate: "~3.2 min",
      upstream: {
        kind: "eso-obscore",
        endpoint: "https://archive.eso.org/tap_obs",
        query: "SELECT TOP 5 ... FROM ivoa.ObsCore",
        rowCount: 5,
      },
      persistedAt: "2026-08-07T18:00:00.000Z",
      freshness: {
        maxAgeMs: 15 * 60 * 1000,
        lastUpdatedAt: "2026-08-07T18:05:00.000Z",
        stale: false,
      },
    };
    fixture.detectChanges();
  });

  it("renders the Lakehouse summary details", () => {
    const text = fixture.nativeElement.textContent;
    expect(text).toContain("Bronze ingest active");
    expect(text).toContain("97.4% pass");
    expect(text).toContain("ESO ObsCore proof slice");
    expect(text).toContain("~3.2 min");
  });

  it("reflects stale freshness metadata", () => {
    component.summary = {
      ...component.summary,
      freshness: {
        ...component.summary.freshness!,
        stale: true,
      },
    };
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain("stale");
    expect(text).toContain("Needs refresh");
  });
});
