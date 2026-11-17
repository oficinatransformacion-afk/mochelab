import { BadRequestException, Body, Controller, Get, Headers, Param, Patch, Post, Query, StreamableFile } from "@nestjs/common";
import { InitiativesRepository } from "./initiatives.repository";
import { InitiativesExportService, type InitiativeExportFilters } from "./initiatives-export.service";
import { RequirePermission } from "../access/access.decorators";
import { AccessService,profileCode,type ProfileCode } from "../access/access.service";

@RequirePermission("PORTAFOLIO","view")
@Controller("initiatives")
export class InitiativesController {
 constructor(private readonly repository:InitiativesRepository,private readonly access:AccessService,private readonly exporter:InitiativesExportService){}
 private profile(profile?:string):ProfileCode{return profileCode(profile)}
 private scope(profile:string|undefined,email:string|undefined){return this.access.getTeamScope(this.profile(profile),email)}
 @Get() async list(@Query("search") search?:string,@Query("year") year?:string,@Headers("x-mochelab-demo-profile") profile?:string,@Headers("x-mochelab-demo-user-email") email?:string){return this.repository.list(search,year?Number(year):undefined,await this.scope(profile,email))}
 @Get("options") async options(@Headers("x-mochelab-demo-profile") profile?:string,@Headers("x-mochelab-demo-user-email") email?:string){return this.repository.options(await this.scope(profile,email))}
 @Post("export/preview")
 async exportPreview(@Body() body:InitiativeExportFilters,@Headers("x-mochelab-demo-profile") profile?:string,@Headers("x-mochelab-demo-user-email") email?:string){return this.exporter.preview(body??{},await this.scope(profile,email))}
 @Post("export")
 async exportReport(@Body() body:InitiativeExportFilters,@Headers("x-mochelab-demo-profile") profile?:string,@Headers("x-mochelab-demo-user-email") email?:string){const identity=this.profile(profile);const[scope,userId]=await Promise.all([this.access.getTeamScope(identity,email),this.access.getUserId(identity,email)]);const result=await this.exporter.export(body??{},scope,userId,email??"");return new StreamableFile(result.buffer,{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",disposition:`attachment; filename="${result.filename}"`})}
 @Post()
 @RequirePermission("PORTAFOLIO","create")
 async create(@Body() body:unknown,@Headers("x-mochelab-demo-profile") profile?:string,@Headers("x-mochelab-demo-user-email") email?:string){if(!body||typeof body!=="object")throw new BadRequestException("Datos inválidos");const identity=this.profile(profile);const [scope,userId]=await Promise.all([this.access.getTeamScope(identity,email),this.access.getUserId(identity,email)]);return this.repository.create(body as Record<string,unknown>,scope,userId)}
 @Patch(":id")
 @RequirePermission("PORTAFOLIO","edit")
 async update(@Param("id") id:string,@Body() body:unknown,@Headers("x-mochelab-demo-profile") profile?:string,@Headers("x-mochelab-demo-user-email") email?:string){if(!body||typeof body!=="object")throw new BadRequestException("Datos inválidos");const identity=this.profile(profile);const [scope,userId]=await Promise.all([this.access.getTeamScope(identity,email),this.access.getUserId(identity,email)]);return this.repository.update(id,body as Record<string,unknown>,scope,userId)}
}
