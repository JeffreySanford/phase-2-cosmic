import {
  ComponentFixture,
  TestBed,
  discardPeriodicTasks,
  fakeAsync,
  tick,
} from "@angular/core/testing";
import {
  HttpClientTestingModule,
  HttpTestingController,
} from "@angular/common/http/testing";
import { TelemetryComponent } from "./telemetry.component";
import { InfraTabsComponent } from "./infra-tabs.component";
import { PulsarStatusComponent } from "./pulsar-status/pulsar-status.component";
import { RabbitMQStatusComponent } from "./rabbitmq-status/rabbitmq-status.component";
import { MatCardModule } from "@angular/material/card";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatSelectModule } from "@angular/material/select";
import { MatButtonModule } from "@angular/material/button";
import { MatTabsModule } from "@angular/material/tabs";
import { MatIconModule } from "@angular/material/icon";
import { MatBadgeModule } from "@angular/material/badge";
import { MatTableModule } from "@angular/material/table";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatExpansionModule } from "@angular/material/expansion";
import { NoopAnimationsModule } from "@angular/platform-browser/animations";
import { By } from "@angular/platform-browser";
import { TelemetryService } from "../../services/telemetry.service";
import { TelemetryChartService } from "../../services/telemetry-chart.service";
import { LoadProfileService } from "../../services/load-profile.service";
import { VoService } from "../../services/vo.service";
import { ActivatedRoute } from "@angular/router";
import {
  asyncScheduler,
  BehaviorSubject,
  Observable,
  of,
  scheduled,
} from "rxjs";
import { SharedModule } from "../../shared/shared.module";
import { InfrastructureTelemetrySnapshot } from "../../shared/types";


function clickTabByLabel(
  fixture: ComponentFixture<TelemetryComponent>,
  label: string,
  occurrence = 0
): void {
  const tabs = fixture.debugElement.queryAll(By.css(".mdc-tab"));
  const matching = tabs.filter((tab) =>
    ((tab.nativeElement.textContent as string) || "").includes(label)
  );
  const target = matching[occurrence];
  if (!target) {
    throw new Error(`Unable to find tab with label: ${label}`);
  }
  (target.nativeElement as HTMLElement).click();
}

function settleTelemetryView(
  fixture: ComponentFixture<TelemetryComponent>,
  ms = 0
): void {
  tick(ms);
  fixture.detectChanges();
}

