// importing from the Nest server file via require to avoid tsconfig path issues
import { ExecutionPlansController } from "./execution-plans.controller";

describe("ExecutionPlansController", () => {
  let controller: any;

  beforeEach(() => {
    controller = new ExecutionPlansController();
  });

  it("rejects unauthorized requests at every endpoint", async () => {
    const req = {
      schedulingBlock: {
        id: "sb-unauth",
        subarray: "s1",
        startTime: "",
        endTime: "",
      },
      spectralConfig: null,
      existingAllocations: [],
    };
    await expect(controller.validatePlan(req as any)).rejects.toThrow(
      "unauthorized"
    );
    await expect(controller.applyPlan("nope", "k", undefined)).rejects.toThrow(
      "unauthorized"
    );
    expect(() => controller.getPlan("nope")).toThrow("unauthorized");
  });

  it("validates a scheduling block and returns planId", async () => {
    const req = {
      schedulingBlock: {
        id: "sb-100",
        subarray: "subarray-1",
        startTime: "2026-04-01T00:00:00Z",
        endTime: "2026-04-01T01:00:00Z",
      },
      spectralConfig: null,
      existingAllocations: [],
    };
    const result = await controller.validatePlan(req as any, "Bearer token");
    expect(result).toHaveProperty("planId");
    const planId = (result as any).planId;

    const status = controller.getPlan(planId, "Bearer token");
    expect(status).toEqual({
      id: planId,
      status: "validated",
      history: ["validated"],
    });
  });

  it("applies a plan and enforces idempotency", async () => {
    const req = {
      schedulingBlock: {
        id: "sb-101",
        subarray: "subarray-2",
        startTime: "2026-04-02T00:00:00Z",
        endTime: "2026-04-02T02:00:00Z",
      },
      spectralConfig: null,
      existingAllocations: [],
    };
    const { planId } = (await controller.validatePlan(
      req as any,
      "Bearer token"
    )) as any;

    const applyResp = await controller.applyPlan(
      planId,
      "key-123",
      "Bearer token"
    );
    expect(applyResp).toEqual({ status: "accepted", planId });

    const dup = await controller.applyPlan(planId, "key-123", "Bearer token");
    expect(dup).toEqual({ code: "DUPLICATE", planId });

    const status = controller.getPlan(planId, "Bearer token");
    expect(status.status).toBe("applied");
  });
});
