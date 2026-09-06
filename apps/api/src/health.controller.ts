import { Controller, Get } from "@nestjs/common";
import { HealthResponseSchema, type HealthResponse } from "@mochelab/shared";

@Controller("health")
export class HealthController {
  @Get()
  getHealth(): HealthResponse {
    return HealthResponseSchema.parse({
      status: "ok",
      service: "mochelab-api",
      timestamp: new Date().toISOString(),
    });
  }
}
