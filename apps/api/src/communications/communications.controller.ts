import { BadRequestException, Body, Controller, Get, Headers, Param, Patch, Post, Query } from "@nestjs/common";
import { AdminOnly, RequirePermission } from "../access/access.decorators";
import { AccessService } from "../access/access.service";
import { CommunicationsRepository } from "./communications.repository";
import { GmailService } from "./gmail.service";

@AdminOnly()
@RequirePermission("MADUREZ","view")
@Controller("communications")
export class CommunicationsController {
  constructor(private readonly repository:CommunicationsRepository,private readonly access:AccessService,private readonly gmail:GmailService){}
  private type(value:unknown){if(value!=="OPENING"&&value!=="REMINDER")throw new BadRequestException("El tipo debe ser OPENING o REMINDER");return value}
  @Get() list(@Query("status") status?:string){return this.repository.list(status)}
  @Get("templates") templates(){return this.repository.listTemplates()}
  @Get("provider-status") providerStatus(){return this.gmail.status()}
  @Patch("templates/:id") async updateTemplate(@Param("id") id:string,@Body() body:{name?:string;subjectTemplate?:string;bodyTemplate?:string;senderName?:string;senderEmail?:string;active?:boolean},@Headers("x-mochelab-demo-user-email") email?:string){return this.repository.updateTemplate(id,body,await this.access.getUserId("ADMIN",email))}
  @Get("maturity/:periodId/preview") preview(@Param("periodId") periodId:string,@Query("type") type:string){return this.repository.preview(periodId,this.type(type))}
  @Post("maturity/:periodId") async prepare(@Param("periodId") periodId:string,@Body() body:{type?:string},@Headers("x-mochelab-demo-user-email") email?:string){return this.repository.prepareMaturity(periodId,this.type(body.type),await this.access.getUserId("ADMIN",email))}
}
