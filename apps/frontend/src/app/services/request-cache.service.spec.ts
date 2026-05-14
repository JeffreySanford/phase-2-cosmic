import { firstValueFrom, of } from "rxjs";
import { RequestCacheService } from "./request-cache.service";

describe("RequestCacheService", () => {
  let service: RequestCacheService;

  beforeEach(() => {
    service = new RequestCacheService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("reuses cached values until the TTL expires", async () => {
    let now = 1_000;
    jest.spyOn(Date, "now").mockImplementation(() => now);
    const factory = jest.fn(() => of("cached"));

    const first$ = service.getOrCreate("telemetry", 500, factory);
    const second$ = service.getOrCreate("telemetry", 500, factory);

    expect(await firstValueFrom(first$)).toBe("cached");
    expect(await firstValueFrom(second$)).toBe("cached");
    expect(factory).toHaveBeenCalledTimes(1);

    now = 1_600;
    const third$ = service.getOrCreate("telemetry", 500, factory);

    expect(await firstValueFrom(third$)).toBe("cached");
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("clears the full cache or only matching prefixes", async () => {
    jest.spyOn(Date, "now").mockReturnValue(500);

    const alphaFactory = jest.fn(() => of("alpha"));
    const betaFactory = jest.fn(() => of("beta"));

    await firstValueFrom(service.getOrCreate("alpha:1", 1_000, alphaFactory));
    await firstValueFrom(service.getOrCreate("beta:1", 1_000, betaFactory));

    service.clear("alpha:");

    await firstValueFrom(service.getOrCreate("alpha:1", 1_000, alphaFactory));
    await firstValueFrom(service.getOrCreate("beta:1", 1_000, betaFactory));

    expect(alphaFactory).toHaveBeenCalledTimes(2);
    expect(betaFactory).toHaveBeenCalledTimes(1);

    service.clear();

    await firstValueFrom(service.getOrCreate("beta:1", 1_000, betaFactory));
    expect(betaFactory).toHaveBeenCalledTimes(2);
  });
});
