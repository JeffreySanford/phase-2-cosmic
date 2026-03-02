import { Component } from '@angular/core';
import { LoadProfilePct, LoadProfileService } from '../../services/load-profile.service';

@Component({
  selector: 'app-footer',
  templateUrl: './footer.component.html',
  styleUrls: ['./footer.component.scss'],
})
export class FooterComponent {
  readonly profileOptions: Array<{ value: LoadProfilePct; label: string; note: string }> = [
    { value: 10, label: '10% (Default)', note: 'Normal development' },
    { value: 25, label: '25%', note: 'Low stress profile' },
    { value: 50, label: '50%', note: 'Medium stress profile' },
    { value: 100, label: '100%', note: 'Smoke stress profile' },
  ];

  // avoid using injected service in property initializer (TS runs initializers before
  // constructor assignment). Expose as a getter to defer access until runtime.
  constructor(private loadProfile: LoadProfileService) {}

  get profile$() {
    return this.loadProfile.profile$;
  }

  setProfile(pct: LoadProfilePct): void {
    this.loadProfile.setProfile(pct);
  }
}
