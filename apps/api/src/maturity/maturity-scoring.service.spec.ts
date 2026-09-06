import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { MaturityScoringService } from "./maturity-scoring.service";

describe("MaturityScoringService", () => {
  const service = new MaturityScoringService();

  it("calculates the weighted score across dimensions", () => {
    const result = service.calculate([
      { weight: 1, behaviors: [{ score: 1, weight: 1 }, { score: 2, weight: 1 }] },
      { weight: 2, behaviors: [{ score: 2, weight: 1 }] },
    ]);

    expect(result.score).toBe(1.8333);
    expect(result.dimensionScores).toEqual([1.5, 2]);
    expect(result.level).toBe("OFICIAL");
  });

  it.each([
    [0.49, "POSTULANTE"],
    [0.5, "PRINCIPIANTE"],
    [1.49, "PRINCIPIANTE"],
    [1.5, "OFICIAL"],
    [2, "OFICIAL"],
  ] as const)("maps score %s to %s", (score, level) => {
    expect(service.levelFor(score)).toBe(level);
  });

  it("rejects answers outside the configured scale", () => {
    expect(() =>
      service.calculate([{ weight: 1, behaviors: [{ score: 3, weight: 1 }] }]),
    ).toThrow(BadRequestException);
  });

  it("grants Maestro only when all three requirements are met", () => {
    expect(
      service.levelFor(2, {
        trainedPerson: true,
        facilitatedCamp: true,
        teamIsOfficial: true,
      }),
    ).toBe("MAESTRO");

    expect(
      service.levelFor(2, {
        trainedPerson: true,
        facilitatedCamp: false,
        teamIsOfficial: true,
      }),
    ).toBe("OFICIAL");

    expect(
      service.levelFor(1.49, {
        trainedPerson: true,
        facilitatedCamp: true,
        teamIsOfficial: true,
      }),
    ).toBe("PRINCIPIANTE");
  });
});
