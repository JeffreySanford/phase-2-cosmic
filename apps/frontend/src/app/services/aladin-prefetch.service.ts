// Module-level promise — set as soon as prefetch starts so the viewer
// can await the same init() instead of starting a second parallel compile.
let _initPromise: Promise<unknown> | null = null;

export function prefetchAladin(): void {
  if (_initPromise) return;
  _initPromise = (async () => {
    try {
      const mod = await import("aladin-lite");
      const m = (mod && (mod.default ?? mod)) as {
        init?: () => Promise<void>;
      } | null;
      if (m && typeof m.init === "function") {
        await m.init();
      }
      return mod;
    } catch {
      // non-fatal
      return null;
    }
  })();
}

/** Returns the in-flight (or completed) init promise, or null if prefetch hasn't started. */
export function getAladinInitPromise(): Promise<unknown> | null {
  return _initPromise;
}

export function isAladinPrefetched(): boolean {
  // kept for API compat; viewer now uses getAladinInitPromise() instead
  return _initPromise !== null;
}
