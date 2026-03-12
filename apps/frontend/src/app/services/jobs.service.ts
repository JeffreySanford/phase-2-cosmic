import { DOCUMENT } from "@angular/common";
import { HttpClient } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { Observable, of, throwError, interval } from "rxjs";
import {
  map,
  catchError,
  shareReplay,
  startWith,
  switchMap,
} from "rxjs/operators";
import { Result } from "./rx-utils";

export interface JobStatus {
  jobId: string;
  workflow: string;
  datasetId?: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
  parameters?: Record<string, unknown>;
  lineage?: Record<string, unknown>;
  requestedBy?: string;
  [key: string]: unknown;
}

export interface JobSubmitRequest {
  workflow: string;
  datasetId?: string;
  lineage?: Record<string, unknown>;
  parameters?: Record<string, unknown>;
  manifest?: Record<string, unknown>;
  requestedBy?: string;
}

export interface JobSubmitResponse {
  jobId: string;
  status: string;
  queuedAt: string;
}

@Injectable({ providedIn: "root" })
export class JobsService {
  private http = inject(HttpClient);
  private document = inject(DOCUMENT, { optional: true });

  private base = "/api/v1/jobs";

  private toAbsoluteArtifactUrl(url: string): string {
    if (!url.startsWith("/")) {
      return url;
    }
    const origin = this.document?.defaultView?.location?.origin;
    return origin ? `${origin}${url}` : url;
  }

  list(
    workflow?: string,
    state?: string,
    page?: number,
    size?: number
  ): Observable<JobStatus[]> {
    const params: Record<string, string> = {};
    if (workflow) params["workflow"] = workflow;
    if (state) params["state"] = state;
    if (page !== undefined) params["page"] = String(page);
    if (size !== undefined) params["size"] = String(size);
    return this.http.get<JobStatus[]>(this.base, { params });
  }

  // Polling hot observable for the job list.  Subscribers share a single
  // HTTP request stream and the data is replayed.  The cache is invalidated
  // by `invalidateList()` or by simply waiting for the polling interval.
  // polling interval for the full job list; shortened so that completed jobs
  // appear within a few seconds instead of waiting 30s
  private _listPollIntervalMs = 5_000;
  // interval for watching a single job; simulator jobs complete in a
  // few hundred milliseconds, so poll faster during UI development so we
  // can observe the RUNNING state and show the timer.  500ms strikes a
  // reasonable balance between responsiveness and not hammering the API.
  private _watchPollIntervalMs = 200; // 5 Hz polling for short-lived simulator jobs
  private _listCache$?: Observable<JobStatus[]>;

  listHot(forceReload = false): Observable<Result<JobStatus[]>> {
    if (forceReload || !this._listCache$) {
      // build a new polling stream
      this._listCache$ = interval(this._listPollIntervalMs).pipe(
        startWith(0),
        switchMap(() => this.list()),
        catchError((err) => {
          // swallow the error; subscribers will see a failure result
          return throwError(() => err);
        }),
        shareReplay({ bufferSize: 1, refCount: true })
      );
    }

    const cache$ = this._listCache$ ?? of([] as JobStatus[]);
    return cache$.pipe(
      map((v) => ({ ok: true as const, value: v })),
      catchError((err) => of({ ok: false as const, error: err }))
    );
  }

  invalidateList(): void {
    this._listCache$ = undefined;
  }

  // ------------------------------------------------------------------------
  // helper for watching a specific job's status.  The returned observable
  // polls the backend and is share-replayed so multiple components can
  // subscribe without creating duplicate HTTP requests.
  private _jobCache = new Map<string, Observable<JobStatus>>();

  watchJob(id: string): Observable<JobStatus> {
    if (!this._jobCache.has(id)) {
      const obs = interval(this._watchPollIntervalMs).pipe(
        startWith(0),
        switchMap(() => this.get(id)),
        shareReplay({ bufferSize: 1, refCount: true })
      );
      this._jobCache.set(id, obs);
    }
    return this._jobCache.get(id) as Observable<JobStatus>;
  }

  invalidateJob(id: string): void {
    this._jobCache.delete(id);
  }

  get(id: string): Observable<JobStatus> {
    return this.http.get<JobStatus>(`${this.base}/${id}`);
  }

  submit(body: {
    type: string;
    payload?: Record<string, unknown>;
  }): Observable<JobStatus> {
    return this.http.post<JobStatus>(this.base, body);
  }

  submitJob(request: JobSubmitRequest): Observable<JobSubmitResponse> {
    return this.http.post<JobSubmitResponse>(this.base, request);
  }

  transition(id: string, nextState: string): Observable<JobStatus> {
    return this.http.post<JobStatus>(`${this.base}/${id}/transition`, {
      state: nextState,
    });
  }

  types(): Observable<string[]> {
    return this.http.get<string[]>(`${this.base}/types`);
  }

  getLogs(id: string): Observable<string[]> {
    return this.http.get<string[]>(`${this.base}/${id}/logs`);
  }

  artifacts(id: string): Observable<{ name: string; url: string }[]> {
    return this.http
      .get<{ name: string; url: string }[]>(`${this.base}/${id}/artifacts`)
      .pipe(
        map((arr) =>
          (arr || []).map((a) => ({
            name: a.name,
            url:
              a.url && typeof a.url === "string"
                ? this.toAbsoluteArtifactUrl(a.url)
                : a.url,
          }))
        )
      );
  }

  // Dispatch scanner admin endpoints

  publicSources(): Observable<Array<{ name: string; url: string }>> {
    return this.http.get<Array<{ name: string; url: string }>>(
      "/api/v1/public-sources"
    );
  }
  getDispatchConfig(): Observable<{
    intervalSeconds: number;
    scannedCount: number;
    dispatchedCount: number;
  }> {
    return this.http.get<{
      intervalSeconds: number;
      scannedCount: number;
      dispatchedCount: number;
    }>(`/api/v1/admin/dispatch`);
  }

  setDispatchInterval(seconds: number): Observable<unknown> {
    return this.http.post<unknown>(`/api/v1/admin/dispatch`, {
      intervalSeconds: seconds,
    });
  }

  releaseDeferred(): Observable<{ released: number }> {
    return this.http.post<{ released: number }>(
      `/api/v1/admin/release-deferred`,
      {}
    );
  }

  validate(
    type: string,
    payload: Record<string, unknown>
  ): Observable<unknown> {
    return this.http.post<unknown>(`${this.base}/validate`, { type, payload });
  }

  deleteJob(id: string): Observable<unknown> {
    return this.http.delete(`${this.base}/${id}`);
  }

  /**
   * Shortcut to retrieve lineage metadata for a job.  Mirrors backend
   * `/jobs/{id}/lineage` endpoint and is used by the UI when detail panel
   * requires explicit refresh.
   */
  getLineage(id: string): Observable<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>(`${this.base}/${id}/lineage`);
  }

  /**
   * Update lineage metadata for a job. Mirrors backend `/jobs/{id}/lineage` PUT endpoint.
   */
  updateLineage(
    id: string,
    lineage: Record<string, unknown>
  ): Observable<unknown> {
    return this.http.put<unknown>(`${this.base}/${id}/lineage`, lineage);
  }
}
