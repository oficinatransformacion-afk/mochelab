import { describe, expect, it, vi } from "vitest";
import { MaturityRepository } from "./maturity.repository";
import { MaturityScoringService } from "./maturity-scoring.service";

const personRoleId = "11111111-1111-4111-8111-111111111111";
const periodId = "22222222-2222-4222-8222-222222222222";

describe("MaturityRepository person-role identity", () => {
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
        findUnique:vi.fn().mockResolvedValue({ id:"maturity-2", periodId, calibratedAt:null, score:1.2, selfAssessmentScore:1.2, period:{status:{code:"CALIBRACION"}}, personRole:{personId:"person-1",roleId:"role-1",person:{},role:{},team:{}} }),
        findFirst:vi.fn().mockResolvedValue({ id:"maturity-1" }),
      },
    };
    const repository = new MaturityRepository(prisma as never, new MaturityScoringService(), {} as never);

    await expect(repository.calibrate({ roleMaturityId:personRoleId, calibratedScore:1.2 }, "admin-1"))
      .rejects.toThrow("Esta persona y rol ya tienen una calibración final para el período");
  });
});
