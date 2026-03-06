import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { Observable, of, throwError } from "rxjs";
import { map, catchError, shareReplay } from "rxjs/operators";
import { Result } from "./rx-utils";

export interface Dataset {
  id: string;
  name: string;
  description?: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
  // Provenance linkage for reproducible science
  workflow?: string;
  jobId?: string;
  sourceDatasetId?: string;
  processingTimestamp?: string;
  parameters?: Record<string, unknown>;
  manifest?: Record<string, unknown>;
  ngvlaParams?: {
    arraySegment?: string;
    antennaClass?: string;
    frequencyBandGHz?: { min: number; max: number };
  };
}

export interface DatasetRequest {
  id?: string;
  name: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

@Injectable({ providedIn: "root" })
export class DatasetsService {
  private base = "/api/v1/datasets";
  constructor(private http: HttpClient) {}

  list(): Observable<Dataset[]> {
    // flatten metadata keys onto the dataset object so provenance fields
    // (workflow, jobId, parameters, etc.) become top-level properties.
    return this.http.get<Dataset[]>(this.base).pipe(
      map((arr) =>
        (arr || []).map((d) => {
          if (d.metadata && typeof d.metadata === "object") {
            // spread metadata into dataset, precedence to existing keys
            return { ...d, ...d.metadata } as Dataset;
          }
          return d;
        })
      )
    );
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
    // after creation the backend returns the raw dataset response; merge
    // any metadata fields so caller can immediately access provenance info.
    return this.http.post<Dataset>(this.base, req).pipe(
      map((d) => {
        if (d.metadata && typeof d.metadata === "object") {
          return { ...d, ...d.metadata } as Dataset;
        }
        return d;
      })
    );
  }
}
