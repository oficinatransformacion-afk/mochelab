import { Controller,Get,Query } from "@nestjs/common";
import { AdminOnly,RequirePermission } from "../access/access.decorators";
import { AuditRepository } from "./audit.repository";

@AdminOnly() @RequirePermission("AUDITORIA","view") @Controller("audit/admin")
export class AuditController{
  constructor(private readonly repository:AuditRepository){}
  private values(value?:string){return value?.split(",").map(item=>item.trim()).filter(Boolean)??[]}
  @Get() list(@Query("entities") entities?:string,@Query("actions") actions?:string,@Query("results") results?:string,@Query("origins") origins?:string,@Query("search") search?:string,@Query("from") from?:string,@Query("to") to?:string,@Query("page") page?:string,@Query("pageSize") pageSize?:string){return this.repository.list({entities:this.values(entities),actions:this.values(actions),results:this.values(results),origins:this.values(origins),search,from,to,page:Number(page)||1,pageSize:Number(pageSize)||25})}
  @Get("options") options(){return this.repository.options()}
}
