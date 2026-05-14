import { HttpClient } from "@angular/common/http";
import { TestBed } from "@angular/core/testing";
import { of, throwError } from "rxjs";
import { DataSourceService } from "./data-source.service";
import { RequestCacheService } from "./request-cache.service";
import { StartupWarmService } from "./startup-warm.service";
import { prefetchAladin } from "./aladin-prefetch.service";

jest.mock("./aladin-prefetch.service", () => ({
  prefetchAladin: jest.fn(),
}));

describe("StartupWarmService", () => {
  const mockedPrefetchAladin = jest.mocked(prefetchAladin);

  beforeEach(() => {
    jest.useFakeTimers();
    mockedPrefetchAladin.mockClear();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("warms browser and network caches in live mode", () => {
    const emitted: Array<[string, unknown]> = [];
    const http = {
      get: jest.fn((url: string) => {
        switch (url) {
          case "/api/proxy/prometheus":
            return throwError(() => new Error("prometheus offline"));
          case "/api/diagnostics":
            return of({ path: "/diag", files: ["report.log"] });
          case "/api/v1/pulsar/status":
            return throwError(() => new Error("pulsar offline"));
          case "/api/topology":
            return of({ nodes: [{ id: "n1" }], links: [] });
          case "/api/forge/health":
            return throwError(() => new Error("forge offline"));
          case "/api/v1/rabbitmq/status":
            return throwError(() => new Error("rabbit offline"));
          default:
            throw new Error(`Unexpected URL: ${url}`);
        }
      }),
    };
    const cache = {
      getOrCreate: jest.fn(
        (
          key: string,
          _ttlMs: number,
          factory: () => ReturnType<HttpClient["get"]>
        ) => {
          factory().subscribe((value) => emitted.push([key, value]));
          return of(null);
        }
      ),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: HttpClient, useValue: http },
        { provide: DataSourceService, useValue: { mode: "live" } },
        { provide: RequestCacheService, useValue: cache },
      ],
    });

    const service = TestBed.inject(StartupWarmService);
    service.warm();

    jest.advanceTimersByTime(250);
    expect(mockedPrefetchAladin).toHaveBeenCalledTimes(1);
    expect(cache.getOrCreate).not.toHaveBeenCalled();

    jest.advanceTimersByTime(250);

    expect(cache.getOrCreate).toHaveBeenCalledTimes(6);
    expect(http.get).toHaveBeenCalledTimes(6);
    expect(http.get).toHaveBeenCalledWith("/api/proxy/prometheus", {
      params: { query: "sum(up)" },
      responseType: "text",
    });
    expect(emitted).toEqual([
      ["telemetry:instant:sum(up)", "0"],
      ["diagnostics:index", { path: "/diag", files: ["report.log"] }],
      ["diagnostics:pulsar-status", { brokers: 0, topics: 0, partitions: 0 }],
      ["topology:index", { nodes: [{ id: "n1" }], links: [] }],
      ["forge:health", { status: "offline" }],
      ["diagnostics:rabbit-status", { status: "unknown", connection: "unknown" }],
    ]);
  });

  it("does not warm network caches in mock mode", () => {
    const http = { get: jest.fn() };
    const cache = { getOrCreate: jest.fn(() => of(null)) };

    TestBed.configureTestingModule({
      providers: [
        { provide: HttpClient, useValue: http },
        { provide: DataSourceService, useValue: { mode: "mock" } },
        { provide: RequestCacheService, useValue: cache },
      ],
    });

    const service = TestBed.inject(StartupWarmService);
    service.warm();

    jest.advanceTimersByTime(500);

    expect(mockedPrefetchAladin).toHaveBeenCalledTimes(1);
    expect(cache.getOrCreate).not.toHaveBeenCalled();
    expect(http.get).not.toHaveBeenCalled();
  });

  it("does not warm network caches when HttpClient is unavailable", () => {
    const cache = { getOrCreate: jest.fn(() => of(null)) };

    TestBed.configureTestingModule({
      providers: [
        { provide: HttpClient, useValue: null },
        { provide: DataSourceService, useValue: { mode: "live" } },
        { provide: RequestCacheService, useValue: cache },
      ],
    });

    const service = TestBed.inject(StartupWarmService);
    service.warm();

    jest.advanceTimersByTime(500);

    expect(mockedPrefetchAladin).toHaveBeenCalledTimes(1);
    expect(cache.getOrCreate).not.toHaveBeenCalled();
  });

  it("warms only once", () => {
    const http = { get: jest.fn(() => of("ok")) };
    const cache = {
      getOrCreate: jest.fn(
        (
          _key: string,
          _ttlMs: number,
          factory: () => ReturnType<HttpClient["get"]>
        ) => {
          factory().subscribe();
          return of(null);
        }
      ),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: HttpClient, useValue: http },
        { provide: DataSourceService, useValue: { mode: "live" } },
        { provide: RequestCacheService, useValue: cache },
      ],
    });

    const service = TestBed.inject(StartupWarmService);
    service.warm();
    service.warm();

    jest.advanceTimersByTime(500);

    expect(mockedPrefetchAladin).toHaveBeenCalledTimes(1);
    expect(cache.getOrCreate).toHaveBeenCalledTimes(6);
    expect(http.get).toHaveBeenCalledTimes(6);
  });
});
