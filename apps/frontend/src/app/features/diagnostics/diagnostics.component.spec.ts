import { TestBed, ComponentFixture } from "@angular/core/testing";
import { Component, Input } from "@angular/core";
import { DiagnosticsComponent } from "./diagnostics.component";
import { BehaviorSubject } from "rxjs";
import { PulsarStatus } from "../../shared/types";

@Component({ selector: "app-promql-card", template: "" })
class PromqlCardStubComponent {
  @Input() query?: string;
  @Input() title?: string;
  @Input() tone?: string;
}

@Component({ selector: "app-pulsar-status", template: "" })
class PulsarStatusStubComponent {
  @Input() status?: Partial<PulsarStatus>;
}

@Component({ selector: "app-disclaimer-banner", template: "" })
class DisclaimerBannerStubComponent {
  @Input() dismissible?: boolean;
  @Input() type?: string;
  @Input() message?: string;
  @Input() ready?: boolean;
}
import {
  HttpClientTestingModule,
  HttpTestingController,
} from "@angular/common/http/testing";
import { MatButtonModule } from "@angular/material/button";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatSelectModule } from "@angular/material/select";
import { MatCardModule } from "@angular/material/card";
import { MatIconModule } from "@angular/material/icon";
import { MatTabsModule } from "@angular/material/tabs";
import { MatSlideToggleModule } from "@angular/material/slide-toggle";
import { NoopAnimationsModule } from "@angular/platform-browser/animations";
import { LoadProfileService } from "../../services/load-profile.service";

describe("DiagnosticsComponent", () => {
  let fixture: ComponentFixture<DiagnosticsComponent>;
  let comp: DiagnosticsComponent;
  let httpMock: HttpTestingController;
  const pollingMsSubject = new BehaviorSubject<number>(5000);

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        HttpClientTestingModule,
        MatButtonModule,
        MatFormFieldModule,
        MatSelectModule,
        MatCardModule,
        MatIconModule,
        MatTabsModule,
        MatSlideToggleModule,
        NoopAnimationsModule,
      ],
      declarations: [
        DiagnosticsComponent,
        PromqlCardStubComponent,
        PulsarStatusStubComponent,
        DisclaimerBannerStubComponent,
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
    }).compileComponents();

    fixture = TestBed.createComponent(DiagnosticsComponent);
    comp = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
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
    httpMock.verify();
  });

  it("fetches index and system-specs", () => {
    fixture.detectChanges();
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
    expect(comp.dockerServices.length).toBe(2);
    expect(comp.dockerServices[0].name).toBe("Pulsar");
    expect(comp.dockerServices[0].latencyMs).toBe(15);
    expect(comp.dockerServices[1].error).toBe("connection_refused");

    // stub misc status/metrics calls to satisfy httpMock.verify
    httpMock
      .expectOne("/api/v1/pulsar/status")
      .flush({ brokers: 0, topics: 0, partitions: 0 });
    httpMock
      .expectOne("/api/v1/rabbitmq/status")
      .flush({ status: "unavailable", connection: "none" });
    httpMock.expectOne("/api/metrics/topology").flush({});
  });

  it("handles docker services with all status types", () => {
    fixture.detectChanges();
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
  });

  it("fetches timing/rfi metrics on init", () => {
    fixture.detectChanges();
    httpMock.expectOne("/api/diagnostics").flush({ path: "/tmp", files: [] });
    httpMock.expectOne("/api/diagnostics/docker-services").flush([]);

    const metricsReq = httpMock.expectOne("/api/metrics/topology");
    metricsReq.flush({ timing_drift_ns: 123, rfi_event_rate: 5 });
    expect(comp.timingDriftNs).toBe(123);
    expect(comp.rfiEventRate).toBe(5);
    // DOM metrics are only visible under the second tab; component state is sufficient for unit test
  });

  it("fetches Pulsar status on init and polling", () => {
    fixture.detectChanges();
    httpMock.expectOne("/api/diagnostics").flush({ path: "/tmp", files: [] });
    httpMock.expectOne("/api/diagnostics/docker-services").flush([]);

    // Should fetch Pulsar status on init
    const pulsarReq = httpMock.expectOne("/api/v1/pulsar/status");
    pulsarReq.flush({
      brokers: 3,
      topics: 15,
      partitions: 45,
    });
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
    expect(comp.rabbitMQStatus.status).toBe("connected");
    expect(comp.rabbitMQStatus.connection).toBe("connected");
  });

  it("handles Pulsar status error gracefully", () => {
    fixture.detectChanges();
    httpMock.expectOne("/api/diagnostics").flush({ path: "/tmp", files: [] });
    httpMock.expectOne("/api/diagnostics/docker-services").flush([]);

    const pulsarReq = httpMock.expectOne("/api/v1/pulsar/status");
    pulsarReq.error(new ErrorEvent("network error"));

    expect(comp.pulsarStatus.brokers).toBe(0);
    expect(comp.pulsarStatus.topics).toBe(0);
    expect(comp.pulsarStatus.partitions).toBe(0);
  });

  it("handles RabbitMQ status error gracefully", () => {
    fixture.detectChanges();
    httpMock.expectOne("/api/diagnostics").flush({ path: "/tmp", files: [] });
    httpMock.expectOne("/api/diagnostics/docker-services").flush([]);

    httpMock
      .expectOne("/api/v1/pulsar/status")
      .flush({ brokers: 1, topics: 1, partitions: 1 });

    const rabbitReq = httpMock.expectOne("/api/v1/rabbitmq/status");
    rabbitReq.error(new ErrorEvent("connection refused"));

    expect(comp.rabbitMQStatus.status).toBe("unavailable");
    expect(comp.rabbitMQStatus.connection).toBe("error");
    expect(comp.rabbitMQStatus.error).toBeDefined();
  });
});
