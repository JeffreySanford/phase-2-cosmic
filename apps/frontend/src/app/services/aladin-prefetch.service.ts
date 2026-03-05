export function prefetchAladin(): void {
  try {
    const win = window as Window & { __ALADIN_PREFETCHED?: unknown };
    if (win.__ALADIN_PREFETCHED) return;
    // dynamic import warms the module cache and fetches the chunk in background
    import("aladin-lite")
      .then((mod) => {
        win.__ALADIN_PREFETCHED = mod;
      })
      .catch(() => {
        // ignore
      });
  } catch {
    // non-fatal; keep quiet
  }
}

export function isAladinPrefetched(): boolean {
  const win = window as Window & { __ALADIN_PREFETCHED?: unknown };
  return Boolean(win.__ALADIN_PREFETCHED);
}
