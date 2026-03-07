import { Injectable } from "@angular/core";
import { Observable, defer } from "rxjs";
import { shareReplay } from "rxjs/operators";

type CacheEntry<T> = {
  expiresAt: number;
  value$: Observable<T>;
};

@Injectable({ providedIn: "root" })
export class RequestCacheService {
  private readonly cache = new Map<string, CacheEntry<unknown>>();

  getOrCreate<T>(
    key: string,
    ttlMs: number,
    factory: () => Observable<T>
  ): Observable<T> {
    const now = Date.now();
    const existing = this.cache.get(key) as CacheEntry<T> | undefined;
    if (existing && existing.expiresAt > now) {
      return existing.value$;
    }

    const value$ = defer(factory).pipe(
      shareReplay({ bufferSize: 1, refCount: false, windowTime: ttlMs })
    );
    this.cache.set(key, {
      expiresAt: now + ttlMs,
      value$,
    });
    return value$;
  }

  clear(keyPrefix?: string): void {
    if (!keyPrefix) {
      this.cache.clear();
      return;
    }
    for (const key of this.cache.keys()) {
      if (key.startsWith(keyPrefix)) {
        this.cache.delete(key);
      }
    }
  }
}
