import { describe,expect,it,vi } from "vitest";
import { AuditRepository } from "./audit.repository";

describe("AuditRepository pagination",()=>{
  it("applies all filters before counting and paging",async()=>{
    const prisma={audit:{count:vi.fn().mockResolvedValue(251),findMany:vi.fn().mockResolvedValue([])}};
    const repository=new AuditRepository(prisma as never);

    const result=await repository.list({entities:["PERSON","TEAM"],results:["OK"],page:2,pageSize:25});

    expect(result).toEqual({items:[],total:251,page:2,pageSize:25,pages:11});
    expect(prisma.audit.findMany).toHaveBeenCalledWith(expect.objectContaining({skip:25,take:25,where:expect.objectContaining({entity:{in:["PERSON","TEAM"]},result:{in:["OK"]}})}));
  });
});
