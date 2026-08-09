import { Injectable, InjectionToken, OnDestroy, inject } from "@angular/core";
import { BehaviorSubject } from "rxjs";

export interface IngestedPipelineEvent {
  receivedAt: number;
  source?: string;
  eventType?: string;
  traceId?: string;
  collectorRegion?: string;
  broker?: string;
  payload?: {
    eventId?: string;
    source?: string;
    [key: string]: unknown;
  };
}

export const INGEST_EVENT_SOURCE_FACTORY = new InjectionToken<
  (url: string) => EventSource
>("INGEST_EVENT_SOURCE_FACTORY", {
  providedIn: "root",
  factory: () => (url: string) => new EventSource(url),
});

/**
 * Angular-side consumer for the event-backed ingest stream.
 *
 * This is deliberately separate from the older broker-events diagnostics feed.
 * The contract is the repaired path:
 * generator -> Pulsar -> collector -> Kafka -> java-ingest -> API -> SSE -> Angular.
 */
@Injectable({ providedIn: "root" })
export class IngestEventStreamService implements OnDestroy {
  private readonly eventSourceFactory = inject(INGEST_EVENT_SOURCE_FACTORY);
  private readonly eventsSubject = new BehaviorSubject<IngestedPipelineEvent[]>([]);
  private source?: EventSource;

  readonly events$ = this.eventsSubject.asObservable();

  connect(url = "/api/ingest/stream"): void {
    if (this.source || typeof EventSource === "undefined") {
      return;
    }

    this.source = this.eventSourceFactory(url);
    this.source.addEventListener("ingest-event", (raw) => {
      const message = raw as MessageEvent<string>;
      try {
        const event = JSON.parse(message.data) as IngestedPipelineEvent;
        this.accept(event);
      } catch {
        // Ignore malformed SSE frames; the server remains the contract boundary.
      }
    });
  }

  disconnect(): void {
    this.source?.close();
    this.source = undefined;
  }

  ngOnDestroy(): void {
    this.disconnect();
  }

  private accept(event: IngestedPipelineEvent): void {
    const eventId = event.payload?.eventId;
    const current = this.eventsSubject.value;

    // Presentation-level duplicate suppression is keyed by the immutable eventId.
    // java-ingest also suppresses duplicates, but this protects reconnect/replay
    // behavior without claiming exactly-once delivery.
    if (
      eventId &&
      current.some((candidate) => candidate.payload?.eventId === eventId)
    ) {
      return;
    }

    this.eventsSubject.next([event, ...current].slice(0, 50));
  }
}
