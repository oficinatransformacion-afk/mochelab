import { BadRequestException, Body, Controller, Get, Headers, Param, Patch, Post, Query } from "@nestjs/common";
import { RequirePermission } from "../access/access.decorators";
import { AccessService, profileCode, type ProfileCode } from "../access/access.service";
import { AnnualObjectivesRepository } from "./annual-objectives.repository";

@RequirePermission("OBJETIVOS", "view")
@Controller("annual-objectives")
export class AnnualObjectivesController {
  constructor(private readonly repository: AnnualObjectivesRepository, private readonly access: AccessService) {}
  private profile(value?: string): ProfileCode { return profileCode(value); }
  private body(value: unknown) { if (!value || typeof value !== "object") throw new BadRequestException("Datos inválidos"); return value as Record<string, unknown>; }

  @Get() async list(@Query("years") years?: string, @Query("search") search?: string, @Headers("x-mochelab-demo-profile") profile?: string, @Headers("x-mochelab-demo-user-email") email?: string) { return this.repository.list((years ?? "").split(",").filter(Boolean).map(Number), search, await this.access.getTeamScope(this.profile(profile), email)); }
  @Get("options") async options(@Headers("x-mochelab-demo-profile") profile?: string, @Headers("x-mochelab-demo-user-email") email?: string) { return this.repository.options(await this.access.getTeamScope(this.profile(profile), email)); }
  @Post() @RequirePermission("OBJETIVOS", "create") async create(@Body() input: unknown, @Headers("x-mochelab-demo-profile") profile?: string, @Headers("x-mochelab-demo-user-email") email?: string) { const identity = this.profile(profile); return this.repository.create(this.body(input), await this.access.getTeamScope(identity, email), await this.access.getUserId(identity, email), identity === "ADMIN" || identity === "SYSTEM"); }
  @Patch(":id") @RequirePermission("OBJETIVOS", "edit") async update(@Param("id") id: string, @Body() input: unknown, @Headers("x-mochelab-demo-profile") profile?: string, @Headers("x-mochelab-demo-user-email") email?: string) { const identity = this.profile(profile); return this.repository.update(id, this.body(input), await this.access.getTeamScope(identity, email), await this.access.getUserId(identity, email), identity === "ADMIN" || identity === "SYSTEM"); }
  @Post(":id/key-results") @RequirePermission("OBJETIVOS", "create") async createKeyResult(@Param("id") id: string, @Body() input: unknown, @Headers("x-mochelab-demo-profile") profile?: string, @Headers("x-mochelab-demo-user-email") email?: string) { const identity = this.profile(profile); return this.repository.createKeyResult(id, this.body(input), await this.access.getUserId(identity, email)); }
  @Patch("key-results/:id") @RequirePermission("OBJETIVOS", "edit") async updateKeyResult(@Param("id") id: string, @Body() input: unknown, @Headers("x-mochelab-demo-profile") profile?: string, @Headers("x-mochelab-demo-user-email") email?: string) { const identity = this.profile(profile); return this.repository.updateKeyResult(id, this.body(input), await this.access.getUserId(identity, email)); }
}
