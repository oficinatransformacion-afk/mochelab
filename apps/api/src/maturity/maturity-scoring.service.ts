import { BadRequestException, Injectable } from "@nestjs/common";

export type MaturityLevel = "POSTULANTE" | "PRINCIPIANTE" | "OFICIAL" | "MAESTRO";

export interface MasteryRequirements {
  trainedPerson: boolean;
  facilitatedCamp: boolean;
  teamIsOfficial: boolean;
}

export interface BehaviorScore {
  score: number;
  weight: number;
}

export interface DimensionScore {
  weight: number;
  behaviors: BehaviorScore[];
}

export interface MaturityScoreResult {
  score: number;
  level: MaturityLevel;
  dimensionScores: number[];
}

@Injectable()
export class MaturityScoringService {
  calculate(dimensions: DimensionScore[]): MaturityScoreResult {
    if (dimensions.length === 0) {
      throw new BadRequestException("La autoevaluación no tiene dimensiones");
    }

    const dimensionScores = dimensions.map((dimension) => {
      if (dimension.weight <= 0 || dimension.behaviors.length === 0) {
        throw new BadRequestException("Cada dimensión debe tener peso y comportamientos activos");
      }

      const totalWeight = dimension.behaviors.reduce((sum, behavior) => {
        if (behavior.weight <= 0 || behavior.score < 0 || behavior.score > 2) {
          throw new BadRequestException("Las respuestas deben estar entre 0 y 2 y tener peso positivo");
        }
        return sum + behavior.weight;
      }, 0);

      return dimension.behaviors.reduce(
        (sum, behavior) => sum + behavior.score * behavior.weight,
        0,
      ) / totalWeight;
    });

    const totalDimensionWeight = dimensions.reduce(
      (sum, dimension) => sum + dimension.weight,
      0,
    );
    const rawScore = dimensionScores.reduce(
      (sum, score, index) => sum + score * dimensions[index].weight,
      0,
    ) / totalDimensionWeight;
    const score = Math.round(rawScore * 10_000) / 10_000;

    return {
      score,
      level: this.levelFor(score),
      dimensionScores: dimensionScores.map(
        (dimensionScore) => Math.round(dimensionScore * 10_000) / 10_000,
      ),
    };
  }

  levelFor(score: number, mastery?: MasteryRequirements): MaturityLevel {
    if (score < 0 || score > 2) {
      throw new BadRequestException("El puntaje de madurez debe estar entre 0 y 2");
    }
    if (score < 0.5) return "POSTULANTE";
    if (score < 1.5) return "PRINCIPIANTE";
    if (mastery?.trainedPerson && mastery.facilitatedCamp && mastery.teamIsOfficial) {
      return "MAESTRO";
    }
    return "OFICIAL";
  }
}
