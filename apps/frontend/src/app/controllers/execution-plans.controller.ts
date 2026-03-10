import { Controller, Post, Body, Param, Headers, Get } from "@nestjs/common";

interface ExecutionPlanRequest {
  schedulingBlock: unknown;
  spectralConfig?: unknown;
  existingAllocations?: unknown[];
}

interface StoredPlan {
  id: string;
  request: ExecutionPlanRequest;
  status: "validated" | "applied";
  history: string[];
}

@Controller("api/v1/execution/plans")
export class ExecutionPlansController {
  private plans = new Map<string, StoredPlan>();
  private idempotency = new Map<string, string>(); // key -> planId

  @Post()
  async validatePlan(
    @Body() body: ExecutionPlanRequest,
    @Headers("authorization") auth?: string
  ): Promise<{ planId: string } | { error: string }> {
    if (!auth || !auth.startsWith("Bearer ")) {
      throw new Error("unauthorized");
    }
    try {
      const path = require("path");
      const allocatorPath = path.join(
        process.cwd(),
        "tools",
        "trident-allocator",
        "allocator.js"
      );
      const { allocate } = require(allocatorPath);
      const result = allocate(
        body.schedulingBlock,
        body.spectralConfig ?? null,
        body.existingAllocations ?? []
      );
      if (result.error) {
        return { error: result.error.message };
      }
      const planId = result.plan.planId;
      this.plans.set(planId, {
        id: planId,
        request: body,
        status: "validated",
        history: ["validated"],
      });
      return { planId };
    } catch (_e) {
      return { error: "validation_failure" };
    }
  }

  @Post(":id/apply")
  async applyPlan(
    @Param("id") id: string,
    @Headers("idempotency-key") key: string,
    @Headers("authorization") auth?: string
  ): Promise<
    | { code: "DUPLICATE"; planId: string }
    | { status: "accepted"; planId: string }
  > {
    if (!auth || !auth.startsWith("Bearer ")) {
      throw new Error("unauthorized");
    }
    if (!key) {
      throw new Error("Missing Idempotency-Key");
    }
    if (this.idempotency.has(key)) {
      const existing = this.idempotency.get(key) as string;
      return { code: "DUPLICATE", planId: existing };
    }
    const plan = this.plans.get(id);
    if (!plan) {
      throw new Error("plan_not_found");
    }
    plan.status = "applied";
    plan.history.push("applied");
    this.idempotency.set(key, id);
    return { status: "accepted", planId: id };
  }

  @Get(":id")
  getPlan(
    @Param("id") id: string,
    @Headers("authorization") auth?: string
  ): { id: string; status: "validated" | "applied"; history: string[] } {
    if (!auth || !auth.startsWith("Bearer ")) {
      throw new Error("unauthorized");
    }
    const plan = this.plans.get(id);
    if (!plan) {
      throw new Error("plan_not_found");
    }
    return { id: plan.id, status: plan.status, history: plan.history };
  }
}
