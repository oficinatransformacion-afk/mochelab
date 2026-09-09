import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";

type MaturityCommunicationType = "OPENING" | "REMINDER";

@Injectable()
export class CommunicationsRepository {
  constructor(private readonly prisma: PrismaService) {}
  private render(template:string,variables:Record<string,unknown>){return template.replace(/\{\{(\w+)\}\}/g,(_,key)=>variables[key]===null||variables[key]===undefined?"":String(variables[key]))}

  private async candidates(periodId:string,type:MaturityCommunicationType){
    const period=await this.prisma.period.findUnique({where:{id:periodId},include:{status:true}});
    if(!period)throw new NotFoundException("No se encontró el período");
    if(period.status.code!=="AUTOEVALUACION")throw new BadRequestException("Las comunicaciones solo pueden prepararse mientras la autoevaluación está abierta");
    const assignments=await this.prisma.personRole.findMany({where:{status:{code:"ACTIVO"},role:{observableBehaviors:{some:{active:true,behavior:{active:true,dimension:{active:true}}}}},selfAssessments:type==="REMINDER"?{none:{periodId}}:undefined},include:{person:true,role:true,team:true,selfAssessments:{where:{periodId},select:{id:true}}},orderBy:[{team:{sourceId:"asc"}},{person:{names:"asc"}}]});
    return{period,assignments:assignments.filter(item=>item.selfAssessments.length===0)};
  }

  async preview(periodId:string,type:MaturityCommunicationType){const {period,assignments}=await this.candidates(periodId,type);return{period:{id:period.id,name:period.name,status:period.status.code},type,total:assignments.length,withEmail:assignments.filter(x=>x.person.email).length,withoutEmail:assignments.filter(x=>!x.person.email).length,recipients:assignments.slice(0,100).map(x=>({personRoleId:x.id,person:x.person.names,email:x.person.email,role:x.role.name,team:x.team.sourceId}))}}

  async prepareMaturity(periodId:string,type:MaturityCommunicationType,requestedById:string){const {period,assignments}=await this.candidates(periodId,type);const eventType=type==="OPENING"?"SELF_ASSESSMENT_OPENED":"SELF_ASSESSMENT_REMINDER";const template=await this.prisma.communicationTemplate.findFirst({where:{code:eventType,active:true}});if(!template)throw new BadRequestException(`La plantilla ${eventType} no existe o está inactiva`);const day=new Date().toISOString().slice(0,10);const rows=assignments.map(item=>{const variables={personName:item.person.names,roleName:item.role.name,teamCode:item.team.sourceId,periodName:period.name,closesAt:period.selfAssessmentClosesAt?.toISOString()??null};return{eventType,recipient:item.person.email,subject:this.render(template.subjectTemplate,variables),templateCode:eventType,variables,status:item.person.email?"PENDIENTE":"OMITIDA_SIN_CORREO",source:"MANUAL_ADMIN",dedupeKey:`${eventType}:${period.id}:${item.id}:${type==="REMINDER"?day:"OPENING"}`,personRoleId:item.id,periodId:period.id,requestedById}});const result=rows.length?await this.prisma.communication.createMany({data:rows,skipDuplicates:true}):{count:0};await this.prisma.audit.create({data:{occurredAt:new Date(),userId:requestedById,action:"PREPARE_COMMUNICATIONS",entity:"MATURITY_PERIOD",recordId:periodId,newValue:{eventType,candidates:rows.length,created:result.count},result:"OK",origin:"WEB"}});return{eventType,candidates:rows.length,created:result.count,skipped:rows.length-result.count,withoutEmail:rows.filter(x=>!x.recipient).length}}

  list(status?:string){return this.prisma.communication.findMany({where:{status:status||undefined},take:200,orderBy:{createdAt:"desc"},include:{personRole:{include:{person:true,role:true,team:true}},period:true,requestedBy:{select:{name:true,email:true}}}})}

  listTemplates(){return this.prisma.communicationTemplate.findMany({orderBy:{name:"asc"}})}
  async updateTemplate(id:string,input:{name?:string;subjectTemplate?:string;bodyTemplate?:string;senderName?:string;senderEmail?:string;active?:boolean},userId:string){const current=await this.prisma.communicationTemplate.findUnique({where:{id}});if(!current)throw new NotFoundException("No se encontró la plantilla");const required=[input.name,input.subjectTemplate,input.bodyTemplate,input.senderName,input.senderEmail];if(required.some(value=>typeof value!=="string"||!value.trim()))throw new BadRequestException("Nombre, asunto, contenido y remitente son obligatorios");if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.senderEmail!))throw new BadRequestException("El correo del remitente no es válido");return this.prisma.$transaction(async tx=>{const updated=await tx.communicationTemplate.update({where:{id},data:{name:input.name!.trim(),subjectTemplate:input.subjectTemplate!.trim(),bodyTemplate:input.bodyTemplate!.trim(),senderName:input.senderName!.trim(),senderEmail:input.senderEmail!.trim().toLowerCase(),active:input.active??current.active}});await tx.audit.create({data:{occurredAt:new Date(),userId,action:"UPDATE",entity:"COMMUNICATION_TEMPLATE",recordId:id,oldValue:current,newValue:updated,result:"OK",origin:"WEB"}});return updated})}
}
