import { TestBed, ComponentFixture } from "@angular/core/testing";
import { Component, Input } from "@angular/core";
import { DiagnosticsComponent } from "./diagnostics.component";
import { BehaviorSubject } from "rxjs";

@Component({ selector: "app-promql-card", template: "" })
class PromqlCardStubComponent {
  @Input() query?: string;
  @Input() title?: string;
  @Input() tone?: string;
}

@Component({ selector: "app-disclaimer-banner", template: "" })
class DisclaimerBannerStubComponent {
  @Input() dismissible?: boolean;
  @Input() type?: string;
  @Input() message?: string;
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
    httpMock.verify();
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
    httpMock.verify();
  });
});
