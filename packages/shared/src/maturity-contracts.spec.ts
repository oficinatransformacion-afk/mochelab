import { describe, expect, it } from "vitest";
import {
  CalibrateRoleMaturitySchema,
  SubmitSelfAssessmentSchema,
} from "./index.js";

const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";

describe("maturity contracts", () => {
  it("accepts answers only on the 0 to 2 scale", () => {
    const base = {
      personRoleId: firstId,
      periodId: secondId,
      configurationVersion: "2026-1-v1",
    };

    expect(SubmitSelfAssessmentSchema.safeParse({ ...base, answers: [{ behaviorId: firstId, score: 2 }] }).success).toBe(true);
    expect(SubmitSelfAssessmentSchema.safeParse({ ...base, answers: [{ behaviorId: firstId, score: 3 }] }).success).toBe(false);
  });

  it("rejects duplicate behavior answers", () => {
    const result = SubmitSelfAssessmentSchema.safeParse({
      personRoleId: firstId,
      periodId: secondId,
      configurationVersion: "2026-1-v1",
      answers: [
        { behaviorId: firstId, score: 1 },
        { behaviorId: firstId, score: 2 },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects a calibrated score above 2", () => {
    expect(CalibrateRoleMaturitySchema.safeParse({ roleMaturityId: firstId, calibratedScore: 2.01 }).success).toBe(false);
  });

  it("rejects incomplete Maestro evidence",()=>{
    expect(CalibrateRoleMaturitySchema.safeParse({roleMaturityId:firstId,calibratedScore:2,mastery:{trainingVerified:true,campVerified:true}}).success).toBe(false);
  });

  it("accepts complete Maestro evidence",()=>{
    expect(CalibrateRoleMaturitySchema.safeParse({roleMaturityId:firstId,calibratedScore:2,mastery:{trainedPersonId:secondId,trainingEvidence:"Registro de acompañamiento",trainingVerified:true,campName:"Campamento 2026",campDate:"2026-08-01",campEvidence:"Acta del evento",campVerified:true,teamMaturityId:firstId}}).success).toBe(true);
  });
});
