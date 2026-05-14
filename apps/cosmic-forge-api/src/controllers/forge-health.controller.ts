import { Controller, Get, Inject } from "@nestjs/common";
import { ForgeStoreService } from "../state/forge-store.service";

@Controller()
export class ForgeHealthController {
  constructor(
    @Inject(ForgeStoreService) private readonly store: ForgeStoreService
  ) {}

  @Get("health")
  getHealth() {
    return this.store.getHealth();
  }
}
