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
import { PulsarStatusComponent } from "./pulsar-status/pulsar-status.component";
import { RabbitMQStatusComponent } from "./rabbitmq-status/rabbitmq-status.component";
import { MatCardModule } from "@angular/material/card";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatSelectModule } from "@angular/material/select";
import { MatButtonModule } from "@angular/material/button";
import { MatTabsModule } from "@angular/material/tabs";
import { MatIconModule } from "@angular/material/icon";
import { MatExpansionModule } from "@angular/material/expansion";
import { NoopAnimationsModule } from "@angular/platform-browser/animations";
import { TelemetryService } from "../../services/telemetry.service";
import { LoadProfileService } from "../../services/load-profile.service";
import { VoService } from "../../services/vo.service";
import { ActivatedRoute } from "@angular/router";
import { BehaviorSubject, Observable, of } from "rxjs";

type TelemetryComponentTestHooks = {
  loadD3: () => Observable<unknown>;
  initGauge: () => void;
  ensureVizInitialized: () => void;
};

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
        NoopAnimationsModule,
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
          useValue: { getServices: jest.fn(() => of({})) },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TelemetryComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);

    const hooks = component as unknown as TelemetryComponentTestHooks;
    jest.spyOn(hooks, "loadD3").mockReturnValue(of({}));
    jest.spyOn(hooks, "initGauge").mockImplementation(() => undefined);
    jest
      .spyOn(hooks, "ensureVizInitialized")
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    fixture.destroy();
    httpMock.verify();
  });

  it("should create", () => {
    expect(component).toBeTruthy();
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

    expect(component.rabbitMQStatus.status).toBe("connected");
    expect(component.rabbitMQStatus.connection).toBe("connected");
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

    expect(component.rabbitMQStatus.status).toBe("error");
    expect(component.rabbitMQStatus.connection).toBe("error");
    expect(component.rabbitMQStatus.error).toBe("Connection failed");
    component.ngOnDestroy();
    discardPeriodicTasks();
  }));

  it("should populate alertSlo from API response", fakeAsync(() => {
    fixture.detectChanges();
    tick(6000);

    httpMock.expectOne("/api/v1/pulsar/status").flush({ brokers: 1, topics: 1, partitions: 1 });
    httpMock.expectOne("/api/v1/rabbitmq/status").flush({
      status: "unknown", connection: "unknown", queues: {}, exchanges: {},
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

    httpMock.expectOne("/api/v1/pulsar/status").flush({ brokers: 1, topics: 1, partitions: 1 });
    httpMock.expectOne("/api/v1/rabbitmq/status").flush({
      status: "unknown", connection: "unknown", queues: {}, exchanges: {},
    });
    httpMock.expectOne("/api/v1/alerts/slo").error(new ErrorEvent("alert-slo-error"));
    httpMock.expectOne("/api/v1/alerts/dlq").flush([]);

    expect(component.alertSloError).toBe("Alert SLO endpoint unavailable");
    expect(component.alertSloLoading).toBe(false);
    component.ngOnDestroy();
    discardPeriodicTasks();
  }));
});
