import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ForgeBootstrapService } from "./services/forge-bootstrap.service";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    cors: true,
  });
  const bootstrapService = app.get(ForgeBootstrapService);
  await bootstrapService.warmup();

  const port = Number(process.env["FORGE_API_HOST_PORT"] || process.env["PORT"] || "4101");
  await app.listen(port, "0.0.0.0");
  process.stdout.write(`cosmic-forge-api listening on http://127.0.0.1:${port}\n`);
}

if (require.main === module) {
  void bootstrap();
}

export { bootstrap };
