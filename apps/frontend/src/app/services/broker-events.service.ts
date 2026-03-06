import { Injectable, OnDestroy } from "@angular/core";
import { Subject, Observable } from "rxjs";

export interface BrokerEvent {
  type: string;
  payload: Record<string, unknown>;
}

declare global {
  interface Window {
    __emitBrokerEvent?: (evt: BrokerEvent) => void;
  }
}

/**
 * Service responsible for subscribing to live broker events (job ingest,
 * status updates, etc.) via Server-Sent Events (SSE).
 */
@Injectable({ providedIn: "root" })
export class BrokerEventsService implements OnDestroy {
  private events$ = new Subject<BrokerEvent>();
  private source?: EventSource;

  constructor() {
    // open SSE connection when service is instantiated
    const url = "/api/v1/broker-events";
    this.source = new EventSource(url);
    this.source.onmessage = (e) => {
      try {
        const parsed: BrokerEvent = JSON.parse(e.data);
        this.events$.next(parsed);
      } catch (err) {
        console.error("failed to parse broker event", err, e.data);
      }
    };
    this.source.onerror = (err) => {
      console.error("broker events SSE error", err);
      // optionally try reconnect logic here
    };

    // expose helper for end-to-end tests to simulate incoming events
    if (typeof window !== "undefined") {
      window.__emitBrokerEvent = (evt: BrokerEvent) => this._push(evt);
    }
  }

  /**
   * Observable stream of broker events.
   */
  get events(): Observable<BrokerEvent> {
    return this.events$.asObservable();
  }

  /**
   * Internal helper to push an event into the stream (used by tests).
   */
  _push(event: BrokerEvent): void {
    this.events$.next(event);
  }

  ngOnDestroy(): void {
    this.source?.close();
  }
}
