import { Injectable, inject } from "@angular/core";
import { BehaviorSubject, Observable, forkJoin, interval, of } from "rxjs";
import { HttpClient } from "@angular/common/http";
import { catchError, map } from "rxjs/operators";
import { DataSourceService } from "./data-source.service";
import { MockDataService } from "./mock-data.service";

export interface SystemStatus {
  health: "healthy" | "degraded" | "offline";
  lastCheck: Date;
  message?: string;
  services: {
    governance: "online" | "offline";
    telemetry: "online" | "offline";
    diagnostics: "online" | "offline";
  };
}

/**
 * App-level status service for monitoring system health and data freshness.
 *
 * Mission linkage:
 * - Mission outcome: Human decision speed
 * - Operator/science impact: Operators see immediate system status feedback
 * - Validation evidence: Status band visible across all routes
 */
@Injectable({
  providedIn: "root",
})
export class SystemStatusService {
  private http = inject(HttpClient);
  private dataSource = inject(DataSourceService);
  private mock = inject(MockDataService);

  private statusSubject = new BehaviorSubject<SystemStatus>({
    health: "healthy",
    lastCheck: new Date(),
    services: {
      governance: "online",
      telemetry: "online",
      diagnostics: "online",
    },
  });

  public status$: Observable<SystemStatus> = this.statusSubject.asObservable();

  constructor() {
    // Check health every 30 seconds
    interval(30000).subscribe(() => this.checkHealth());
    // Initial check
    this.checkHealth();
  }

  private checkHealth(): void {
    if (this.dataSource.mode === "mock") {
      this.mock.mockSystemStatus().subscribe((s) => {
        const newStatus: SystemStatus = {
          health: "healthy",
          lastCheck: new Date(s.lastCheck || Date.now()),
          message: "Mock data mode active",
          services: {
            governance: "online",
            telemetry: "online",
            diagnostics: "online",
          },
        };
        this.statusSubject.next(newStatus);
      });
      return;
    }

    forkJoin({
      governance: this.probe("/api/v1/health"),
      telemetry: this.probe("/api/proxy/prometheus?query=sum(up)"),
      diagnostics: this.probe("/api/diagnostics"),
    }).subscribe((result) => {
      const services: SystemStatus["services"] = {
        governance: result.governance ? "online" : "offline",
        telemetry: result.telemetry ? "online" : "offline",
        diagnostics: result.diagnostics ? "online" : "offline",
      };
      const onlineCount = Object.values(services).filter(
        (state) => state === "online"
      ).length;
      const health: SystemStatus["health"] =
        onlineCount === 3
          ? "healthy"
          : onlineCount > 0
          ? "degraded"
          : "offline";
      const offlineServices = Object.entries(services)
        .filter(([, state]) => state === "offline")
        .map(([name]) => name);

      this.statusSubject.next({
        health,
        lastCheck: new Date(),
        message: offlineServices.length
          ? `Unavailable: ${offlineServices.join(", ")}`
          : "All systems operational",
        services,
      });
    });
  }

  public forceCheck(): void {
    this.checkHealth();
  }

  public getCurrentStatus(): SystemStatus {
    return this.statusSubject.value;
  }

  private probe(url: string): Observable<boolean> {
    return this.http.get(url, { observe: "response" }).pipe(
      map((response) => response.status >= 200 && response.status < 300),
      catchError(() => of(false))
    );
  }
}
