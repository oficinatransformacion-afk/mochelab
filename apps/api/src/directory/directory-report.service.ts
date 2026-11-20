import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import * as XLSX from "xlsx";
import { PrismaService } from "../database/prisma.service";

export type DirectoryReportFilters = {
  companyNames?: string[];
  personStatusNames?: string[];
  managementIds?: string[];
  divisionIds?: string[];
  roleIds?: string[];
  teamIds?: string[];
  assignmentStatusIds?: string[];
  cutoffDate?: string;
  includeContact?: boolean;
};

const completedCourseCodes = ["TERMINADO", "APROBADO", "COMPLETADO"];
const strings = (value: unknown) => Array.isArray(value) ? [...new Set(value.filter(item => typeof item === "string" && item.trim()).map(String))] : [];
const iso = (value: Date | null | undefined) => value ? value.toISOString().slice(0, 10) : "";
const text = (value: string | null | undefined) => value ?? "";
const pct = (numerator: number, denominator: number) => denominator ? numerator / denominator : 0;
const valueName = (value: { name: string } | null | undefined) => value?.name ?? "";
const isOperator = (person: any) => {
  const value = person.occupationLevel?.code ?? person.occupationLevel?.name ?? "";
  return String(value).trim().toUpperCase() === "OPERARIO";
};

function parseCutoff(value?: string) {
  if (!value?.trim()) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException("La fecha de corte no es válida");
  const date = new Date(`${value}T23:59:59.999Z`);
  if (Number.isNaN(date.valueOf())) throw new BadRequestException("La fecha de corte no es válida");
  return date;
}

function effectiveStart(assignment: any) {
  return (assignment.startDate as Date | null) ?? (assignment.createdAt as Date);
}

function assignmentActive(assignment: any, cutoff: Date | null) {
  if (!cutoff) return assignment.status.code === "ACTIVO";
  const start = effectiveStart(assignment);
  return start <= cutoff && (!assignment.endDate || assignment.endDate > cutoff);
}

function columnName(index: number) {
  let n = index + 1, result = "";
  while (n > 0) { const remainder = (n - 1) % 26; result = String.fromCharCode(65 + remainder) + result; n = Math.floor((n - 1) / 26); }
  return result;
}

function makeSheet(title: string, subtitle: string, headers: string[], rows: unknown[][], widths?: number[]) {
  const sheet = XLSX.utils.aoa_to_sheet([[title], [subtitle], [], headers, ...rows], { cellDates: true });
  const lastColumn = columnName(Math.max(0, headers.length - 1));
  const lastRow = Math.max(4, 4 + rows.length);
  sheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: Math.min(headers.length - 1, 8) } }, { s: { r: 1, c: 0 }, e: { r: 1, c: Math.min(headers.length - 1, 12) } }];
  sheet["!autofilter"] = { ref: `A4:${lastColumn}${lastRow}` };
  sheet["!cols"] = headers.map((header, index) => ({ wch: widths?.[index] ?? (/Nombre|Persona|Equipo|Gerencia|División|Motivo|Roles|Metodología/.test(header) ? 30 : 18) }));
  return sheet;
}

@Injectable()
export class DirectoryReportService {
  constructor(private readonly prisma: PrismaService) {}

