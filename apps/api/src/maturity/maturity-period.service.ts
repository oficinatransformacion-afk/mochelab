import { BadRequestException, Injectable } from "@nestjs/common";

export interface MaturityPeriodDates {
  startDate: Date;
  endDate: Date;
  selfAssessmentOpensAt: Date;
  selfAssessmentClosesAt: Date;
  calibrationClosesAt: Date;
}

export type MaturityPeriodStatus = "PLANIFICADO" | "AUTOEVALUACION" | "CALIBRACION" | "CERRADO" | "CANCELADO";

@Injectable()
export class MaturityPeriodService {
  validateDates(period: MaturityPeriodDates): void {
    if (period.endDate < period.startDate) {
      throw new BadRequestException("La fecha final no puede ser anterior a la fecha inicial");
    }
    if (period.selfAssessmentClosesAt <= period.selfAssessmentOpensAt) {
      throw new BadRequestException("El cierre de autoevaluación debe ser posterior a su apertura");
    }
    if (period.calibrationClosesAt <= period.selfAssessmentClosesAt) {
      throw new BadRequestException("La calibración debe cerrar después de la autoevaluación");
    }
  }

  validateTransition(current: MaturityPeriodStatus, next: MaturityPeriodStatus): void {
    const allowed: Record<MaturityPeriodStatus, MaturityPeriodStatus[]> = {
      PLANIFICADO: ["AUTOEVALUACION", "CANCELADO"],
      AUTOEVALUACION: ["CALIBRACION", "CANCELADO"],
      CALIBRACION: ["CERRADO", "CANCELADO"],
      CERRADO: [],
      CANCELADO: [],
    };
    if (!allowed[current].includes(next)) {
      throw new BadRequestException(`No se puede cambiar un período de ${current} a ${next}`);
    }
  }
}
