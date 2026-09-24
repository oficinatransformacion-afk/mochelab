import { describe, expect, it, vi } from "vitest";
import { MaturityRepository } from "./maturity.repository";
import { MaturityScoringService } from "./maturity-scoring.service";

const personRoleId = "11111111-1111-4111-8111-111111111111";
const periodId = "22222222-2222-4222-8222-222222222222";

describe("MaturityRepository person-role identity", () => {
  it("counts period participation once per person and role", async () => {
    const prisma = {
      periodAssessmentModel:{count:vi.fn().mockResolvedValue(1)},
      personRole:{findMany:vi.fn().mockResolvedValue([{personId:"person-1",roleId:"role-1"},{personId:"person-2",roleId:"role-1"}])},
      roleSelfAssessment:{findMany:vi.fn().mockResolvedValue([
        {personRole:{personId:"person-1",roleId:"role-1"}},
        {personRole:{personId:"person-1",roleId:"role-1"}},
      ])},
      roleMaturity:{findMany:vi.fn().mockResolvedValue([{calibratedAt:null,personRole:{personId:"person-1",roleId:"role-1"}}])},
    };
    const repository = new MaturityRepository(prisma as never, new MaturityScoringService(), {} as never);
    const population=await (repository as unknown as {periodPopulation:(id:string)=>Promise<unknown>}).periodPopulation(periodId);
    expect(population).toEqual({eligibleRoles:2,submitted:1,pendingSubmission:1,results:1,calibrated:0,pendingCalibration:1});
    expect(prisma.personRole.findMany).toHaveBeenCalledWith(expect.objectContaining({distinct:["personId","roleId"]}));
  });

  it("rejects a second self-assessment for the same person, role and period on another assignment", async () => {
    const prisma = {
      requireConnection:vi.fn(),
      period:{ findUnique:vi.fn().mockResolvedValue({ id:periodId, configurationVersion:"v1", status:{code:"AUTOEVALUACION"} }) },
      personRole:{ findUnique:vi.fn().mockResolvedValue({ id:personRoleId, personId:"person-1", roleId:"role-1", developmentPathMode:"STANDARD" }) },
      roleSelfAssessment:{ findFirst:vi.fn().mockResolvedValue({ id:"existing-assessment" }) },
    };
    const repository = new MaturityRepository(prisma as never, new MaturityScoringService(), {} as never);
    vi.spyOn(repository as unknown as {versionedModel:()=>Promise<unknown>}, "versionedModel").mockResolvedValue(null);

    await expect(repository.submitSelfAssessment({ personRoleId, periodId, configurationVersion:"v1", answers:[] }))
      .rejects.toThrow("La autoevaluación de esta persona y rol ya fue enviada para el período");
    expect(prisma.roleSelfAssessment.findFirst).toHaveBeenCalledWith({ where:{ periodId, personRole:{ personId:"person-1", roleId:"role-1" } }, select:{ id:true } });
  });

  it("rejects a second final calibration for the same person, role and period", async () => {
    const prisma = {
      requireConnection:vi.fn(),
      roleMaturity:{
        findUnique:vi.fn().mockResolvedValue({ id:"maturity-2", periodId, calibratedAt:null, score:1.2, selfAssessmentScore:1.2, selfAssessment:{id:"assessment-2",modelVersionId:"model-v1"},period:{status:{code:"CALIBRACION"}}, personRole:{personId:"person-1",roleId:"role-1",person:{},role:{},team:{}} }),
        findFirst:vi.fn().mockResolvedValue({ id:"maturity-1" }),
      },
    };
    const repository = new MaturityRepository(prisma as never, new MaturityScoringService(), {} as never);

    await expect(repository.calibrate({ roleMaturityId:personRoleId, calibratedScore:1.2 }, "admin-1"))
      .rejects.toThrow("Esta persona y rol ya tienen una calibración final para el período");
  });

  it("rejects calibration when the historical model version is missing", async () => {
    const prisma = {
      requireConnection:vi.fn(),
      roleMaturity:{
        findUnique:vi.fn().mockResolvedValue({ id:"maturity-2", periodId, calibratedAt:null, score:1.2, selfAssessmentScore:1.2, selfAssessment:{id:"assessment-2",modelVersionId:null},period:{status:{code:"CALIBRACION"}}, personRole:{personId:"person-1",roleId:"role-1",person:{},role:{},team:{}} }),
      },
    };
    const repository = new MaturityRepository(prisma as never, new MaturityScoringService(), {} as never);

    await expect(repository.calibrate({ roleMaturityId:personRoleId, calibratedScore:1.2 }, "admin-1"))
      .rejects.toThrow("No se puede calibrar porque no se identificó la versión del modelo utilizada");
  });

  it("reopens a closed period for calibration with an audited justification", async () => {
    const tx={
      period:{
        findUnique:vi.fn().mockResolvedValue({id:periodId,status:{code:"CERRADO",name:"Cerrado"}}),
        update:vi.fn().mockResolvedValue({id:periodId,status:{code:"CALIBRACION",name:"En calibración"},_count:{selfAssessments:6,roleMaturities:6}}),
      },
      catalogValue:{findFirst:vi.fn().mockResolvedValue({id:"calibration-status"})},
      audit:{create:vi.fn().mockResolvedValue({id:"audit-1"})},
    };
    const prisma={$transaction:vi.fn((callback:(client:typeof tx)=>unknown)=>callback(tx))};
    const repository = new MaturityRepository(prisma as never, new MaturityScoringService(), {} as never);
    const result=await repository.reopenPeriodForCalibration(periodId,"Carga histórica validada", "admin-1");
    expect(result.status.code).toBe("CALIBRACION");
    expect(tx.audit.create).toHaveBeenCalledWith({data:expect.objectContaining({action:"REOPEN_FOR_CALIBRATION",entity:"MATURITY_PERIOD",recordId:periodId})});
  });

  it("does not open self-assessment without a published model per role", async () => {
    const tx={
      period:{findUnique:vi.fn().mockResolvedValue({id:periodId,status:{code:"PLANIFICADO"}})},
      periodAssessmentModel:{findMany:vi.fn().mockResolvedValue([])},
    };
    const prisma={$transaction:vi.fn((callback:(client:typeof tx)=>unknown)=>callback(tx))};
    const repository = new MaturityRepository(prisma as never, new MaturityScoringService(), {validateTransition:vi.fn()} as never);

    await expect(repository.transitionPeriod(periodId,"AUTOEVALUACION","admin-1"))
      .rejects.toThrow("el período no tiene modelos por rol");
  });

  it("retires the previous published version before publishing the draft", async () => {
    const version={
      id:"version-2",assessmentModelId:"model-1",status:"DRAFT",assessmentModel:{id:"model-1"},
      sections:[{id:"section-1",code:"INTEGRAL",name:"Integral",type:"INTEGRAL",weight:1,responseScaleId:"scale-1",dimensions:[{id:"dimension-1",code:"COMPROMISO",name:"Compromiso",description:null,weight:1,items:[{behaviorId:"behavior-1",weight:1,required:true,responseScaleId:null,maturityLevelId:null}]}]}],
    };
    const tx={
      assessmentModelVersion:{
        updateMany:vi.fn().mockResolvedValue({count:1}),
        update:vi.fn().mockResolvedValue({...version,status:"PUBLISHED"}),
      },
      audit:{create:vi.fn().mockResolvedValue({id:"audit-1"})},
    };
    const prisma={assessmentModelVersion:{findUnique:vi.fn().mockResolvedValue(version)},$transaction:vi.fn((callback:(client:typeof tx)=>unknown)=>callback(tx))};
    const repository=new MaturityRepository(prisma as never,new MaturityScoringService(),{} as never);

    const result=await repository.publishAssessmentModelVersion("version-2","admin-1");

    expect(result.status).toBe("PUBLISHED");
    expect(tx.assessmentModelVersion.updateMany).toHaveBeenCalledWith(expect.objectContaining({where:{assessmentModelId:"model-1",status:"PUBLISHED",id:{not:"version-2"}},data:expect.objectContaining({status:"RETIRED"})}));
    expect(tx.assessmentModelVersion.update).toHaveBeenCalledWith(expect.objectContaining({where:{id:"version-2"},data:expect.objectContaining({status:"PUBLISHED"})}));
  });
});
