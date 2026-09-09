import "reflect-metadata";
import "./environment";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const corsOrigin = process.env.CORS_ORIGIN ?? "http://localhost:5173";
  const allowedOrigins = new Set(
    corsOrigin.split(",").map((origin) => origin.trim()).filter(Boolean),
  );

  if (process.env.NODE_ENV !== "production") {
    allowedOrigins.add("http://localhost:5173");
    allowedOrigins.add("http://127.0.0.1:5173");
  }

  app.enableCors({
    origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
      const localDevelopmentOrigin = process.env.NODE_ENV !== "production"
        && Boolean(origin?.match(/^http:\/\/(localhost|127\.0\.0\.1):\d+$/));
      callback(null, !origin || allowedOrigins.has(origin) || localDevelopmentOrigin);
    },
  });
  app.setGlobalPrefix("api");

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}

void bootstrap();
