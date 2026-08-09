// Mock vite before importing server.nest
jest.mock("vite", () => ({ createServer: jest.fn() }));

// Mock @angular/ssr
jest.mock("@angular/ssr", () => ({ CommonEngine: jest.fn() }));

import { AppController } from "../../../../server.nest";
import { Response, Request } from "express";
import { ForgeProxyService } from "../../../server/forge/forge-proxy.service";
import { GovernanceUpstreamService } from "../../../server/governance/governance-upstream.service";
import { GovernanceProxyService } from "../../../server/governance/governance-proxy.service";
import { EmbeddedMockBackendService } from "../../../server/mock/embedded-mock-backend.service";

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
      headers.set(
        "content-length",
        Buffer.byteLength(JSON.stringify(body ?? {}), "utf8")
      );
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

function makeController(options?: {
  governanceUpstreamService?: GovernanceUpstreamService;
  governanceProxyService?: GovernanceProxyService;
  embeddedMockBackendService?: EmbeddedMockBackendService;
}) {
  const governanceUpstreamService =
    options?.governanceUpstreamService ??
    ({
      governanceBaseCandidates: jest.fn(() => ["http://governance.test"]),
      fetchWithFallback: jest.fn(),
      fetchWithTimeout: jest.fn().mockResolvedValue({ ok: true }),
    } as unknown as GovernanceUpstreamService);
  const governanceProxyService =
    options?.governanceProxyService ??
    new GovernanceProxyService(governanceUpstreamService);
  const embeddedMockBackendService =
    options?.embeddedMockBackendService ?? new EmbeddedMockBackendService();

  return {
    ctrl: new AppController(
      {} as ConstructorParameters<typeof AppController>[0],
      {} as ConstructorParameters<typeof AppController>[1],
      { handle: jest.fn() } as unknown as ForgeProxyService,
      governanceUpstreamService,
      governanceProxyService,
      embeddedMockBackendService
    ),
    governanceUpstreamService,
    governanceProxyService,
    embeddedMockBackendService,
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
    const { ctrl, governanceUpstreamService } = makeController();
    (
      governanceUpstreamService as unknown as { fetchWithTimeout: jest.Mock }
    ).fetchWithTimeout = jest.fn().mockResolvedValue({ ok: true });

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

  it("marks slow but reachable services as degraded", async () => {
    const { ctrl, governanceUpstreamService } = makeController();
    (
      governanceUpstreamService as unknown as { fetchWithTimeout: jest.Mock }
    ).fetchWithTimeout = jest.fn().mockImplementation(async () => ({
      ok: true,
    }));

    const res = createMockResponse();
    const originalNet = jest.requireMock("net");
    const originalSocket = originalNet.Socket;
    originalNet.Socket = class extends originalSocket {
      connect(port: number, host: string, cb?: () => void) {
        setTimeout(() => {
          this.emit("connect");
          if (cb) cb();
        }, 1100);
        return this;
      }
    };

    try {
      await ctrl.getDockerServices(res);
      const result = res.json.mock.calls[0][0] as ServiceResult[];
      const kafka = result.find((s: ServiceResult) => s.name === "Kafka");
      expect(kafka?.status).toBe("degraded");
    } finally {
      originalNet.Socket = originalSocket;
    }
  });

  it("prefers Prometheus-backed diagnostics when query results are available", async () => {
    const ctrl = new AppController(
      {} as ConstructorParameters<typeof AppController>[0],
      {} as ConstructorParameters<typeof AppController>[1]
    );
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          result: [{ value: [1, "1"] }],
        },
      }),
    } as Response);

    try {
      const result = await ctrl.getDatabaseBenchmarks();
      expect(result.source).toBe("prometheus");
      expect(result.prometheus.available).toBe(true);
      expect(result.postgres.details).toContain("Prometheus-backed");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("returns a deterministic fallback payload when no native or Prometheus metrics are available", async () => {
    const ctrl = new AppController(
      {} as ConstructorParameters<typeof AppController>[0],
      {} as ConstructorParameters<typeof AppController>[1]
    );
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ data: { result: [] } }),
    } as Response);

    try {
      const result = await ctrl.getDatabaseBenchmarks();
      expect(result.source).toBe("fallback");
      expect(result.prometheus.available).toBe(false);
      expect(result.benchmarks.throughputMbPerSec).toBe(0);
      expect(result.postgres.details).toContain("No native Postgres");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("returns single service detail by name with latency", async () => {
    const { ctrl, governanceUpstreamService } = makeController();
    (
      governanceUpstreamService as unknown as { fetchWithTimeout: jest.Mock }
    ).fetchWithTimeout = jest.fn().mockResolvedValue({ ok: true });
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
    const { ctrl, governanceUpstreamService } = makeController();
    (
      governanceUpstreamService as unknown as { fetchWithTimeout: jest.Mock }
    ).fetchWithTimeout = jest.fn().mockResolvedValue({ ok: true });
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
    const { ctrl, governanceUpstreamService } = makeController();
    const req = createGovernanceRequest("/api/v1/telemetry/infrastructure");
    const res = createMockResponse();
    const upstream = {
      status: 200,
      headers: { get: jest.fn().mockReturnValue("application/json") },
      text: jest
        .fn()
        .mockResolvedValue('{"source":"prometheus","services":{}}'),
    };
    (
      governanceUpstreamService as unknown as { fetchWithFallback: jest.Mock }
    ).fetchWithFallback = jest.fn().mockResolvedValue(upstream);

    await ctrl.proxyGovernance(req, res);

    expect(
      (
        governanceUpstreamService as unknown as {
          fetchWithFallback: jest.Mock;
        }
      ).fetchWithFallback
    ).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith(
      '{"source":"prometheus","services":{}}'
    );
  });

  it("falls back to mock infrastructure telemetry when governance is unavailable", async () => {
    const { ctrl, governanceUpstreamService } = makeController();
    const req = createGovernanceRequest("/api/v1/telemetry/infrastructure");
    const res = createMockResponse();
    (
      governanceUpstreamService as unknown as { fetchWithFallback: jest.Mock }
    ).fetchWithFallback = jest
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
  type CtrlPrivate = {
    brokerEventsSse: (res: import("express").Response) => void;
  };

  it("sets text/event-stream and no-cache headers then flushes", () => {
    const ctrl = new AppController(
      {} as ConstructorParameters<typeof AppController>[0],
      {} as ConstructorParameters<typeof AppController>[1]
    );
    const res = createSseResponse();

    (ctrl as unknown as CtrlPrivate).brokerEventsSse(
      res as unknown as import("express").Response
    );

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

    (ctrl as unknown as CtrlPrivate).brokerEventsSse(
      res as unknown as import("express").Response
    );

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

    (ctrl as unknown as CtrlPrivate).brokerEventsSse(
      res as unknown as import("express").Response
    );

    expect(closeHandler).not.toBeNull();
    const clearIntervalSpy = jest.spyOn(global, "clearInterval");
    (closeHandler as unknown as () => void)();
    expect(clearIntervalSpy).toHaveBeenCalled();

    jest.useRealTimers();
  });
});

// ── Jobs API endpoints (via tryHandleEmbeddedGovernance) ──────────────────────

function makeCtrl() {
  return makeController().ctrl;
}

function makeGovReq(path: string, method = "GET", body?: unknown) {
  return {
    path,
    originalUrl: path,
    method,
    headers: {},
    body: body ?? {},
    params: {},
  } as unknown as Request;
}

describe("AppController jobs endpoints (embedded governance)", () => {
  beforeEach(() => {
    process.env["USE_EMBEDDED_E2E_BACKEND"] = "true";
  });

  afterEach(() => {
    delete process.env["USE_EMBEDDED_E2E_BACKEND"];
  });

  it("GET /api/v1/jobs returns array of jobs", async () => {
    const ctrl = makeCtrl();
    const req = makeGovReq("/api/v1/jobs");
    const res = createMockResponse();
    await ctrl.proxyGovernance(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalled();
    const body = res.json.mock.calls[0][0] as unknown[];
    expect(Array.isArray(body)).toBe(true);
  });

  it("POST /api/v1/jobs creates a job and returns 201", async () => {
    const ctrl = makeCtrl();
    const req = makeGovReq("/api/v1/jobs", "POST", {
      workflow: "ingest",
      datasetId: "ds-001",
    });
    const res = createMockResponse();
    await ctrl.proxyGovernance(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalled();
    const body = res.json.mock.calls[0][0] as {
      jobId: string;
      status: string;
      queuedAt: string;
    };
    expect(body).toHaveProperty("jobId");
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("queuedAt");
  });

  it("POST /api/v1/jobs with requestedBy returns 202", async () => {
    const ctrl = makeCtrl();
    const req = makeGovReq("/api/v1/jobs", "POST", {
      workflow: "export",
      requestedBy: "test-user",
    });
    const res = createMockResponse();
    await ctrl.proxyGovernance(req, res);
    expect(res.status).toHaveBeenCalledWith(202);
  });

  it("GET /api/v1/jobs/types returns workflow type list", async () => {
    const ctrl = makeCtrl();
    const req = makeGovReq("/api/v1/jobs/types");
    const res = createMockResponse();
    await ctrl.proxyGovernance(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const types = res.json.mock.calls[0][0] as string[];
    expect(Array.isArray(types)).toBe(true);
    expect(types.length).toBeGreaterThan(0);
    expect(types).toContain("import");
  });

  it("POST /api/v1/jobs/validate returns valid:true", async () => {
    const ctrl = makeCtrl();
    const req = makeGovReq("/api/v1/jobs/validate", "POST", {
      type: "ingest",
      payload: {},
    });
    const res = createMockResponse();
    await ctrl.proxyGovernance(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as { valid: boolean };
    expect(body.valid).toBe(true);
  });

  it("GET /api/v1/jobs/:id returns the job", async () => {
    // First create a job to get its id
    const ctrl = makeCtrl();
    const createReq = makeGovReq("/api/v1/jobs", "POST", {
      workflow: "cleanup",
    });
    const createRes = createMockResponse();
    await ctrl.proxyGovernance(createReq, createRes);
    const { jobId } = createRes.json.mock.calls[0][0] as { jobId: string };

    const getReq = makeGovReq(`/api/v1/jobs/${jobId}`);
    const getRes = createMockResponse();
    await ctrl.proxyGovernance(getReq, getRes);
    expect(getRes.status).toHaveBeenCalledWith(200);
    const job = getRes.json.mock.calls[0][0] as { jobId: string };
    expect(job.jobId).toBe(jobId);
  });

  it("GET /api/v1/jobs/:id returns 404 for unknown id", async () => {
    const ctrl = makeCtrl();
    const req = makeGovReq("/api/v1/jobs/nonexistent-job-id-xyz");
    const res = createMockResponse();
    await ctrl.proxyGovernance(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    const body = res.json.mock.calls[0][0] as { error: string };
    expect(body.error).toBe("not_found");
  });

  it("DELETE /api/v1/jobs/:id removes job and returns 204", async () => {
    const ctrl = makeCtrl();
    // Create job
    const createReq = makeGovReq("/api/v1/jobs", "POST", {
      workflow: "diagnostics",
    });
    const createRes = createMockResponse();
    await ctrl.proxyGovernance(createReq, createRes);
    const { jobId } = createRes.json.mock.calls[0][0] as { jobId: string };

    const delReq = makeGovReq(`/api/v1/jobs/${jobId}`, "DELETE");
    const delRes = createMockResponse();
    await ctrl.proxyGovernance(delReq, delRes);
    expect(delRes.status).toHaveBeenCalledWith(204);

    // Confirm it is gone
    const checkReq = makeGovReq(`/api/v1/jobs/${jobId}`);
    const checkRes = createMockResponse();
    await ctrl.proxyGovernance(checkReq, checkRes);
    expect(checkRes.status).toHaveBeenCalledWith(404);
  });

  it("POST /api/v1/jobs/:id/transition updates job status", async () => {
    const ctrl = makeCtrl();
    const createReq = makeGovReq("/api/v1/jobs", "POST", {
      workflow: "ingest",
    });
    const createRes = createMockResponse();
    await ctrl.proxyGovernance(createReq, createRes);
    const { jobId } = createRes.json.mock.calls[0][0] as { jobId: string };

    const transReq = makeGovReq(`/api/v1/jobs/${jobId}/transition`, "POST", {
      state: "RUNNING",
    });
    const transRes = createMockResponse();
    await ctrl.proxyGovernance(transReq, transRes);
    expect(transRes.status).toHaveBeenCalledWith(200);
    const updated = transRes.json.mock.calls[0][0] as { status: string };
    expect(updated.status).toBe("RUNNING");
  });

  it("GET /api/v1/jobs/:id/lineage returns lineage object", async () => {
    const ctrl = makeCtrl();
    const createReq = makeGovReq("/api/v1/jobs", "POST", {
      workflow: "ingest",
    });
    const createRes = createMockResponse();
    await ctrl.proxyGovernance(createReq, createRes);
    const { jobId } = createRes.json.mock.calls[0][0] as { jobId: string };

    const req = makeGovReq(`/api/v1/jobs/${jobId}/lineage`);
    const res = createMockResponse();
    await ctrl.proxyGovernance(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(typeof res.json.mock.calls[0][0]).toBe("object");
  });

  it("PUT /api/v1/jobs/:id/lineage updates lineage and returns it", async () => {
    const ctrl = makeCtrl();
    const createReq = makeGovReq("/api/v1/jobs", "POST", {
      workflow: "ingest",
    });
    const createRes = createMockResponse();
    await ctrl.proxyGovernance(createReq, createRes);
    const { jobId } = createRes.json.mock.calls[0][0] as { jobId: string };

    const lineagePayload = { parentJobId: "parent-123", origin: "test-suite" };
    const putReq = makeGovReq(
      `/api/v1/jobs/${jobId}/lineage`,
      "PUT",
      lineagePayload
    );
    const putRes = createMockResponse();
    await ctrl.proxyGovernance(putReq, putRes);
    expect(putRes.status).toHaveBeenCalledWith(200);
    const saved = putRes.json.mock.calls[0][0] as Record<string, unknown>;
    expect(saved["parentJobId"]).toBe("parent-123");
    expect(saved["origin"]).toBe("test-suite");
  });

  it("GET /api/v1/jobs/:id/logs returns log array", async () => {
    const ctrl = makeCtrl();
    const createReq = makeGovReq("/api/v1/jobs", "POST", {
      workflow: "ingest",
    });
    const createRes = createMockResponse();
    await ctrl.proxyGovernance(createReq, createRes);
    const { jobId } = createRes.json.mock.calls[0][0] as { jobId: string };

    const req = makeGovReq(`/api/v1/jobs/${jobId}/logs`);
    const res = createMockResponse();
    await ctrl.proxyGovernance(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const logs = res.json.mock.calls[0][0] as unknown[];
    expect(Array.isArray(logs)).toBe(true);
  });

  it("GET /api/v1/jobs/:id/artifacts returns artifact array", async () => {
    const ctrl = makeCtrl();
    const createReq = makeGovReq("/api/v1/jobs", "POST", {
      workflow: "ingest",
    });
    const createRes = createMockResponse();
    await ctrl.proxyGovernance(createReq, createRes);
    const { jobId } = createRes.json.mock.calls[0][0] as { jobId: string };

    const req = makeGovReq(`/api/v1/jobs/${jobId}/artifacts`);
    const res = createMockResponse();
    await ctrl.proxyGovernance(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const artifacts = res.json.mock.calls[0][0] as unknown[];
    expect(Array.isArray(artifacts)).toBe(true);
  });
});

// ── Dispatch admin endpoints (via tryHandleEmbeddedGovernance) ────────────────

describe("AppController dispatch admin endpoints (embedded governance)", () => {
  beforeEach(() => {
    process.env["USE_EMBEDDED_E2E_BACKEND"] = "true";
  });

  afterEach(() => {
    delete process.env["USE_EMBEDDED_E2E_BACKEND"];
  });

  it("GET /api/v1/admin/dispatch returns config with expected shape", async () => {
    const ctrl = makeCtrl();
    const req = makeGovReq("/api/v1/admin/dispatch");
    const res = createMockResponse();
    await ctrl.proxyGovernance(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as {
      intervalSeconds: number;
      scannedCount: number;
      dispatchedCount: number;
    };
    expect(typeof body.intervalSeconds).toBe("number");
    expect(typeof body.scannedCount).toBe("number");
    expect(typeof body.dispatchedCount).toBe("number");
  });

  it("POST /api/v1/admin/dispatch updates the interval", async () => {
    const ctrl = makeCtrl();
    const req = makeGovReq("/api/v1/admin/dispatch", "POST", {
      intervalSeconds: 30,
    });
    const res = createMockResponse();
    await ctrl.proxyGovernance(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as { intervalSeconds: number };
    expect(body.intervalSeconds).toBe(30);
  });

  it("POST /api/v1/admin/dispatch ignores zero or negative interval", async () => {
    const ctrl = makeCtrl();
    // First set to a known value
    const setup = makeGovReq("/api/v1/admin/dispatch", "POST", {
      intervalSeconds: 10,
    });
    const setupRes = createMockResponse();
    await ctrl.proxyGovernance(setup, setupRes);
    const { intervalSeconds: initial } = setupRes.json.mock.calls[0][0] as {
      intervalSeconds: number;
    };

    // Now try invalid value
    const badReq = makeGovReq("/api/v1/admin/dispatch", "POST", {
      intervalSeconds: 0,
    });
    const badRes = createMockResponse();
    await ctrl.proxyGovernance(badReq, badRes);
    expect(badRes.status).toHaveBeenCalledWith(200);
    const body = badRes.json.mock.calls[0][0] as { intervalSeconds: number };
    // Interval should remain unchanged since 0 is not > 0
    expect(body.intervalSeconds).toBe(initial);
  });

  it("POST /api/v1/admin/release-deferred returns released count", async () => {
    const ctrl = makeCtrl();
    const req = makeGovReq("/api/v1/admin/release-deferred", "POST");
    const res = createMockResponse();
    await ctrl.proxyGovernance(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as { released: number };
    expect(typeof body.released).toBe("number");
    expect(body.released).toBeGreaterThanOrEqual(0);
  });

  it("GET /api/v1/public-sources returns source list", async () => {
    const ctrl = makeCtrl();
    const req = makeGovReq("/api/v1/public-sources");
    const res = createMockResponse();
    await ctrl.proxyGovernance(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0] as Array<{
      name: string;
      url: string;
    }>;
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    expect(body[0]).toHaveProperty("name");
    expect(body[0]).toHaveProperty("url");
  });
});
