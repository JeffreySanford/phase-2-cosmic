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

  it("accepts a forwarded event and records it", () => {
    const controller = makeController();

    const result = controller.receiveIngestEvent({
      broker: "kafka",
      collectorRegion: "us-west",
      payload: {
        source: "main",
        eventType: "telemetry.batch",
        traceId: "trace-001",
      },
    });

    expect(result.accepted).toBe(true);

    const stats = getIngestEventStats();
    expect(stats.received).toBe(1);
    expect(stats.latest?.traceId).toBe("trace-001");
    expect(stats.latest?.collectorRegion).toBe("us-west");
    expect(stats.latest?.broker).toBe("kafka");
  });

  it("broadcasts an event to a subscribed SSE client", () => {
    const controller = makeController();
    const { res, written } = makeSseResponse();
    const { req } = makeReq();

    controller.streamIngestEvents(req, res);
    written.length = 0;

    controller.receiveIngestEvent({
      broker: "kafka",
      payload: { source: "lbl", traceId: "trace-002" },
    });

    const body = written.join("");
    expect(body).toContain("event: ingest-event");
    expect(body).toContain("trace-002");
  });

  it("replays buffered events to a client that joins mid-stream", () => {
    const controller = makeController();

    controller.receiveIngestEvent({
      broker: "kafka",
      payload: { traceId: "trace-early" },
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

  it("ignores non-string attribution fields rather than coercing them", () => {
    const controller = makeController();

    controller.receiveIngestEvent({
      broker: 42 as unknown as string,
      payload: { traceId: { nested: true } },
    });

    const latest = getIngestEventStats().latest;
    expect(latest?.broker).toBeUndefined();
    expect(latest?.traceId).toBeUndefined();
  });

  it("bounds the replay buffer so history cannot grow without limit", () => {
    const controller = makeController();

    for (let i = 0; i < 60; i += 1) {
      controller.receiveIngestEvent({ payload: { traceId: `trace-${i}` } });
    }

    const stats = getIngestEventStats();
    expect(stats.received).toBe(60);
    expect(stats.buffered).toBe(50);
    expect(stats.latest?.traceId).toBe("trace-59");
  });
});
