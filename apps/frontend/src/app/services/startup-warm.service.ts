import { Injectable, Optional } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { of } from "rxjs";
import { catchError } from "rxjs/operators";
import { DataSourceService } from "./data-source.service";
import { RequestCacheService } from "./request-cache.service";
import { prefetchAladin } from "./aladin-prefetch.service";

@Injectable({ providedIn: "root" })
export class StartupWarmService {
  private warmed = false;

  constructor(
    @Optional() private http: HttpClient | null,
    private dataSource: DataSourceService,
    private cache: RequestCacheService
  ) {}

  warm(): void {
    if (this.warmed) return;
    this.warmed = true;

    if (typeof window !== "undefined") {
      setTimeout(() => prefetchAladin(), 250);
    }

    if (this.dataSource.mode === "mock") return;

    // If HttpClient is not available (e.g. unit tests without HttpClientTestingModule),
    // skip network warm-up to avoid injecting HTTP dependencies into many specs.
    if (!this.http) return;
    const http = this.http;

    setTimeout(() => {
      this.cache
        .getOrCreate("telemetry:instant:sum(up)", 1500, () =>
          http
            .get("/api/proxy/prometheus", {
              params: { query: "sum(up)" },
              responseType: "text",
            })
            .pipe(catchError(() => of("0")))
        )
        .subscribe();

      this.cache
        .getOrCreate("diagnostics:index", 5000, () =>
          http
            .get("/api/diagnostics")
            .pipe(catchError(() => of({ path: "", files: [] })))
        )
        .subscribe();

      this.cache
        .getOrCreate("diagnostics:pulsar-status", 5000, () =>
          http
            .get("/api/v1/pulsar/status")
            .pipe(catchError(() => of({ brokers: 0, topics: 0, partitions: 0 })))
        )
        .subscribe();

      this.cache
        .getOrCreate("diagnostics:rabbit-status", 5000, () =>
          http
            .get("/api/v1/rabbitmq/status")
            .pipe(catchError(() => of({ status: "unknown", connection: "unknown" })))
        )
        .subscribe();
    }, 500);
  }
}
