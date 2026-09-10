import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { DashboardRepository } from "./dashboard.repository";

const teamId="11111111-1111-4111-8111-111111111111";
const periodId="22222222-2222-4222-8222-222222222222";

function database(){
  return {
    period:{findFirst:vi.fn().mockResolvedValue({id:periodId,name:"Ago. 2026",status:{code:"CERRADO"}})},
    team:{findMany:vi.fn().mockResolvedValue([])},
    person:{count:vi.fn().mockResolvedValue(1)},
    personRole:{count:vi.fn().mockResolvedValue(2)},
    personCourse:{count:vi.fn().mockResolvedValueOnce(4).mockResolvedValueOnce(3)},
    roleMaturity:{findMany:vi.fn().mockResolvedValue([])},
    teamMaturity:{findMany:vi.fn().mockResolvedValue([])},
    objective:{findMany:vi.fn().mockResolvedValue([])},
    initiative:{findMany:vi.fn().mockResolvedValue([])},
  };
}

describe("DashboardRepository",()=>{
  it("uses the current period, current year and strategic initiatives",async()=>{
    const prisma=database(),repository=new DashboardRepository(prisma as never);
    const result=await repository.summary({teamIds:[teamId]},[teamId]);
    const currentYear=Number(new Intl.DateTimeFormat("en-US",{year:"numeric",timeZone:"America/Lima"}).format(new Date()));

    expect(result.context).toEqual({year:currentYear,maturityPeriod:{id:periodId,label:"Ago. 2026",status:"CERRADO"}});
    expect(prisma.personRole.count).toHaveBeenCalledWith({where:expect.objectContaining({teamId:{in:[teamId]},status:{code:"ACTIVO"},role:{name:{in:expect.arrayContaining(["SPONSOR","ATF"])}}})});
    expect(prisma.roleMaturity.findMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({periodId})}));
    expect(prisma.objective.findMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({year:currentYear})}));
    expect(prisma.initiative.findMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({year:currentYear,type:{code:"ESTRATEGICA",catalog:{code:"TIPO_INICIATIVA"}}})}));
    expect(result.capabilities.learningCompletion).toBe(75);
  });

  it("rejects teams outside the authenticated user's scope",async()=>{
    const repository=new DashboardRepository(database() as never);
    await expect(repository.summary({teamIds:[teamId]},[])).rejects.toThrow(BadRequestException);
  });
});
