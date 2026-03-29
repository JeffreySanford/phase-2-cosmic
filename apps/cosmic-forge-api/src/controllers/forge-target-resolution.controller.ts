import {
  Controller,
  Get,
  HttpCode,
  Inject,
  Query,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import { ForgeTargetResolverService } from "../services/forge-target-resolver.service";

@Controller()
export class ForgeTargetResolutionController {
  constructor(
    @Inject(ForgeTargetResolverService)
    private readonly targetResolver: ForgeTargetResolverService
  ) {}

  @Get("resolve-target")
  @HttpCode(200)
  async resolve(
    @Query("query") query: string | undefined,
    @Res() res: Response
  ): Promise<void> {
    const result = await this.targetResolver.resolve(query ?? "");
    res.status(result.status).json(result.body);
  }
}
