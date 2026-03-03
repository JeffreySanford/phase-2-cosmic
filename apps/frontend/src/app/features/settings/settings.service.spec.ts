import { TestBed } from '@angular/core/testing';
import { SettingsService } from './settings.service';

describe('SettingsService', () => {
  let service: SettingsService;

  beforeEach(() => {
    localStorage.removeItem('cosmic.userSettings');
    TestBed.configureTestingModule({});
    service = TestBed.inject(SettingsService);
  });

  it('should provide defaults on first load', () => {
    expect(service.current.profile.displayName).toBeTruthy();
    expect(service.current.application.defaultLandingRoute).toBe('/landing');
  });

  it('should persist and reload settings', () => {
    const next = {
      ...service.current,
      profile: { ...service.current.profile, displayName: 'Test User' },
    };
    service.update(next);

    const reloaded = TestBed.inject(SettingsService);
    expect(reloaded.current.profile.displayName).toBe('Test User');
  });
});
