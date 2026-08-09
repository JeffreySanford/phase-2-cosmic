import { Component, Input } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { FormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatSelectModule } from "@angular/material/select";
import { MatTabsModule } from "@angular/material/tabs";
import { NoopAnimationsModule } from "@angular/platform-browser/animations";
import type { Meta, StoryObj } from "@storybook/angular";
import { moduleMetadata } from "@storybook/angular";
import { of } from "rxjs";
import { DataSourceService } from "../../services/data-source.service";
import { LoadProfileService } from "../../services/load-profile.service";
import { MockDataService } from "../../services/mock-data.service";
import { RequestCacheService } from "../../services/request-cache.service";
import { DiagnosticsComponent } from "./diagnostics.component";

@Component({ selector: "app-promql-card", template: "" })
class PromqlCardStubComponent {
  @Input() query?: string;
  @Input() title?: string;
  @Input() tone?: string;
}

@Component({ selector: "app-pulsar-status", template: "" })
class PulsarStatusStubComponent {
  @Input() status?: unknown;
}

@Component({ selector: "app-rabbitmq-status", template: "" })
class RabbitMQStatusStubComponent {
  @Input() status?: unknown;
}

@Component({ selector: "app-disclaimer-banner", template: "" })
class DisclaimerBannerStubComponent {
  @Input() dismissible?: boolean;
  @Input() type?: string;
  @Input() ready?: boolean;
}

@Component({ selector: "app-trident-allocator", template: "" })
class TridentAllocatorStubComponent {}

class MockEventSource {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  close(): void {
    // no-op for stories
  }
}

(
  globalThis as typeof globalThis & { EventSource?: typeof EventSource }
).EventSource = MockEventSource as unknown as typeof EventSource;

const meta: Meta<DiagnosticsComponent> = {
  title: "Features/Diagnostics",
  component: DiagnosticsComponent,
  decorators: [
    moduleMetadata({
      declarations: [
        DiagnosticsComponent,
        PromqlCardStubComponent,
        PulsarStatusStubComponent,
        RabbitMQStatusStubComponent,
        DisclaimerBannerStubComponent,
        TridentAllocatorStubComponent,
      ],
      imports: [
        FormsModule,
        MatButtonModule,
        MatCardModule,
        MatFormFieldModule,
        MatIconModule,
        MatSelectModule,
        MatTabsModule,
        NoopAnimationsModule,
      ],
      providers: [
        {
          provide: DataSourceService,
          useValue: { mode: "mock" },
        },
        {
          provide: MockDataService,
          useValue: {
            diagnosticsIndex: () =>
              of({
                path: "/tmp",
                files: ["system-specs.txt", "payloads.log.20260807T100000Z"],
              }),
            systemSpecsText: () => of("mock system specs"),
            mockDockerServices: () => of([]),
          },
        },
        {
          provide: LoadProfileService,
          useValue: {
            pollingMs$: of(5000),
            profile$: of(10),
            current: 10,
          },
        },
        {
          provide: RequestCacheService,
          useValue: {
            getOrCreate: (_key: string, _ttl: number, factory: () => unknown) =>
              of(factory()),
          },
        },
        {
          provide: HttpClient,
          useValue: {
            get: (url: string) => {
              switch (url) {
                case "/api/diagnostics/database-benchmarks":
                  return of({
                    generatedAt: new Date().toISOString(),
                    source: "prometheus",
                    postgres: {
                      status: "healthy",
                      connection: "configured",
                      host: "postgres",
                      database: "cosmic",
                      activeConnections: 7,
                      latencyMs: 3,
                      details:
                        "Prometheus-backed metrics surfaced in Storybook",
                    },
                    benchmarks: {
                      ingestRatePerSec: 132,
                      ingestBytesPerSec: 2097152,
                      averageLatencyMs: 6,
                      queueDepth: 4,
                      activeJobs: 3,
                      failureRatePerSec: 0.14,
                      throughputMbPerSec: 11.4,
                    },
                    prometheus: {
                      available: true,
                      queries: [
                        { query: "pg_up", label: "pg_up", value: 1 },
                        {
                          query: "pg_stat_activity_count",
                          label: "Connections",
                          value: 7,
                        },
                      ],
                    },
                  });
                case "/api/v1/pulsar/status":
                  return of({ brokers: 3, topics: 14, partitions: 42 });
                case "/api/v1/rabbitmq/status":
                  return of({ status: "connected", connection: "connected" });
                case "/api/metrics/topology":
                  return of({ timing_drift_ns: 128, rfi_event_rate: 4 });
                case "/api/diagnostics/docker-services":
                  return of([]);
                case "/api/diagnostics":
                  return of({ path: "/tmp", files: ["system-specs.txt"] });
                case "/api/diagnostics/system-specs":
                  return of("storybook system specs");
                default:
                  return of([]);
              }
            },
          },
        },
      ],
    }),
  ],
};

export default meta;
type Story = StoryObj<DiagnosticsComponent>;

export const Default: Story = {};
