import { Injectable } from '@angular/core';
import { MatSnackBar, MatSnackBarConfig } from '@angular/material/snack-bar';

@Injectable({ providedIn: 'root' })
export class SnackService {
  constructor(private snackBar: MatSnackBar) {
    // Initialize CSS variable for footer offset and keep it updated.
    this.updateFooterOffset();
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', () => this.updateFooterOffset());
      // Also observe DOM changes in case footer height changes dynamically.
      try {
        const obs = new MutationObserver(() => this.updateFooterOffset());
        obs.observe(document.body, { childList: true, subtree: true });
      } catch {
        // ignore in restricted environments
      }
    }
  }

  private updateFooterOffset(): void {
    try {
      const footer = document.querySelector('footer');
      const h = footer ? `${Math.ceil(footer.getBoundingClientRect().height)}px` : '0px';
      document.documentElement.style.setProperty('--app-footer-height', h);
    } catch (e) {
      console.error(e); // ignore
    }
  }

  private open(message: string, panelClass: string, duration = 6000) {
    const cfg: MatSnackBarConfig = {
      duration,
      horizontalPosition: 'center',
      verticalPosition: 'bottom',
      panelClass: [panelClass, 'app-snack'],
    };
    this.snackBar.open(message, undefined, cfg);
  }

  showSuccess(message: string, duration = 5000) {
    this.open(message, 'snack-success', duration);
  }

  showInfo(message: string, duration = 6000) {
    this.open(message, 'snack-info', duration);
  }

  showError(message: string, duration = 8000) {
    this.open(message, 'snack-error', duration);
  }
}
