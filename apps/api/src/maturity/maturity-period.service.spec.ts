import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { MaturityPeriodService } from "./maturity-period.service";

describe("MaturityPeriodService", () => {
  const service = new MaturityPeriodService();
  const valid = {
    startDate: new Date("2026-01-01"),
    endDate: new Date("2026-06-30"),
    selfAssessmentOpensAt: new Date("2026-06-01T08:00:00-05:00"),
    selfAssessmentClosesAt: new Date("2026-06-15T18:00:00-05:00"),
    calibrationClosesAt: new Date("2026-06-30T18:00:00-05:00"),
  };

  it("accepts a period with ordered stages", () => {
    expect(() => service.validateDates(valid)).not.toThrow();
  });

  it("rejects calibration closing before self-assessment", () => {
    expect(() => service.validateDates({ ...valid, calibrationClosesAt: valid.selfAssessmentClosesAt })).toThrow(BadRequestException);
  });

  it("allows only the sequential maturity workflow", () => {
    expect(() => service.validateTransition("PLANIFICADO", "AUTOEVALUACION")).not.toThrow();
    expect(() => service.validateTransition("AUTOEVALUACION", "CALIBRACION")).not.toThrow();
    expect(() => service.validateTransition("CALIBRACION", "CERRADO")).not.toThrow();
    expect(() => service.validateTransition("PLANIFICADO", "CERRADO")).toThrow(BadRequestException);
  });
});
