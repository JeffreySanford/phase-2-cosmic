import { Request, Response } from "express";
import { EmbeddedMockBackendService } from "./embedded-mock-backend.service";

class FakeResponse {
  statusCode = 200;
  body: unknown;
  sent = false;

  status(code: number) {
    this.statusCode = code;
    return this;
  }

  json(payload: unknown) {
    this.body = payload;
    this.sent = true;
    return this;
  }

  send(payload?: unknown) {
    this.body = payload;
    this.sent = true;
    return this;
  }
}

describe("EmbeddedMockBackendService", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.useFakeTimers();
    process.env = { ...originalEnv, USE_EMBEDDED_E2E_BACKEND: "true" };
  });

  afterEach(() => {
    jest.useRealTimers();
    process.env = originalEnv;
  });

  it("returns seeded jobs from the embedded backend", () => {
    const svc = new EmbeddedMockBackendService();
    const req = {
      path: "/api/v1/jobs",
      method: "GET",
    } as Request;
    const res = new FakeResponse() as unknown as Response;

    const handled = svc.handleGovernance(req, res);

    expect(handled).toBe(true);
    expect((res as unknown as FakeResponse).statusCode).toBe(200);
    expect((res as unknown as FakeResponse).body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          workflow: "vo.cone-search",
          status: "COMPLETED",
        }),
      ])
    );
  });

  it("creates deferred ui-sample jobs and releases them through the admin endpoint", () => {
    const svc = new EmbeddedMockBackendService();
    const createReq = {
      path: "/api/v1/jobs",
      method: "POST",
      body: {
        workflow: "import",
        requestedBy: "ui-sample",
      },
    } as unknown as Request;
    const createRes = new FakeResponse() as unknown as Response;

    expect(svc.handleGovernance(createReq, createRes)).toBe(true);
    const created = (createRes as unknown as FakeResponse).body as {
      jobId: string;
      status: string;
    };
    expect(created.status).toBe("QUEUED");

    const releaseReq = {
      path: "/api/v1/admin/release-deferred",
      method: "POST",
      body: {},
    } as Request;
    const releaseRes = new FakeResponse() as unknown as Response;

    expect(svc.handleGovernance(releaseReq, releaseRes)).toBe(true);
    expect((releaseRes as unknown as FakeResponse).body).toEqual({
      released: 1,
    });
  });
});
