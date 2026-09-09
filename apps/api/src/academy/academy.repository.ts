import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";

@Injectable()
export class AcademyRepository {
  constructor(private readonly prisma: PrismaService) {}
  private snapshot(value:unknown){return JSON.parse(JSON.stringify(value,(_,item)=>typeof item==="bigint"?item.toString():item))}
  private text(input:Record<string,unknown>,key:string){const value=typeof input[key]==="string"?(input[key] as string).trim():"";if(!value)throw new BadRequestException(`${key} es obligatorio`);return value}

  async adminOptions(){const values=await this.prisma.catalogValue.findMany({where:{active:true,catalog:{code:{in:["MODULO_CURSO","ESTADO_CURSO"]}}},include:{catalog:true},orderBy:[{catalog:{code:"asc"}},{sortOrder:"asc"}]});return{modules:values.filter(x=>x.catalog.code==="MODULO_CURSO").map(x=>({id:x.id,code:x.code,name:x.name})),statuses:values.filter(x=>x.catalog.code==="ESTADO_CURSO").map(x=>({id:x.id,code:x.code,name:x.name}))}}

  async listRoles(teamIds:string[]|null=null) {
    const roles = await this.prisma.role.findMany({
      include: { type: true, status: true, roleCourses: { include: { course: { include: { module: true } } } }, assignments: {where:teamIds===null?undefined:{teamId:{in:teamIds}}} },
      orderBy: { name: "asc" },
    });
    return roles.map((role) => ({ id: role.id, sourceId: role.sourceId, name: role.name, type: role.type.name,typeId:role.typeId, status: role.status.name,statusId:role.statusId, peopleCount: role.assignments.length, courses: role.roleCourses.filter((item) => item.active).map((item) => ({ id: item.course.id, name: item.course.name, module: item.course.module.name })) }));
  }

  async listCourses(teamIds:string[]|null=null) {
    const courses = await this.prisma.course.findMany({
      include: { module: true, status: true, roleCourses: { include: { role: true } }, personCourses: { where:teamIds===null?undefined:{personRole:{teamId:{in:teamIds}}},include: { status: true, personRole: { include: { person: true } } } } },
      orderBy: { name: "asc" },
    });
    return courses.map((course) => ({ id: course.id, sourceId: course.sourceId, name: course.name,moduleId:course.moduleId,statusId:course.statusId, module: course.module.name, status: course.status.name, roles: course.roleCourses.filter((item) => item.active).map((item) => ({id:item.role.id,name:item.role.name})), progress: course.personCourses.map((item) => ({ personRoleId: item.personRoleId, courseId: item.courseId, person: item.personRole.person.names, status: item.status.code, statusName: item.status.name, score: item.score === null ? null : Number(item.score), startDate: item.startDate?.toISOString().slice(0, 10) ?? null, endDate: item.endDate?.toISOString().slice(0, 10) ?? null })) }));
  }

  async learningRouteOptions(teamIds:string[]|null=null){
    const teams=await this.prisma.team.findMany({
      where:{status:{code:"ACTIVO"},id:teamIds===null?undefined:{in:teamIds}},
      include:{program:true},
      orderBy:{sourceId:"asc"},
    });
    return{teams:teams.map(item=>({id:item.sourceId,label:`${item.sourceId} · ${item.program.name}`}))};
  }

  async learningRoutes(teamIds:string[]|null=null){
    const assignments=await this.prisma.personRole.findMany({where:{teamId:teamIds===null?undefined:{in:teamIds},status:{code:"ACTIVO"}},include:{person:{include:{company:true}},role:true,team:{include:{program:true}},courses:{include:{course:{include:{module:true}},status:true},orderBy:{course:{name:"asc"}}}},orderBy:{person:{names:"asc"}}});
    return assignments.map(item=>{const total=item.courses.length,completed=item.courses.filter(c=>["TERMINADO","APROBADO","COMPLETADO"].includes(c.status.code)).length,pending=total-completed,progress=total?Math.round(completed*10000/total)/100:0;return{personRoleId:item.id,personId:item.personId,person:item.person.names,dni:item.person.dni,company:item.person.company.name,role:item.role.name,team:item.team.sourceId,program:item.team.program.name,total,completed,pending,progress,situation:total===0?"SIN_RUTA":progress===100?"COMPLETA":completed===0?"SIN_INICIAR":"EN_PROGRESO",priority:pending===0?"BAJA":progress===0?"ALTA":"MEDIA",courses:item.courses.map(c=>({id:c.id,name:c.course.name,module:c.course.module.name,status:c.status.name,statusCode:c.status.code,score:c.score===null?null:Number(c.score)}))}});
  }

