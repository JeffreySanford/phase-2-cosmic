import "./polyfills";
import { importProvidersFrom } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import { AppComponent } from "./app/app.component";
import { AppModule } from "./app/app.module";
import { prefetchAladin } from "./app/services/aladin-prefetch.service";

// --- polyfill: ensure scroll-blocking event listeners are passive to avoid console violations ---
// Add before any framework code runs so that Angular Material's input listeners
// are registered with the passive flag. This prevents the Chrome warning seen in
// the allocator component logs.
const PASSIVE_EVENTS = new Set([
  "wheel",
  "mousewheel",
  "touchstart",
  "touchmove",
]);
(function () {
  const orig = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ) {
    if (PASSIVE_EVENTS.has(type)) {
      if (options === undefined) {
        options = { passive: true };
      } else if (typeof options === "boolean") {
        options = { capture: options, passive: true };
      } else if (
        typeof options === "object" &&
        (options as AddEventListenerOptions).passive == null
      ) {
        options = { ...(options as AddEventListenerOptions), passive: true };
      }
    }
    return orig.call(
      this,
      type,
      listener,
      options as boolean | AddEventListenerOptions
    );
  };
})();

// Warm up aladin-lite in the background on idle so the viewer loads faster when opened.
try {
  const maybe = globalThis as unknown as {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void;
  };
  if (typeof maybe.requestIdleCallback === "function") {
    maybe.requestIdleCallback(() => prefetchAladin(), { timeout: 2000 });
  } else {
    setTimeout(() => prefetchAladin(), 2000);
  }
} catch {
  // ignore on non-browser / SSR environments
}

bootstrapApplication(AppComponent, {
  providers: [importProvidersFrom(AppModule)],
})
  .catch((err) => console.error(err));
