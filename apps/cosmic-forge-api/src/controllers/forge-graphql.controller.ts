import { Body, Controller, HttpCode, Inject, Post, Res } from "@nestjs/common";
import type { Response } from "express";
import { ForgeGraphqlService } from "../graphql/forge-graphql.service";

@Controller()
export class ForgeGraphqlController {
  constructor(
    @Inject(ForgeGraphqlService)
    private readonly graphqlService: ForgeGraphqlService
  ) {}

  @Post("graphql")
  @HttpCode(200)
  async execute(@Body() body: unknown, @Res() res: Response): Promise<void> {
    const result = await this.graphqlService.execute(body);
    res.status(result.status).json(result.body);
  }
}
