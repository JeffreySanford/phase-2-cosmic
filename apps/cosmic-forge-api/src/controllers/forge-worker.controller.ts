import { Body, Controller, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { ForgeStoreService } from "../state/forge-store.service";

type WorkerRequestBody = Readonly<{
  workerId?: string;
}>;

const FORGE_WORKER_CONTRACT_VERSION = "forge-worker.v1";

@Controller("internal/worker")
export class ForgeWorkerController {
  constructor(@Inject(ForgeStoreService) private readonly store: ForgeStoreService) {}

  @Post("claim-next")
  @HttpCode(200)
  claimNext(@Body() body?: WorkerRequestBody) {
    const job = this.store.claimNextJob();
    return {
      status: "ok",
      contractVersion: FORGE_WORKER_CONTRACT_VERSION,
      claimedAt: new Date().toISOString(),
      workerId: body?.workerId ?? "forge-worker",
      job,
    };
  }

  @Post("jobs/:jobId/execute")
  @HttpCode(200)
  async executeJob(@Param("jobId") jobId: string, @Body() body?: WorkerRequestBody) {
    const job = await this.store.executeClaimedJob(jobId);
    return {
      status: "ok",
      contractVersion: FORGE_WORKER_CONTRACT_VERSION,
      completedAt: new Date().toISOString(),
      workerId: body?.workerId ?? "forge-worker",
      jobId,
      resultStatus: job?.status ?? null,
      job,
    };
  }

  @Post("execute-next")
  @HttpCode(200)
  async executeNext() {
    const next = await this.store.executeNextJob();
    return {
      status: "ok",
      contractVersion: FORGE_WORKER_CONTRACT_VERSION,
      executedAt: new Date().toISOString(),
      activeJobId: next?.status === "RUNNING" ? next.id : null,
      resultStatus: next?.status ?? null,
    };
  }
}
