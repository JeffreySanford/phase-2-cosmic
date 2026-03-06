import {
  ComponentFixture,
  TestBed,
  discardPeriodicTasks,
  fakeAsync,
  tick,
} from "@angular/core/testing";
import { HttpClientTestingModule, HttpTestingController } from "@angular/common/http/testing";
import { TelemetryComponent } from "./telemetry.component";
import { PulsarStatusComponent } from "./pulsar-status/pulsar-status.component";
import { RabbitMQStatusComponent } from "./rabbitmq-status/rabbitmq-status.component";
import { MatCardModule } from "@angular/material/card";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatSelectModule } from "@angular/material/select";
import { MatButtonModule } from "@angular/material/button";
import { MatTabsModule } from "@angular/material/tabs";
import { MatIconModule } from "@angular/material/icon";
import { NoopAnimationsModule } from "@angular/platform-browser/animations";
import { TelemetryService } from "../../services/telemetry.service";
import { LoadProfileService } from "../../services/load-profile.service";
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
    getPulsarStatus: jest.fn(() => of({ brokers: 0, topics: 0, partitions: 0 })),
  };

  beforeEach(async () => {
    const mockActivatedRoute = {
      queryParamMap: new BehaviorSubject(new Map())
    };

    await TestBed.configureTestingModule({
      imports: [
        HttpClientTestingModule,
        MatCardModule,
        MatFormFieldModule,
        MatSelectModule,
        MatButtonModule,
        MatTabsModule,
        MatIconModule,
        NoopAnimationsModule
      ],
      declarations: [TelemetryComponent, PulsarStatusComponent, RabbitMQStatusComponent],
      providers: [
        {
          provide: TelemetryService,
          useValue: telemetryServiceStub
        },
        {
          provide: LoadProfileService,
          useValue: {
            pollingMs$: pollingMsSubject.asObservable(),
            profile$: new BehaviorSubject(10).asObservable(),
            current: 10
          }
        },
        {
          provide: ActivatedRoute,
          useValue: mockActivatedRoute
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(TelemetryComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);

    const hooks = component as unknown as TelemetryComponentTestHooks;
    jest.spyOn(hooks, "loadD3").mockReturnValue(of({}));
    jest.spyOn(hooks, "initGauge").mockImplementation(() => undefined);
    jest.spyOn(hooks, "ensureVizInitialized").mockImplementation(() => undefined);
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
      partitions: 30
    });
    httpMock
      .expectOne("/api/v1/rabbitmq/status")
      .flush({ status: "unknown", connection: "unknown", queues: {}, exchanges: {} });

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
    httpMock.expectOne("/api/v1/pulsar/status").flush({ brokers: 1, topics: 1, partitions: 1 });

    const rabbitReq = httpMock.expectOne("/api/v1/rabbitmq/status");
    rabbitReq.flush({
      status: 'connected',
      connection: 'connected',
      queues: { 'test-queue': {} },
      exchanges: { 'test-exchange': {} }
    });

    expect(component.rabbitMQStatus.status).toBe('connected');
    expect(component.rabbitMQStatus.connection).toBe('connected');
    component.ngOnDestroy();
    discardPeriodicTasks();
  }));

  it("should handle Pulsar status error", fakeAsync(() => {
    fixture.detectChanges();

    tick(6000);

    const pulsarReq = httpMock.expectOne("/api/v1/pulsar/status");
    pulsarReq.error(new ErrorEvent('network error'));
    httpMock
      .expectOne("/api/v1/rabbitmq/status")
      .flush({ status: "unknown", connection: "unknown", queues: {}, exchanges: {} });

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
    httpMock.expectOne("/api/v1/pulsar/status").flush({ brokers: 1, topics: 1, partitions: 1 });

    const rabbitReq = httpMock.expectOne("/api/v1/rabbitmq/status");
    rabbitReq.error(new ErrorEvent('connection failed'));

    expect(component.rabbitMQStatus.status).toBe('error');
    expect(component.rabbitMQStatus.connection).toBe('error');
    expect(component.rabbitMQStatus.error).toBe('Connection failed');
    component.ngOnDestroy();
    discardPeriodicTasks();
  }));
});
