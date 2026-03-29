import { Module } from "@nestjs/common";
import { ForgeArtifactsController } from "./controllers/forge-artifacts.controller";
import { ForgeGraphqlController } from "./controllers/forge-graphql.controller";
import { ForgeHealthController } from "./controllers/forge-health.controller";
import { ForgeTargetResolutionController } from "./controllers/forge-target-resolution.controller";
import { ForgeWorkerController } from "./controllers/forge-worker.controller";
import { ArtifactCacheService } from "./artifacts/artifact-cache.service";
import { ForgeGraphqlService } from "./graphql/forge-graphql.service";
import { ForgeBootstrapService } from "./services/forge-bootstrap.service";
import { ForgeTargetResolverService } from "./services/forge-target-resolver.service";
import { ForgeStateRepository } from "./state/forge-state.repository";
import { ForgeStoreService } from "./state/forge-store.service";

@Module({
  controllers: [
    ForgeArtifactsController,
    ForgeGraphqlController,
    ForgeHealthController,
    ForgeTargetResolutionController,
    ForgeWorkerController,
  ],
  providers: [
    ArtifactCacheService,
    ForgeBootstrapService,
    ForgeGraphqlService,
    ForgeTargetResolverService,
    ForgeStateRepository,
    ForgeStoreService,
  ],
})
export class AppModule {}