  async options(teamScope: string[] | null) {
    const personScope = teamScope === null ? undefined : { assignments: { some: { teamId: { in: teamScope } } } };
    const [people, roles, teams, assignmentStatuses] = await Promise.all([
      this.prisma.person.findMany({ where: personScope, select: { company: { select: { name: true } }, management: { select: { id: true, name: true } }, division: { select: { id: true, name: true } }, status: { select: { name: true } } } }),
      this.prisma.role.findMany({ where: { assignments: { some: { teamId: teamScope === null ? undefined : { in: teamScope } } } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      this.prisma.team.findMany({ where: { id: teamScope === null ? undefined : { in: teamScope } }, select: { id: true, sourceId: true, name: true }, orderBy: { sourceId: "asc" } }),
      this.prisma.catalogValue.findMany({ where: { active: true, catalog: { code: "ESTADO_ASIGNACION" } }, select: { id: true, code: true, name: true }, orderBy: { sortOrder: "asc" } }),
    ]);
    const unique = (values: string[]) => [...new Set(values)].sort((a, b) => a.localeCompare(b, "es"));
    const uniqueValues = (values: ({ id: string; name: string } | null)[]) => [...new Map(values.filter((item): item is { id: string; name: string } => Boolean(item)).map(item => [item.id, { id: item.id, label: item.name }])).values()].sort((a, b) => a.label.localeCompare(b.label, "es"));
    return {
      companies: unique(people.map(item => item.company.name)),
      personStatuses: unique(people.map(item => item.status.name)),
      managements: uniqueValues(people.map(item => item.management)),
      divisions: uniqueValues(people.map(item => item.division)),
      roles: roles.map(item => ({ id: item.id, label: item.name })),
      teams: teams.map(item => ({ id: item.id, label: `${item.sourceId} · ${item.name}` })),
      assignmentStatuses: assignmentStatuses.map(item => ({ id: item.id, code: item.code, label: item.name })),
    };
  }

  async export(rawFilters: DirectoryReportFilters, teamScope: string[] | null, userId: string | null, actor: string) {
    const filters = rawFilters ?? {};
    const cutoff = parseCutoff(filters.cutoffDate);
    const companyNames = strings(filters.companyNames), personStatusNames = strings(filters.personStatusNames), managementIds = strings(filters.managementIds), divisionIds = strings(filters.divisionIds), roleIds = strings(filters.roleIds), requestedTeams = strings(filters.teamIds), assignmentStatusIds = strings(filters.assignmentStatusIds);
    const allowedTeams = teamScope === null ? requestedTeams : requestedTeams.length ? requestedTeams.filter(id => teamScope.includes(id)) : teamScope;
    const impossibleScope = teamScope !== null && requestedTeams.length > 0 && allowedTeams.length === 0;
    const assignmentWhere: any = {
      teamId: impossibleScope ? "00000000-0000-0000-0000-000000000000" : allowedTeams.length ? { in: allowedTeams } : undefined,
      roleId: roleIds.length ? { in: roleIds } : undefined,
      statusId: assignmentStatusIds.length ? { in: assignmentStatusIds } : undefined,
      AND: cutoff ? [{ OR: [{ startDate: { lte: cutoff } }, { startDate: null, createdAt: { lte: cutoff } }] }] : undefined,
    };
    // La fecha de corte cambia la vigencia de las asignaciones, pero no debe
    // excluir de la base de empleados a quienes todavía no tenían un rol.
    const hasAssignmentFilters = roleIds.length > 0 || requestedTeams.length > 0 || assignmentStatusIds.length > 0;
    const personWhere: any = {
      company: companyNames.length ? { name: { in: companyNames } } : undefined,
      status: personStatusNames.length ? { name: { in: personStatusNames } } : undefined,
      managementId: managementIds.length ? { in: managementIds } : undefined,
      divisionId: divisionIds.length ? { in: divisionIds } : undefined,
      AND: [
        ...(teamScope === null ? [] : [{ assignments: { some: { teamId: { in: teamScope } } } }]),
        ...(hasAssignmentFilters ? [{ assignments: { some: assignmentWhere } }] : []),
      ],
    };
    const maturityWhere = cutoff ? { evaluatedAt: { lte: cutoff } } : undefined;
    const people: any[] = await this.prisma.person.findMany({
      where: personWhere,
      include: {
        company: true, status: true, occupationLevel: true, organizationalUnit: true, management: true,
        subManagement: true, division: true, businessPartner: true, businessPartnerValue: true,
        assignments: {
          where: assignmentWhere,
          include: {
            role: { include: { type: true, status: true } },
            team: { include: { status: true } }, status: true, onboardingStatus: true,
            courses: { include: { status: true } },
            maturities: { where: maturityWhere, include: { period: true, level: true }, orderBy: { evaluatedAt: "desc" }, take: 1 },
          },
          orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
        },
      },
      orderBy: [{ names: "asc" }, { dni: "asc" }],
    });

    const includeContact = Boolean(filters.includeContact);
    const personRows: unknown[][] = [];
    const assignmentRows: unknown[][] = [];
    const classifications = new Map<string, { classification: string; currentParticipant: boolean; activeAssignments: any[]; assignments: any[] }>();
    for (const person of people) {
      const assignments = person.assignments.filter((assignment: any) => !cutoff || effectiveStart(assignment) <= cutoff);
      const activeAssignments = assignments.filter((assignment: any) => assignmentActive(assignment, cutoff));
      const activeEmployee = person.status.code === "ACTIVO";
      const classification = !activeEmployee ? "Empleado inactivo" : activeAssignments.length ? "Participante actual" : assignments.length ? "Exparticipante" : "Sin participación";
      classifications.set(person.id, { classification, currentParticipant: activeEmployee && activeAssignments.length > 0, activeAssignments, assignments });
      const activeRoleNames = [...new Set(activeAssignments.map((item: any) => item.role.name))];
      const activeTeamNames = [...new Set(activeAssignments.map((item: any) => `${item.team.sourceId} · ${item.team.name}`))];
      const starts = assignments.map((item: any) => effectiveStart(item)).sort((a: Date, b: Date) => a.valueOf() - b.valueOf());
      const ends = assignments.map((item: any) => item.endDate as Date | null).filter((item: Date | null): item is Date => Boolean(item)).sort((a: Date, b: Date) => a.valueOf() - b.valueOf());
      personRows.push([
        person.id, person.dni, person.names, person.company.name, person.status.name,
        ...(includeContact ? [text(person.email), text(person.phone)] : []),
        text(person.position), valueName(person.occupationLevel), valueName(person.organizationalUnit), valueName(person.management), valueName(person.subManagement), valueName(person.division), valueName(person.businessPartnerValue) || valueName(person.businessPartner),
        classification, new Set(activeAssignments.map((item: any) => item.roleId)).size, assignments.filter((item: any) => !assignmentActive(item, cutoff)).length,
        activeRoleNames.join("; "), activeTeamNames.join("; "), starts.length ? iso(starts[0]) : "", ends.length ? iso(ends[ends.length - 1]) : "",
        assignments.some((item: any) => item.developmentPathMode === "STANDARD") ? "Sí" : assignments.length ? "No" : "No aplica",
      ]);
      for (const assignment of assignments) {
        const courses = assignment.courses as any[];
        const completed = courses.filter(course => completedCourseCodes.includes(course.status.code)).length;
        const maturity = assignment.maturities[0];
        const active = assignmentActive(assignment, cutoff);
        assignmentRows.push([
          person.id, person.dni, person.names, person.company.name, person.status.name,
          ...(includeContact ? [text(person.email), text(person.phone)] : []),
          text(person.position), valueName(person.management), valueName(person.division),
          assignment.id, assignment.status.name, iso(assignment.startDate), iso(assignment.endDate), iso(effectiveStart(assignment)), effectiveStart(assignment).getUTCFullYear(), active ? "ACTIVA" : "INACTIVA",
          assignment.role.sourceId, assignment.role.name, assignment.role.type.name, assignment.role.status.name,
          assignment.team.sourceId, assignment.team.name, assignment.team.status.name,
          assignment.developmentPathMode === "EXEMPT" ? "Sin ruta" : "Con ruta", text(assignment.developmentExclusionReason), assignment.onboardingStatus.name,
          courses.length, completed, courses.length - completed, pct(completed, courses.length),
          maturity?.period?.name ?? "", maturity ? iso(maturity.evaluatedAt) : "", maturity ? Number(maturity.score) : "", maturity?.level?.name ?? "",
          assignment.developmentPathMode === "EXEMPT" ? "No aplica" : maturity ? "Evaluado" : "Sin evaluación registrada",
        ]);
      }
    }

    const employees = people.filter(person => !isOperator(person));
    const operators = people.filter(isOperator);
    const activeEmployees = employees.filter(person => person.status.code === "ACTIVO");
    const inactiveEmployees = employees.filter(person => person.status.code !== "ACTIVO");
    const activeOperators = operators.filter(person => person.status.code === "ACTIVO");
    const inactiveOperators = operators.filter(person => person.status.code !== "ACTIVO");
    const currentParticipants = employees.filter(person => classifications.get(person.id)?.currentParticipant);
    const formerParticipants = employees.filter(person => classifications.get(person.id)?.classification === "Exparticipante");
    const noParticipation = employees.filter(person => classifications.get(person.id)?.classification === "Sin participación");
    const activeAssignmentCount = [...classifications.values()].reduce((sum, item) => sum + item.activeAssignments.length, 0);
    const inactiveAssignmentCount = [...classifications.values()].reduce((sum, item) => sum + item.assignments.length - item.activeAssignments.length, 0);

    const roleSummary = new Map<string, { role: string; people: Set<string>; assignments: number }>();
    for (const person of employees) for (const assignment of classifications.get(person.id)?.activeAssignments ?? []) {
      const current = roleSummary.get(assignment.roleId) ?? { role: assignment.role.name, people: new Set<string>(), assignments: 0 };
      current.people.add(person.id); current.assignments += 1; roleSummary.set(assignment.roleId, current);
    }
    const summaryRows: unknown[][] = [
      ["Total de personas", people.length, "Total de registros únicos de personas dentro del alcance y filtros aplicados. Incluye empleados y operarios, activos e inactivos."],
      ["Empleados activos", activeEmployees.length, "Personas con estado ACTIVO cuyo Nivel Ocupacional es diferente de OPERARIO o no está informado."],
      ["Empleados inactivos", inactiveEmployees.length, "Personas con estado diferente de ACTIVO cuyo Nivel Ocupacional es diferente de OPERARIO o no está informado."],
      ["Operarios activos", activeOperators.length, "Personas con estado ACTIVO cuyo Nivel Ocupacional es OPERARIO."],
      ["Operarios inactivos", inactiveOperators.length, "Personas con estado diferente de ACTIVO cuyo Nivel Ocupacional es OPERARIO."],
      ["Participantes actuales", currentParticipants.length, `Personas activas no operarias con al menos una asignación persona–rol vigente ${cutoff ? "a la fecha de corte" : "al generar el reporte"}.`],
      ["Exparticipantes", formerParticipants.length, `Personas activas no operarias sin asignaciones vigentes, pero con historial de asignaciones ${cutoff ? "hasta la fecha de corte" : "dentro del alcance exportado"}.`],
      ["Sin participación", noParticipation.length, `Personas activas no operarias sin asignaciones de rol ${cutoff ? "hasta la fecha de corte" : "dentro del alcance exportado"}.`],
      ["Tasa de participación", pct(currentParticipants.length, activeEmployees.length), `Participantes actuales no operarios (${currentParticipants.length}) ÷ empleados activos no operarios (${activeEmployees.length}) × 100.`],
      ["Asignaciones activas", activeAssignmentCount, `Cantidad de asignaciones persona–rol vigentes ${cutoff ? "a la fecha de corte" : "al generar el reporte"}. Este indicador conserva todos los niveles ocupacionales.`],
      ["Asignaciones inactivas", inactiveAssignmentCount, `Cantidad de asignaciones persona–rol no vigentes ${cutoff ? "a la fecha de corte" : "al generar el reporte"}. Este indicador conserva todos los niveles ocupacionales.`],
      [], ["Participación actual por rol", "Personas únicas", "Asignaciones"],
      ...[...roleSummary.values()].sort((a, b) => a.role.localeCompare(b.role, "es")).map(item => [item.role, item.people.size, item.assignments]),
    ];
    const summary = XLSX.utils.aoa_to_sheet([["Participación en transformación"], [`Fecha de generación: ${new Date().toISOString()} · ${cutoff ? `Corte: ${filters.cutoffDate}` : "Histórico completo"}`], [], ["Indicador", "Valor", "Detalle"], ...summaryRows], { cellDates: true });
    summary["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } }];
    summary["!cols"] = [{ wch: 38 }, { wch: 20 }, { wch: 95 }];
    const participationRateRow = 5 + summaryRows.findIndex(row => row[0] === "Tasa de participación");
    if (summary[`B${participationRateRow}`]) summary[`B${participationRateRow}`].z = "0.00%";

    const personHeaders = ["ID persona", "DNI", "Nombres completos", "Empresa", "Estado empleado", ...(includeContact ? ["Correo", "Teléfono"] : []), "Puesto", "Nivel ocupacional", "Unidad organizacional", "Gerencia", "Subgerencia", "División", "Business Partner", "Clasificación participación", "Roles activos", "Asignaciones inactivas", "Nombres de roles activos", "Equipos activos", "Fecha primer rol", "Fecha última finalización", "Tiene ruta de desarrollo"];
    const assignmentHeaders = ["ID persona", "DNI", "Nombres completos", "Empresa", "Estado empleado", ...(includeContact ? ["Correo", "Teléfono"] : []), "Puesto", "Gerencia", "División", "ID asignación", "Estado asignación", "Fecha inicio", "Fecha fin", "Inicio efectivo", "Año inicio", cutoff ? "Vigencia al corte" : "Vigencia actual", "ID rol", "Rol", "Tipo de rol", "Estado rol", "ID equipo", "Equipo", "Estado equipo", "Ruta de desarrollo", "Motivo sin ruta", "Estado onboarding", "Cursos asignados", "Cursos terminados", "Cursos pendientes", "Avance Academia", "Último período de madurez", "Fecha evaluación", "Puntaje madurez", "Nivel madurez", "Estado evaluación"];

    const organization = new Map<string, { company: string; management: string; division: string; employees: Set<string>; active: Set<string>; participants: Set<string>; former: Set<string>; none: Set<string> }>();
    for (const person of people) {
      const management = valueName(person.management) || "Sin gerencia", division = valueName(person.division) || "Sin división", key = `${person.company.name}|${management}|${division}`;
      const item = organization.get(key) ?? { company: person.company.name, management, division, employees: new Set(), active: new Set(), participants: new Set(), former: new Set(), none: new Set() };
      item.employees.add(person.id);
      if (person.status.code === "ACTIVO") item.active.add(person.id);
      const classification = classifications.get(person.id)?.classification;
      if (classification === "Participante actual") item.participants.add(person.id);
      if (classification === "Exparticipante") item.former.add(person.id);
      if (classification === "Sin participación") item.none.add(person.id);
      organization.set(key, item);
    }
    const organizationRows = [...organization.values()].sort((a, b) => `${a.company}${a.management}${a.division}`.localeCompare(`${b.company}${b.management}${b.division}`, "es")).map(item => [item.company, item.management, item.division, item.employees.size, item.active.size, item.participants.size, item.former.size, item.none.size, pct(item.participants.size, item.active.size)]);

    const generatedAt = new Date();
    const subtitle = `${cutoff ? `Estado a la fecha de corte ${filters.cutoffDate}` : "Histórico completo"} · ${people.length} personas · Alcance: ${teamScope === null ? "todos los equipos permitidos" : `${teamScope.length} equipos permitidos`}`;
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, summary, "Resumen");
    XLSX.utils.book_append_sheet(book, makeSheet("Base de empleados", subtitle, personHeaders, personRows), "Base empleados");
    const assignmentsSheet = makeSheet("Detalle persona–rol", subtitle, assignmentHeaders, assignmentRows);
    for (let row = 5; row <= 4 + assignmentRows.length; row++) { const progressColumn = columnName(assignmentHeaders.indexOf("Avance Academia")); const cell = assignmentsSheet[`${progressColumn}${row}`]; if (cell) cell.z = "0.00%"; }
    XLSX.utils.book_append_sheet(book, assignmentsSheet, "Detalle persona-rol");
    const organizationSheet = makeSheet("Participación organizacional", subtitle, ["Empresa", "Gerencia", "División", "Empleados", "Empleados activos", "Participantes actuales", "Exparticipantes", "Sin participación", "Tasa de participación"], organizationRows, [28, 30, 28, 14, 18, 20, 16, 18, 20]);
    for (let row = 5; row <= 4 + organizationRows.length; row++) if (organizationSheet[`I${row}`]) organizationSheet[`I${row}`].z = "0.00%";
    XLSX.utils.book_append_sheet(book, organizationSheet, "Participación organizacional");
    const methodologyRows = [
      ["Fuente", "Base de datos de Mochelab consultada al generar el reporte."],
      ["Persona única", "Se identifica por el registro de persona; el DNI se muestra como identificador funcional."],
      ["Total de personas", "Incluye empleados y operarios, activos e inactivos."],
      ["Empleado", "Persona cuyo nivel ocupacional es diferente de OPERARIO o no está informado."],
      ["Operario", "Persona cuyo nivel ocupacional tiene código o nombre OPERARIO."],
      ["Participante actual", "Empleado activo no operario con al menos una asignación persona–rol vigente."],
      ["Exparticipante", "Empleado activo no operario sin asignaciones vigentes, pero con historial de asignaciones."],
      ["Sin participación", "Empleado activo no operario sin asignaciones de rol dentro del alcance exportado."],
      ["Tasa de participación", "Participantes actuales no operarios dividido entre empleados activos no operarios."],
      ["Empleado inactivo", "Se conserva como categoría independiente, aunque tenga historial de roles."],
      ["Fecha de corte vacía", "Exporta todo el historial; la participación actual usa el estado vigente de la asignación."],
      ["Fecha de corte informada", "Incluye asignaciones iniciadas hasta esa fecha y reconstruye su vigencia con fecha de inicio y fin."],
      ["Estado histórico del empleado", "El estado del empleado es el actual; no se reconstruye históricamente sin auditoría específica."],
      ["Último período de madurez", "Último resultado registrado para la asignación hasta la fecha de corte, si corresponde."],
      ["Alcance", teamScope === null ? "Acceso global." : `Limitado a ${teamScope.length} equipos autorizados; las personas sin equipo no pueden atribuirse a un alcance restringido.`],
      ["Filtros aplicados", JSON.stringify(filters)],
      ["Generado por", actor || "Usuario"],
      ["Fecha de generación", generatedAt.toISOString()],
    ];
    XLSX.utils.book_append_sheet(book, makeSheet("Metodología", "Criterios utilizados para interpretar el reporte", ["Elemento", "Definición"], methodologyRows, [32, 100]), "Metodología");

    const buffer = XLSX.write(book, { bookType: "xlsx", type: "buffer", compression: true, cellStyles: true }) as Buffer;
    await this.prisma.audit.create({ data: { occurredAt: generatedAt, userId: userId ?? undefined, actorLegacy: actor || undefined, action: "EXPORT", entity: "PERSON_TRANSFORMATION_REPORT", newValue: { filters: filters as Prisma.InputJsonValue, people: people.length, assignments: assignmentRows.length, currentParticipants: currentParticipants.length }, result: "SUCCESS", origin: "WEB" } });
    const dateParts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Lima",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(generatedAt).map(part => [part.type, part.value]),
    );
    const downloadDate = `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
    return { buffer, filename: `participacion_resumen_${downloadDate}.xlsx`, people: people.length, assignments: assignmentRows.length };
  }
}
