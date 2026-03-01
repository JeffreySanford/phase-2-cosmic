import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { map, catchError, shareReplay } from 'rxjs/operators';
import { Result } from './rx-utils';

export interface JobStatus {
  jobId: string;
  workflow: string;
  datasetId?: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
  parameters?: Record<string, unknown>;
  requestedBy?: string;
  [key: string]: unknown;
}

export interface JobSubmitRequest {
  workflow: string;
  datasetId?: string;
  parameters?: Record<string, unknown>;
  requestedBy?: string;
}

export interface JobSubmitResponse {
  jobId: string;
  status: string;
  queuedAt: string;
}


@Injectable({ providedIn: 'root' })
export class JobsService {
  private base = '/api/v1/jobs';
  private _listCache$?: Observable<JobStatus[]>;

  constructor(private http: HttpClient) {}

  list(): Observable<JobStatus[]> {
    return this.http.get<JobStatus[]>(this.base);
  }

  // Hot, cached observable for the job list. Use `invalidateList()` to refresh.
  listHot(forceReload = false): Observable<Result<JobStatus[]>> {
    if (forceReload || !this._listCache$) {
      this._listCache$ = this.list().pipe(
        catchError((err) => {
          return throwError(() => err);
        }),
        shareReplay({ bufferSize: 1, refCount: false })
      );
    }

    return this._listCache$.pipe(
      map((v) => ({ ok: true as const, value: v })),
      catchError((err) => of({ ok: false as const, error: err }))
    );
  }

  invalidateList(): void {
    this._listCache$ = undefined;
  }

  get(id: string): Observable<JobStatus> {
    return this.http.get<JobStatus>(`${this.base}/${id}`);
  }

  submit(body: { type: string; payload?: Record<string, unknown> }): Observable<JobStatus> {
    return this.http.post<JobStatus>(this.base, body);
  }

  submitJob(request: JobSubmitRequest): Observable<JobSubmitResponse> {
    return this.http.post<JobSubmitResponse>(this.base, request);
  }

  transition(id: string, nextState: string): Observable<JobStatus> {
    return this.http.post<JobStatus>(`${this.base}/${id}/transition`, { state: nextState });
  }

  types(): Observable<string[]> {
    return this.http.get<string[]>(`${this.base}/types`);
  }

  getLogs(id: string): Observable<string[]> {
    return this.http.get<string[]>(`${this.base}/${id}/logs`);
  }

  artifacts(id: string): Observable<{ name: string; url: string }[]> {
    return this.http.get<{ name: string; url: string }[]>(`${this.base}/${id}/artifacts`);
  }

  validate(type: string, payload: Record<string, unknown>): Observable<unknown> {
    return this.http.post<unknown>(`${this.base}/validate`, { type, payload });
  }
}
