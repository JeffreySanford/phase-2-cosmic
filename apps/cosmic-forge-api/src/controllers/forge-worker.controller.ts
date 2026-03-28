import { Controller, HttpCode, Inject, Post } from "@nestjs/common";
import { ForgeStoreService } from "../state/forge-store.service";

@Controller("internal/worker")
export class ForgeWorkerController {
  constructor(@Inject(ForgeStoreService) private readonly store: ForgeStoreService) {}

  @Post("execute-next")
  @HttpCode(200)
  async executeNext() {
    const next = await this.store.executeNextJob();
    return {
      status: "ok",
      executedAt: new Date().toISOString(),
      activeJobId: next?.id ?? null,
    };
  }
}
