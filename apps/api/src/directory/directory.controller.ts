import { BadRequestException, Body, Controller, ForbiddenException, Get, Headers, Param, Patch, Post, Query } from "@nestjs/common";
import { AdminOnly, RequirePermission } from "../access/access.decorators";
import { AccessService, type ProfileCode } from "../access/access.service";
import { DirectoryRepository } from "./directory.repository";

@Controller()
export class DirectoryController {
  constructor(private readonly repository: DirectoryRepository,private readonly access:AccessService) {}

  private scope(profile:string|undefined,email:string|undefined){return this.access.getTeamScope(profile?.toUpperCase()==="SYSTEM"?"SYSTEM":profile?.toUpperCase()==="ADMIN"?"ADMIN":"USUARIO" as ProfileCode,email)}
  private ids(value?:string){return value?.split(",").map(item=>item.trim()).filter(Boolean)??[]}

  @Get("people")
  @RequirePermission("PERSONAS","view")
  async listPeople(@Query("search") search?: string,@Headers("x-mochelab-demo-profile") profile?:string,@Headers("x-mochelab-demo-user-email") email?:string) {
    return this.repository.listPeople(search,await this.scope(profile,email));
  }

  @Get("people/:id/profile")
  @RequirePermission("PERSONAS","view")
  async personProfile(@Param("id") id:string,@Headers("x-mochelab-demo-profile") profile?:string,@Headers("x-mochelab-demo-user-email") email?:string){
    return this.repository.getPersonProfile(id,await this.scope(profile,email));
  }

  @Get("teams")
  @RequirePermission("EQUIPOS","view")
  async listTeams(@Query("search") search?: string,@Headers("x-mochelab-demo-profile") profile?:string,@Headers("x-mochelab-demo-user-email") email?:string) {
    return this.repository.listTeams(search,await this.scope(profile,email));
  }

  @Get("assignment-options")
  @RequirePermission("ASIGNACIONES","view")
  async listAssignmentOptions(@Headers("x-mochelab-demo-profile") profile?:string,@Headers("x-mochelab-demo-user-email") email?:string) { return this.repository.listAssignmentOptions(await this.scope(profile,email)); }

  @AdminOnly() @Get("directory-admin/options")
  adminOptions(){return this.repository.adminOptions()}

  @AdminOnly() @RequirePermission("PERSONAS","create") @Post("people")
  async createPerson(@Body() body:Record<string,unknown>,@Headers("x-mochelab-demo-user-email") email?:string){return this.repository.savePerson(null,body,await this.access.getUserId("ADMIN",email))}

  @AdminOnly() @RequirePermission("PERSONAS","edit") @Patch("people/:id")
  async updatePerson(@Param("id") id:string,@Body() body:Record<string,unknown>,@Headers("x-mochelab-demo-user-email") email?:string){return this.repository.savePerson(id,body,await this.access.getUserId("ADMIN",email))}

  @AdminOnly() @RequirePermission("EQUIPOS","create") @Post("teams")
  async createTeam(@Body() body:Record<string,unknown>,@Headers("x-mochelab-demo-user-email") email?:string){return this.repository.saveTeam(null,body,await this.access.getUserId("ADMIN",email))}

  @AdminOnly() @RequirePermission("EQUIPOS","edit") @Patch("teams/:id")
  async updateTeam(@Param("id") id:string,@Body() body:Record<string,unknown>,@Headers("x-mochelab-demo-user-email") email?:string){return this.repository.saveTeam(id,body,await this.access.getUserId("ADMIN",email))}

  @AdminOnly() @RequirePermission("CURSOS","create") @Post("roles")
  async createRole(@Body() body:Record<string,unknown>,@Headers("x-mochelab-demo-user-email") email?:string){return this.repository.saveRole(null,body,await this.access.getUserId("ADMIN",email))}

  @AdminOnly() @RequirePermission("CURSOS","edit") @Patch("roles/:id")
  async updateRole(@Param("id") id:string,@Body() body:Record<string,unknown>,@Headers("x-mochelab-demo-user-email") email?:string){return this.repository.saveRole(id,body,await this.access.getUserId("ADMIN",email))}

  @RequirePermission("ASIGNACIONES","create")
  @Post("person-role-assignments")
  async assignPerson(@Body() body: { personId?: string; roleId?: string; teamId?: string },@Headers("x-mochelab-demo-profile") profile?:string,@Headers("x-mochelab-demo-user-email") email?:string) {
    if (!body.personId || !body.roleId || !body.teamId) throw new BadRequestException("Persona, rol y equipo son obligatorios");
    const identity=profile?.toUpperCase()==="SYSTEM"?"SYSTEM":profile?.toUpperCase()==="ADMIN"?"ADMIN":"USUARIO" as ProfileCode;
    const scope=await this.access.getTeamScope(identity,email);
    if(scope!==null&&!scope.includes(body.teamId))throw new ForbiddenException("No puedes asignar roles fuera de tus equipos autorizados");
    return this.repository.assignPerson(body.personId, body.roleId, body.teamId,await this.access.getUserId(identity,email),scope);
  }

  @RequirePermission("ASIGNACIONES","edit") @Patch("person-role-assignments/:id")
  async updateAssignment(@Param("id") id:string,@Body() body:Record<string,unknown>,@Headers("x-mochelab-demo-profile") profile?:string,@Headers("x-mochelab-demo-user-email") email?:string){const identity=profile?.toUpperCase()==="SYSTEM"?"SYSTEM":profile?.toUpperCase()==="ADMIN"?"ADMIN":"USUARIO" as ProfileCode;return this.repository.updateAssignment(id,body,await this.access.getUserId(identity,email),await this.access.getTeamScope(identity,email))}

  @RequirePermission("ASIGNACIONES","view") @Get("person-role-assignments")
  async listAssignments(@Query("search") search?:string,@Query("teamIds") teamIds?:string,@Query("roleIds") roleIds?:string,@Query("statusIds") statusIds?:string,@Query("statusCodes") statusCodes?:string,@Query("onboardingStatusIds") onboardingStatusIds?:string,@Headers("x-mochelab-demo-profile") profile?:string,@Headers("x-mochelab-demo-user-email") email?:string){return this.repository.listAssignments({search,teamIds:this.ids(teamIds),roleIds:this.ids(roleIds),statusIds:this.ids(statusIds),statusCodes:this.ids(statusCodes),onboardingStatusIds:this.ids(onboardingStatusIds)},await this.scope(profile,email))}

  @RequirePermission("ASIGNACIONES","edit") @Patch("person-role-assignments")
  async bulkUpdateAssignments(@Body() body:{ids?:string[];statusId?:string;onboardingStatusId?:string;endDate?:string},@Headers("x-mochelab-demo-profile") profile?:string,@Headers("x-mochelab-demo-user-email") email?:string){
    if(!Array.isArray(body.ids)||!body.ids.length)throw new BadRequestException("Selecciona al menos una asignación");
    const identity=profile?.toUpperCase()==="SYSTEM"?"SYSTEM":profile?.toUpperCase()==="ADMIN"?"ADMIN":"USUARIO" as ProfileCode;
    return this.repository.bulkUpdateAssignments({...body,ids:body.ids},await this.access.getUserId(identity,email),await this.access.getTeamScope(identity,email));
  }
}
