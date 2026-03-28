import { Module } from "@nestjs/common";
import { ForgeArtifactsController } from "./controllers/forge-artifacts.controller";
import { ForgeGraphqlController } from "./controllers/forge-graphql.controller";
import { ForgeHealthController } from "./controllers/forge-health.controller";
import { ForgeWorkerController } from "./controllers/forge-worker.controller";
import { ArtifactCacheService } from "./artifacts/artifact-cache.service";
import { ForgeGraphqlService } from "./graphql/forge-graphql.service";
import { ForgeBootstrapService } from "./services/forge-bootstrap.service";
import { ForgeStoreService } from "./state/forge-store.service";

@Module({
  controllers: [
    ForgeArtifactsController,
    ForgeGraphqlController,
    ForgeHealthController,
    ForgeWorkerController,
  ],
  providers: [
    ArtifactCacheService,
    ForgeBootstrapService,
    ForgeGraphqlService,
    ForgeStoreService,
  ],
})
export class AppModule {}
