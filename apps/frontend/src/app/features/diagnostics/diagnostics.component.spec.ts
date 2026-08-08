import {
  TestBed,
  ComponentFixture,
  fakeAsync,
  tick,
} from "@angular/core/testing";
import { Component, Input } from "@angular/core";
import { DiagnosticsComponent } from "./diagnostics.component";
import { BehaviorSubject } from "rxjs";
import { PulsarStatus } from "../../shared/types";

@Component({ selector: "app-promql-card", template: "", standalone: true })
class PromqlCardStubComponent {
  @Input() query?: string;
  @Input() title?: string;
  @Input() tone?: string;
}

@Component({ selector: "app-pulsar-status", template: "", standalone: true })
class PulsarStatusStubComponent {
  @Input() status?: Partial<PulsarStatus>;
}

@Component({ selector: "app-rabbitmq-status", template: "", standalone: true })
class RabbitMQStatusStubComponent {
  @Input() status?: unknown;
}

@Component({ selector: "app-disclaimer-banner", template: "", standalone: true })
class DisclaimerBannerStubComponent {
  @Input() dismissible?: boolean;
  @Input() type?: string;
  @Input() message?: string;
  @Input() ready?: boolean;
}

@Component({ selector: "app-trident-allocator", template: "", standalone: true })
class TridentAllocatorStubComponent {
  @Input() dismissible?: boolean;
  @Input() type?: string;
  @Input() message?: string;
  @Input() ready?: boolean;
}

@Component({ selector: "app-job-events", template: "", standalone: true })
class JobEventsStubComponent {}
import {
  HttpClientTestingModule,
  HttpTestingController,
} from "@angular/common/http/testing";
import { FormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatSelectModule } from "@angular/material/select";
import { MatCardModule } from "@angular/material/card";
import { MatIconModule } from "@angular/material/icon";
import { MatTabsModule } from "@angular/material/tabs";
import { NoopAnimationsModule } from "@angular/platform-browser/animations";
import { LoadProfileService } from "../../services/load-profile.service";
import { DisclaimerBannerModule } from "../../shared/disclaimer-banner/disclaimer-banner.module";
import { TelemetryModule } from "../telemetry/telemetry.module";
import { DiagnosticsModule } from "./diagnostics.module";

