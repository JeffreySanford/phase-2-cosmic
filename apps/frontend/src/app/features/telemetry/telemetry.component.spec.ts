import { ComponentFixture, TestBed, fakeAsync, tick } from "@angular/core/testing";
import { HttpClientTestingModule, HttpTestingController } from "@angular/common/http/testing";
import { TelemetryComponent } from "./telemetry.component";
import { TelemetryService } from "../../services/telemetry.service";
import { LoadProfileService } from "../../services/load-profile.service";
import { ActivatedRoute } from "@angular/router";
import { BehaviorSubject } from "rxjs";

describe("TelemetryComponent", () => {
  let component: TelemetryComponent;
  let fixture: ComponentFixture<TelemetryComponent>;
  let httpMock: HttpTestingController;
  const pollingMsSubject = new BehaviorSubject<number>(5000);

  beforeEach(async () => {
    const mockActivatedRoute = {
      queryParamMap: new BehaviorSubject(new Map())
    };

    await TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      declarations: [TelemetryComponent],
      providers: [
        {
          provide: TelemetryService,
          useValue: {}
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
  });

  afterEach(() => {
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

    expect(component.pulsarStatus.brokers).toBe(2);
    expect(component.pulsarStatus.topics).toBe(10);
    expect(component.pulsarStatus.partitions).toBe(30);
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
  }));

  it("should handle Pulsar status error", fakeAsync(() => {
    fixture.detectChanges();

    tick(6000);

    const pulsarReq = httpMock.expectOne("/api/v1/pulsar/status");
    pulsarReq.error(new ErrorEvent('network error'));

    expect(component.pulsarStatus.brokers).toBe(0);
    expect(component.pulsarStatus.topics).toBe(0);
    expect(component.pulsarStatus.partitions).toBe(0);
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
  }));
});