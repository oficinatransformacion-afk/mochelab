import { BadRequestException, Body, Controller, Get, Headers, Param, Patch, Post } from "@nestjs/common";
import { AdminOnly, RequirePermission } from "../access/access.decorators";
import { AccessService, type ProfileCode } from "../access/access.service";
import { AcademyRepository } from "./academy.repository";

@Controller("academy")
@RequirePermission("CURSOS","view")
export class AcademyController {
  constructor(private readonly repository: AcademyRepository,private readonly access:AccessService) {}
  private scope(profile:string|undefined,email:string|undefined){return this.access.getTeamScope(profile?.toUpperCase()==="SYSTEM"?"SYSTEM":profile?.toUpperCase()==="ADMIN"?"ADMIN":"USUARIO" as ProfileCode,email)}
  @Get("roles") async listRoles(@Headers("x-mochelab-demo-profile") profile?:string,@Headers("x-mochelab-demo-user-email") email?:string) { return this.repository.listRoles(await this.scope(profile,email)); }
  @Get("courses") async listCourses(@Headers("x-mochelab-demo-profile") profile?:string,@Headers("x-mochelab-demo-user-email") email?:string) { return this.repository.listCourses(await this.scope(profile,email)); }
  @Get("routes/options") async learningRouteOptions(@Headers("x-mochelab-demo-profile") profile?:string,@Headers("x-mochelab-demo-user-email") email?:string) { return this.repository.learningRouteOptions(await this.scope(profile,email)); }
  @Get("routes") async learningRoutes(@Headers("x-mochelab-demo-profile") profile?:string,@Headers("x-mochelab-demo-user-email") email?:string) { return this.repository.learningRoutes(await this.scope(profile,email)); }
  @AdminOnly() @Get("admin/options") adminOptions(){return this.repository.adminOptions()}
  @AdminOnly() @RequirePermission("CURSOS","create") @Post("courses") async createCourse(@Body() body:Record<string,unknown>,@Headers("x-mochelab-demo-user-email") email?:string){return this.repository.saveCourse(null,body,await this.access.getUserId("ADMIN",email))}
  @AdminOnly() @RequirePermission("CURSOS","edit") @Patch("courses/:id") async updateCourse(@Param("id") id:string,@Body() body:Record<string,unknown>,@Headers("x-mochelab-demo-user-email") email?:string){return this.repository.saveCourse(id,body,await this.access.getUserId("ADMIN",email))}

  @AdminOnly()
  @RequirePermission("CURSOS","create")
  @Post("roles/:roleId/courses/:courseId")
  async assignCourse(@Param("roleId") roleId: string, @Param("courseId") courseId: string,@Headers("x-mochelab-demo-user-email") email?:string) { return this.repository.assignCourse(roleId, courseId,await this.access.getUserId("ADMIN",email)); }
  @AdminOnly() @RequirePermission("CURSOS","edit") @Patch("roles/:roleId/courses/:courseId/deactivate") async unassignCourse(@Param("roleId") roleId:string,@Param("courseId") courseId:string,@Headers("x-mochelab-demo-user-email") email?:string){return this.repository.unassignCourse(roleId,courseId,await this.access.getUserId("ADMIN",email))}

  @AdminOnly()
  @RequirePermission("CURSOS","edit")
  @Patch("person-roles/:personRoleId/courses/:courseId")
  async updateProgress(@Param("personRoleId") personRoleId: string, @Param("courseId") courseId: string, @Body() body: { statusCode?: string; score?: number | null; startDate?: string | null; endDate?: string | null },@Headers("x-mochelab-demo-user-email") email?:string) {
    if (!body.statusCode || typeof body.statusCode !== "string") throw new BadRequestException("El estado es obligatorio");
    return this.repository.updateProgress(personRoleId, courseId, body.statusCode, body.score, body.startDate, body.endDate,await this.access.getUserId("ADMIN",email));
  }
}
