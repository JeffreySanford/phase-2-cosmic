// Mock vite before importing server.nest
jest.mock("vite", () => ({ createServer: jest.fn() }));
jest.mock("@angular/ssr", () => ({ CommonEngine: jest.fn() }));

import { Request, Response } from "express";
import {
  AppController,
  getIngestEventStats,
  resetIngestEventsForTest,
} from "../../../server.nest";
import { ForgeProxyService } from "../forge/forge-proxy.service";
import { GovernanceUpstreamService } from "../governance/governance-upstream.service";
import { GovernanceProxyService } from "../governance/governance-proxy.service";
import { EmbeddedMockBackendService } from "../mock/embedded-mock-backend.service";
import { LakehouseMetricsService } from "../lakehouse/lakehouse-metrics.service";

function makeController(): AppController {
  const ssr = { render: jest.fn() } as never;
  const upstream = new GovernanceUpstreamService();
  return new AppController(
    ssr,
    undefined,
    new ForgeProxyService(),
    upstream,
    new GovernanceProxyService(upstream),
    new EmbeddedMockBackendService(),
    new LakehouseMetricsService()
  );
}

function makeSseResponse() {
  const written: string[] = [];
  const res = {
    setHeader: jest.fn(),
    write: (chunk: string) => {
      written.push(chunk);
      return true;
    },
    writableEnded: false,
    writableFinished: false,
  } as unknown as Response;
  return { res, written };
}

function makeReq() {
  const handlers: Record<string, () => void> = {};
  const req = {
    on: (event: string, handler: () => void) => {
      handlers[event] = handler;
    },
  } as unknown as Request;
  return { req, handlers };
}

describe("ingest event channel", () => {
  beforeEach(() => {
    resetIngestEventsForTest();
  });

  it("accepts a forwarded event and preserves event identity, region, and source", async () => {
    const controller = makeController();

    const result = await controller.receiveIngestEvent({
      eventId: "event-001",
      broker: "kafka",
      collectorRegion: "us-west",
      payload: {
        eventId: "event-001",
        source: "main",
        eventType: "telemetry.batch",
        traceId: "trace-001",
      },
    });

    expect(result.accepted).toBe(true);
    expect(result.duplicate).toBe(false);

    const stats = getIngestEventStats();
    expect(stats.received).toBe(1);
    expect(stats.duplicatesSuppressed).toBe(0);
    expect(stats.latest?.eventId).toBe("event-001");
    expect(stats.latest?.traceId).toBe("trace-001");
    expect(stats.latest?.source).toBe("main");
    expect(stats.latest?.collectorRegion).toBe("us-west");
    expect(stats.latest?.broker).toBe("kafka");
    expect(
      (stats.latest?.payload as { eventId?: string } | undefined)?.eventId
    ).toBe("event-001");
  });

  it("suppresses a duplicate eventId before repeating the SSE side effect", async () => {
    const controller = makeController();
    const { res, written } = makeSseResponse();
    const { req } = makeReq();

    controller.streamIngestEvents(req, res);
    written.length = 0;

    const body = {
      eventId: "event-idempotent",
      broker: "kafka",
      collectorRegion: "us-west",
      payload: {
        eventId: "event-idempotent",
        source: "main",
        traceId: "trace-idempotent",
      },
    };

    const first = await controller.receiveIngestEvent(body);
    const second = await controller.receiveIngestEvent(body);

    expect(first).toMatchObject({ accepted: true, duplicate: false });
    expect(second).toMatchObject({
      accepted: true,
      duplicate: true,
      eventId: "event-idempotent",
    });
    expect(getIngestEventStats().received).toBe(1);
    expect(getIngestEventStats().duplicatesSuppressed).toBe(1);
    expect(written.join("").match(/event: ingest-event/g)).toHaveLength(1);
  });

  it("broadcasts an event to a subscribed SSE client", async () => {
    const controller = makeController();
    const { res, written } = makeSseResponse();
    const { req } = makeReq();

    controller.streamIngestEvents(req, res);
    written.length = 0;

    await controller.receiveIngestEvent({
      eventId: "event-002",
      broker: "kafka",
      payload: {
        eventId: "event-002",
        source: "lbl",
        traceId: "trace-002",
      },
    });

    const body = written.join("");
    expect(body).toContain("event: ingest-event");
    expect(body).toContain("event-002");
    expect(body).toContain("trace-002");
  });

  it("replays buffered events to a client that joins mid-stream", async () => {
    const controller = makeController();

    await controller.receiveIngestEvent({
      eventId: "event-early",
      broker: "kafka",
      payload: {
        eventId: "event-early",
        source: "main",
        traceId: "trace-early",
      },
    });

    const { res, written } = makeSseResponse();
    const { req } = makeReq();
    controller.streamIngestEvents(req, res);

    expect(written.join("")).toContain("trace-early");
  });

  it("drops a disconnected client instead of writing to it", () => {
    const controller = makeController();
    const { res } = makeSseResponse();
    const { req, handlers } = makeReq();

    controller.streamIngestEvents(req, res);
    expect(getIngestEventStats().clientCount).toBe(1);

    handlers["close"]?.();
    expect(getIngestEventStats().clientCount).toBe(0);
  });

  it("ignores non-string attribution fields rather than coercing them", async () => {
    const controller = makeController();

    await controller.receiveIngestEvent({
      eventId: "event-types",
      broker: 42 as unknown as string,
      payload: {
        eventId: "event-types",
        source: "main",
        traceId: { nested: true },
      },
    });

    const latest = getIngestEventStats().latest;
    expect(latest?.broker).toBeUndefined();
    expect(latest?.traceId).toBeUndefined();
  });

  it("bounds the replay buffer so history cannot grow without limit", async () => {
    const controller = makeController();

    for (let i = 0; i < 60; i += 1) {
      await controller.receiveIngestEvent({
        eventId: `event-${i}`,
        broker: "kafka",
        payload: {
          eventId: `event-${i}`,
          source: "main",
          traceId: `trace-${i}`,
        },
      });
    }

    const stats = getIngestEventStats();
    expect(stats.received).toBe(60);
    expect(stats.buffered).toBe(50);
    expect(stats.latest?.traceId).toBe("trace-59");
  });
});
