import { Inject, Injectable, Logger } from "@nestjs/common";
import { ForgeGraphqlService } from "../graphql/forge-graphql.service";
import { ForgeStoreService } from "../state/forge-store.service";

@Injectable()
export class ForgeBootstrapService {
  private readonly logger = new Logger(ForgeBootstrapService.name);

  constructor(
    @Inject(ForgeGraphqlService)
    private readonly graphqlService: ForgeGraphqlService,
    @Inject(ForgeStoreService)
    private readonly store: ForgeStoreService
  ) {}

  async warmup(): Promise<void> {
    try {
      const jobs = this.store.getJobs();
      const imageProducts = this.store.getImageProducts();
      const localArtifacts = imageProducts.filter((image) => image.artifactMode !== "external");

      if (localArtifacts.length === 0) {
        this.logger.log("cosmic-forge-api warmup: no local artifacts to precache");
      }

      await this.graphqlService.execute({
        operationName: "ForgeWorkbenchBootstrap",
        variables: {},
      });

      this.logger.log(
        `cosmic-forge-api warmup complete ${JSON.stringify({
          jobCount: jobs.length,
          imageCount: imageProducts.length,
        })}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`cosmic-forge-api warmup encountered errors ${message}`);
    }
  }
}
