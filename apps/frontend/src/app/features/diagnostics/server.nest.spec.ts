// Mock vite before importing server.nest
jest.mock("vite", () => ({ createServer: jest.fn() }));

// Mock @angular/ssr
jest.mock("@angular/ssr", () => ({ CommonEngine: jest.fn() }));

import { AppController } from "../../../../server.nest";
import { Response, Request } from "express";

// Mock net.Socket behavior for TCP checks
jest.mock("net", () => {
  const EventEmitter = require("events");
  class FakeSocket extends EventEmitter {
    constructor() {
      super();
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    setTimeout(_ms: number, _cb?: () => void) {
      /* no-op for mock */
    }

    connect(_port: number, _host: string, cb?: () => void) {
      process.nextTick(() => {
        this["emit"]("connect");
        if (cb) cb();
      });
    }
    destroy() {
      /* no-op for mock */
    }
    once(ev: string, cb: (...args: unknown[]) => void) {
      super.once(ev, cb);
    }
  }
  return { Socket: FakeSocket };
});

interface ServiceResult {
  name: string;
  status: string;
  latencyMs?: number;
  icon?: string;
}

function createMockResponse() {
  const res = {
    json: jest.fn(),
    status: jest.fn().mockReturnThis(),
  };
  return res as unknown as Response & { json: jest.Mock; status: jest.Mock };
}

function createMockRequest(name: string) {
  return { params: { name } } as unknown as Request & {
    params: { name: string };
  };
}

describe("AppController diagnostics endpoints", () => {
  it("returns a sanitized diagnostics index path", () => {
    const ctrl = new AppController(
      {} as ConstructorParameters<typeof AppController>[0],
      {} as ConstructorParameters<typeof AppController>[1]
    );
    const res = createMockResponse();

    ctrl.getDiagnosticsIndex(res);

    if (res.status.mock.calls.length > 0) {
      const statusCode = res.status.mock.calls[0][0];
      expect(statusCode).not.toBe(500);
    } else {
      const payload = res.json.mock.calls[0][0] as {
        path: string;
        files: string[];
      };
      expect(payload.path).toBe("diagnostics logs");
      expect(Array.isArray(payload.files)).toBe(true);
    }
  });

  it("returns docker services list with status, latency, and icons", async () => {
    const ctrl = new AppController(
      {} as ConstructorParameters<typeof AppController>[0],
      {} as ConstructorParameters<typeof AppController>[1]
    );

    // stub fetchWithTimeout to simulate HTTP readiness checks
    (ctrl as unknown as { fetchWithTimeout: jest.Mock }).fetchWithTimeout = jest
      .fn()
      .mockResolvedValue({ ok: true });

    const res = createMockResponse();
    await ctrl.getDockerServices(res);
    expect(res.json).toHaveBeenCalled();
    const result = res.json.mock.calls[0][0] as ServiceResult[];
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(5);
    // Check structure of returned services
    const prometheus = result.find(
      (s: ServiceResult) => s.name === "Prometheus"
    );
    expect(prometheus).toBeDefined();
    expect(prometheus).toHaveProperty("status");
    expect(prometheus).toHaveProperty("latencyMs");
    expect(prometheus).toHaveProperty("icon", "monitoring");
    // Check Kafka (TCP service)
    const kafka = result.find((s: ServiceResult) => s.name === "Kafka");
    expect(kafka).toBeDefined();
    expect(kafka).toHaveProperty("icon", "stream");
  });

  it("returns single service detail by name with latency", async () => {
    const ctrl = new AppController(
      {} as ConstructorParameters<typeof AppController>[0],
      {} as ConstructorParameters<typeof AppController>[1]
    );
    (ctrl as unknown as { fetchWithTimeout: jest.Mock }).fetchWithTimeout = jest
      .fn()
      .mockResolvedValue({ ok: true });
    const req = createMockRequest("Prometheus");
    const res = createMockResponse();
    await ctrl.getDockerServiceByName(res, req);
    expect(res.json).toHaveBeenCalled();
    const obj = res.json.mock.calls[0][0];
    expect(obj).toHaveProperty("name", "Prometheus");
    expect(obj).toHaveProperty("status");
    expect(obj).toHaveProperty("latencyMs");
    expect(obj).toHaveProperty("lastChecked");
  });

  it("returns 404 for unknown service name", async () => {
    const ctrl = new AppController(
      {} as ConstructorParameters<typeof AppController>[0],
      {} as ConstructorParameters<typeof AppController>[1]
    );
    const req = createMockRequest("NonExistentService");
    const res = createMockResponse();
    await ctrl.getDockerServiceByName(res, req);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: "service_not_found",
      name: "NonExistentService",
    });
  });

  it("handles TCP service check for Pulsar", async () => {
    const ctrl = new AppController(
      {} as ConstructorParameters<typeof AppController>[0],
      {} as ConstructorParameters<typeof AppController>[1]
    );
    (ctrl as unknown as { fetchWithTimeout: jest.Mock }).fetchWithTimeout = jest
      .fn()
      .mockResolvedValue({ ok: true });
    const req = createMockRequest("Pulsar");
    const res = createMockResponse();
    await ctrl.getDockerServiceByName(res, req);
    expect(res.json).toHaveBeenCalled();
    const obj = res.json.mock.calls[0][0];
    expect(obj).toHaveProperty("name", "Pulsar");
    expect(obj.status).toBe("healthy"); // Mock socket connects successfully
  });
});

