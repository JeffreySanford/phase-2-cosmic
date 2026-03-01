import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { map, catchError, shareReplay } from 'rxjs/operators';
import { Result } from './rx-utils';

export interface Dataset {
  id: string;
  name: string;
  description?: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
}

export interface DatasetRequest {
  id?: string;
  name: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

@Injectable({ providedIn: 'root' })
export class DatasetsService {
  private base = '/api/v1/datasets';
  constructor(private http: HttpClient) {}

  list(): Observable<Dataset[]> {
    return this.http.get<Dataset[]>(this.base);
  }

  private _listCache$?: Observable<Dataset[]>;

  listHot(forceReload = false): Observable<Result<Dataset[]>> {
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

  get(id: string): Observable<Dataset> {
    return this.http.get<Dataset>(`${this.base}/${id}`);
  }

  create(req: DatasetRequest): Observable<Dataset> {
    return this.http.post<Dataset>(this.base, req);
  }
}
