import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { DEFAULT_USER_SETTINGS, UserSettings } from './settings.model';

const SETTINGS_KEY = 'cosmic.userSettings';

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly settingsSubject = new BehaviorSubject<UserSettings>(this.readInitial());
  readonly settings$ = this.settingsSubject.asObservable();

  get current(): UserSettings {
    return this.settingsSubject.value;
  }

  update(next: UserSettings): void {
    this.settingsSubject.next(next);
    this.persist(next);
  }

  reset(): void {
    const resetSettings: UserSettings = JSON.parse(JSON.stringify(DEFAULT_USER_SETTINGS));
    this.settingsSubject.next(resetSettings);
    this.persist(resetSettings);
  }

  private readInitial(): UserSettings {
    if (typeof localStorage === 'undefined') {
      return JSON.parse(JSON.stringify(DEFAULT_USER_SETTINGS));
    }
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) {
        return JSON.parse(JSON.stringify(DEFAULT_USER_SETTINGS));
      }
      const parsed = JSON.parse(raw) as Partial<UserSettings>;
      return {
        profile: { ...DEFAULT_USER_SETTINGS.profile, ...(parsed.profile || {}) },
        preferences: { ...DEFAULT_USER_SETTINGS.preferences, ...(parsed.preferences || {}) },
        application: { ...DEFAULT_USER_SETTINGS.application, ...(parsed.application || {}) },
        notifications: { ...DEFAULT_USER_SETTINGS.notifications, ...(parsed.notifications || {}) },
      };
    } catch {
      return JSON.parse(JSON.stringify(DEFAULT_USER_SETTINGS));
    }
  }

  private persist(settings: UserSettings): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // ignore persistence failures
    }
  }
}
