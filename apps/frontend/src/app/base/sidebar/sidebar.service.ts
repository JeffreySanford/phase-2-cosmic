import { Injectable, inject } from "@angular/core";
import { BehaviorSubject } from "rxjs";
import { BrowserPlatformService } from "../../services/browser-platform.service";

@Injectable({ providedIn: "root" })
export class SidebarService {
  private readonly browser = inject(BrowserPlatformService);
  private collapsedSubject = new BehaviorSubject<boolean>(false);
  /** observable stream of collapse state */
  collapsed$ = this.collapsedSubject.asObservable();

  setCollapsed(value: boolean) {
    this.collapsedSubject.next(value);
    // Notify any non-Angular listeners that the sidebar toggled (useful
    // for third-party libs or components that listen on `window`).
    try {
      this.browser.dispatchWindowEvent("app:sidebar-toggled", value);
    } catch (e) {
      console.warn("Failed to dispatch sidebar toggle event", e);
      // ignore dispatch errors in exotic environments
    }
    if (this.browser.window) {
      // after the CSS transition (200ms) settle, dispatch a resize so
      // components relying on computed sizes can recalc.
      setTimeout(() => {
        try {
          this.browser.dispatchWindowEvent("resize");
        } catch (e) {
          console.warn("Failed to dispatch resize event", e); // ignore dispatch errors in exotic environments
        }
      }, 250);
    }
  }
}
