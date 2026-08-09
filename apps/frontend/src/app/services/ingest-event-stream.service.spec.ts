import { TestBed } from "@angular/core/testing";
import {
  INGEST_EVENT_SOURCE_FACTORY,
  IngestEventStreamService,
  IngestedPipelineEvent,
} from "./ingest-event-stream.service";

describe("IngestEventStreamService", () => {
  let service: IngestEventStreamService;
  let eventHandler: ((event: Event) => void) | undefined;
  let close: jest.Mock;

  beforeEach(() => {
    close = jest.fn();
    const source = {
      addEventListener: jest.fn((name: string, handler: (event: Event) => void) => {
        if (name === "ingest-event") {
          eventHandler = handler;
        }
      }),
      close,
    } as unknown as EventSource;

    TestBed.configureTestingModule({
      providers: [
        IngestEventStreamService,
        {
          provide: INGEST_EVENT_SOURCE_FACTORY,
          useValue: () => source,
        },
      ],
    });

    service = TestBed.inject(IngestEventStreamService);
  });

  it("accepts the eventId, region, and source from the repaired SSE path", () => {
    let latest: IngestedPipelineEvent[] = [];
    const subscription = service.events$.subscribe((events) => {
      latest = events;
    });

    service.connect();
    eventHandler?.(
      new MessageEvent("ingest-event", {
        data: JSON.stringify({
          receivedAt: 1,
          broker: "kafka",
          collectorRegion: "us-west",
          source: "main",
          payload: {
            eventId: "event-001",
            source: "main",
          },
        }),
      })
    );

    expect(latest).toHaveLength(1);
    expect(latest[0].payload?.eventId).toBe("event-001");
    expect(latest[0].collectorRegion).toBe("us-west");
    expect(latest[0].source).toBe("main");
    expect(latest[0].broker).toBe("kafka");

    subscription.unsubscribe();
  });

  it("suppresses replay duplicates by immutable eventId", () => {
    let latest: IngestedPipelineEvent[] = [];
    const subscription = service.events$.subscribe((events) => {
      latest = events;
    });

    service.connect();
    const frame = new MessageEvent("ingest-event", {
      data: JSON.stringify({
        receivedAt: 1,
        broker: "kafka",
        collectorRegion: "us-east",
        source: "lbl",
        payload: { eventId: "event-duplicate", source: "lbl" },
      }),
    });

    eventHandler?.(frame);
    eventHandler?.(frame);

    expect(latest).toHaveLength(1);
    expect(latest[0].payload?.eventId).toBe("event-duplicate");

    subscription.unsubscribe();
  });

  it("closes the EventSource on disconnect", () => {
    service.connect();
    service.disconnect();

    expect(close).toHaveBeenCalledTimes(1);
  });
});
