import { Request, Response } from "express";
import { defaultIfEmpty, firstValueFrom } from "rxjs";
import { ForgeProxyService } from "./forge-proxy.service";

type TestResponse = Response & {
  body?: unknown;
  sentBody?: Buffer | string;
  headersMap: Map<string, string>;
};

function createResponse(): TestResponse {
  const headersMap = new Map<string, string>();
  const res = {
    statusCode: 200,
    headersMap,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    setHeader(name: string, value: string) {
      headersMap.set(name.toLowerCase(), String(value));
      return this;
    },
    getHeader(name: string) {
      return headersMap.get(name.toLowerCase());
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    send(payload: Buffer | string) {
      this.sentBody = payload;
      return this;
    },
  } as unknown as TestResponse;

  return res;
}

describe("ForgeProxyService", () => {
  const originalEnv = { ...process.env };
  const fetchMock = jest.fn();

  beforeEach(() => {
    process.env = { ...originalEnv, FORGE_API_URL: "http://forge-api.test" };
    fetchMock.mockReset();
    global.fetch = fetchMock as typeof fetch;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("proxies Forge health and records metrics", async () => {
    const svc = new ForgeProxyService();
    const req = {
      path: "/api/forge/health",
      method: "GET",
    } as Request;
    const res = createResponse();
    const recordMetrics = jest.fn();

    fetchMock.mockResolvedValue({
      status: 200,
      json: async () => ({
        status: "ok",
        service: "cosmic-forge-api",
      }),
    });

    const payload = await firstValueFrom(svc.handle(req, res, recordMetrics));

    expect(payload).toEqual({
      status: "ok",
      service: "cosmic-forge-api",
    });
    expect(res.statusCode).toBe(200);
    expect(recordMetrics).toHaveBeenCalledWith(
      "GET",
      200,
      expect.any(Number),
      expect.any(Number)
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://forge-api.test/health",
      expect.objectContaining({
        method: "GET",
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      })
    );
  });

  it("proxies cached artifacts as binary responses", async () => {
    const svc = new ForgeProxyService();
    const req = {
      path: "/api/forge/artifacts/forge-image-1/preview",
      method: "GET",
    } as Request;
    const res = createResponse();
    const recordMetrics = jest.fn();
    const artifactBytes = Buffer.from("preview-bytes", "utf8");

    fetchMock.mockResolvedValue({
      status: 200,
      headers: {
        get: (name: string) =>
          name.toLowerCase() === "content-type" ? "image/jpeg" : null,
      },
      arrayBuffer: async () =>
        artifactBytes.buffer.slice(
          artifactBytes.byteOffset,
          artifactBytes.byteOffset + artifactBytes.byteLength
        ),
    });

    const payload = await firstValueFrom(
      svc.handle(req, res, recordMetrics).pipe(defaultIfEmpty(null))
    );

    expect(payload).toBeNull();
    expect(res.statusCode).toBe(200);
    expect(res.getHeader("content-type")).toBe("image/jpeg");
    expect(res.getHeader("content-length")).toBe(String(artifactBytes.byteLength));
    expect(res.sentBody).toEqual(artifactBytes);
    expect(recordMetrics).toHaveBeenCalledWith(
      "GET",
      200,
      artifactBytes.byteLength,
      expect.any(Number)
    );
  });

  it("returns a 502 payload when Forge health cannot be reached", async () => {
    const svc = new ForgeProxyService();
    const req = {
      path: "/api/forge/health",
      method: "GET",
    } as Request;
    const res = createResponse();
    const recordMetrics = jest.fn();

    fetchMock.mockRejectedValue(new Error("connect ECONNREFUSED"));

    const payload = await firstValueFrom(svc.handle(req, res, recordMetrics));

    expect(res.statusCode).toBe(502);
    expect(payload).toEqual({
      error: "forge_proxy_error",
      message: "Unable to reach Cosmic Forge API",
    });
    expect(recordMetrics).toHaveBeenCalledWith("GET", 502, 0, 0);
  });

  it("returns a 502 payload when Forge artifacts cannot be reached", async () => {
    const svc = new ForgeProxyService();
    const req = {
      path: "/api/forge/artifacts/forge-image-1/preview",
      method: "GET",
    } as Request;
    const res = createResponse();
    const recordMetrics = jest.fn();

    fetchMock.mockRejectedValue(new Error("connect ECONNREFUSED"));

    const payload = await firstValueFrom(
      svc.handle(req, res, recordMetrics).pipe(defaultIfEmpty(null))
    );

    expect(payload).toBeNull();
    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({
      error: "forge_artifact_proxy_error",
      message: "Unable to reach cached Cosmic Forge artifact",
    });
    expect(recordMetrics).toHaveBeenCalledWith("GET", 502, 0, 0);
  });

  it("proxies Forge target resolution and preserves the query string", async () => {
    const svc = new ForgeProxyService();
    const req = {
      path: "/api/forge/resolve-target",
      url: "/api/forge/resolve-target?query=Cygnus%20A",
      method: "GET",
    } as Request;
    const res = createResponse();
    const recordMetrics = jest.fn();

    fetchMock.mockResolvedValue({
      status: 200,
      json: async () => ({
        data: {
          canonicalName: "MCG+07-41-003",
          providerName: "CDS Sesame / SIMBAD",
          ra: 299.868152368208,
          dec: 40.733915897917,
          suggestedRadiusArcmin: 12,
        },
      }),
    });

    const payload = await firstValueFrom(svc.handle(req, res, recordMetrics));

    expect(payload).toEqual({
      data: {
        canonicalName: "MCG+07-41-003",
        providerName: "CDS Sesame / SIMBAD",
        ra: 299.868152368208,
        dec: 40.733915897917,
        suggestedRadiusArcmin: 12,
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://forge-api.test/resolve-target?query=Cygnus%20A",
      expect.objectContaining({
        method: "GET",
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      })
    );
  });

  it("returns 501 for reserved Forge routes without a handler", async () => {
    const svc = new ForgeProxyService();
    const req = {
      path: "/api/forge/future-endpoint",
      method: "PATCH",
    } as Request;
    const res = createResponse();
    const recordMetrics = jest.fn();

    const payload = await firstValueFrom(svc.handle(req, res, recordMetrics));

    expect(res.statusCode).toBe(501);
    expect(payload).toEqual({
      error: "forge_not_implemented",
      message: "Forge route reserved but not yet implemented",
      path: "/api/forge/future-endpoint",
      method: "PATCH",
    });
    expect(recordMetrics).not.toHaveBeenCalled();
  });
});