describe("TelemetryComponent", () => {
  let component: TelemetryComponent;
  let fixture: ComponentFixture<TelemetryComponent>;
  let httpMock: HttpTestingController;
  const pollingMsSubject = new BehaviorSubject<number>(5000);
  const telemetryServiceStub = {
    queryRangeRate: jest.fn(() => of({ data: { result: [{ values: [] }] } })),
    queryInstant: jest.fn(() => of(0)),
    queryRange: jest.fn(() => of({ data: { result: [{ values: [] }] } })),
    getPulsarStatus: jest.fn(() =>
      of({ brokers: 0, topics: 0, partitions: 0 })
    ),
  };

  const telemetryChartServiceStub = {
    initLineChart: jest.fn(() => Promise.resolve()),
    initHistogram: jest.fn(() => Promise.resolve()),
    initGauge: jest.fn(() => Promise.resolve()),
    renderLine: jest.fn(),
    renderHistogram: jest.fn(),
    renderGauge: jest.fn(),
  };

  beforeEach(async () => {
    const mockActivatedRoute = {
      queryParamMap: new BehaviorSubject(new Map()),
    };

    await TestBed.configureTestingModule({
      imports: [
        HttpClientTestingModule,
        MatCardModule,
        MatFormFieldModule,
        MatSelectModule,
        MatButtonModule,
        MatTabsModule,
        MatExpansionModule,
        MatIconModule,
        MatBadgeModule,
        MatTableModule,
        MatProgressSpinnerModule,
        NoopAnimationsModule,
        SharedModule,
        InfraTabsComponent,
      ],
      declarations: [
        TelemetryComponent,
        PulsarStatusComponent,
        RabbitMQStatusComponent,
      ],
      providers: [
        {
          provide: TelemetryService,
          useValue: telemetryServiceStub,
        },
        {
          provide: LoadProfileService,
          useValue: {
            pollingMs$: pollingMsSubject.asObservable(),
            profile$: new BehaviorSubject(10).asObservable(),
            current: 10,
          },
        },
        {
          provide: ActivatedRoute,
          useValue: mockActivatedRoute,
        },
        {
          provide: VoService,
          useValue: {
            getServices: jest.fn(() => of({})),
            voLoading$: new BehaviorSubject(false),
          },
        },
        {
          provide: TelemetryChartService,
          useValue: telemetryChartServiceStub,
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TelemetryComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);

  });

  afterEach(() => {
    fixture.destroy();
    httpMock.verify();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("should render infra tabs component when infrastructureTelemetry is provided", () => {
    // provide minimal valid snapshot
    component.infrastructureTelemetry = {
      measuredAt: new Date().toISOString(),
      source: "prometheus",
      services: {
        redis: { source: "prometheus" },
        rabbitmq: { source: "prometheus" },
        minio: { source: "prometheus" },
        nginx: { source: "prometheus" },
        frontendSsr: { source: "prometheus" },
        kafka: { source: "prometheus" },
        javaIngest: { source: "prometheus" },
        grafana: { source: "prometheus" },
        loki: { source: "prometheus" },
        alertmanager: { source: "prometheus" },
        pulsar: { source: "prometheus", brokers: 0, topics: 0, partitions: 0 },
      },
    } as InfrastructureTelemetrySnapshot;
    fixture.detectChanges();

    const infraDebug = fixture.debugElement.query(By.css("app-infra-tabs"));
    expect(infraDebug).toBeTruthy();
  });

  it("should fetch Pulsar status on polling", fakeAsync(() => {
    fixture.detectChanges();

    // Wait for polling to trigger
    tick(6000);

    const pulsarReq = httpMock.expectOne("/api/v1/pulsar/status");
    pulsarReq.flush({
      brokers: 2,
      topics: 10,
      partitions: 30,
    });
    httpMock.expectOne("/api/v1/rabbitmq/status").flush({
      status: "unknown",
      connection: "unknown",
      queues: {},
      exchanges: {},
    });
    httpMock.expectOne("/api/v1/telemetry/infrastructure").flush({
      measuredAt: new Date().toISOString(),
      source: "prometheus",
      services: {
        redis: { source: "prometheus" },
        rabbitmq: { source: "prometheus" },
        minio: { source: "prometheus" },
        frontendSsr: { source: "prometheus" },
        kafka: { source: "prometheus" },
        javaIngest: { source: "prometheus" },
        pulsar: {
          source: "prometheus",
          brokers: 2,
          topics: 10,
          partitions: 30,
          ingressBytesPerSec: 4096,
          egressBytesPerSec: 2048,
          publishRatePerSec: 6,
          deliverRatePerSec: 5,
        },
      },
    });
    httpMock.expectOne("/api/v1/alerts/slo").flush({
      alertIngestedTotal: 0,
      alertLatencyMsP50: 0,
      alertLatencyMsP95: 0,
      alertLatencyMsP99: 0,
      dlqDepth: 0,
      replaysTotal: 0,
      measuredAt: new Date().toISOString(),
    });
    httpMock.expectOne("/api/v1/alerts/dlq").flush([]);
    settleTelemetryView(fixture);

    expect(component.pulsarStatus.brokers).toBe(2);
    expect(component.pulsarStatus.topics).toBe(10);
    expect(component.pulsarStatus.partitions).toBe(30);
    component.ngOnDestroy();
    discardPeriodicTasks();
  }));

  it("should fetch RabbitMQ status on polling", fakeAsync(() => {
    fixture.detectChanges();

    // Wait for polling to trigger
    tick(6000);

    // Expect Pulsar request first
    httpMock
      .expectOne("/api/v1/pulsar/status")
      .flush({ brokers: 1, topics: 1, partitions: 1 });

    const rabbitReq = httpMock.expectOne("/api/v1/rabbitmq/status");
    rabbitReq.flush({
      status: "connected",
      connection: "connected",
      queues: { "test-queue": {} },
      exchanges: { "test-exchange": {} },
    });
    httpMock.expectOne("/api/v1/telemetry/infrastructure").flush({
      measuredAt: new Date().toISOString(),
      source: "prometheus",
      services: {
        redis: { source: "prometheus" },
        rabbitmq: { source: "prometheus" },
        minio: { source: "prometheus" },
        frontendSsr: { source: "prometheus" },
        kafka: { source: "prometheus" },
        javaIngest: { source: "prometheus" },
        pulsar: {
          source: "prometheus",
          brokers: 1,
          topics: 1,
          partitions: 1,
          ingressBytesPerSec: 1024,
          egressBytesPerSec: 768,
          publishRatePerSec: 1,
          deliverRatePerSec: 1,
        },
      },
    });
    httpMock.expectOne("/api/v1/alerts/slo").flush({
      alertIngestedTotal: 0,
      alertLatencyMsP50: 0,
      alertLatencyMsP95: 0,
      alertLatencyMsP99: 0,
      dlqDepth: 0,
      replaysTotal: 0,
      measuredAt: new Date().toISOString(),
    });
    httpMock.expectOne("/api/v1/alerts/dlq").flush([]);
    settleTelemetryView(fixture);

    expect(component.rabbitMQStatus.status).toBe("connected");
    expect(component.rabbitMQStatus.connection).toBe("connected");
    component.ngOnDestroy();
    discardPeriodicTasks();
  }));

  it("should compute non-zero throughput stats from range response", fakeAsync(() => {
    telemetryServiceStub.queryRangeRate =
      (jest.fn(() =>
        of({
          data: {
            result: [
              {
                values: [
                  [1, "100"],
                  [2, "140"],
                  [3, "120"],
                  [4, "160"],
                ],
              },
            ],
          },
        })) as any);
    telemetryServiceStub.queryInstant = jest.fn(() => of(140));

    fixture.detectChanges();
    // Allow deferred tasks / polling triggers to run
    tick(50);

    // Flush any component-initialized API calls that we aren't explicitly testing in this spec.
    httpMock
      .expectOne("/api/v1/pulsar/status")
      .flush({ brokers: 0, topics: 0, partitions: 0 });
    httpMock.expectOne("/api/v1/rabbitmq/status").flush({
      status: "unknown",
      connection: "unknown",
      queues: {},
      exchanges: {},
    });
    httpMock.expectOne("/api/v1/telemetry/infrastructure").flush({
      measuredAt: new Date().toISOString(),
      source: "prometheus",
      services: {
        redis: { source: "prometheus" },
        rabbitmq: { source: "prometheus" },
        minio: { source: "prometheus" },
        frontendSsr: { source: "prometheus" },
        kafka: { source: "prometheus" },
        javaIngest: { source: "prometheus" },
        pulsar: {
          source: "prometheus",
          brokers: 0,
          topics: 0,
          partitions: 0,
        },
      },
    });
    httpMock.expectOne("/api/v1/alerts/slo").flush({
      alertIngestedTotal: 0,
      alertLatencyMsP50: 0,
      alertLatencyMsP95: 0,
      alertLatencyMsP99: 0,
      dlqDepth: 0,
      replaysTotal: 0,
      measuredAt: new Date().toISOString(),
    });
    httpMock.expectOne("/api/v1/alerts/dlq").flush([]);

    expect(component.currentRate).toBeGreaterThan(0);
    expect(component.currentRateHuman).not.toBe("0 B/s");
    expect(component.stats.max).toBeGreaterThan(0);

    component.ngOnDestroy();
    discardPeriodicTasks();
  }));

  it("should handle Pulsar status error", fakeAsync(() => {
    fixture.detectChanges();

    tick(6000);

    const pulsarReq = httpMock.expectOne("/api/v1/pulsar/status");
    pulsarReq.error(new ErrorEvent("network error"));
    httpMock.expectOne("/api/v1/rabbitmq/status").flush({
      status: "unknown",
      connection: "unknown",
      queues: {},
      exchanges: {},
    });
    httpMock.expectOne("/api/v1/telemetry/infrastructure").flush({
      measuredAt: new Date().toISOString(),
      source: "unavailable",
      services: {
        redis: { source: "unavailable" },
        rabbitmq: { source: "unavailable" },
        minio: { source: "unavailable" },
        frontendSsr: { source: "unavailable" },
        kafka: { source: "unavailable" },
        javaIngest: { source: "unavailable" },
        pulsar: { source: "unavailable", brokers: 0, topics: 0, partitions: 0 },
      },
    });
    httpMock.expectOne("/api/v1/alerts/slo").flush({
      alertIngestedTotal: 0,
      alertLatencyMsP50: 0,
      alertLatencyMsP95: 0,
      alertLatencyMsP99: 0,
      dlqDepth: 0,
      replaysTotal: 0,
      measuredAt: new Date().toISOString(),
    });
    httpMock.expectOne("/api/v1/alerts/dlq").flush([]);
    settleTelemetryView(fixture);

    expect(component.pulsarStatus.brokers).toBe(0);
    expect(component.pulsarStatus.topics).toBe(0);
    expect(component.pulsarStatus.partitions).toBe(0);
    component.ngOnDestroy();
    discardPeriodicTasks();
  }));

  it("should handle RabbitMQ status error", fakeAsync(() => {
    fixture.detectChanges();

    tick(6000);

    // Handle Pulsar request
    httpMock
      .expectOne("/api/v1/pulsar/status")
      .flush({ brokers: 1, topics: 1, partitions: 1 });

    const rabbitReq = httpMock.expectOne("/api/v1/rabbitmq/status");
    rabbitReq.error(new ErrorEvent("connection failed"));
    httpMock.expectOne("/api/v1/telemetry/infrastructure").flush({
      measuredAt: new Date().toISOString(),
      source: "unavailable",
      services: {
        redis: { source: "unavailable" },
        rabbitmq: { source: "unavailable" },
        minio: { source: "unavailable" },
        frontendSsr: { source: "unavailable" },
        kafka: { source: "unavailable" },
        javaIngest: { source: "unavailable" },
        pulsar: { source: "unavailable", brokers: 0, topics: 0, partitions: 0 },
      },
    });
    httpMock.expectOne("/api/v1/alerts/slo").flush({
      alertIngestedTotal: 0,
      alertLatencyMsP50: 0,
      alertLatencyMsP95: 0,
      alertLatencyMsP99: 0,
      dlqDepth: 0,
      replaysTotal: 0,
      measuredAt: new Date().toISOString(),
    });
    httpMock.expectOne("/api/v1/alerts/dlq").flush([]);
    settleTelemetryView(fixture);

    expect(component.rabbitMQStatus.status).toBe("error");
    expect(component.rabbitMQStatus.connection).toBe("error");
    expect(component.rabbitMQStatus.error).toBe("Connection failed");
    component.ngOnDestroy();
    discardPeriodicTasks();
  }));

  it("should populate alertSlo from API response", fakeAsync(() => {
    fixture.detectChanges();
    tick(6000);

    httpMock
      .expectOne("/api/v1/pulsar/status")
      .flush({ brokers: 1, topics: 1, partitions: 1 });
    httpMock.expectOne("/api/v1/rabbitmq/status").flush({
      status: "unknown",
      connection: "unknown",
      queues: {},
      exchanges: {},
    });
    httpMock.expectOne("/api/v1/telemetry/infrastructure").flush({
      measuredAt: new Date().toISOString(),
      source: "prometheus",
      services: {
        redis: { source: "prometheus" },
        rabbitmq: { source: "prometheus" },
        minio: { source: "prometheus" },
        frontendSsr: { source: "prometheus" },
        kafka: { source: "prometheus" },
        javaIngest: { source: "prometheus" },
        pulsar: {
          source: "prometheus",
          brokers: 1,
          topics: 1,
          partitions: 1,
          ingressBytesPerSec: 1024,
          egressBytesPerSec: 768,
          publishRatePerSec: 1,
          deliverRatePerSec: 1,
        },
      },
    });
    httpMock.expectOne("/api/v1/alerts/slo").flush({
      alertIngestedTotal: 42,
      alertLatencyMsP50: 12.5,
      alertLatencyMsP95: 45.0,
      alertLatencyMsP99: 98.3,
      dlqDepth: 3,
      replaysTotal: 1,
      measuredAt: "2025-01-01T00:00:00Z",
    });
    httpMock.expectOne("/api/v1/alerts/dlq").flush([]);
    settleTelemetryView(fixture);

    expect(component.alertSlo).not.toBeNull();
    expect(component.alertSlo?.alertIngestedTotal).toBe(42);
    expect(component.alertSlo?.dlqDepth).toBe(3);
    expect(component.alertSloLoading).toBe(false);
    expect(component.alertSloError).toBeNull();
    component.ngOnDestroy();
    discardPeriodicTasks();
  }));

  it("should set alertSloError when alert SLO endpoint fails", fakeAsync(() => {
    fixture.detectChanges();
    tick(6000);

    httpMock
      .expectOne("/api/v1/pulsar/status")
      .flush({ brokers: 1, topics: 1, partitions: 1 });
    httpMock.expectOne("/api/v1/rabbitmq/status").flush({
      status: "unknown",
      connection: "unknown",
      queues: {},
      exchanges: {},
    });
    httpMock.expectOne("/api/v1/telemetry/infrastructure").flush({
      measuredAt: new Date().toISOString(),
      source: "unavailable",
      services: {
        redis: { source: "unavailable" },
        rabbitmq: { source: "unavailable" },
        minio: { source: "unavailable" },
        frontendSsr: { source: "unavailable" },
        kafka: { source: "unavailable" },
        javaIngest: { source: "unavailable" },
        pulsar: { source: "unavailable", brokers: 0, topics: 0, partitions: 0 },
      },
    });
    httpMock
      .expectOne("/api/v1/alerts/slo")
      .error(new ErrorEvent("alert-slo-error"));
    httpMock.expectOne("/api/v1/alerts/dlq").flush([]);
    settleTelemetryView(fixture);

    expect(component.alertSloError).toBe("Alert SLO endpoint unavailable");
    expect(component.alertSloLoading).toBe(false);
    component.ngOnDestroy();
    discardPeriodicTasks();
  }));

  it("should render Nest SSR API traffic and observability tiles from infrastructure telemetry", fakeAsync(() => {
    fixture.detectChanges();
    tick(6000);

    httpMock.expectOne("/api/v1/pulsar/status").flush({
      brokers: 1,
      topics: 2,
      partitions: 3,
    });
    httpMock.expectOne("/api/v1/rabbitmq/status").flush({
      status: "healthy",
      connection: "established",
      queues: {},
      exchanges: {},
    });
    httpMock.expectOne("/api/v1/telemetry/infrastructure").flush({
      measuredAt: new Date().toISOString(),
      source: "prometheus",
      services: {
        redis: { source: "prometheus" },
        rabbitmq: { source: "prometheus" },
        minio: { source: "prometheus" },
        nginx: { source: "prometheus" },
        frontendSsr: {
          source: "prometheus",
          frontendApiRequestRatePerSec: 7.4,
          frontendApiResponseBytesPerSec: 49152,
          frontendApiErrorRatePerSec: 0.03,
          frontendApiLatencyMs: 21,
          apiRouteRequestRatesPerSec: {
            telemetry: 1.7,
            jobs: 2.1,
            alerts: 0.9,
          },
        },
        governanceRuntime: {
          source: "prometheus",
          queuedJobs: 6,
          runningJobs: 2,
          deferredJobs: 3,
          blockedJobs: 1,
          avgQueueAgeMs: 640,
          maxQueueAgeMs: 1820,
          scannerIntervalSeconds: 10,
          deferredReleaseRatePerSec: 0.03,
          deferredReleaseTotal: 5,
          operatorReadRatePerSec: 1.9,
          operatorReadBytesPerSec: 8192,
          operatorReadRouteRatesPerSec: {
            jobs: 1.1,
            datasets: 0.5,
            alerts: 0.2,
          },
          httpRequestRatePerSec: 5.2,
          httpResponseBytesPerSec: 16384,
          httpErrorRatePerSec: 0.06,
          httpLatencyMs: 17,
          httpRouteRequestRatesPerSec: {
            jobs: 1.4,
            telemetry: 0.7,
            alerts: 0.3,
          },
          datasetPublishRatePerSec: 0.2,
          datasetPublishPayloadBytesPerSec: 3072,
          datasetReadRatePerSec: 0.7,
          datasetReadPayloadBytesPerSec: 5120,
          manifestPublishRatePerSec: 0.18,
          manifestPublishPayloadBytesPerSec: 2048,
          manifestReadRatePerSec: 0.46,
          manifestReadPayloadBytesPerSec: 2560,
          kafkaPublishRatePerSec: 2.2,
          kafkaPublishBytesPerSec: 14336,
          kafkaPublishLatencyMs: 13,
          kafkaPublishErrorRatePerSec: 0.01,
          artifactReadRatePerSec: 0.48,
          artifactReadBytesPerSec: 12288,
          artifactReadAvgLatencyMs: 14,
          artifactReadErrorRatePerSec: 0.01,
          artifactAvgSizeBytes: 4096,
          voAdapterRequestRatePerSec: 0.4,
          voAdapterPayloadBytesPerSec: 3584,
          voAdapterLatencyMs: 410,
          voAdapterErrorRatePerSec: 0.02,
          voAdapterOperationRatesPerSec: {
            adql_query: 0.2,
            votable_fetch: 0.1,
          },
          voAdapterFailureClassRatesPerSec: {
            timeout: 0.02,
          },
          taccAdapterRequestRatePerSec: 0.3,
          taccAdapterPayloadBytesPerSec: 1024,
          taccAdapterLatencyMs: 180,
          taccAdapterErrorRatePerSec: 0,
          taccAdapterOperationRatesPerSec: {
            submit: 0.3,
          },
          taccAdapterFailureClassRatesPerSec: {},
          alertIngestedTotal: 12,
          alertIngestRatePerSec: 0.2,
          alertReplaysTotal: 3,
          alertReplayRatePerSec: 0.04,
          alertDlqDepth: 2,
          alertReplaySingleSuccessRatePerSec: 0.03,
          alertReplaySingleMissRatePerSec: 0.01,
          alertReplayAllSuccessRatePerSec: 0.01,
          alertReplayAllEmptyRatePerSec: 0,
          alertReplayItemsRatePerSec: 0.05,
          alertReplayAvgBatchSize: 2.5,
          alertReplayAvgLatencyMs: 15,
          workflowOutcomes: {
            ingest: {
              source: "prometheus",
              completedTotal: 8,
              failedTotal: 1,
              completedRatePerSec: 0.6,
              failedRatePerSec: 0.03,
              avgDispatchWaitMs: 220,
              avgRuntimeMs: 1480,
            },
            "vo.adql.query": {
              source: "prometheus",
              completedTotal: 4,
              failedTotal: 0,
              completedRatePerSec: 0.2,
              failedRatePerSec: 0,
              avgDispatchWaitMs: 120,
              avgRuntimeMs: 890,
            },
          },
        },
        kafka: { source: "prometheus" },
        javaIngest: {
          source: "prometheus",
          receiveRatePerSec: 5.1,
          processedRatePerSec: 5.0,
          validationFailureRatePerSec: 0.05,
          failureRatePerSec: 0.01,
          retryRatePerSec: 0,
          dlqRatePerSec: 0,
          payloadBytesPerSec: 40960,
          avgLatencyMs: 11,
        },
        pulsar: {
          source: "prometheus",
          brokers: 1,
          topics: 2,
          partitions: 3,
        },
        grafana: {
          source: "prometheus",
          dataproxyRatePerSec: 0.4,
        },
        loki: {
          source: "prometheus",
          inflightRequests: 1,
        },
        alertmanager: {
          source: "prometheus",
          alertsReceivedRatePerSec: 0.05,
        },
      },
    });
    httpMock.expectOne("/api/v1/alerts/slo").flush({
      alertIngestedTotal: 0,
      alertLatencyMsP50: 0,
      alertLatencyMsP95: 0,
      alertLatencyMsP99: 0,
      dlqDepth: 0,
      replaysTotal: 0,
      measuredAt: new Date().toISOString(),
    });
    httpMock.expectOne("/api/v1/alerts/dlq").flush([]);

    settleTelemetryView(fixture);
    clickTabByLabel(fixture, "Overview");
    settleTelemetryView(fixture);
    clickTabByLabel(fixture, "Nest SSR");
    settleTelemetryView(fixture);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain("API Traffic");
    expect(text).toContain("By API Group");
    expect(text).toContain("Prometheus Proxy");

    clickTabByLabel(fixture, "Observability");
    settleTelemetryView(fixture);
    const observabilityText = fixture.nativeElement.textContent as string;
    expect(observabilityText).toContain("Observability");
    expect(observabilityText).toContain("Grafana");
    expect(observabilityText).toContain("Loki");
    expect(observabilityText).toContain("Alertmanager");

    clickTabByLabel(fixture, "Operators");
    settleTelemetryView(fixture);
    const operatorsText = fixture.nativeElement.textContent as string;
    expect(operatorsText).toContain("Transient Alerts");
    expect(operatorsText).toContain("Replay throughput");
    expect(operatorsText).toContain("Single replay success");
    expect(operatorsText).toContain("Avg replay batch");
    expect(operatorsText).toContain("DLQ and Replay");
    expect(operatorsText).toContain("Jobs reads");
    expect(operatorsText).toContain("Datasets reads");
    expect(operatorsText).toContain("Dataset publishes");
    expect(operatorsText).toContain("Manifest reads");

    clickTabByLabel(fixture, "Brokers");
    settleTelemetryView(fixture);
    const brokersText = fixture.nativeElement.textContent as string;
    expect(brokersText).toContain("Java Ingest Consumer");
    expect(brokersText).toContain("Retries");
    expect(brokersText).toContain("Latency");

    clickTabByLabel(fixture, "Java Governance Runtime");
    settleTelemetryView(fixture);
    const governanceText = fixture.nativeElement.textContent as string;
    expect(governanceText).toContain("Scheduler Pressure");
    expect(governanceText).toContain("Queued jobs");
    expect(governanceText).toContain("Deferred release rate");
    expect(governanceText).toContain("API Surface");
    expect(governanceText).toContain("HTTP request rate");
    expect(governanceText).toContain("Jobs route rate");
    expect(governanceText).toContain("Workflow Outcomes");
    expect(governanceText).toContain("Queue wait");
    expect(governanceText).toContain("Kafka publishes");
    expect(governanceText).toContain("Kafka latency");
    expect(governanceText).toContain("Artifact reads");
    expect(governanceText).toContain("Avg artifact size");
    expect(governanceText).toContain("External Adapters");
    expect(governanceText).toContain("VO requests");
    expect(governanceText).toContain("vo.adql.query");

    clickTabByLabel(fixture, "Executors");
    settleTelemetryView(fixture);
    const executorsText = fixture.nativeElement.textContent as string;
    expect(executorsText).toContain("VO Adapter");
    expect(executorsText).toContain("TACC Adapter");
    expect(executorsText).toContain("Failure Classes");

    component.ngOnDestroy();
    discardPeriodicTasks();
  }));
});
