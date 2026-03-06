import { ComponentFixture, TestBed } from "@angular/core/testing";
import { StatusBandComponent } from "./status-band.component";
import {
  SystemStatus,
  SystemStatusService,
} from "../../services/system-status.service";
import { Observable, of } from "rxjs";
import { StatusBandModule } from "./status-band.module";

describe("StatusBandComponent", () => {
  let component: StatusBandComponent;
  let fixture: ComponentFixture<StatusBandComponent>;
  let mockStatusService: { status$: Observable<SystemStatus> };

  beforeEach(async () => {
    mockStatusService = {
      status$: of({
        health: "healthy" as const,
        lastCheck: new Date(),
        services: {
          governance: "online" as const,
          telemetry: "online" as const,
          diagnostics: "online" as const,
        },
      }),
    };

    await TestBed.configureTestingModule({
      imports: [StatusBandModule],
      providers: [
        { provide: SystemStatusService, useValue: mockStatusService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(StatusBandComponent);
    component = fixture.componentInstance;
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("should remain visible when system is healthy", () => {
    fixture.detectChanges();
    expect(component.shouldShow).toBe(true);
  });

  it("should show when system is degraded", () => {
    mockStatusService.status$ = of({
      health: "degraded",
      lastCheck: new Date(),
      services: {
        governance: "online",
        telemetry: "offline",
        diagnostics: "online",
      },
    });
    component.ngOnInit();
    fixture.detectChanges();
    expect(component.shouldShow).toBe(true);
  });

  it("should show correct icon for offline status", () => {
    component.status = {
      health: "offline",
      lastCheck: new Date(),
      services: {
        governance: "offline",
        telemetry: "online",
        diagnostics: "offline",
      },
    };
    expect(component.getIcon()).toBe("error");
  });

  it("should format timestamp correctly", () => {
    const oldDate = new Date(Date.now() - 65000); // 65 seconds ago
    component.status = {
      health: "healthy",
      lastCheck: oldDate,
      services: {
        governance: "online",
        telemetry: "online",
        diagnostics: "online",
      },
    };
    const timestamp = component.getTimestamp();
    expect(timestamp).toMatch(/1m ago/);
  });

  it("should update timestampDisplay when status changes", () => {
    const oldDate = new Date(Date.now() - 30000); // 30 seconds ago
    component.status = {
      health: "healthy",
      lastCheck: oldDate,
      services: {
        governance: "online",
        telemetry: "online",
        diagnostics: "online",
      },
    };
    component.updateTimestampDisplay();
    expect(component.timestampDisplay).toMatch(/30s ago/);
  });
});
