import * as XLSX from "xlsx";
import { describe, expect, it, vi } from "vitest";
import { DirectoryReportService, UNSPECIFIED_OCCUPATION_LEVEL_ID } from "./directory-report.service";

describe("DirectoryReportService", () => {
  it("publica los niveles ocupacionales disponibles y la opción sin informar", async () => {
    const prisma = {
      person: { findMany: vi.fn().mockResolvedValue([
        { company: { name: "DANPER" }, management: null, division: null, status: { name: "ACTIVO" }, occupationLevel: { id: "level-1", code: "EMPLEADO", name: "EMPLEADO" } },
        { company: { name: "DANPER" }, management: null, division: null, status: { name: "ACTIVO" }, occupationLevel: { id: "level-2", code: "OPERARIO", name: "OPERARIO" } },
        { company: { name: "DANPER" }, management: null, division: null, status: { name: "ACTIVO" }, occupationLevel: null },
      ]) },
      role: { findMany: vi.fn().mockResolvedValue([]) },
      team: { findMany: vi.fn().mockResolvedValue([]) },
      catalogValue: { findMany: vi.fn().mockResolvedValue([]) },
    };

    const result = await new DirectoryReportService(prisma as never).options(null);

    expect(result.occupationLevels).toEqual([
      { id: "level-1", code: "EMPLEADO", label: "EMPLEADO" },
      { id: "level-2", code: "OPERARIO", label: "OPERARIO" },
      { id: UNSPECIFIED_OCCUPATION_LEVEL_ID, code: "SIN_INFORMAR", label: "Sin nivel ocupacional informado" },
    ]);
  });

  it("filtra por niveles ocupacionales y conserva a las personas sin nivel cuando se seleccionan", async () => {
    const prisma = {
      person: { findMany: vi.fn().mockResolvedValue([]) },
      audit: { create: vi.fn().mockResolvedValue({}) },
    };
    const service = new DirectoryReportService(prisma as never);

    await service.export({ occupationLevelIds: ["level-1", UNSPECIFIED_OCCUPATION_LEVEL_ID] }, null, null, "local.test@example.invalid");

    expect(prisma.person.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: [{ occupationLevelId: { in: ["level-1"] } }, { occupationLevelId: null }],
      }),
    }));
  });

  it("genera las cinco hojas acordadas", async () => {
    const prisma = {
      person: { findMany: vi.fn().mockResolvedValue([]) },
      audit: { create: vi.fn().mockResolvedValue({}) },
    };
    const service = new DirectoryReportService(prisma as never);
    const result = await service.export({}, null, null, "local.test@example.invalid");
    const workbook = XLSX.read(result.buffer, { type: "buffer" });
    expect(workbook.SheetNames).toEqual(["Resumen", "Base empleados", "Detalle persona-rol", "Participación organizacional", "Metodología"]);
    expect(result.people).toBe(0);
    expect(result.assignments).toBe(0);
    expect(result.filename).toMatch(/^participacion_resumen_\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(prisma.audit.create).toHaveBeenCalledOnce();
  });

  it("rechaza una fecha de corte inválida antes de consultar datos", async () => {
    const prisma = { person: { findMany: vi.fn() }, audit: { create: vi.fn() } };
    const service = new DirectoryReportService(prisma as never);
    await expect(service.export({ cutoffDate: "18/11/2026" }, null, null, "local.test@example.invalid")).rejects.toThrow("La fecha de corte no es válida");
    expect(prisma.person.findMany).not.toHaveBeenCalled();
  });

  it("mantiene la base completa cuando solo se informa una fecha de corte", async () => {
    const prisma = {
      person: { findMany: vi.fn().mockResolvedValue([]) },
      audit: { create: vi.fn().mockResolvedValue({}) },
    };
    const service = new DirectoryReportService(prisma as never);
    await service.export({ cutoffDate: "2026-08-31" }, null, null, "local.test@example.invalid");

    const query = prisma.person.findMany.mock.calls[0]?.[0] as { where?: { AND?: unknown[] } };
    expect(query.where?.AND).toEqual([]);
  });

  it("separa empleados y operarios en el resumen y calcula la tasa sin operarios", async () => {
    const basePerson = (id: string, statusCode: string, occupationLevel: { code?: string; name: string } | null, assignments: any[] = []) => ({
      id, dni: id, names: `Persona ${id}`, email: null, phone: null, position: null,
      company: { name: "DANPER TRUJILLO SAC" }, status: { code: statusCode, name: statusCode }, occupationLevel,
      organizationalUnit: null, management: null, subManagement: null, division: null, businessPartner: null, businessPartnerValue: null,
      assignments,
    });
    const activeAssignment = (id: string) => ({
      id, roleId: "role-1", status: { code: "ACTIVO", name: "ACTIVO" }, startDate: new Date("2026-01-01T00:00:00Z"), endDate: null,
      createdAt: new Date("2026-01-01T00:00:00Z"), developmentPathMode: "STANDARD", developmentExclusionReason: null,
      role: { sourceId: "1", name: "ATF", type: { name: "Transformación" }, status: { name: "ACTIVO" } },
      team: { sourceId: "1", name: "Equipo A", status: { name: "ACTIVO" } }, onboardingStatus: { name: "COMPLETADO" }, courses: [], maturities: [],
    });
    const people = [
      basePerson("1", "ACTIVO", { code: "EMPLEADO", name: "EMPLEADO" }, [activeAssignment("a1")]),
      basePerson("2", "ACTIVO", null),
      basePerson("3", "INACTIVO", { code: "EMPLEADO", name: "EMPLEADO" }),
      basePerson("4", "ACTIVO", { code: "OPERARIO", name: "OPERARIO" }, [activeAssignment("a2")]),
      basePerson("5", "INACTIVO", { name: "OPERARIO" }),
    ];
    const prisma = { person: { findMany: vi.fn().mockResolvedValue(people) }, audit: { create: vi.fn().mockResolvedValue({}) } };
    const result = await new DirectoryReportService(prisma as never).export({}, null, null, "local.test@example.invalid");
    const workbook = XLSX.read(result.buffer, { type: "buffer", cellStyles: true });
    const summary = workbook.Sheets.Resumen;
    const rows = XLSX.utils.sheet_to_json(summary, { header: 1, defval: null }) as unknown[][];
    const value = (label: string) => rows.find(row => row[0] === label);

    expect(value("Total de personas")?.[1]).toBe(5);
    expect(value("Empleados activos")?.[1]).toBe(2);
    expect(value("Empleados inactivos")?.[1]).toBe(1);
    expect(value("Operarios activos")?.[1]).toBe(1);
    expect(value("Operarios inactivos")?.[1]).toBe(1);
    expect(value("Participantes actuales")?.[1]).toBe(1);
    expect(value("Sin participación")?.[1]).toBe(1);
    expect(value("Tasa de participación")?.[1]).toBe(0.5);
    expect(value("Tasa de participación")?.[2]).toContain("1) ÷ empleados activos no operarios (2)");
    expect(value("ATF")?.[1]).toBe(1);
    expect(value("ATF")?.[2]).toBe(1);
    expect(summary.B13?.z).toBe("0.00%");
  });
});
