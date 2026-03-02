/**
 * Common page state types for consistent UX across all routes.
 * These states follow the mission outcome: Human decision speed.
 */

export type PageState = 'loading' | 'empty' | 'stale' | 'error' | 'recovered' | 'ready';

export interface PageStateConfig {
  state: PageState;
  message?: string;
  icon?: string;
  action?: {
    label: string;
    callback: () => void;
  };
}

export interface DataSource {
  label: 'live' | 'fallback' | 'mock' | 'stale';
  lastUpdated?: string;
}
