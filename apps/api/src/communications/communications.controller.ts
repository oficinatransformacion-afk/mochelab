import { BadRequestException, Body, Controller, Get, Headers, Param, Patch, Post, Query } from "@nestjs/common";
import { AdminOnly, RequirePermission } from "../access/access.decorators";
import { AccessService } from "../access/access.service";
import { CommunicationsRepository } from "./communications.repository";
import { AppsScriptEmailService } from "./apps-script-email.service";
import { DailyCommunicationService } from "./daily-communication.service";

@AdminOnly()
@RequirePermission("MADUREZ","view")
@Controller("communications")
export class CommunicationsController {
  constructor(private readonly repository:CommunicationsRepository,private readonly access:AccessService,private readonly appsScript:AppsScriptEmailService,private readonly daily:DailyCommunicationService){}
  private type(value:unknown){if(value!=="OPENING"&&value!=="REMINDER")throw new BadRequestException("El tipo debe ser OPENING o REMINDER");return value}
  @Get() list(@Query("status") status?:string,@Query("page") page?:string,@Query("pageSize") pageSize?:string){return this.repository.list(status,Number(page)||1,Number(pageSize)||25)}
  @Get("templates") templates(){return this.repository.listTemplates()}
  @Get("provider-status") providerStatus(){return{...this.appsScript.status(),automatic:this.daily.status()}}
  @Post("send-pending") async sendPending(@Body() body:{limit?:number;communicationId?:string},@Headers("x-mochelab-demo-user-email") email?:string){const status=this.appsScript.status();if(!status.enabled||!status.configured)throw new BadRequestException("El envío está en modo Solo cola hasta configurar Google Apps Script");return this.repository.deliverPending(Math.min(50,Math.max(1,Number(body.limit)||25)),await this.access.getUserId("ADMIN",email),(message)=>this.appsScript.send(message),body.communicationId)}
  @Post("course-reminder/test") async prepareCourseReminderTest(@Body() body:{email?:string}){const recipient=String(body.email??"").trim().toLowerCase();if(!/^\S+@\S+\.\S+$/.test(recipient))throw new BadRequestException("Indica un correo válido para la prueba");const dateKey=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Lima",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());return this.repository.prepareCourseReminders(dateKey,recipient,`:TEST:${Date.now()}`)}
  @Post("course-reminders/generate") async generateCourseReminders(){const dateKey=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Lima",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());return this.repository.prepareCourseReminders(dateKey)}
  @Patch("templates/:id") async updateTemplate(@Param("id") id:string,@Body() body:{name?:string;subjectTemplate?:string;bodyTemplate?:string;senderName?:string;senderEmail?:string;active?:boolean},@Headers("x-mochelab-demo-user-email") email?:string){return this.repository.updateTemplate(id,body,await this.access.getUserId("ADMIN",email))}
  @Get("maturity/:periodId/preview") preview(@Param("periodId") periodId:string,@Query("type") type:string){return this.repository.preview(periodId,this.type(type))}
  @Post("maturity/:periodId") async prepare(@Param("periodId") periodId:string,@Body() body:{type?:string},@Headers("x-mochelab-demo-user-email") email?:string){return this.repository.prepareMaturity(periodId,this.type(body.type),await this.access.getUserId("ADMIN",email))}
}
