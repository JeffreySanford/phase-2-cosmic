import { Request, Response } from "express";
import { GovernanceProxyService } from "./governance-proxy.service";
import { GovernanceUpstreamService } from "./governance-upstream.service";

type FinishListener = () => void;

class FakeResponse {
  statusCode = 200;
  body: unknown;
  sentBody: unknown;
  private readonly headersMap = new Map<string, string>();
  private readonly finishListeners: FinishListener[] = [];

  status(code: number) {
    this.statusCode = code;
    return this;
  }

  json(payload: unknown) {
    this.body = payload;
    this.finish();
    return this;
  }

  send(payload: unknown) {
    this.sentBody = payload;
    this.finish();
    return this;
  }

  setHeader(name: string, value: string) {
    this.headersMap.set(name.toLowerCase(), String(value));
    return this;
  }

  getHeader(name: string) {
    return this.headersMap.get(name.toLowerCase());
  }

  on(event: string, listener: FinishListener) {
    if (event === "finish") {
      this.finishListeners.push(listener);
    }
    return this;
  }

  private finish() {
    for (const listener of this.finishListeners) {
      listener();
    }
  }
}

describe("GovernanceProxyService", () => {
  const createDeps = () => ({
    tryHandleEmbeddedGovernance: jest.fn(() => false),
    mockInfrastructureTelemetry: jest.fn(() => ({ source: "fallback" })),
    classifyFrontendApiRoute: jest.fn(() => "governance"),
    recordFrontendApiMetrics: jest.fn(),
    recordGovernanceProxyMetrics: jest.fn(),
  });

  it("serves health locally without proxying upstream", async () => {
    const upstream = {
      governanceBaseCandidates: jest.fn(() => ["http://governance.test"]),
      fetchWithFallback: jest.fn(),
    } as unknown as GovernanceUpstreamService;
    const svc = new GovernanceProxyService(upstream);
    const req = {
      path: "/api/v1/health",
      method: "GET",
    } as Request;
    const res = new FakeResponse() as unknown as Response;
    const deps = createDeps();

    await svc.handle(req, res, deps);

    expect((res as unknown as FakeResponse).body).toEqual({
      status: "ok",
      service: "java-governance",
      timestamp: expect.any(String),
    });
    expect(upstream.fetchWithFallback).not.toHaveBeenCalled();
    expect(deps.recordFrontendApiMetrics).toHaveBeenCalled();
  });

  it("serves proof-only Lakehouse evidence locally on the versioned route", async () => {
    const upstream = {
      governanceBaseCandidates: jest.fn(() => ["http://governance.test"]),
      fetchWithFallback: jest.fn(),
    } as unknown as GovernanceUpstreamService;
    const svc = new GovernanceProxyService(upstream);
    const summary = {
      source: "live" as const,
      bronzeState:
        "Public source proof only (5 ESO ObsCore rows); Bronze Delta not implemented",
      silverQuality: "Silver not implemented",
      goldReadiness: "Gold not implemented",
      evidence: "ESO ObsCore • image • ivo://example",
      bronzePercent: 0,
      silverPercent: 0,
      goldPercent: 0,
      qualityFailureRate: 0,
      transferTimeEstimate: "n/a",
      upstream: {
        kind: "eso-obscore" as const,
        endpoint: "https://archive.eso.org/tap_obs",
        query: "SELECT TOP 5 ... FROM ivoa.ObsCore",
        rowCount: 5,
      },
      freshness: {
        maxAgeMs: 900000,
        lastUpdatedAt: new Date().toISOString(),
        stale: false,
      },
    };
    (
      svc as unknown as {
        lakehouseMetricsService: {
          getPublicEvidenceSummary: jest.Mock;
        };
      }
    ).lakehouseMetricsService = {
      getPublicEvidenceSummary: jest.fn().mockResolvedValue(summary),
    };

    const req = {
      path: "/api/v1/lakehouse/metrics",
      method: "GET",
    } as Request;
    const res = new FakeResponse() as unknown as Response;
    const deps = createDeps();

    await svc.handle(req, res, deps);

    expect((res as unknown as FakeResponse).statusCode).toBe(200);
    expect((res as unknown as FakeResponse).body).toEqual(summary);
    expect(summary.bronzePercent).toBe(0);
    expect(summary.silverPercent).toBe(0);
    expect(summary.goldPercent).toBe(0);
    expect(upstream.fetchWithFallback).not.toHaveBeenCalled();
    expect(deps.recordFrontendApiMetrics).toHaveBeenCalled();
  });

  it("proxies generic governance requests upstream and records metrics", async () => {
    const upstream = {
      governanceBaseCandidates: jest.fn(() => ["http://governance.test"]),
      fetchWithFallback: jest.fn(async () => ({
        status: 201,
        headers: {
          get: (name: string) =>
            name.toLowerCase() === "content-type" ? "application/json" : null,
        },
        text: async () => '{"ok":true}',
      })),
    } as unknown as GovernanceUpstreamService;
    const svc = new GovernanceProxyService(upstream);
    const req = {
      path: "/api/v1/custom",
      originalUrl: "/api/v1/custom?mode=test",
      method: "POST",
      headers: {
        "x-trace-id": "trace-1",
        "content-type": "application/json",
      },
      body: { hello: "world" },
    } as unknown as Request;
    const res = new FakeResponse() as unknown as Response;
    const deps = createDeps();

    await svc.handle(req, res, deps);

    expect(upstream.fetchWithFallback).toHaveBeenCalledWith(
      ["http://governance.test/api/v1/custom?mode=test"],
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ hello: "world" }),
      }),
      7000
    );
    expect((res as unknown as FakeResponse).statusCode).toBe(201);
    expect((res as unknown as FakeResponse).sentBody).toBe('{"ok":true}');
    expect(deps.recordGovernanceProxyMetrics).toHaveBeenCalledWith(
      "governance_api",
      "POST",
      201,
      expect.any(Number),
      expect.any(Number)
    );
  });
});
