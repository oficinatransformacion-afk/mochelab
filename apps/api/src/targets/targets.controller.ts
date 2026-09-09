import { BadRequestException,Body,Controller,Get,Headers,Param,Patch,Post } from "@nestjs/common";
import { RequirePermission } from "../access/access.decorators";
import { AccessService,type ProfileCode } from "../access/access.service";
import { TargetsRepository } from "./targets.repository";
@RequirePermission("OBJETIVOS","view") @Controller("targets")
export class TargetsController{
 constructor(private readonly repository:TargetsRepository,private readonly access:AccessService){}
 private profile(profile?:string):ProfileCode{return profile?.toUpperCase()==="SYSTEM"?"SYSTEM":profile?.toUpperCase()==="ADMIN"?"ADMIN":"USUARIO"}
 private scope(profile:string|undefined,email:string|undefined){return this.access.getTeamScope(this.profile(profile),email)}
 @Get() async list(@Headers("x-mochelab-demo-profile") profile?:string,@Headers("x-mochelab-demo-user-email") email?:string){return this.repository.list(await this.scope(profile,email))}
 @Get("options") async options(@Headers("x-mochelab-demo-profile") profile?:string,@Headers("x-mochelab-demo-user-email") email?:string){return this.repository.options(await this.scope(profile,email))}
 @Post() @RequirePermission("OBJETIVOS","create") async create(@Body() body:unknown,@Headers("x-mochelab-demo-profile") profile?:string,@Headers("x-mochelab-demo-user-email") email?:string){if(!body||typeof body!=="object")throw new BadRequestException("Datos inválidos");const identity=this.profile(profile);const [scope,userId]=await Promise.all([this.access.getTeamScope(identity,email),this.access.getUserId(identity,email)]);return this.repository.create(body as Record<string,unknown>,scope,userId)}
 @Patch(":id") @RequirePermission("OBJETIVOS","edit") async update(@Param("id") id:string,@Body() body:unknown,@Headers("x-mochelab-demo-profile") profile?:string,@Headers("x-mochelab-demo-user-email") email?:string){if(!body||typeof body!=="object")throw new BadRequestException("Datos inválidos");const identity=this.profile(profile);const [scope,userId]=await Promise.all([this.access.getTeamScope(identity,email),this.access.getUserId(identity,email)]);return this.repository.update(id,body as Record<string,unknown>,scope,userId)}
}
