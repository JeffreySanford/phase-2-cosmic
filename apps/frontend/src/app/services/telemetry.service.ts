import { HttpClient, HttpParams } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { map } from "rxjs/operators";
import { Observable } from "rxjs";
import { DataSourceService } from "./data-source.service";
import { MockDataService } from "./mock-data.service";
import { RequestCacheService } from "./request-cache.service";

// Prometheus helper. Uses the frontend proxy at `/api/proxy/prometheus` so
// the browser doesn't need direct CORS access to the Prometheus server.
@Injectable({ providedIn: "root" })
export class TelemetryService {
  private proxy = "/api/proxy/prometheus";

  constructor(
    private http: HttpClient,
    private dataSource: DataSourceService,
    private mock: MockDataService,
    private cache: RequestCacheService
  ) {}

  queryInstant(metric: string): Observable<number> {
    if (this.dataSource.mode === "mock") {
      return this.mock.telemetryInstant(metric);
    }
    const params = new HttpParams().set("query", metric);
    const key = `telemetry:instant:${metric}`;
    return this.cache.getOrCreate(key, 1500, () =>
      this.http.get(this.proxy, { params, responseType: "text" }).pipe(
        map((txt) => {
          try {
            const res = JSON.parse(String(txt));
            const val = res?.data?.result?.[0]?.value?.[1];
            return val ? Number(val) : 0;
          } catch {
            return 0;
          }
        })
      )
    );
  }

  // range query: start/end are seconds since epoch (number), step in seconds
  queryRange(
    metric: string,
    start: number,
    end: number,
    step: number
  ): Observable<unknown> {
    if (this.dataSource.mode === "mock") {
      return this.mock.telemetryRange(metric, start, end, step);
    }
    const params = new HttpParams()
      .set("query", metric)
      .set("start", String(start))
      .set("end", String(end))
      .set("step", String(step));
    const key = `telemetry:range:${metric}:${start}:${end}:${step}`;
    return this.cache.getOrCreate(key, 2500, () =>
      this.http.get(this.proxy, { params, responseType: "text" }).pipe(
        map((txt) => {
          try {
            return JSON.parse(String(txt));
          } catch {
            return {};
          }
        })
      )
    );
  }

  // range query that computes the Prometheus `rate()` over the specified window (e.g. '1m')
  queryRangeRate(
    metric: string,
    start: number,
    end: number,
    step: number,
    window = "1m"
  ): Observable<unknown> {
    // wrap the metric in a rate() call so Prometheus returns a per-second rate series
    if (this.dataSource.mode === "mock") {
      const expr = `rate(${metric}[${window}])`;
      return this.mock.telemetryRange(expr, start, end, step);
    }
    const expr = `rate(${metric}[${window}])`;
    const params = new HttpParams()
      .set("query", expr)
      .set("start", String(start))
      .set("end", String(end))
      .set("step", String(step));
    const key = `telemetry:range-rate:${metric}:${window}:${start}:${end}:${step}`;
    return this.cache.getOrCreate(key, 2500, () =>
      this.http.get(this.proxy, { params, responseType: "text" }).pipe(
        map((txt) => {
          try {
            return JSON.parse(String(txt));
          } catch {
            return {};
          }
        })
      )
    );
  }

  getPulsarStatus(): Observable<{
    brokers: number;
    topics: number;
    partitions: number;
    status: string;
    lastUpdated: string;
  }> {
    if (this.dataSource.mode === "mock") {
      return this.mock.getPulsarStatus();
    }
    return this.cache.getOrCreate("telemetry:pulsar-status", 5000, () =>
      this.http.get<{
        brokers: number;
        topics: number;
        partitions: number;
        status: string;
        lastUpdated: string;
      }>("/api/v1/pulsar/status")
    );
  }

  /**
   * Fetch the topology metrics payload from the Nest SSR proxy. This mirrors
   * `/api/metrics/topology` which itself proxies the governance backend.
   * The landing page uses this to compute a live governance coverage percentage.
   */
  getTopologyMetrics(): Observable<{ links?: Array<{ source?: string }> }> {
    if (this.dataSource.mode === "mock") {
      return this.mock.topologyMetrics();
    }
    const key = "telemetry:topology";
    return this.cache.getOrCreate(key, 2000, () =>
      this.http.get<{ links?: Array<{ source?: string }> }>(
        "/api/metrics/topology"
      )
    );
  }
}
