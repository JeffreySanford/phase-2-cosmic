import { DOCUMENT } from "@angular/common";
import { Injectable, inject } from "@angular/core";
import { BehaviorSubject } from "rxjs";

export type DataMode = "live" | "mock";

declare global {
  interface Window {
    __E2E_MODE?: string;
  }
}

@Injectable({ providedIn: "root" })
export class DataSourceService {
  private readonly document = inject(DOCUMENT, { optional: true });

  private getInitialMode(): DataMode {
    const browserWindow = this.document?.defaultView as
      | (Window & { __E2E_MODE?: string })
      | null
      | undefined;
    return browserWindow?.__E2E_MODE === "mock" ? "mock" : "live";
  }

  // initialize synchronously from E2E shim when present so tests see the correct mode early
  private modeSubject = new BehaviorSubject<DataMode>(this.getInitialMode());
  readonly mode$ = this.modeSubject.asObservable();

  setMode(m: DataMode): void {
    this.modeSubject.next(m);
  }

  get mode(): DataMode {
    return this.modeSubject.value;
  }
}
