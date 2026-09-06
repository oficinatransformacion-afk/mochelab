import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { MaturityController, SelfAssessmentController } from "./maturity.controller";

const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";

describe("maturity controllers", () => {
  const repository = {
    submitSelfAssessment: vi.fn(),
    calibrate: vi.fn(),
  };

  it("prevents one role from submitting another role's assessment", async () => {
    const controller = new SelfAssessmentController(repository as never);
    await expect(controller.submit(secondId, {
      personRoleId: firstId,
      periodId: secondId,
      configurationVersion: "2026-1-v1",
      answers: [{ behaviorId: firstId, score: 1 }],
    })).rejects.toThrow(UnauthorizedException);
    expect(repository.submitSelfAssessment).not.toHaveBeenCalled();
  });

  it("requires the administrator identity during calibration", async () => {
    const access={getUserId:vi.fn().mockRejectedValue(new UnauthorizedException())};
    const controller = new MaturityController(repository as never,access as never);
    await expect(controller.calibrate(firstId, undefined, { calibratedScore: 2 })).rejects.toThrow(UnauthorizedException);
    expect(repository.calibrate).not.toHaveBeenCalled();
  });
});
