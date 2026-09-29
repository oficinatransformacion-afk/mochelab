import { afterEach, describe, expect, it, vi } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { GoogleFormsIntegrationService } from "./google-forms.service";

const secret = "google-forms-secret-with-at-least-32-characters";

describe("GoogleFormsIntegrationService idempotency", () => {
  afterEach(() => {
    delete process.env.GOOGLE_FORMS_INTEGRATION_KEY;
    vi.restoreAllMocks();
  });

  it("devuelve el resultado guardado sin reprocesar un submissionId repetido", async () => {
    process.env.GOOGLE_FORMS_INTEGRATION_KEY = secret;
    const prisma = {
      audit: { findUnique: vi.fn().mockResolvedValue({ newValue: { courseCode: "1", status: "TERMINADO", updatedRecords: 1 } }) },
      person: { findMany: vi.fn() },
    };
    const result = await new GoogleFormsIntegrationService(prisma as never).registerCourseResult({
      submissionId: "spreadsheet:sheet:row",
      email: "persona@danper.com",
      courseCode: "1",
      score: 20,
      completedAt: "2026-09-28T10:00:00-05:00",
    }, secret);

    expect(result).toEqual(expect.objectContaining({ courseCode: "1", alreadyProcessed: true }));
    expect(prisma.person.findMany).not.toHaveBeenCalled();
  });

  it("rechaza identificadores de envío excesivamente largos", async () => {
    process.env.GOOGLE_FORMS_INTEGRATION_KEY = secret;
    const service = new GoogleFormsIntegrationService({ audit: { findUnique: vi.fn() } } as never);
    await expect(service.registerCourseResult({ submissionId: "x".repeat(501) }, secret))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it("guarda un recibo idempotente junto con la actualización", async () => {
    process.env.GOOGLE_FORMS_INTEGRATION_KEY = secret;
    const transactionAuditCreate = vi.fn().mockResolvedValue({});
    const tx = {
      personCourse: { update: vi.fn().mockResolvedValue({ id: "pc-1", score: 20, statusId: "done", endDate: new Date("2026-09-28") }) },
      audit: { create: transactionAuditCreate },
    };
    const prisma = {
      audit: { findUnique: vi.fn().mockResolvedValue(null) },
      person: { findMany: vi.fn().mockResolvedValue([{ id: "person-1", dni: "12345678", names: "Persona" }]) },
      course: { findUnique: vi.fn().mockResolvedValue({ id: "course-1", sourceId: "1", name: "Curso" }) },
      catalogValue: { findFirst: vi.fn().mockResolvedValue({ id: "done" }) },
      personCourse: { findMany: vi.fn().mockResolvedValue([{ id: "pc-1", personRoleId: "pr-1", score: null, statusId: "pending", endDate: null }]) },
      $transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)),
    };

    const result = await new GoogleFormsIntegrationService(prisma as never).registerCourseResult({
      submissionId: "spreadsheet:866410718:479",
      email: "persona@danper.com",
      courseCode: "1",
      score: 20,
      completedAt: "2026-09-28T10:00:00-05:00",
    }, secret);

    expect(result).toEqual(expect.objectContaining({ status: "TERMINADO", alreadyProcessed: false }));
    expect(transactionAuditCreate).toHaveBeenCalledTimes(2);
    expect(transactionAuditCreate.mock.calls[1][0].data.sourceId).toMatch(/^GFCR:[a-f0-9]{64}$/);
  });
});
