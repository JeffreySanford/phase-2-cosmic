import { HttpClient } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { Observable, of } from "rxjs";
import { catchError, map } from "rxjs/operators";
import { DataSourceService } from "./data-source.service";
import { MockDataService } from "./mock-data.service";

export type LakehouseSource = "live" | "fallback";

export interface LakehouseMetricsSummary {
  source: LakehouseSource;
  bronzeState: string;
  silverQuality: string;
  goldReadiness: string;
  evidence: string;
  bronzePercent?: number;
  silverPercent?: number;
  goldPercent?: number;
  qualityFailureRate?: number;
  transferTimeEstimate?: string;
  upstream?: {
    kind: "eso-obscore" | "pr41-local-mvp" | "fallback";
    endpoint: string;
    query: string;
    rowCount: number;
  };
  persistedAt?: string;
  freshness?: {
    maxAgeMs: number;
    lastUpdatedAt?: string;
    stale: boolean;
  };
}

@Injectable({ providedIn: "root" })
export class LakehouseMetricsService {
  private readonly http = inject(HttpClient);
  private readonly dataSource = inject(DataSourceService);
  private readonly mock = inject(MockDataService);

  private readonly endpoint = "/api/v1/lakehouse/metrics";

  getSummary(): Observable<LakehouseMetricsSummary> {
    if (this.dataSource.mode === "mock") {
      return this.mock.lakehouseMetrics();
    }

    return this.http.get<LakehouseMetricsSummary>(this.endpoint).pipe(
      map((value) => {
        const source: LakehouseSource =
          value?.source === "fallback" ? "fallback" : "live";

        return {
          ...value,
          source,
        };
      }),
      catchError(() =>
        of({
          source: "fallback" as const,
          bronzeState: "Lakehouse metrics unavailable",
          silverQuality: "Unavailable",
          goldReadiness: "Unavailable",
          evidence: "Live Lakehouse evidence endpoint unavailable",
          bronzePercent: 0,
          silverPercent: 0,
          goldPercent: 0,
          qualityFailureRate: 0,
          transferTimeEstimate: "n/a",
          upstream: {
            kind: "fallback" as const,
            endpoint: "n/a",
            query: "n/a",
            rowCount: 0,
          },
          freshness: {
            maxAgeMs: 15 * 60 * 1000,
            stale: true,
          },
        })
      )
    );
  }
}
