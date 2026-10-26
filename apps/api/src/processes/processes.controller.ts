import { BadRequestException, Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query } from "@nestjs/common";
import { RequirePermission } from "../access/access.decorators";
import { AccessService, profileCode } from "../access/access.service";
import { ProcessesRepository, type ProcessLevel } from "./processes.repository";

@RequirePermission("PROCESOS", "view")
@Controller("processes")
export class ProcessesController {
  constructor(private readonly repository: ProcessesRepository, private readonly access: AccessService) {}

  private async actor(profile?: string, email?: string) {
    return this.access.getUserId(profileCode(profile), email);
  }

  @Get()
  list(@Query("search") search?: string, @Query("state") state?: string) {
    return this.repository.list(search, state);
  }

  @Get("options")
  options() { return this.repository.options(); }

  @Post(":level")
  @RequirePermission("PROCESOS", "create")
  async create(@Param("level") level: string, @Body() body: unknown, @Headers("x-mochelab-demo-profile") profile?: string, @Headers("x-mochelab-demo-user-email") email?: string) {
    if (!body || typeof body !== "object") throw new BadRequestException("Datos inválidos");
    return this.repository.create(this.repository.level(level), body as Record<string, unknown>, await this.actor(profile, email));
  }

  @Patch(":level/:id")
  @RequirePermission("PROCESOS", "edit")
  async update(@Param("level") level: string, @Param("id") id: string, @Body() body: unknown, @Headers("x-mochelab-demo-profile") profile?: string, @Headers("x-mochelab-demo-user-email") email?: string) {
    if (!body || typeof body !== "object") throw new BadRequestException("Datos inválidos");
    return this.repository.update(this.repository.level(level), id, body as Record<string, unknown>, await this.actor(profile, email));
  }

  @Post("subprocesses/:id/initiatives")
  @RequirePermission("PROCESOS", "edit")
  async link(@Param("id") id: string, @Body() body: unknown, @Headers("x-mochelab-demo-profile") profile?: string, @Headers("x-mochelab-demo-user-email") email?: string) {
    if (!body || typeof body !== "object") throw new BadRequestException("Datos inválidos");
    return this.repository.linkInitiative(id, body as Record<string, unknown>, await this.actor(profile, email));
  }

  @Delete("subprocesses/:id/initiatives/:initiativeId")
  @RequirePermission("PROCESOS", "edit")
  async unlink(@Param("id") id: string, @Param("initiativeId") initiativeId: string, @Headers("x-mochelab-demo-profile") profile?: string, @Headers("x-mochelab-demo-user-email") email?: string) {
    return this.repository.unlinkInitiative(id, initiativeId, await this.actor(profile, email));
  }
}
