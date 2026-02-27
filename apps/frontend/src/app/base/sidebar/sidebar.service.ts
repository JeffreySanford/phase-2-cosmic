import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SidebarService {
  private collapsedSubject = new BehaviorSubject<boolean>(false);
  /** observable stream of collapse state */
  collapsed$ = this.collapsedSubject.asObservable();

  setCollapsed(value: boolean) {
    this.collapsedSubject.next(value);
    // Notify any non-Angular listeners that the sidebar toggled (useful
    // for third-party libs or components that listen on `window`).
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent('app:sidebar-toggled', { detail: value }));
      } catch (e) {
        console.warn('Failed to dispatch sidebar toggle event', e);
        // ignore dispatch errors in exotic environments
      }
      // after the CSS transition (200ms) settle, dispatch a resize so
      // components relying on computed sizes can recalc.
      setTimeout(() => {
        try { window.dispatchEvent(new Event('resize')); } 
        catch (e) {
          console.warn('Failed to dispatch resize event', e); // ignore dispatch errors in exotic environments
        }
      }, 250);
    }
  }
}
