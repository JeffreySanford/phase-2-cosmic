import { TestBed } from "@angular/core/testing";
import { BrokerEvent, BrokerEventsService } from "./broker-events.service";

describe("BrokerEventsService", () => {
  let service: BrokerEventsService;
  let originalEventSource: typeof window.EventSource | undefined;

  class MockEventSource {
    static lastUrl: string | null = null;
    onmessage: ((this: EventSource, ev: MessageEvent) => unknown) | null = null;
    onerror: ((this: EventSource, ev: Event) => unknown) | null = null;
    closed = false;

    constructor(public readonly url: string) {
      MockEventSource.lastUrl = url;
    }

    emit(data: string): void {
      const ev = new MessageEvent("message", { data });
      this.onmessage?.call(this as unknown as EventSource, ev);
    }

    close(): void {
      this.closed = true;
    }
  }

  beforeEach(() => {
    // stub global EventSource so tests don't open real connections
    originalEventSource = window.EventSource;
    Object.defineProperty(window, "EventSource", {
      configurable: true,
      writable: true,
      value: MockEventSource as unknown as typeof EventSource,
    });

    TestBed.configureTestingModule({});
    service = TestBed.inject(BrokerEventsService);
  });

  afterEach(() => {
    Object.defineProperty(window, "EventSource", {
      configurable: true,
      writable: true,
      value: originalEventSource,
    });
  });

  it("should be created", () => {
    expect(service).toBeTruthy();
  });

  it("should emit events when pushed", (done) => {
    const testEvent: BrokerEvent = {
      type: "job-submitted",
      payload: { jobId: "123" },
    };
    service.events.subscribe((evt) => {
      expect(evt).toEqual(testEvent);
      done();
    });
    service._push(testEvent);
  });

  it("should open SSE connection and forward messages", (done) => {
    // grab the mock EventSource constructor
    const Mock = window.EventSource as unknown as typeof MockEventSource;
    expect(Mock).toBeDefined();
    // constructor should have been called with the correct URL
    expect(Mock.lastUrl).toEqual("/api/v1/broker-events");
    // assume service constructor already created one instance
    const instance = (service as unknown as { source?: MockEventSource })
      .source;
    expect(instance).toBeInstanceOf(Mock);
    // subscribe and then simulate event
    const msg: BrokerEvent = { type: "evt", payload: { foo: 1 } };
    service.events.subscribe((e) => {
      expect(e).toEqual(msg);
      done();
    });
    expect(instance).toBeDefined();
    instance?.emit(JSON.stringify(msg));
  });
});