  async assignCourse(roleId: string, courseId: string,administratorId:string) {
    const [role, course] = await Promise.all([this.prisma.role.findUnique({ where: { id: roleId } }), this.prisma.course.findUnique({ where: { id: courseId } })]);
    if (!role || !course) throw new NotFoundException("No se encontró el rol o curso seleccionado");
    return this.prisma.$transaction(async tx=>{const current=await tx.roleCourse.findUnique({where:{roleId_courseId:{roleId,courseId}}});const updated=await tx.roleCourse.upsert({ where: { roleId_courseId: { roleId, courseId } }, create: { roleId, courseId }, update: { active: true } });await tx.audit.create({data:{occurredAt:new Date(),userId:administratorId,action:current?"REACTIVATE":"CREATE",entity:"ROLE_COURSE",recordId:`${roleId}:${courseId}`,oldValue:current?this.snapshot(current):undefined,newValue:this.snapshot(updated),result:"OK",origin:"WEB"}});return updated});
  }

  async unassignCourse(roleId:string,courseId:string,administratorId:string){const current=await this.prisma.roleCourse.findUnique({where:{roleId_courseId:{roleId,courseId}}});if(!current||!current.active)throw new NotFoundException("No existe una asignación activa entre el rol y el curso");return this.prisma.$transaction(async tx=>{const updated=await tx.roleCourse.update({where:{roleId_courseId:{roleId,courseId}},data:{active:false}});await tx.audit.create({data:{occurredAt:new Date(),userId:administratorId,action:"DEACTIVATE",entity:"ROLE_COURSE",recordId:`${roleId}:${courseId}`,oldValue:this.snapshot(current),newValue:this.snapshot(updated),result:"OK",origin:"WEB"}});return updated})}

  async saveCourse(id:string|null,input:Record<string,unknown>,administratorId:string){const current=id?await this.prisma.course.findUnique({where:{id},include:{status:true}}):null;if(id&&!current)throw new NotFoundException("No se encontró el curso");const data={sourceId:this.text(input,"sourceId"),name:this.text(input,"name"),moduleId:this.text(input,"moduleId"),statusId:this.text(input,"statusId")};const [module,status]=await Promise.all([this.prisma.catalogValue.findFirst({where:{id:data.moduleId,catalog:{code:"MODULO_CURSO"}}}),this.prisma.catalogValue.findFirst({where:{id:data.statusId,catalog:{code:"ESTADO_CURSO"}}})]);if(!module||!status)throw new BadRequestException("Módulo o estado del curso inválido");if(current&&current.status.code==="ACTIVO"&&status.code!=="ACTIVO"&&await this.prisma.roleCourse.count({where:{courseId:id!,active:true}}))throw new BadRequestException("Desvincula el curso de sus roles antes de desactivarlo");try{return await this.prisma.$transaction(async tx=>{const row=id?await tx.course.update({where:{id},data}):await tx.course.create({data});await tx.audit.create({data:{occurredAt:new Date(),userId:administratorId,action:id?"UPDATE":"CREATE",entity:"COURSE",recordId:row.id,oldValue:current?this.snapshot(current):undefined,newValue:this.snapshot(row),result:"OK",origin:"WEB"}});return row})}catch(error:unknown){if(typeof error==="object"&&error&&"code" in error&&error.code==="P2002")throw new BadRequestException("Ya existe un curso con ese código");throw error}}

  async updateProgress(personRoleId: string, courseId: string, statusCode: string, score?: number | null, startDate?: string | null, endDate?: string | null,administratorId?:string) {
    if (score != null && (score < 0 || score > 20)) throw new BadRequestException("La nota debe estar entre 0 y 20");
    if (startDate && endDate && startDate > endDate) throw new BadRequestException("La fecha de fin no puede ser anterior a la fecha de inicio");
    const [assignment, course, status] = await Promise.all([
      this.prisma.personRole.findUnique({ where: { id: personRoleId } }),
      this.prisma.course.findUnique({ where: { id: courseId } }),
      this.prisma.catalogValue.findFirst({ where: { code: statusCode, catalog: { code: "ESTADO_PERSONA_CURSO" } } }),
    ]);
    if (!assignment || !course || !status) throw new NotFoundException("No se encontró la asignación, curso o estado");
    return this.prisma.$transaction(async tx=>{const current=await tx.personCourse.findUnique({where:{personRoleId_courseId:{personRoleId,courseId}}});const updated=await tx.personCourse.upsert({
      where: { personRoleId_courseId: { personRoleId, courseId } },
      create: { personRoleId, courseId, statusId: status.id, score, startDate: startDate ? new Date(startDate) : null, endDate: endDate ? new Date(endDate) : null },
      update: { statusId: status.id, score, startDate: startDate ? new Date(startDate) : null, endDate: endDate ? new Date(endDate) : null },
    });await tx.audit.create({data:{occurredAt:new Date(),userId:administratorId,action:"UPDATE_PROGRESS",entity:"PERSON_COURSE",recordId:updated.id,oldValue:current?this.snapshot(current):undefined,newValue:this.snapshot(updated),result:"OK",origin:"WEB"}});return updated});
  }
}
