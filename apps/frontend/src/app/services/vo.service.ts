import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import {
  Observable,
  BehaviorSubject,
  catchError,
  of,
} from "rxjs";

export interface VoServices {
  tapUrl?: string;
  dataLinkUrl?: string;
}

@Injectable({ providedIn: "root" })
export class VoService {
  // Sparkline samples consumed by TelemetryComponent (populated externally)
  voSamples$ = new BehaviorSubject<
    Array<{ time: string; valueHuman: string; pct: number }>
  >([]);
  voLoading$ = new BehaviorSubject<boolean>(false);

  private _workflowSamples: Record<string, Record<string, unknown>> = {};

  constructor(private http: HttpClient) {
    // Load curated VO workflow sample payloads once for submit-dialog auto-fill
    this.http
      .get<Record<string, Record<string, unknown>>>("/api/v1/vo/cached-samples")
      .pipe(catchError(() => of({} as Record<string, Record<string, unknown>>)))
      .subscribe((samples) => {
        this._workflowSamples = samples ?? {};
      });
  }

  /** Returns a curated sample payload for the given VO workflow type, or null. */
  getSampleForType(type: string): Record<string, unknown> | null {
    return this._workflowSamples[type] ?? null;
  }

  getServices(): Observable<VoServices> {
    return this.http.get<VoServices>("/api/v1/vo/services");
  }

  // lightweight human-readable formatting reused by service
  private humanRate(v: number) {
    if (!isFinite(v)) return "0";
    if (v === 0) return "0 B/s";
    const abs = Math.abs(v);
    const units = ["B/s", "KB/s", "MB/s", "GB/s"];
    let i = 0;
    let val = abs;
    while (val >= 1024 && i < units.length - 1) {
      val /= 1024;
      i++;
    }
    return `${v < 0 ? "-" : ""}${val.toFixed(2)} ${units[i]}`;
  }
}
