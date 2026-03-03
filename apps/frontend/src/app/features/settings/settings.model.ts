export type ThemeMode = 'system' | 'light' | 'dark';

export interface UserSettings {
  profile: {
    displayName: string;
    email: string;
    timezone: string;
    language: string;
  };
  preferences: {
    themeMode: ThemeMode;
    accentColor: string;
    reduceMotion: boolean;
    compactDensity: boolean;
  };
  application: {
    defaultLandingRoute: string;
    autoRefreshSeconds: number;
    telemetryWindowSeconds: number;
    showModelingDisclaimers: boolean;
    showAdvancedDiagnostics: boolean;
  };
  notifications: {
    inAppToasts: boolean;
    warnOnHighLoad: boolean;
  };
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  profile: {
    displayName: 'Operator',
    email: 'operator@local',
    timezone: 'America/Chicago',
    language: 'en-US',
  },
  preferences: {
    themeMode: 'system',
    accentColor: '#06b6d4',
    reduceMotion: false,
    compactDensity: false,
  },
  application: {
    defaultLandingRoute: '/landing',
    autoRefreshSeconds: 30,
    telemetryWindowSeconds: 300,
    showModelingDisclaimers: true,
    showAdvancedDiagnostics: false,
  },
  notifications: {
    inAppToasts: true,
    warnOnHighLoad: true,
  },
};
