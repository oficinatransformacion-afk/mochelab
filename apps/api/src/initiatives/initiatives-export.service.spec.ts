import { describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { InitiativesExportService } from "./initiatives-export.service";

const catalog=(name:string,code=name.toUpperCase())=>({id:`${name}-id`,name,code});
const initiative={
 id:"initiative-id",sourceId:1273n,year:2026,name:"Optimización de proceso",release:"R1",teamId:"team-1",
 company:{id:"company-1",name:"DANPER"},team:{id:"team-1",sourceId:"EQ-01",name:"Equipo A",assignments:[
  {person:{names:"Sponsor del equipo"},role:{name:"SPONSOR"}},
  {person:{names:"Dueño Programa Uno"},role:{name:"DUEÑO DE PROGRAMA"}},
  {person:{names:"Líder AE Uno"},role:{name:"LIDER AE"}},
  {person:{names:"Líder EAD Dos"},role:{name:"LIDER EAD"}},
  {person:{names:"Líder EAD Uno"},role:{name:"LÍDER EAD"}},
 ]},cycle:catalog("Anual"),focusArea:catalog("Productividad"),level:catalog("Equipo"),program:{id:"program-1",name:"Programa A"},type:catalog("Estratégica"),size:catalog("M"),priority:catalog("Alta"),managementType:catalog("Ágil"),status:catalog("En ejecución","EN_EJECUCION"),impact:catalog("Económico"),executionArea:catalog("Operaciones"),improvementSupervisor:catalog("Supervisor"),escalation:null,returnHorizon:null,tiCapacity:null,category:null,
 executionStart:new Date("2026-01-01T00:00:00Z"),executionEnd:new Date("2026-12-31T00:00:00Z"),accompanimentMilestone:"Hito 1",impactDescription:"Impacto",projectedEconomicBenefit:100,actualEconomicBenefit:80,projectedMitigationBenefit:20,actualMitigationBenefit:10,annualPotentialBenefit:150,projectedInvestment:50,actualInvestment:45,documentationUrl:"https://example.test/doc",observations:"Observación",manager:null,sourceCreatedAt:null,createdAt:new Date("2026-01-01T00:00:00Z"),updatedAt:new Date("2026-06-01T00:00:00Z"),
 objectiveLink:{sourceId:45n,objective:"Mejorar productividad",keyResult:"Reducir tiempos",type:catalog("Resultado clave")},
 responsibilities:[{responsibilityType:"PRODUCT_OWNER",personRole:{person:{names:"Dueño Producto"},role:{name:"DUEÑO DE PRODUCTO"}}},{responsibilityType:"SPONSOR",personRole:{person:{names:"Sponsor Uno"},role:{name:"SPONSOR"}}},{responsibilityType:"ATF",personRole:{person:{names:"ATF Uno"},role:{name:"ATF"}}}],
 subprocesses:[],
};

function mockPrisma(){return {initiative:{count:vi.fn().mockResolvedValue(1),findMany:vi.fn().mockResolvedValue([initiative])},audit:{findMany:vi.fn().mockResolvedValue([]),create:vi.fn().mockResolvedValue({id:"audit-id"})}}}

describe("InitiativesExportService",()=>{
 it("exige al menos un año antes de consultar la base",async()=>{const prisma=mockPrisma(),service=new InitiativesExportService(prisma as never);await expect(service.preview({years:[]},null)).rejects.toThrow("Debes seleccionar al menos un año");expect(prisma.initiative.count).not.toHaveBeenCalled()});

 it("intersecta los equipos solicitados con el alcance permitido",async()=>{const prisma=mockPrisma(),service=new InitiativesExportService(prisma as never);await service.preview({years:[2026],teamIds:["team-1","team-2"]},["team-1"]);expect(prisma.initiative.count).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({year:{in:[2026]},teamId:{in:["team-1"]}})}))});

 it("aplica la búsqueda visible de la pantalla base",async()=>{const prisma=mockPrisma(),service=new InitiativesExportService(prisma as never);await service.preview({years:[2026],search:"poda"},null);expect(prisma.initiative.count).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({OR:[{name:{contains:"poda",mode:"insensitive"}},{release:{contains:"poda",mode:"insensitive"}}]})}))});

 it("genera PORTAFOLIO_V2 con responsables directos y del equipo",async()=>{const prisma=mockPrisma(),service=new InitiativesExportService(prisma as never),result=await service.export({years:[2026]},null,null,"local.test@example.invalid");const workbook=XLSX.read(result.buffer,{type:"buffer"}),sheet=workbook.Sheets.Portafolio,rows=XLSX.utils.sheet_to_json<unknown[]>(sheet,{header:1,range:4}),header=rows[0],data=rows[1];expect(workbook.SheetNames).toEqual(["Portafolio","Criterios","Diccionario"]);expect(header).toHaveLength(73);expect(header).not.toContain("Validación supervisor");expect(header).not.toContain("Fecha validación supervisor");expect(header).not.toContain("Comentario validación supervisor");expect(data[header.indexOf("Sponsor")]).toBe("Sponsor Uno");expect(data[header.indexOf("Dueño de programa")]).toBe("Dueño Programa Uno");expect(data[header.indexOf("Líder de área de enfoque")]).toBe("Líder AE Uno");expect(data[header.indexOf("Líder EAD")]).toBe("Líder EAD Dos; Líder EAD Uno");expect(header).toContain("Dueño de Producto");expect(header).toContain("Mitigación real (USD)");expect(result.count).toBe(1);expect(prisma.audit.create).toHaveBeenCalledOnce()});

 it("usa el Sponsor activo del equipo cuando la iniciativa no tiene Sponsor directo",async()=>{const prisma=mockPrisma(),fallbackInitiative={...initiative,responsibilities:initiative.responsibilities.filter(item=>item.responsibilityType!=="SPONSOR")};prisma.initiative.findMany.mockResolvedValue([fallbackInitiative]);const service=new InitiativesExportService(prisma as never),result=await service.export({years:[2026]},null,null,"local.test@example.invalid"),workbook=XLSX.read(result.buffer,{type:"buffer"}),rows=XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets.Portafolio,{header:1,range:4}),header=rows[0],data=rows[1];expect(data[header.indexOf("Sponsor")]).toBe("Sponsor del equipo")});
});
