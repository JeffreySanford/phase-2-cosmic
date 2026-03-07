import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable, BehaviorSubject, timer, switchMap, catchError, of } from "rxjs";

export interface VoServices {
  tapUrl?: string;
  dataLinkUrl?: string;
}

type CachedVoSamplesResponse = {
  fields?: string[];
  rows?: unknown[];
  links?: unknown[];
};

@Injectable({ providedIn: "root" })
export class VoService {
  // hot observable holding latest VO samples (array of simple sample objects)
  voSamples$ = new BehaviorSubject<Array<{ time: string; valueHuman: string; pct: number }>>([]);
  // loading indicator
  voLoading$ = new BehaviorSubject<boolean>(false);

  constructor(private http: HttpClient) {
    // start polling the cached samples endpoint every 5 seconds
    timer(0, 5000)
      .pipe(
        switchMap(() => {
          this.voLoading$.next(true);
          return this.http.get<CachedVoSamplesResponse>("/api/v1/vo/cached-samples").pipe(
            catchError(() => of(null))
          );
        })
      )
      .subscribe((res) => {
        try {
          if (!res) {
            this.voLoading$.next(false);
            return;
          }
          const fields = res?.fields || [];
          const rows = res?.rows || [];
          const parsed: Array<{ time: string; valueHuman: string; pct: number }> = [];
          const voRows: Array<Record<string, string>> = [];
          for (const r of rows) {
            let rec: Record<string, string> = {};
            if (Array.isArray(r)) {
              for (let i = 0; i < r.length; i++) {
                const key = fields[i] ?? `col${i}`;
                rec[key] = String(r[i] ?? "");
              }
            } else if (typeof r === "object" && r !== null) {
              rec = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v ?? "")]));
            }
            voRows.push(rec);
          }
          const sampleRecs = voRows.map((rec) => {
            const keys = Object.keys(rec);
            const timeVal = rec["time"] ?? rec["timestamp"] ?? (keys.length ? rec[keys[0]] : new Date().toLocaleTimeString());
            const valueRaw = rec["value"] ?? rec["flux"] ?? rec["mag"] ?? (keys.length > 1 ? rec[keys[1]] : "0");
            const n = Number(String(valueRaw).replace(/[^0-9.+-eE]/g, "")) || 0;
            return { time: String(timeVal), value: n };
          });
          const max = Math.max(1, ...sampleRecs.map((s) => s.value));
          for (const s of sampleRecs) {
            parsed.push({ time: s.time, valueHuman: this.humanRate(s.value), pct: Math.min(100, Math.max(0, (s.value / max) * 100)) });
          }
          if (parsed.length) this.voSamples$.next(parsed.slice(0, 50).reverse());
        } finally {
          this.voLoading$.next(false);
        }
      });
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
