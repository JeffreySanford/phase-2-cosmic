import { ComponentFixture, TestBed } from "@angular/core/testing";
import { PromqlCardComponent } from "./promql-card.component";
import { TelemetryService } from "../../services/telemetry.service";
import { LoadProfileService } from "../../services/load-profile.service";
import { of } from "rxjs";
import { MatCardModule } from "@angular/material/card";
import { MatButtonModule } from "@angular/material/button";

describe("PromqlCardComponent", () => {
  let component: PromqlCardComponent;
  let fixture: ComponentFixture<PromqlCardComponent>;

  const mockTelemetry = {
    queryRange: () =>
      of({
        data: {
          result: [
            {
              values: [
                [1, "1"],
                [2, "2"],
                [3, "3"],
              ],
            },
          ],
        },
      }),
  } as unknown as TelemetryService;

  const mockLoadProfile = {
    pollingMs$: of(1000),
    profile$: of(50),
  } as unknown as LoadProfileService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MatCardModule, MatButtonModule],
      declarations: [PromqlCardComponent],
      providers: [
        { provide: TelemetryService, useValue: mockTelemetry },
        { provide: LoadProfileService, useValue: mockLoadProfile },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PromqlCardComponent);
    component = fixture.componentInstance;
    component.query = "up";
    component.title = "Test";
    fixture.detectChanges();
  });

  it("creates", () => {
    expect(component).toBeTruthy();
  });

  it("loads aligned value and sparkline data on refresh", (done) => {
    component.refresh();
    setTimeout(() => {
      expect(component.currentValue$.value).toBe(3);
      expect(component.points$.value.length).toBeGreaterThan(0);
      expect(component.path$.value).toContain("M");
      done();
    }, 50);
  });

  it("formats percent metrics using a stable percent domain", () => {
    component.query =
      '100 * sum(rate(process_cpu_seconds_total{job=~"data-generator|java-ingest"}[1m]))';
    component.currentValue$.next(96.25);

    expect(component.displayValue()).toBe("96.3%");
  });

  it("has default tone of cyan", () => {
    expect(component.tone).toBe("cyan");
  });

  it("accepts different tone values", () => {
    component.tone = "violet";
    fixture.detectChanges();
    expect(component.tone).toBe("violet");

    component.tone = "amber";
    fixture.detectChanges();
    expect(component.tone).toBe("amber");
  });
});
