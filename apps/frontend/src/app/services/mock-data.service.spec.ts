import { TestBed } from "@angular/core/testing";
import { firstValueFrom } from "rxjs";
import { MockDataService } from "./mock-data.service";
import { LoadProfileService } from "./load-profile.service";

describe("MockDataService", () => {
  it("keeps CPU telemetry near saturation at the 100% profile", async () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: LoadProfileService, useValue: { current: 100 } },
        MockDataService,
      ],
    });
    const service = TestBed.inject(MockDataService);

    const res = (await firstValueFrom(
      service.telemetryRange(
        '100 * sum(rate(process_cpu_seconds_total{job=~"data-generator|java-ingest"}[1m]))',
        1_700_000_000,
        1_700_000_300,
        15
      )
    )) as { data?: { result?: Array<{ values?: Array<[number, string]> }> } };

    const values = (res.data?.result?.[0]?.values ?? []).map((entry) =>
      Number(entry[1])
    );

    expect(values.length).toBeGreaterThan(0);
    expect(Math.min(...values)).toBeGreaterThan(85);
    expect(Math.max(...values)).toBeLessThanOrEqual(100);
  });

  it("derives the instant value from the same metric-specific series", async () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: LoadProfileService, useValue: { current: 50 } },
        MockDataService,
      ],
    });
    const service = TestBed.inject(MockDataService);

    const value = await firstValueFrom(
      service.telemetryInstant('up{job="data-generator"}')
    );

    expect([0, 1]).toContain(value);
  });
});