describe("DiagnosticsComponent", () => {
  let fixture: ComponentFixture<DiagnosticsComponent>;
  let comp: DiagnosticsComponent;
  let httpMock: HttpTestingController;
  const pollingMsSubject = new BehaviorSubject<number>(5000);
  let logSpy: jest.SpyInstance;

  function startComponent(): void {
    fixture.detectChanges();
    tick();
    fixture.detectChanges();
  }

  function settleView(): void {
    tick();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    await TestBed.configureTestingModule({
      imports: [
        HttpClientTestingModule,
        FormsModule,
        MatButtonModule,
        MatFormFieldModule,
        MatSelectModule,
        MatCardModule,
        MatIconModule,
        MatTabsModule,
        NoopAnimationsModule,
        DiagnosticsComponent,
      ],
      providers: [
        // Prevent real MockDataService construction which would call LoadProfileService
        {
          provide: (
            await import("../../services/mock-data.service")
          ).MockDataService,
          useValue: {
            diagnosticsIndex: () => ({
              subscribe: (
                fn: (val: { path: string; files: string[] }) => void
              ) => fn({ path: "/tmp", files: [] }),
            }),
            systemSpecsText: () => ({
              subscribe: (fn: (val: string) => void) => fn("mock specs"),
            }),
            mockDockerServices: () => ({
              subscribe: (fn: (val: unknown[]) => void) => fn([]),
            }),
          },
        },
        {
          provide: LoadProfileService,
          useValue: {
            pollingMs$: pollingMsSubject.asObservable(),
            profile$: new BehaviorSubject(10).asObservable(),
            current: 10,
          },
        },
      ],
    })
      .overrideComponent(DiagnosticsComponent, {
        remove: {
          imports: [DisclaimerBannerModule, TelemetryModule, DiagnosticsModule],
        },
        add: {
          imports: [
            PromqlCardStubComponent,
            PulsarStatusStubComponent,
            RabbitMQStatusStubComponent,
            DisclaimerBannerStubComponent,
            TridentAllocatorStubComponent,
            JobEventsStubComponent,
          ],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(DiagnosticsComponent);
    comp = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    if (!httpMock) {
      logSpy.mockRestore();
      return;
    }
    // catch any outstanding status/metrics requests
    try {
      httpMock.expectOne("/api/metrics/topology").flush({});
    } catch {
      // intentionally ignore if no request was pending
    }
    try {
      httpMock
        .expectOne("/api/v1/pulsar/status")
        .flush({ brokers: 0, topics: 0, partitions: 0 });
    } catch {
      // ignore absence
    }
    try {
      httpMock
        .expectOne("/api/v1/rabbitmq/status")
        .flush({ status: "unavailable", connection: "none" });
    } catch {
      // ignore absence
    }
    try {
      httpMock
        .expectOne("/api/v1/vo/services")
        .flush({ tapUrl: null, dataLinkUrl: null });
    } catch {
      // ignore absence
    }
    try {
      httpMock.expectOne("/api/v1/commissioning/scenarios").flush([]);
    } catch {
      // ignore absence
    }
    // ensure diagnostics index and docker services also get flushed
    try {
      httpMock.expectOne("/api/diagnostics").flush({ path: "/tmp", files: [] });
    } catch {
      // ignore absence
    }
    try {
      httpMock.expectOne("/api/diagnostics/docker-services").flush([]);
    } catch {
      // ignore absence
    }
    try {
      httpMock.expectOne("/api/diagnostics/database-benchmarks").flush({
        generatedAt: new Date().toISOString(),
        source: "mock",
        postgres: {
          status: "healthy",
          connection: "mock",
          host: "local-postgres",
          database: "mock",
          activeConnections: 3,
          latencyMs: 2,
          details: "mock",
        },
        benchmarks: {
          ingestRatePerSec: 128,
          ingestBytesPerSec: 1048576,
          averageLatencyMs: 9,
          queueDepth: 4,
          activeJobs: 2,
          failureRatePerSec: 0,
          throughputMbPerSec: 1,
        },
      });
    } catch {
      // ignore absence
    }
    httpMock.verify();
    logSpy.mockRestore();
  });

  it("renders the database and benchmarks tab", fakeAsync(() => {
    startComponent();
    settleView();

    const tabButtons = Array.from(
      fixture.nativeElement.querySelectorAll(".mat-mdc-tab, [role='tab']") as NodeListOf<HTMLElement>
    );
    const dbTab = tabButtons.find((button) =>
      button.textContent?.includes("Database & Benchmarks")
    );

    expect(dbTab).toBeTruthy();
    dbTab?.click();
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    comp.databaseMetrics = {
      generatedAt: new Date().toISOString(),
      source: "prometheus",
      postgres: {
        status: "healthy",
        connection: "configured",
        host: "postgres",
        database: "cosmic",
        activeConnections: 2,
        latencyMs: 3,
        details: "ready",
      },
      benchmarks: {
        ingestRatePerSec: 128,
        ingestBytesPerSec: 1048576,
        averageLatencyMs: 9,
        queueDepth: 4,
        activeJobs: 2,
        failureRatePerSec: 0,
        throughputMbPerSec: 1,
      },
      prometheus: {
        available: true,
        queries: [{ query: "pg_up", label: "pg_up", value: 1 }],
      },
    } as any;
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent ?? "";
    expect(text).toContain("Database & Benchmarks");
    expect(text).toContain("Postgres");
    expect(text).toContain("Benchmarks");
    expect(text).toContain("Source details");
    expect(text).toContain("Prometheus signals");
    expect(text).toContain("pg_up");
  }));

  it("formats diagnostics source labels for the monitoring dashboard", () => {
    expect(comp.getSourceLabel("postgres")).toBe("PostgreSQL native");
    expect(comp.getSourceLabel("prometheus")).toBe("Prometheus");
    expect(comp.getSourceLabel("mock")).toBe("Mock");
    expect(comp.getSourceLabel("fallback")).toBe("Fallback");
    expect(comp.getSourceLabel("live")).toBe("Live");
  });

  it("uses distinct copy for refreshing and refreshed states", fakeAsync(() => {
    startComponent();
    comp.databaseMetrics = {
      generatedAt: new Date().toISOString(),
      source: "mock",
      postgres: {
        status: "healthy",
        connection: "mock",
        host: "local-postgres",
        database: "mock",
        activeConnections: 3,
        latencyMs: 2,
        details: "mock",
      },
      benchmarks: {
        ingestRatePerSec: 128,
        ingestBytesPerSec: 1048576,
        averageLatencyMs: 9,
        queueDepth: 4,
        activeJobs: 2,
        failureRatePerSec: 0,
        throughputMbPerSec: 1,
      },
    } as any;

    comp.lastMetricsRefreshStatus = "refreshing";
    const tabButtons = Array.from(
      fixture.nativeElement.querySelectorAll(".mat-mdc-tab, [role='tab']") as NodeListOf<HTMLElement>
    );
    const dbTab = tabButtons.find((button) =>
      button.textContent?.includes("Database & Benchmarks")
    );
    dbTab?.click();
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain("Refreshing metrics…");
    expect(
      fixture.nativeElement.querySelector(".refresh-status")?.getAttribute("title")
    ).toContain("Refresh in progress");

    comp.lastMetricsRefreshAt = new Date(Date.now() - 30_000);
    comp.lastMetricsRefreshStatus = "success";
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("Last refreshed");
    expect(fixture.nativeElement.textContent).toContain("just now");
    expect(fixture.nativeElement.textContent).toContain("▲");
  }));

  it("fetches index and system-specs", fakeAsync(() => {
    startComponent();
    const req = httpMock.expectOne("/api/diagnostics");
    req.flush({
      path: "/tmp/logs",
      files: [
        ".gitkeep",
        "system-specs.txt",
        "payloads.log.20260302T172915Z",
        "payloads.log.20260302T170944Z",
      ],
    });
    settleView();
    expect(comp.index).toBeTruthy();
    expect(comp.visibleFileCount).toBe(5);
    expect(comp.visibleFiles.length).toBe(3);
    expect(comp.visibleFiles[0]).toBe("payloads.log.20260302T172915Z");
    comp.setVisibleFileCount(-1);
    expect(comp.visibleFiles.length).toBe(3);
    // request system-specs
    comp.viewSystemSpecs();
    const req2 = httpMock.expectOne("/api/diagnostics/system-specs");
    req2.flush("cpu: test");
    settleView();
    expect(comp.systemSpecs).toContain("cpu: test");
    // docker services called on init
    const req3 = httpMock.expectOne("/api/diagnostics/docker-services");
    req3.flush([
      {
        name: "Pulsar",
        status: "online",
        details: "127.0.0.1:6650",
        latencyMs: 15,
        icon: "cloud_queue",
      },
      {
        name: "Kafka",
        status: "offline",
        details: "127.0.0.1:9092",
        error: "connection_refused",
        latencyMs: 3000,
        icon: "stream",
      },
    ]);
    settleView();
    // Pulsar is filtered out by the component; only Kafka remains
    expect(comp.dockerServices.length).toBe(1);
    expect(comp.dockerServices[0].name).toBe("Kafka");
    expect(comp.dockerServices[0].error).toBe("connection_refused");

    // stub misc status/metrics calls to satisfy httpMock.verify
    httpMock
      .expectOne("/api/v1/pulsar/status")
      .flush({ brokers: 0, topics: 0, partitions: 0 });
    httpMock
      .expectOne("/api/v1/rabbitmq/status")
      .flush({ status: "unavailable", connection: "none" });
    httpMock.expectOne("/api/metrics/topology").flush({});
    settleView();
  }));

  it("handles docker services with all status types", fakeAsync(() => {
    startComponent();
    httpMock.expectOne("/api/diagnostics").flush({ path: "/tmp", files: [] });
    const req = httpMock.expectOne("/api/diagnostics/docker-services");
    req.flush([
      {
        name: "Prometheus",
        status: "online",
        details: "http://127.0.0.1:9090",
        latencyMs: 12,
        icon: "monitoring",
      },
      {
        name: "Grafana",
        status: "offline",
        details: "http://127.0.0.1:3000",
        error: "timeout",
        icon: "dashboard",
      },
      {
        name: "Redis",
        status: "unknown",
        details: "127.0.0.1:6379",
        error: "dns_error",
        icon: "memory",
      },
    ]);
    settleView();
    expect(comp.dockerServices.length).toBe(3);
    expect(comp.dockerServices[0].status).toBe("online");
    expect(comp.dockerServices[1].status).toBe("offline");
    expect(comp.dockerServices[2].status).toBe("unknown");

    // stub status/metrics endpoints
    httpMock
      .expectOne("/api/v1/pulsar/status")
      .flush({ brokers: 0, topics: 0, partitions: 0 });
    httpMock
      .expectOne("/api/v1/rabbitmq/status")
      .flush({ status: "unavailable", connection: "none" });
    httpMock.expectOne("/api/metrics/topology").flush({});
    settleView();
  }));

  it("refreshes database metrics on the polling cadence", fakeAsync(() => {
    startComponent();
    httpMock.expectOne("/api/diagnostics").flush({ path: "/tmp", files: [] });
    httpMock.expectOne("/api/diagnostics/docker-services").flush([]);
    const initialMetricsReq = httpMock.expectOne("/api/diagnostics/database-benchmarks");
    initialMetricsReq.flush({
      generatedAt: new Date().toISOString(),
      source: "prometheus",
      postgres: {
        status: "healthy",
        connection: "configured",
        host: "postgres",
        database: "cosmic",
        activeConnections: 2,
        latencyMs: 3,
        details: "ready",
      },
      benchmarks: {
        ingestRatePerSec: 111,
        ingestBytesPerSec: 222,
        averageLatencyMs: 4,
        queueDepth: 5,
        activeJobs: 6,
        failureRatePerSec: 0.2,
        throughputMbPerSec: 7,
      },
    });

    tick(5000);
    const refreshedMetricsReq = httpMock.expectOne("/api/diagnostics/database-benchmarks");
    refreshedMetricsReq.flush({
      generatedAt: new Date().toISOString(),
      source: "postgres",
      postgres: {
        status: "healthy",
        connection: "configured",
        host: "postgres",
        database: "cosmic",
        activeConnections: 4,
        latencyMs: 6,
        details: "ready",
      },
      benchmarks: {
        ingestRatePerSec: 333,
        ingestBytesPerSec: 444,
        averageLatencyMs: 8,
        queueDepth: 9,
        activeJobs: 10,
        failureRatePerSec: 0.4,
        throughputMbPerSec: 11,
      },
    });

    settleView();
    expect(comp.databaseMetrics?.source).toBe("postgres");
    expect(comp.databaseMetrics?.benchmarks.ingestRatePerSec).toBe(333);
  }));

  it("fetches timing/rfi metrics on init", fakeAsync(() => {
    startComponent();
    httpMock.expectOne("/api/diagnostics").flush({ path: "/tmp", files: [] });
    httpMock.expectOne("/api/diagnostics/docker-services").flush([]);

    const metricsReq = httpMock.expectOne("/api/metrics/topology");
    metricsReq.flush({ timing_drift_ns: 123, rfi_event_rate: 5 });
    settleView();
    expect(comp.timingDriftNs).toBe(123);
    expect(comp.rfiEventRate).toBe(5);
    // DOM metrics are only visible under the second tab; component state is sufficient for unit test
  }));

  it("fetches Pulsar status on init and polling", fakeAsync(() => {
    startComponent();
    httpMock.expectOne("/api/diagnostics").flush({ path: "/tmp", files: [] });
    httpMock.expectOne("/api/diagnostics/docker-services").flush([]);

    // Should fetch Pulsar status on init
    const pulsarReq = httpMock.expectOne("/api/v1/pulsar/status");
    pulsarReq.flush({
      brokers: 3,
      topics: 15,
      partitions: 45,
    });
    settleView();
    expect(comp.pulsarStatus.brokers).toBe(3);
    expect(comp.pulsarStatus.topics).toBe(15);
    expect(comp.pulsarStatus.partitions).toBe(45);

    // Should fetch RabbitMQ status on init
    const rabbitReq = httpMock.expectOne("/api/v1/rabbitmq/status");
    rabbitReq.flush({
      status: "connected",
      connection: "connected",
      queues: { "audit-queue": {}, "control-queue": {} },
      exchanges: { "audit-exchange": {}, "control-exchange": {} },
    });
    settleView();
    expect(comp.rabbitMQStatus.status).toBe("connected");
    expect(comp.rabbitMQStatus.connection).toBe("connected");
    settleView();
  }));

  it("handles Pulsar status error gracefully", fakeAsync(() => {
    startComponent();
    httpMock.expectOne("/api/diagnostics").flush({ path: "/tmp", files: [] });
    httpMock.expectOne("/api/diagnostics/docker-services").flush([]);

    const pulsarReq = httpMock.expectOne("/api/v1/pulsar/status");
    pulsarReq.error(new ErrorEvent("network error"));
    settleView();

    expect(comp.pulsarStatus.brokers).toBe(0);
    expect(comp.pulsarStatus.topics).toBe(0);
    expect(comp.pulsarStatus.partitions).toBe(0);
    settleView();
  }));

  it("handles RabbitMQ status error gracefully", fakeAsync(() => {
    startComponent();
    httpMock.expectOne("/api/diagnostics").flush({ path: "/tmp", files: [] });
    httpMock.expectOne("/api/diagnostics/docker-services").flush([]);

    httpMock
      .expectOne("/api/v1/pulsar/status")
      .flush({ brokers: 1, topics: 1, partitions: 1 });

    const rabbitReq = httpMock.expectOne("/api/v1/rabbitmq/status");
    rabbitReq.error(new ErrorEvent("connection refused"));
    settleView();

    expect(comp.rabbitMQStatus.status).toBe("unavailable");
    expect(comp.rabbitMQStatus.connection).toBe("error");
    expect(comp.rabbitMQStatus.error).toBeDefined();
    settleView();
  }));

  it("fetches commissioning scenarios on init", fakeAsync(() => {
    startComponent();
    httpMock.expectOne("/api/diagnostics").flush({ path: "/tmp", files: [] });
    httpMock.expectOne("/api/diagnostics/docker-services").flush([]);

    const commReq = httpMock.expectOne("/api/v1/commissioning/scenarios");
    commReq.flush([
      {
        id: "antenna_calibration",
        name: "Antenna Calibration",
        type: "aiv",
        description: "Validates antenna calibration parameters.",
        requiredParameters: [
          "antennaId",
          "targetFrequencyMHz",
          "pointingModelVersion",
        ],
      },
      {
        id: "timing_sync",
        name: "Timing Synchronisation",
        type: "aiv",
        description: "Validates timing reference synchronisation.",
        requiredParameters: [
          "referenceElementId",
          "maxDriftNs",
          "syncProtocol",
        ],
      },
    ]);
    settleView();

    expect(comp.commissioningScenarios.length).toBe(2);
    expect(comp.commissioningScenarios[0].id).toBe("antenna_calibration");
    expect(comp.commissioningScenarios[1].id).toBe("timing_sync");
    expect(comp.commissioningLoading).toBe(false);
    expect(comp.commissioningError).toBeNull();
    settleView();
  }));

  it("handles commissioning scenarios fetch error gracefully", fakeAsync(() => {
    startComponent();
    httpMock.expectOne("/api/diagnostics").flush({ path: "/tmp", files: [] });
    httpMock.expectOne("/api/diagnostics/docker-services").flush([]);

    const commReq = httpMock.expectOne("/api/v1/commissioning/scenarios");
    commReq.error(new ErrorEvent("service unavailable"));
    settleView();

    expect(comp.commissioningScenarios.length).toBe(0);
    expect(comp.commissioningLoading).toBe(false);
    expect(comp.commissioningError).toBeDefined();
    settleView();
  }));
});
