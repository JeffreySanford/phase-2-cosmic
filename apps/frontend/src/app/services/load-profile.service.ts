import { Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { BehaviorSubject } from "rxjs";
import { map } from "rxjs/operators";
import { DataSourceService } from "./data-source.service";
import { BrowserPlatformService } from "./browser-platform.service";

export type LoadProfilePct = 10 | 25 | 50 | 100;
export type ReplayMode = "loop" | "once" | "random";

const STORAGE_KEY = "cosmic.loadProfilePct";
const STRESS_KEY = "cosmic.stressMode";
const REPLAY_INTERVAL_KEY = "cosmic.autoReplayIntervalMs";
const AUTO_REPLAY_KEY = "cosmic.autoReplayEnabled";
const REPLAY_MODE_KEY = "cosmic.autoReplayMode";

const REPLAY_INTERVAL_MIN_MS = 100;
const REPLAY_INTERVAL_MAX_MS = 60000;

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

  private workersSubject = new BehaviorSubject<number>(0);
  readonly workers$ = this.workersSubject.asObservable();

  private noteSubject = new BehaviorSubject<string>("");
  readonly note$ = this.noteSubject.asObservable();

  // Stress mode controls whether profile changes execute real backend load.
  private stressSubject = new BehaviorSubject<boolean>(
    this.readStressInitial()
  );
  readonly stress$ = this.stressSubject.asObservable();

  private historySubject = new BehaviorSubject<LoadProfilePct[]>([]);
  readonly history$ = this.historySubject.asObservable();

  // Persisted auto-replay settings
  private replayIntervalSubject = new BehaviorSubject<number>(
    this.readReplayInterval()
  );
  readonly replayInterval$ = this.replayIntervalSubject.asObservable();

  private autoReplaySubject = new BehaviorSubject<boolean>(
    this.readAutoReplayEnabled()
  );
  readonly autoReplay$ = this.autoReplaySubject.asObservable();

  private replayModeSubject = new BehaviorSubject<ReplayMode>(
    this.readReplayMode()
  );
  readonly replayMode$ = this.replayModeSubject.asObservable();

  // Next scheduled replay timestamp (ms since epoch).
  private nextReplayAtSubject = new BehaviorSubject<number | null>(null);
  readonly nextReplayAt$ = this.nextReplayAtSubject.asObservable();

  // Replay run log (timestamps of each auto-replay execution).
  private replayRunTimestampsSubject = new BehaviorSubject<number[]>([]);
  readonly replayRunTimestamps$ =
    this.replayRunTimestampsSubject.asObservable();

  private replayScheduleTimer: NodeJS.Timeout | null = null;
  private replayScheduleIntervalMs = 0;
  private replayScheduleActive = false;

  get isReplayScheduled(): boolean {
    return this.replayScheduleActive;
  }

  get replayMode(): ReplayMode {
    return this.replayModeSubject.value;
  }

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

    // If we persisted auto-replay enabled, restore it on reload.
    if (this.autoReplaySubject.value && this.replayIntervalSubject.value > 0) {
      this.startReplaySchedule(this.replayIntervalSubject.value);
    }
  }

  setStress(enabled: boolean): void {
    this.stressSubject.next(enabled);
    this.persistStress(enabled);
    if (enabled) {
      // Ensure live mode is used when stress is enabled.
      this.dataSource.setMode("live");
    }
  }

  replayHistory(intervalMs = 1000): void {
    const history = [...this.historySubject.value];
    if (!history.length) {
      return;
    }

    this.setStress(true);

    // Play back the recorded profile sequence.
    history.forEach((profile, index) => {
      setTimeout(() => {
        this.applyProfile(profile, false);
      }, index * intervalMs);
    });
  }

  setReplayIntervalMs(ms: number): void {
    if (!Number.isFinite(ms) || ms <= 0) return;
    this.replayIntervalSubject.next(ms);
    this.persistReplayInterval(ms);
  }

  setAutoReplayEnabled(enabled: boolean): void {
    this.autoReplaySubject.next(enabled);
    this.persistAutoReplayEnabled(enabled);
  }

  setReplayMode(mode: ReplayMode): void {
    this.replayModeSubject.next(mode);
    this.persistReplayMode(mode);
  }

  private updateNextReplayAt(intervalMs: number): void {
    this.nextReplayAtSubject.next(Date.now() + intervalMs);
  }

  private recordReplayRun(): void {
    const history = [...this.replayRunTimestampsSubject.value];
    history.unshift(Date.now());
    while (history.length > 20) {
      history.pop();
    }
    this.replayRunTimestampsSubject.next(history);
  }

  private getRandomInterval(): number {
    const min = REPLAY_INTERVAL_MIN_MS;
    const max = REPLAY_INTERVAL_MAX_MS;
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  startReplaySchedule(intervalMs: number): void {
    this.stopReplaySchedule();
    if (intervalMs <= 0) {
      return;
    }

    const mode = this.replayModeSubject.value;

    this.setReplayIntervalMs(intervalMs);
    this.setAutoReplayEnabled(true);

    this.replayScheduleIntervalMs = intervalMs;
    this.replayScheduleActive = true;

    const scheduleRun = (delayMs: number) => {
      this.updateNextReplayAt(delayMs);
      this.recordReplayRun();
      this.replayHistory(intervalMs);

      if (mode === "once") {
        // stop after a single replay run
        this.stopReplaySchedule();
        return;
      }

      const nextDelay = mode === "random" ? this.getRandomInterval() : delayMs;
      this.replayScheduleTimer = setTimeout(
        () => scheduleRun(nextDelay),
        nextDelay
      );
    };

    scheduleRun(intervalMs);
  }

  stopReplaySchedule(): void {
    if (this.replayScheduleTimer) {
      clearInterval(this.replayScheduleTimer);
      this.replayScheduleTimer = null;
    }
    this.replayScheduleActive = false;
    this.nextReplayAtSubject.next(null);
    this.setAutoReplayEnabled(false);
  }

  private recordHistory(pct: LoadProfilePct): void {
    const history = [...this.historySubject.value];
    history.push(pct);
    // keep a fixed maximum length
    while (history.length > 40) {
      history.shift();
    }
    this.historySubject.next(history);
  }

  private applyProfile(pct: LoadProfilePct, recordHistory = true): void {
    // If stress mode is disabled, apply locally and avoid backend call.
    if (!this.stressEnabled || this.dataSource.mode === "mock") {
      this.profileSubject.next(pct);
      this.modeSubject.next(pct === 10 ? "baseline" : "runtime-controlled");
      this.persist(pct);
      if (recordHistory) this.recordHistory(pct);
      return;
    }

    // In stress mode, send the profile to the backend orchestrator.
    this.http
      .post<{
        profilePct: LoadProfilePct;
        workers?: number;
        mode?: "baseline" | "runtime-controlled";
        note?: string;
      }>("/api/load-profile", { profilePct: pct })
      .subscribe({
        next: (resp) => {
          const nextPct = (resp?.profilePct ?? pct) as LoadProfilePct;
          this.profileSubject.next(nextPct);
          this.modeSubject.next(
            resp?.mode ?? (nextPct === 10 ? "baseline" : "runtime-controlled")
          );
          this.workersSubject.next(resp?.workers ?? 0);
          this.noteSubject.next(resp?.note ?? "");
          this.persist(nextPct);
          if (recordHistory) this.recordHistory(nextPct);
        },
        error: (err) => {
          console.warn(
            "Failed to apply runtime load profile, keeping local profile state:",
            err
          );
          // fallback to local state so telemetry polling profile still updates
          this.profileSubject.next(pct);
          this.modeSubject.next(pct === 10 ? "baseline" : "runtime-controlled");
          this.workersSubject.next(0);
          this.noteSubject.next("");
          this.persist(pct);
          if (recordHistory) this.recordHistory(pct);
        },
      });
  }

  toggleStress(): void {
    this.setStress(!this.stressSubject.value);
  }

  get stressEnabled(): boolean {
    return this.stressSubject.value;
  }

  get current(): LoadProfilePct {
    return this.profileSubject.value;
  }

  setProfile(pct: LoadProfilePct): void {
    // Manual changes should cancel any auto‑replay schedule to avoid fighting user input.
    if (this.replayScheduleActive) {
      this.stopReplaySchedule();
    }
    this.applyProfile(pct, true);
  }

  private refreshRuntimeStatus(): void {
    this.http
      .get<{
        profilePct?: LoadProfilePct;
        workers?: number;
        mode?: "baseline" | "runtime-controlled";
        note?: string;
      }>("/api/load-profile")
      .subscribe({
        next: (resp) => {
          if (resp?.profilePct && [10, 25, 50, 100].includes(resp.profilePct)) {
            this.profileSubject.next(resp.profilePct as LoadProfilePct);
          }
          if (resp?.mode) {
            this.modeSubject.next(resp.mode);
          }
          if (typeof resp?.workers === "number") {
            this.workersSubject.next(resp.workers);
          }
          if (typeof resp?.note === "string") {
            this.noteSubject.next(resp.note);
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
    const stored = this.browser.getStorageItem(STORAGE_KEY);
    if (stored && ["10", "25", "50", "100"].includes(stored)) {
      return Number(stored) as LoadProfilePct;
    }
    return 10;
  }

  private readReplayInterval(): number {
    const stored = this.browser.getStorageItem(REPLAY_INTERVAL_KEY);
    const parsed = Number(stored);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 5000;
  }

  private persistReplayInterval(ms: number): void {
    this.browser.setStorageItem(REPLAY_INTERVAL_KEY, String(ms));
  }

  private readAutoReplayEnabled(): boolean {
    return this.browser.getStorageItem(AUTO_REPLAY_KEY) === "true";
  }

  private persistAutoReplayEnabled(enabled: boolean): void {
    this.browser.setStorageItem(AUTO_REPLAY_KEY, String(enabled));
  }

  private readReplayMode(): ReplayMode {
    const stored = this.browser.getStorageItem(REPLAY_MODE_KEY);
    if (stored === "once" || stored === "random" || stored === "loop") {
      return stored;
    }
    return "loop";
  }

  private persistReplayMode(mode: ReplayMode): void {
    this.browser.setStorageItem(REPLAY_MODE_KEY, mode);
  }

  private readStressInitial(): boolean {
    const stored = this.browser.getStorageItem(STRESS_KEY);
    return stored === "true";
  }

  private persist(pct: LoadProfilePct): void {
    this.browser.setStorageItem(STORAGE_KEY, String(pct));
  }

  private persistStress(enabled: boolean): void {
    this.browser.setStorageItem(STRESS_KEY, String(enabled));
  }
}
