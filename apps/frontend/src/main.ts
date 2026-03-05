import { platformBrowserDynamic } from "@angular/platform-browser-dynamic";
import { AppModule } from "./app/app.module";
import { prefetchAladin } from "./app/services/aladin-prefetch.service";

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

platformBrowserDynamic()
  .bootstrapModule(AppModule)
  .catch((err) => console.error(err));
