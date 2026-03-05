import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map } from 'rxjs/operators';
import { Observable } from 'rxjs';
import { DataSourceService } from './data-source.service';
import { MockDataService } from './mock-data.service';

// Prometheus helper. Uses the frontend proxy at `/api/proxy/prometheus` so
// the browser doesn't need direct CORS access to the Prometheus server.
@Injectable({ providedIn: 'root' })
export class TelemetryService {
  private proxy = '/api/proxy/prometheus';

  constructor(private http: HttpClient, private dataSource: DataSourceService, private mock: MockDataService) {}

  queryInstant(metric: string): Observable<number> {
    if (this.dataSource.mode === 'mock') {
      return this.mock.telemetryInstant(metric);
    }
    const params = new HttpParams().set('query', metric);
    return this.http
      .get(this.proxy, { params, responseType: 'text' })
      .pipe(
        map((txt) => {
          try {
            const res = JSON.parse(String(txt));
            const val = res?.data?.result?.[0]?.value?.[1];
            return val ? Number(val) : 0;
          } catch {
            return 0;
          }
        })
      );
  }

  // range query: start/end are seconds since epoch (number), step in seconds
  queryRange(metric: string, start: number, end: number, step: number): Observable<unknown> {
    if (this.dataSource.mode === 'mock') {
      return this.mock.telemetryRange(metric, start, end, step);
    }
    const params = new HttpParams().set('query', metric).set('start', String(start)).set('end', String(end)).set('step', String(step));
    return this.http.get(this.proxy, { params, responseType: 'text' }).pipe(
      map((txt) => {
        try {
          return JSON.parse(String(txt));
        } catch {
          return {};
        }
      })
    );
  }

  // range query that computes the Prometheus `rate()` over the specified window (e.g. '1m')
  queryRangeRate(metric: string, start: number, end: number, step: number, window = '1m'): Observable<unknown> {
    // wrap the metric in a rate() call so Prometheus returns a per-second rate series
    if (this.dataSource.mode === 'mock') {
      // for mock, delegate to telemetryRange (mock produces values we can treat as rate outputs)
      return this.mock.telemetryRange(metric, start, end, step);
    }
    const expr = `rate(${metric}[${window}])`;
    const params = new HttpParams().set('query', expr).set('start', String(start)).set('end', String(end)).set('step', String(step));
    return this.http.get(this.proxy, { params, responseType: 'text' }).pipe(
      map((txt) => {
        try {
          return JSON.parse(String(txt));
        } catch {
          return {};
        }
      })
    );
  }
}
