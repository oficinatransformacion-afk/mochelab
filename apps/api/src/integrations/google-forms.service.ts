import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { createHash, timingSafeEqual } from "crypto";
import { PrismaService } from "../database/prisma.service";

type CourseResultInput = { email?: unknown; courseCode?: unknown; score?: unknown; completedAt?: unknown; submissionId?: unknown };

@Injectable()
export class GoogleFormsIntegrationService {
  constructor(private readonly prisma: PrismaService) {}

  private snapshot(value: unknown) {
    return JSON.parse(JSON.stringify(value, (_, item) => item instanceof Date ? item.toISOString() : item));
  }

  private verifyKey(received?: string) {
    const expected = process.env.GOOGLE_FORMS_INTEGRATION_KEY;
    if (!expected || expected.length < 32) {
      throw new ServiceUnavailableException("La integración de Google Forms aún no está configurada");
    }
    if (!received || received.length !== expected.length || !timingSafeEqual(Buffer.from(received), Buffer.from(expected))) {
      throw new UnauthorizedException("Clave de integración inválida");
    }
  }

  private text(value: unknown, field: string) {
    if (typeof value !== "string" || !value.trim()) throw new BadRequestException(`${field} es obligatorio`);
    return value.trim();
  }

  private date(value: unknown) {
    const input = this.text(value, "completedAt");
    const parsed = new Date(input);
    if (Number.isNaN(parsed.getTime())) throw new BadRequestException("completedAt debe ser una fecha ISO válida");
    // PersonCourse almacena una fecha, no una hora. Conservamos la fecha indicada por el Form.
    const dateOnly = input.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? parsed.toISOString().slice(0, 10);
    return new Date(`${dateOnly}T12:00:00.000Z`);
  }

  private submission(value: unknown) {
    if (value === undefined || value === null || value === "") return null;
    const submissionId = this.text(value, "submissionId");
    if (submissionId.length > 500) throw new BadRequestException("submissionId no puede superar 500 caracteres");
    return {
      id: submissionId,
      receipt: `GFCR:${createHash("sha256").update(submissionId).digest("hex")}`,
    };
  }

  private duplicateResponse(value: unknown) {
    const saved = value && typeof value === "object" ? value as Record<string, unknown> : {};
    return { ...saved, alreadyProcessed: true };
  }

  async registerCourseResult(input: CourseResultInput, key?: string) {
    this.verifyKey(key);
    const submission = this.submission(input.submissionId);
    if (submission) {
      const existing = await this.prisma.audit.findUnique({ where: { sourceId: submission.receipt }, select: { newValue: true } });
      if (existing) return this.duplicateResponse(existing.newValue);
    }
    const email = this.text(input.email, "email").toLowerCase();
    const courseCode = this.text(input.courseCode, "courseCode");
    const score = typeof input.score === "number" ? input.score : Number(input.score);
    if (!Number.isFinite(score) || score < 0 || score > 20) throw new BadRequestException("score debe ser un número entre 0 y 20");
    const completedAt = this.date(input.completedAt);

    const people = await this.prisma.person.findMany({
      where: { email: { equals: email, mode: "insensitive" }, status: { code: "ACTIVO" } },
      select: { id: true, dni: true, names: true },
    });
    if (!people.length) throw new NotFoundException("No se encontró una persona activa para el correo indicado");
    if (people.length > 1) throw new BadRequestException("El correo corresponde a más de una persona activa");
    const person = people[0];

    const course = await this.prisma.course.findUnique({ where: { sourceId: courseCode }, select: { id: true, sourceId: true, name: true } });
    if (!course) throw new NotFoundException("No se encontró un curso para el código indicado");
    const completedStatus = await this.prisma.catalogValue.findFirst({ where: { code: "TERMINADO", catalog: { code: "ESTADO_PERSONA_CURSO" } }, select: { id: true } });
    if (!completedStatus) throw new ServiceUnavailableException("No existe el estado TERMINADO para PersonaCurso");

    const matches = await this.prisma.personCourse.findMany({
      where: { courseId: course.id, personRole: { personId: person.id, status: { code: "ACTIVO" } } },
      select: { id: true, personRoleId: true, score: true, statusId: true, endDate: true },
    });
    if (!matches.length) throw new NotFoundException("La persona no tiene el curso en una asignación activa");

    try {
      return await this.prisma.$transaction(async (tx) => {
        const rows = [];
        for (const current of matches) {
          const row = await tx.personCourse.update({
            where: { id: current.id },
            data: { score, statusId: completedStatus.id, endDate: completedAt },
          });
          await tx.audit.create({
            data: {
              occurredAt: new Date(), action: "GOOGLE_FORM_COURSE_RESULT", entity: "PERSON_COURSE", recordId: row.id,
              oldValue: this.snapshot(current), newValue: this.snapshot(row), result: "OK", origin: "GOOGLE_FORMS",
              actorLegacy: email, legacyDetail: `courseCode=${course.sourceId}; dni=${person.dni}`,
            },
          });
          rows.push(row.id);
        }

        const response = { personDni: person.dni, personName: person.names, courseCode: course.sourceId, courseName: course.name, score, status: "TERMINADO", completedAt: completedAt.toISOString().slice(0, 10), updatedRecords: rows.length, alreadyProcessed: false };
        if (submission) {
          await tx.audit.create({
            data: {
              sourceId: submission.receipt,
              occurredAt: new Date(),
              action: "GOOGLE_FORM_SUBMISSION_PROCESSED",
              entity: "GOOGLE_FORM_SUBMISSION",
              recordId: submission.receipt,
              newValue: this.snapshot(response),
              result: "OK",
              origin: "GOOGLE_FORMS",
              actorLegacy: email,
              legacyDetail: `submissionId=${submission.id}; courseCode=${course.sourceId}`,
            },
          });
        }
        return response;
      });
    } catch (error: unknown) {
      if (submission && typeof error === "object" && error && "code" in error && error.code === "P2002") {
        const existing = await this.prisma.audit.findUnique({ where: { sourceId: submission.receipt }, select: { newValue: true } });
        if (existing) return this.duplicateResponse(existing.newValue);
      }
      throw error;
    }
  }
}
