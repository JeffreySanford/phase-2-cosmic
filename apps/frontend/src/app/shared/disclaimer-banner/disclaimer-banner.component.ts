import { Component, Input } from '@angular/core';

export type DisclaimerType = 'modeling' | 'demo' | 'development' | 'simulation';

/**
 * Modeling Disclaimer Banner Component
 * 
 * Displays a dismissible banner to indicate when data or functionality
 * is modeling/simulation-based rather than production-ready.
 * 
 * Mission linkage:
 * - Mission outcome: Institutional trust and audit
 * - Operator/science impact: Clear labeling prevents misinterpretation of demo/modeling data
 * - Validation evidence: Visual disclaimer on demo-facing pages
 */
@Component({
  selector: 'app-disclaimer-banner',
  templateUrl: './disclaimer-banner.component.html',
  styleUrls: ['./disclaimer-banner.component.scss'],
  standalone: false
})
export class DisclaimerBannerComponent {
  @Input() type: DisclaimerType = 'modeling';
  @Input() message?: string;
  @Input() dismissible = true;

  dismissed = false;

  get defaultMessage(): string {
    switch (this.type) {
      case 'modeling':
        return 'This page displays modeling and simulation data for demonstration purposes. Values are not from operational telescope systems.';
      case 'demo':
        return 'Demo environment: Data shown is for demonstration and testing purposes only.';
      case 'development':
        return 'Development environment: Features shown are under active development and subject to change.';
      case 'simulation':
        return 'Simulated data: All displayed metrics are synthetically generated for testing and validation.';
      default:
        return 'Informational notice';
    }
  }

  get displayMessage(): string {
    return this.message || this.defaultMessage;
  }

  get bannerClass(): string {
    return `disclaimer-banner disclaimer-banner--${this.type}`;
  }

  dismiss(): void {
    if (this.dismissible) {
      this.dismissed = true;
    }
  }
}
