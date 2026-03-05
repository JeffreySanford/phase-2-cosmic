import { Observable, of } from "rxjs";
import { map, catchError, shareReplay } from "rxjs/operators";

export type Result<T, E = unknown> =
  | { ok: true; value: T }
  | { ok: false; error: E };

/**
 * Wrap an observable into a shared, hot Result-wrapped observable.
 * The returned stream will replay the last value to new subscribers.
 */
export function hotResult<T>(
  src$: Observable<T>
): Observable<Result<T, unknown>> {
  const shared$ = src$.pipe(shareReplay({ bufferSize: 1, refCount: false }));
  return shared$.pipe(
    map((v) => ({ ok: true as const, value: v })),
    catchError((err) => of({ ok: false as const, error: err }))
  );
}