// ── S1-1: broker-events SSE endpoint ─────────────────────────────────────────

interface SseResponse {
  setHeader: jest.Mock;
  flushHeaders: jest.Mock;
  write: jest.Mock;
  on: jest.Mock;
}

function createSseResponse(): SseResponse {
  return {
    setHeader: jest.fn(),
    flushHeaders: jest.fn(),
    write: jest.fn(),
    on: jest.fn(),
  };
}

describe("AppController brokerEventsSse (S1-1)", () => {
  it("sets text/event-stream and no-cache headers then flushes", () => {
    const ctrl = new AppController(
      {} as ConstructorParameters<typeof AppController>[0],
      {} as ConstructorParameters<typeof AppController>[1]
    );
    const res = createSseResponse();

    ctrl.brokerEventsSse(res as unknown as import("express").Response);

    expect(res.setHeader).toHaveBeenCalledWith(
      "Content-Type",
      "text/event-stream"
    );
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-cache");
    expect(res.setHeader).toHaveBeenCalledWith("Connection", "keep-alive");
    expect(res.flushHeaders).toHaveBeenCalled();
  });

  it("writes a connected event immediately with source=dev-mock", () => {
    const ctrl = new AppController(
      {} as ConstructorParameters<typeof AppController>[0],
      {} as ConstructorParameters<typeof AppController>[1]
    );
    const res = createSseResponse();

    ctrl.brokerEventsSse(res as unknown as import("express").Response);

    expect(res.write).toHaveBeenCalledTimes(1);
    const raw: string = res.write.mock.calls[0][0] as string;
    expect(raw).toMatch(/^data: /);
    const parsed = JSON.parse(raw.replace(/^data: /, "").trim()) as {
      type: string;
      payload: { source: string };
    };
    expect(parsed.type).toBe("connected");
    expect(parsed.payload.source).toBe("dev-mock");
  });

  it("clears the heartbeat interval when the client disconnects", () => {
    jest.useFakeTimers();
    const ctrl = new AppController(
      {} as ConstructorParameters<typeof AppController>[0],
      {} as ConstructorParameters<typeof AppController>[1]
    );
    let closeHandler: (() => void) | null = null;
    const res = createSseResponse();
    res.on.mockImplementation((event: string, cb: () => void) => {
      if (event === "close") closeHandler = cb;
    });

    ctrl.brokerEventsSse(res as unknown as import("express").Response);

    expect(closeHandler).not.toBeNull();
    const clearIntervalSpy = jest.spyOn(global, "clearInterval");
    closeHandler!();
    expect(clearIntervalSpy).toHaveBeenCalled();

    jest.useRealTimers();
  });
});
