import { Injectable } from "@angular/core";
import { BehaviorSubject } from "rxjs";

/**
 * All known feature flags.  New flags for upcoming sprints should be declared here
 * as `false` (disabled by default) and flipped via localStorage or a future remote
 * config endpoint once the feature is production-ready.
 */
export interface FeatureFlags {
  /** Sprint 2 — FSP allocator simulator UI */
  "trident.fsp-allocator": boolean;
  /** Sprint 3 — Execution plans create / apply / status pages */
  "trident.execution-plans": boolean;
  /** Sprint 4 — Mode-aware backend orchestration templates UI */
  "trident.mode-routing": boolean;
  /** Sprint 6 — Job lineage display and submission editor */
  "jobs.lineage": boolean;
}

const STORAGE_KEY = "cosmic.featureFlags";

const DEFAULTS: FeatureFlags = {
  "trident.fsp-allocator": false,
  "trident.execution-plans": false,
  "trident.mode-routing": false,
  "jobs.lineage": false,
};

@Injectable({ providedIn: "root" })
export class FeatureFlagService {
  private readonly flagsSubject = new BehaviorSubject<FeatureFlags>(
    this.readInitial()
  );

  /** Observable stream of the current flag state. */
  readonly flags$ = this.flagsSubject.asObservable();

  /** Synchronous snapshot of the current flag state. */
  get current(): FeatureFlags {
    return this.flagsSubject.value;
  }

  /** Returns true when the named flag is enabled. */
  isEnabled(flag: keyof FeatureFlags): boolean {
    return this.current[flag];
  }

  /**
   * Override one or more flags at runtime (e.g. from a dev console or test
   * harness).  Overrides are written to localStorage so they survive page
   * refreshes during development.
   */
  override(overrides: Partial<FeatureFlags>): void {
    const next: FeatureFlags = { ...this.current, ...overrides };
    this.flagsSubject.next(next);
    this.persist(next);
  }

  /** Reset all flags back to their compiled defaults and clear storage. */
  reset(): void {
    const defaults: FeatureFlags = { ...DEFAULTS };
    this.flagsSubject.next(defaults);
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  private readInitial(): FeatureFlags {
    if (typeof localStorage === "undefined") {
      return { ...DEFAULTS };
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULTS };
      const parsed = JSON.parse(raw) as Partial<FeatureFlags>;
      return { ...DEFAULTS, ...parsed };
    } catch {
      return { ...DEFAULTS };
    }
  }

  private persist(flags: FeatureFlags): void {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(flags));
    }
  }
}
