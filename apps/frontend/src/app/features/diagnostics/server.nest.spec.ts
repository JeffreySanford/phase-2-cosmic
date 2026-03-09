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
  const headers = new Map<string, string | number>();
  const listeners: Record<string, Array<() => void>> = {};
  const emitFinish = () => {
    const finishListeners = listeners["finish"] ?? [];
    finishListeners.forEach((cb) => cb());
  };
  const res = {
    json: jest.fn((body?: unknown) => {
      headers.set("content-length", Buffer.byteLength(JSON.stringify(body ?? {}), "utf8"));
      emitFinish();
      return body;
    }),
    status: jest.fn().mockReturnThis(),
    setHeader: jest.fn((name: string, value: string | number) => {
      headers.set(name.toLowerCase(), value);
    }),
    getHeader: jest.fn((name: string) => headers.get(name.toLowerCase())),
    on: jest.fn((event: string, cb: () => void) => {
      listeners[event] = listeners[event] ?? [];
      listeners[event].push(cb);
    }),
    send: jest.fn(function (this: { emitFinish?: () => void }, body?: unknown) {
      if (typeof body === "string") {
        headers.set("content-length", Buffer.byteLength(body, "utf8"));
      }
      emitFinish();
      return body;
    }),
  };
  return res as unknown as Response & {
    json: jest.Mock;
    status: jest.Mock;
    setHeader: jest.Mock;
    getHeader: jest.Mock;
    on: jest.Mock;
    send: jest.Mock;
  };
}

function createMockRequest(name: string) {
  return { params: { name } } as unknown as Request & {
    params: { name: string };
  };
}

function createGovernanceRequest(path: string, method = "GET") {
  return {
    path,
    originalUrl: path,
    method,
    headers: {},
  } as unknown as Request;
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

  it("exposes Prometheus-formatted SSR metrics", () => {
    const ctrl = new AppController(
      {} as ConstructorParameters<typeof AppController>[0],
      {} as ConstructorParameters<typeof AppController>[1]
    );
    const res = createMockResponse();

    ctrl.metrics(res);

    expect(res.setHeader).toHaveBeenCalledWith(
      "Content-Type",
      "text/plain; version=0.0.4; charset=utf-8"
    );
    expect(res.send).toHaveBeenCalled();
    const payload = res.send.mock.calls[0][0] as string;
    expect(payload).toContain("frontend_ssr_redis_client_connected");
    expect(payload).toContain("frontend_ssr_redis_cache_requests_total");
    expect(payload).toContain("frontend_ssr_governance_proxy_requests_total");
    expect(payload).toContain("frontend_ssr_frontend_api_requests_total");
  });

  it("includes the Pulsar to governance topology edge", () => {
    const ctrl = new AppController(
      {} as ConstructorParameters<typeof AppController>[0],
      {} as ConstructorParameters<typeof AppController>[1]
    );

    const payload = ctrl.getTopology() as {
      links: Array<{ source: string; target: string }>;
    };

    expect(payload.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "pulsar",
          target: "java-governance",
        }),
      ])
    );
  });

  it("proxies infrastructure telemetry to governance before using mock fallback", async () => {
    const ctrl = new AppController(
      {} as ConstructorParameters<typeof AppController>[0],
      {} as ConstructorParameters<typeof AppController>[1]
    );
    const req = createGovernanceRequest("/api/v1/telemetry/infrastructure");
    const res = createMockResponse();
    const upstream = {
      status: 200,
      headers: { get: jest.fn().mockReturnValue("application/json") },
      text: jest.fn().mockResolvedValue('{"source":"prometheus","services":{}}'),
    };
    (ctrl as unknown as { fetchWithFallback: jest.Mock }).fetchWithFallback = jest
      .fn()
      .mockResolvedValue(upstream);

    await ctrl.proxyGovernance(req, res);

    expect(
      (ctrl as unknown as { fetchWithFallback: jest.Mock }).fetchWithFallback
    ).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith('{"source":"prometheus","services":{}}');
  });

  it("falls back to mock infrastructure telemetry when governance is unavailable", async () => {
    const ctrl = new AppController(
      {} as ConstructorParameters<typeof AppController>[0],
      {} as ConstructorParameters<typeof AppController>[1]
    );
    const req = createGovernanceRequest("/api/v1/telemetry/infrastructure");
    const res = createMockResponse();
    (ctrl as unknown as { fetchWithFallback: jest.Mock }).fetchWithFallback = jest
      .fn()
      .mockRejectedValue(new Error("connect failed"));

    await ctrl.proxyGovernance(req, res);

    expect(res.json).toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0] as {
      source: string;
      services: { redis: { source: string } };
    };
    expect(payload.source).toBe("mock");
    expect(payload.services.redis.source).toBe("mock");
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

describe.skip("AppController brokerEventsSse (S1-1)", () => {
  type CtrlPrivate = { brokerEventsSse: (res: import("express").Response) => void };

  it("sets text/event-stream and no-cache headers then flushes", () => {
    const ctrl = new AppController(
      {} as ConstructorParameters<typeof AppController>[0],
      {} as ConstructorParameters<typeof AppController>[1]
    );
    const res = createSseResponse();

    (ctrl as unknown as CtrlPrivate).brokerEventsSse(res as unknown as import("express").Response);

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

    (ctrl as unknown as CtrlPrivate).brokerEventsSse(res as unknown as import("express").Response);

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

    (ctrl as unknown as CtrlPrivate).brokerEventsSse(res as unknown as import("express").Response);

    expect(closeHandler).not.toBeNull();
    const clearIntervalSpy = jest.spyOn(global, "clearInterval");
    (closeHandler as unknown as () => void)();
    expect(clearIntervalSpy).toHaveBeenCalled();

    jest.useRealTimers();
  });
});
