import { Injectable, OnDestroy } from "@angular/core";
import { Subject, Observable } from "rxjs";

export interface BrokerEvent {
  type: string;
  payload: Record<string, unknown>;
}

declare global {
  interface Window {
    __emitBrokerEvent?: (evt: BrokerEvent) => void;
    __pendingBrokerEvents?: BrokerEvent[];
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
  private connectionAttempted = false;
  private unavailableLogged = false;

  constructor() {
    // expose helper for end-to-end tests to simulate incoming events and flush any pending events
    if (typeof window !== "undefined") {
      const w = window;
      w.__emitBrokerEvent = (evt: BrokerEvent) => this._push(evt);
      if (
        Array.isArray(w.__pendingBrokerEvents) &&
        w.__pendingBrokerEvents.length
      ) {
        w.__pendingBrokerEvents.forEach((e: BrokerEvent) => this._push(e));
        // clear the buffer once flushed
        delete w.__pendingBrokerEvents;
      }
    }
  }

  /**
   * Observable stream of broker events.
   */
  get events(): Observable<BrokerEvent> {
    this.ensureConnected();
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

  private ensureConnected(): void {
    if (this.connectionAttempted || typeof window === "undefined") {
      return;
    }

    this.connectionAttempted = true;
    try {
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
      this.source.onerror = () => {
        this.source?.close();
        this.source = undefined;
        if (!this.unavailableLogged) {
          this.unavailableLogged = true;
          console.warn(
            "broker events SSE unavailable; continuing without live broker updates"
          );
        }
      };
    } catch (err) {
      if (!this.unavailableLogged) {
        this.unavailableLogged = true;
        console.warn("broker events SSE not available", err);
      }
    }
  }
}
