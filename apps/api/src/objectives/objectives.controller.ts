import { BadRequestException, Body, Controller, Get, Headers, Param, Patch, Post, Query } from "@nestjs/common";
import { ObjectivesRepository } from "./objectives.repository";
import { RequirePermission } from "../access/access.decorators";
import { AccessService, type ProfileCode } from "../access/access.service";

@RequirePermission("OBJETIVOS","view")
@Controller("objectives")
export class ObjectivesController {
  constructor(private readonly repository: ObjectivesRepository,private readonly access:AccessService) {}
  private profile(profile?:string):ProfileCode{return profile?.toUpperCase()==="ADMINISTRADOR"?"ADMINISTRADOR":"USUARIO"}
  private scope(profile:string|undefined,email:string|undefined){return this.access.getTeamScope(this.profile(profile),email)}

  @Get()
  async list(@Query("year") year?: string, @Query("search") search?: string,@Headers("x-mochelab-demo-profile") profile?:string,@Headers("x-mochelab-demo-user-email") email?:string) {
    return this.repository.list(year ? Number(year) : undefined, search,await this.scope(profile,email));
  }

  @Get("options")
  async options(@Headers("x-mochelab-demo-profile") profile?:string,@Headers("x-mochelab-demo-user-email") email?:string) { return this.repository.options(await this.scope(profile,email)); }

  @Post()
  @RequirePermission("OBJETIVOS","create")
  async create(@Body() body: unknown,@Headers("x-mochelab-demo-profile") profile?:string,@Headers("x-mochelab-demo-user-email") email?:string) {
    if (!body || typeof body !== "object") throw new BadRequestException("Datos del objetivo inválidos");
    const identity=this.profile(profile);const [scope,userId]=await Promise.all([this.access.getTeamScope(identity,email),this.access.getUserId(identity,email)]);
    return this.repository.create(body as Record<string, unknown>,scope,userId);
  }

  @Patch(":id")
  @RequirePermission("OBJETIVOS","edit")
  async update(@Param("id") id: string, @Body() body: unknown,@Headers("x-mochelab-demo-profile") profile?:string,@Headers("x-mochelab-demo-user-email") email?:string) {
    if (!body || typeof body !== "object") throw new BadRequestException("Datos del objetivo inválidos");
    const identity=this.profile(profile);const [scope,userId]=await Promise.all([this.access.getTeamScope(identity,email),this.access.getUserId(identity,email)]);
    return this.repository.update(id, body as Record<string, unknown>,scope,userId);
  }
}
