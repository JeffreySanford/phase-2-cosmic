import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { map } from 'rxjs/operators';

export type LoadProfilePct = 10 | 25 | 50 | 100;

const STORAGE_KEY = 'cosmic.loadProfilePct';

@Injectable({ providedIn: 'root' })
export class LoadProfileService {
  private profileSubject = new BehaviorSubject<LoadProfilePct>(this.readInitial());
  readonly profile$ = this.profileSubject.asObservable();

  // Shared polling cadence for telemetry widgets across pages.
  readonly pollingMs$ = this.profile$.pipe(map((pct) => this.pollingMsFor(pct)));

  get current(): LoadProfilePct {
    return this.profileSubject.value;
  }

  setProfile(pct: LoadProfilePct): void {
    this.profileSubject.next(pct);
    this.persist(pct);
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
    try {
      localStorage.setItem(STORAGE_KEY, String(pct));
    } catch {
      // ignore persistence failures
    }
  }
}
