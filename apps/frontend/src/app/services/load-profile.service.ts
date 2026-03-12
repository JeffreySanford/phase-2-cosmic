import { Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { BehaviorSubject } from "rxjs";
import { map } from "rxjs/operators";
import { DataSourceService } from "./data-source.service";
import { BrowserPlatformService } from "./browser-platform.service";

export type LoadProfilePct = 10 | 25 | 50 | 100;

const STORAGE_KEY = "cosmic.loadProfilePct";

@Injectable({ providedIn: "root" })
export class LoadProfileService {
  private http = inject(HttpClient);
  private dataSource = inject(DataSourceService);
  private browser = inject(BrowserPlatformService);

  private profileSubject = new BehaviorSubject<LoadProfilePct>(
    this.readInitial()
  );
  readonly profile$ = this.profileSubject.asObservable();
  private modeSubject = new BehaviorSubject<"baseline" | "runtime-controlled">(
    "baseline"
  );
  readonly mode$ = this.modeSubject.asObservable();

  // Shared polling cadence for telemetry widgets across pages.
  readonly pollingMs$ = this.profile$.pipe(
    map((pct) => this.pollingMsFor(pct))
  );

  constructor() {
    this.dataSource.mode$.subscribe((mode) => {
      if (mode === "live") {
        this.refreshRuntimeStatus();
      }
    });
  }

  get current(): LoadProfilePct {
    return this.profileSubject.value;
  }

  setProfile(pct: LoadProfilePct): void {
    if (this.dataSource.mode === "mock") {
      this.profileSubject.next(pct);
      this.modeSubject.next(pct === 10 ? "baseline" : "runtime-controlled");
      this.persist(pct);
      return;
    }

    this.http
      .post<{
        profilePct: LoadProfilePct;
        mode?: "baseline" | "runtime-controlled";
      }>("/api/load-profile", { profilePct: pct })
      .subscribe({
        next: (resp) => {
          const nextPct = (resp?.profilePct ?? pct) as LoadProfilePct;
          this.profileSubject.next(nextPct);
          this.modeSubject.next(
            resp?.mode ?? (nextPct === 10 ? "baseline" : "runtime-controlled")
          );
          this.persist(nextPct);
        },
        error: (err) => {
          console.warn(
            "Failed to apply runtime load profile, keeping local profile state:",
            err
          );
          // fallback to local state so telemetry polling profile still updates
          this.profileSubject.next(pct);
          this.modeSubject.next(pct === 10 ? "baseline" : "runtime-controlled");
          this.persist(pct);
        },
      });
  }

  private refreshRuntimeStatus(): void {
    this.http
      .get<{
        profilePct?: LoadProfilePct;
        mode?: "baseline" | "runtime-controlled";
      }>("/api/load-profile")
      .subscribe({
        next: (resp) => {
          if (resp?.profilePct && [10, 25, 50, 100].includes(resp.profilePct)) {
            this.profileSubject.next(resp.profilePct as LoadProfilePct);
          }
          if (resp?.mode) {
            this.modeSubject.next(resp.mode);
          }
        },
        error: () => {
          // keep local default on startup if backend status endpoint is unavailable
        },
      });
  }

  private pollingMsFor(pct: LoadProfilePct): number {
    switch (pct) {
      case 10:
        return 30000;
      case 25:
        return 15000;
      case 50:
        return 5000;
      case 100:
        return 1000;
      default:
        return 5000;
    }
  }

  private readInitial(): LoadProfilePct {
    // Always start in normal-operation mode for safety.
    return 10;
  }

  private persist(pct: LoadProfilePct): void {
    this.browser.setStorageItem(STORAGE_KEY, String(pct));
  }
}
