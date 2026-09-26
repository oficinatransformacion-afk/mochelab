import { BadRequestException, Body, Controller, Get, Headers, Param, Patch, Post, Query } from "@nestjs/common";
import { ObjectivesRepository } from "./objectives.repository";
import { RequirePermission } from "../access/access.decorators";
import { AccessService,profileCode,type ProfileCode } from "../access/access.service";

@RequirePermission("OBJETIVOS","view")
@Controller("objectives")
export class ObjectivesController {
  constructor(private readonly repository: ObjectivesRepository,private readonly access:AccessService) {}
  private profile(profile?:string):ProfileCode{return profileCode(profile)}
  private scope(profile:string|undefined,email:string|undefined){return this.access.getTeamScope(this.profile(profile),email)}

  @Get()
  async list(@Query("years") years?:string,@Query("year") legacyYear?: string, @Query("search") search?: string,@Query("teamIds") teamIds?:string,@Query("cycleIds") cycleIds?:string,@Query("statusIds") statusIds?:string,@Query("page") page?:string,@Query("pageSize") pageSize?:string,@Headers("x-mochelab-demo-profile") profile?:string,@Headers("x-mochelab-demo-user-email") email?:string) {
    const ids=(value?:string)=>value?.split(",").filter(Boolean)??[],selectedYears=ids(years??legacyYear).map(Number);return this.repository.list(selectedYears, search,await this.scope(profile,email),page?{selectedTeamIds:ids(teamIds),cycleIds:ids(cycleIds),statusIds:ids(statusIds),page:Number(page),pageSize:Number(pageSize)||10}:undefined);
  }

  @Get("options")
  async options(@Headers("x-mochelab-demo-profile") profile?:string,@Headers("x-mochelab-demo-user-email") email?:string) { return this.repository.options(await this.scope(profile,email)); }

  @Post()
  @RequirePermission("OBJETIVOS","create")
  async create(@Body() body: unknown,@Headers("x-mochelab-demo-profile") profile?:string,@Headers("x-mochelab-demo-user-email") email?:string) {
    if (!body || typeof body !== "object") throw new BadRequestException("Datos del objetivo inválidos");
    const identity=this.profile(profile);const [scope,userId]=await Promise.all([this.access.getTeamScope(identity,email),this.access.getUserId(identity,email)]);
    return this.repository.create(body as Record<string, unknown>,scope,userId,identity==="ADMIN"||identity==="SYSTEM");
  }

  @Patch(":id")
  @RequirePermission("OBJETIVOS","edit")
  async update(@Param("id") id: string, @Body() body: unknown,@Headers("x-mochelab-demo-profile") profile?:string,@Headers("x-mochelab-demo-user-email") email?:string) {
    if (!body || typeof body !== "object") throw new BadRequestException("Datos del objetivo inválidos");
    const identity=this.profile(profile);const [scope,userId]=await Promise.all([this.access.getTeamScope(identity,email),this.access.getUserId(identity,email)]);
    return this.repository.update(id, body as Record<string, unknown>,scope,userId,identity==="ADMIN"||identity==="SYSTEM");
  }
}
