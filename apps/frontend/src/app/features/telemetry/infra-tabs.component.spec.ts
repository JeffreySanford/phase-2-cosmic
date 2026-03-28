import { ComponentFixture, TestBed } from "@angular/core/testing";
import { InfraTabsComponent } from "./infra-tabs.component";
import { CommonModule } from "@angular/common";
import { MatTabsModule } from "@angular/material/tabs";
import { InfrastructureTelemetrySnapshot } from "../../shared/types";

describe("InfraTabsComponent", () => {
  let component: InfraTabsComponent;
  let fixture: ComponentFixture<InfraTabsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InfraTabsComponent, CommonModule, MatTabsModule],
    }).compileComponents();

    fixture = TestBed.createComponent(InfraTabsComponent);
    component = fixture.componentInstance;
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("does not render anything when infra is null", () => {
    component.infra = null as unknown as InfrastructureTelemetrySnapshot;
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector(".infra-telemetry");
    expect(el).toBeNull();
  });

  it("renders section when infra provided", () => {
    const demoInfra: InfrastructureTelemetrySnapshot = {
      measuredAt: new Date().toISOString(),
      source: "mock",
      services: {
        redis: { source: "mock" },
        rabbitmq: {
          source: "mock",
          queueDepth: 0,
          readyMessages: 0,
          unackedMessages: 0,
          publishRatePerSec: 0,
          deliverRatePerSec: 0,
        },
        minio: {
          source: "mock",
          requestsPerSec: 0,
          ingressBytesPerSec: 0,
          egressBytesPerSec: 0,
          errorRatePerSec: 0,
        },
        nginx: {
          source: "mock",
          requestsPerSec: 0,
          ingressBytesPerSec: 0,
          egressBytesPerSec: 0,
          errorRatePerSec: 0,
          avgLatencyMs: 0,
        },
        frontendSsr: {
          source: "mock",
          connectedClients: 0,
          hitRatePerSec: 0,
          missRatePerSec: 0,
          bypassRatePerSec: 0,
          ingressBytesPerSec: 0,
          egressBytesPerSec: 0,
          avgLatencyMs: 0,
          governanceProxyRatePerSec: 0,
          governanceProxyBytesPerSec: 0,
          governanceProxyErrorRatePerSec: 0,
          governanceProxyLatencyMs: 0,
        },
        kafka: {
          source: "mock",
          brokers: 0,
          topics: 0,
          consumerLag: 0,
          ingressBytesPerSec: 0,
          egressBytesPerSec: 0,
        },
        javaIngest: { source: "mock" },
        pulsar: { source: "mock", brokers: 0, topics: 0, partitions: 0 },
        grafana: {
          source: "mock",
          requestsPerSec: 0,
          errorRatePerSec: 0,
          avgLatencyMs: 0,
          dataproxyRatePerSec: 0,
          dataproxyLatencyMs: 0,
          datasources: 0,
          activeAlerts: 0,
        },
        loki: {
          source: "mock",
          requestsPerSec: 0,
          ingressBytesPerSec: 0,
          egressBytesPerSec: 0,
          errorRatePerSec: 0,
          avgLatencyMs: 0,
          inflightRequests: 0,
        },
        alertmanager: {
          source: "mock",
          requestsPerSec: 0,
          egressBytesPerSec: 0,
          errorRatePerSec: 0,
          avgLatencyMs: 0,
          alertsReceivedRatePerSec: 0,
          activeAlerts: 0,
        },
        governanceRuntime: { source: "mock" },
      },
    };
    component.infra = demoInfra;
    fixture.detectChanges();
    const el = fixture.nativeElement.querySelector(".infra-telemetry");
    expect(el).toBeTruthy();
  });
});
