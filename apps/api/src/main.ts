import "reflect-metadata";
import "./environment";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const corsOrigin = process.env.CORS_ORIGIN ?? "http://localhost:5173";

  app.enableCors({ origin: corsOrigin.split(",").map((origin) => origin.trim()) });
  app.setGlobalPrefix("api");

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}

void bootstrap();
