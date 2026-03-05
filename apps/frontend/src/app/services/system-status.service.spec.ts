import { TestBed } from "@angular/core/testing";
import {
  HttpClientTestingModule,
  HttpTestingController,
} from "@angular/common/http/testing";
import { firstValueFrom } from "rxjs";
import { skip, take } from "rxjs/operators";
import { SystemStatusService } from "./system-status.service";
import { DataSourceService } from "./data-source.service";
import { MockDataService } from "./mock-data.service";

describe("SystemStatusService", () => {
  let httpMock: HttpTestingController;

  afterEach(() => {
    httpMock.verify();
  });

  it("builds a healthy multi-service status in live mode", async () => {
    await TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        { provide: DataSourceService, useValue: { mode: "live" } },
        { provide: MockDataService, useValue: { mockSystemStatus: jest.fn() } },
      ],
    }).compileComponents();

    const service = TestBed.inject(SystemStatusService);
    httpMock = TestBed.inject(HttpTestingController);
    const statusPromise = firstValueFrom(
      service.status$.pipe(skip(1), take(1))
    );

    httpMock
      .expectOne("/api/v1/health")
      .flush({}, { status: 200, statusText: "OK" });
    httpMock
      .expectOne("/api/proxy/prometheus?query=sum(up)")
      .flush({}, { status: 200, statusText: "OK" });
    httpMock
      .expectOne("/api/diagnostics")
      .flush(
        { path: "diagnostics logs", files: [] },
        { status: 200, statusText: "OK" }
      );

    const status = await statusPromise;
    expect(status.health).toBe("healthy");
    expect(status.services).toEqual({
      governance: "online",
      telemetry: "online",
      diagnostics: "online",
    });
  });

  it("uses mock status semantics when the app is in mock mode", async () => {
    await TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        { provide: DataSourceService, useValue: { mode: "mock" } },
        {
          provide: MockDataService,
          useValue: {
            mockSystemStatus: () => ({
              subscribe: (
                fn: (value: {
                  health: "healthy";
                  lastCheck: Date;
                  message: string;
                  services: { governance: "online"; streaming: "online" };
                }) => void
              ) =>
                fn({
                  health: "healthy",
                  lastCheck: new Date(),
                  message: "mock",
                  services: { governance: "online", streaming: "online" },
                }),
            }),
          },
        },
      ],
    }).compileComponents();

    const service = TestBed.inject(SystemStatusService);
    httpMock = TestBed.inject(HttpTestingController);

    const status = service.getCurrentStatus();
    expect(status.health).toBe("healthy");
    expect(status.message).toBe("Mock data mode active");
    expect(status.services.telemetry).toBe("online");
    expect(status.services.diagnostics).toBe("online");
  });
});
