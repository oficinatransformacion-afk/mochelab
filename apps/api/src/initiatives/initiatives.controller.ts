import { BadRequestException, Body, Controller, Get, Headers, Param, Patch, Post, Query } from "@nestjs/common";
import { InitiativesRepository } from "./initiatives.repository";
import { RequirePermission } from "../access/access.decorators";
import { AccessService, type ProfileCode } from "../access/access.service";

@RequirePermission("PORTAFOLIO","view")
@Controller("initiatives")
export class InitiativesController {
 constructor(private readonly repository:InitiativesRepository,private readonly access:AccessService){}
 private profile(profile?:string):ProfileCode{return profile?.toUpperCase()==="ADMINISTRADOR"?"ADMINISTRADOR":"USUARIO"}
 private scope(profile:string|undefined,email:string|undefined){return this.access.getTeamScope(this.profile(profile),email)}
 @Get() async list(@Query("search") search?:string,@Query("year") year?:string,@Headers("x-mochelab-demo-profile") profile?:string,@Headers("x-mochelab-demo-user-email") email?:string){return this.repository.list(search,year?Number(year):undefined,await this.scope(profile,email))}
 @Get("options") async options(@Headers("x-mochelab-demo-profile") profile?:string,@Headers("x-mochelab-demo-user-email") email?:string){return this.repository.options(await this.scope(profile,email))}
 @Get(":id/history") async history(@Param("id") id:string,@Headers("x-mochelab-demo-profile") profile?:string,@Headers("x-mochelab-demo-user-email") email?:string){return this.repository.history(id,await this.scope(profile,email))}
 @Post()
 @RequirePermission("PORTAFOLIO","create")
 async create(@Body() body:unknown,@Headers("x-mochelab-demo-profile") profile?:string,@Headers("x-mochelab-demo-user-email") email?:string){if(!body||typeof body!=="object")throw new BadRequestException("Datos inválidos");const identity=this.profile(profile);const [scope,userId]=await Promise.all([this.access.getTeamScope(identity,email),this.access.getUserId(identity,email)]);return this.repository.create(body as Record<string,unknown>,scope,userId)}
 @Patch(":id")
 @RequirePermission("PORTAFOLIO","edit")
 async update(@Param("id") id:string,@Body() body:unknown,@Headers("x-mochelab-demo-profile") profile?:string,@Headers("x-mochelab-demo-user-email") email?:string){if(!body||typeof body!=="object")throw new BadRequestException("Datos inválidos");const identity=this.profile(profile);const [scope,userId]=await Promise.all([this.access.getTeamScope(identity,email),this.access.getUserId(identity,email)]);return this.repository.update(id,body as Record<string,unknown>,scope,userId)}
}
