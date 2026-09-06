import { BadRequestException, Body, Controller, Get, Headers, Param, Patch, Post, Query } from "@nestjs/common";
import { AdminOnly, RequirePermission } from "../access/access.decorators";
import { AccessService, type ProfileCode } from "../access/access.service";
import { DirectoryRepository } from "./directory.repository";

@Controller()
export class DirectoryController {
  constructor(private readonly repository: DirectoryRepository,private readonly access:AccessService) {}

  private scope(profile:string|undefined,email:string|undefined){return this.access.getTeamScope(profile?.toUpperCase()==="ADMINISTRADOR"?"ADMINISTRADOR":"USUARIO" as ProfileCode,email)}

  @Get("people")
  @RequirePermission("PERSONAS","view")
  async listPeople(@Query("search") search?: string,@Headers("x-mochelab-demo-profile") profile?:string,@Headers("x-mochelab-demo-user-email") email?:string) {
    return this.repository.listPeople(search,await this.scope(profile,email));
  }

  @Get("teams")
  @RequirePermission("EQUIPOS","view")
  async listTeams(@Query("search") search?: string,@Headers("x-mochelab-demo-profile") profile?:string,@Headers("x-mochelab-demo-user-email") email?:string) {
    return this.repository.listTeams(search,await this.scope(profile,email));
  }

  @Get("assignment-options")
  @RequirePermission("PERSONAS","view")
  async listAssignmentOptions(@Headers("x-mochelab-demo-profile") profile?:string,@Headers("x-mochelab-demo-user-email") email?:string) { return this.repository.listAssignmentOptions(await this.scope(profile,email)); }

  @AdminOnly() @Get("directory-admin/options")
  adminOptions(){return this.repository.adminOptions()}

  @AdminOnly() @RequirePermission("PERSONAS","create") @Post("people")
  async createPerson(@Body() body:Record<string,unknown>,@Headers("x-mochelab-demo-user-email") email?:string){return this.repository.savePerson(null,body,await this.access.getUserId("ADMINISTRADOR",email))}

  @AdminOnly() @RequirePermission("PERSONAS","edit") @Patch("people/:id")
  async updatePerson(@Param("id") id:string,@Body() body:Record<string,unknown>,@Headers("x-mochelab-demo-user-email") email?:string){return this.repository.savePerson(id,body,await this.access.getUserId("ADMINISTRADOR",email))}

  @AdminOnly() @RequirePermission("EQUIPOS","create") @Post("teams")
  async createTeam(@Body() body:Record<string,unknown>,@Headers("x-mochelab-demo-user-email") email?:string){return this.repository.saveTeam(null,body,await this.access.getUserId("ADMINISTRADOR",email))}

  @AdminOnly() @RequirePermission("EQUIPOS","edit") @Patch("teams/:id")
  async updateTeam(@Param("id") id:string,@Body() body:Record<string,unknown>,@Headers("x-mochelab-demo-user-email") email?:string){return this.repository.saveTeam(id,body,await this.access.getUserId("ADMINISTRADOR",email))}

  @AdminOnly() @RequirePermission("CURSOS","create") @Post("roles")
  async createRole(@Body() body:Record<string,unknown>,@Headers("x-mochelab-demo-user-email") email?:string){return this.repository.saveRole(null,body,await this.access.getUserId("ADMINISTRADOR",email))}

  @AdminOnly() @RequirePermission("CURSOS","edit") @Patch("roles/:id")
  async updateRole(@Param("id") id:string,@Body() body:Record<string,unknown>,@Headers("x-mochelab-demo-user-email") email?:string){return this.repository.saveRole(id,body,await this.access.getUserId("ADMINISTRADOR",email))}

  @AdminOnly()
  @RequirePermission("PERSONAS","create")
  @Post("person-role-assignments")
  async assignPerson(@Body() body: { personId?: string; roleId?: string; teamId?: string },@Headers("x-mochelab-demo-user-email") email?:string) {
    if (!body.personId || !body.roleId || !body.teamId) throw new BadRequestException("Persona, rol y equipo son obligatorios");
    return this.repository.assignPerson(body.personId, body.roleId, body.teamId,await this.access.getUserId("ADMINISTRADOR",email));
  }

  @AdminOnly() @RequirePermission("PERSONAS","edit") @Patch("person-role-assignments/:id")
  async updateAssignment(@Param("id") id:string,@Body() body:Record<string,unknown>,@Headers("x-mochelab-demo-user-email") email?:string){return this.repository.updateAssignment(id,body,await this.access.getUserId("ADMINISTRADOR",email))}
}
