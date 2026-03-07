import { Injectable } from "@angular/core";
import { BehaviorSubject } from "rxjs";

export type DataMode = "live" | "mock";

declare global {
  interface Window {
    __E2E_MODE?: string;
  }
}

@Injectable({ providedIn: "root" })
export class DataSourceService {
  // initialize synchronously from E2E shim when present so tests see the correct mode early
  private modeSubject = new BehaviorSubject<DataMode>(
    (typeof window !== "undefined" && (window.__E2E_MODE === "mock" ? "mock" : "live")) as DataMode
  );
  readonly mode$ = this.modeSubject.asObservable();

  setMode(m: DataMode) {
    this.modeSubject.next(m);
  }

  get mode(): DataMode {
    return this.modeSubject.value;
  }
}
