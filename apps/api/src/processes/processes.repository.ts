import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type InitiativeSubprocessType } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";

export type ProcessLevel = "macroprocesses" | "business-processes" | "subprocesses";

@Injectable()
export class ProcessesRepository {
  constructor(private readonly prisma: PrismaService) {}

  level(value: string): ProcessLevel {
    if (value === "macroprocesses" || value === "business-processes" || value === "subprocesses") return value;
    throw new BadRequestException("Nivel de proceso inválido");
  }

  private text(value: unknown, field: string, max = 300) {
    const result = typeof value === "string" ? value.trim() : "";
    if (!result) throw new BadRequestException(`${field} es obligatorio`);
    if (result.length > max) throw new BadRequestException(`${field} supera la longitud permitida`);
    return result;
  }
  private optional(value: unknown) { return typeof value === "string" ? value.trim() || null : null; }
  private snapshot(value: unknown) { return JSON.parse(JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item)); }

  async list(search?: string, state?: string) {
    this.prisma.requireConnection();
    const term = search?.trim();
    const active = state === "active" ? true : state === "inactive" ? false : undefined;
    const rows = await this.prisma.macroprocess.findMany({
      where: {
        ...(active === undefined ? {} : { active }),
        ...(term ? { OR: [
          { code: { contains: term, mode: "insensitive" } }, { name: { contains: term, mode: "insensitive" } },
          { processes: { some: { OR: [{ code: { contains: term, mode: "insensitive" } }, { name: { contains: term, mode: "insensitive" } }, { subprocesses: { some: { OR: [{ code: { contains: term, mode: "insensitive" } }, { name: { contains: term, mode: "insensitive" } }] } } }] } } },
        ] } : {}),
      },
      include: {
        responsiblePerson: { select: { id: true, names: true, position: true, email: true } },
        processes: { orderBy: [{ sortOrder: "asc" }, { code: "asc" }], include: {
          responsiblePerson: { select: { id: true, names: true, position: true, email: true } },
          subprocesses: { orderBy: [{ sortOrder: "asc" }, { code: "asc" }], include: {
            responsiblePerson: { select: { id: true, names: true, position: true, email: true } },
            initiatives: { include: { initiative: { select: { id: true, sourceId: true, name: true, year: true, productOwner: true, status: { select: { name: true } }, team: { select: { name: true } } } } }, orderBy: { createdAt: "asc" } },
          } },
        } },
      },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    });
    const counts = await Promise.all([this.prisma.macroprocess.count(), this.prisma.businessProcess.count(), this.prisma.subprocess.count(), this.prisma.subprocess.count({ where: { active: true } })]);
    return { items: this.snapshot(rows), summary: { macroprocesses: counts[0], processes: counts[1], subprocesses: counts[2], activeSubprocesses: counts[3] } };
  }

  async options() {
    this.prisma.requireConnection();
    const [people, initiatives, companies] = await Promise.all([
      this.prisma.person.findMany({ where: { status: { code: "ACTIVO" } }, select: { id: true, names: true, position: true, companyId: true }, orderBy: { names: "asc" } }),
      this.prisma.initiative.findMany({ where: { year: { gte: new Date().getFullYear() - 1 } }, select: { id: true, sourceId: true, name: true, year: true }, orderBy: [{ year: "desc" }, { sourceId: "asc" }], take: 1000 }),
      this.prisma.company.findMany({ select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
    ]);
    return this.snapshot({ people, initiatives, companies });
  }

  async create(level: ProcessLevel, input: Record<string, unknown>, actorId: string) {
    this.prisma.requireConnection();
    const code = this.text(input.code, "El código", 40), name = this.text(input.name, "El nombre"), description = this.optional(input.description);
    const responsiblePersonId = this.optional(input.responsiblePersonId), sortOrder = Number.isInteger(Number(input.sortOrder)) ? Number(input.sortOrder) : 0;
    return this.prisma.$transaction(async tx => {
      let created: unknown;
      if (level === "macroprocesses") created = await tx.macroprocess.create({ data: { companyId: this.text(input.companyId, "La empresa", 40), code, name, description, responsiblePersonId, active: input.active !== false, sortOrder } });
      else if (level === "business-processes") created = await tx.businessProcess.create({ data: { macroprocessId: this.text(input.parentId, "El macroproceso", 40), code, name, description, responsiblePersonId, active: input.active !== false, sortOrder } });
      else created = await tx.subprocess.create({ data: { businessProcessId: this.text(input.parentId, "El proceso", 40), code, name, description, responsiblePersonId, active: input.active !== false, sortOrder } });
      await tx.audit.create({ data: { occurredAt: new Date(), userId: actorId, action: "CREATE", entity: level.toUpperCase(), recordId: (created as { id: string }).id, newValue: this.snapshot(created), result: "OK", origin: "WEB" } });
      return created;
    }).catch(error => { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new BadRequestException("El código ya existe dentro de este nivel"); throw error; });
  }

  async update(level: ProcessLevel, id: string, input: Record<string, unknown>, actorId: string) {
    this.prisma.requireConnection();
    const data: Record<string, unknown> = {};
    if (input.code !== undefined) data.code = this.text(input.code, "El código", 40);
    if (input.name !== undefined) data.name = this.text(input.name, "El nombre");
    if (input.description !== undefined) data.description = this.optional(input.description);
    if (input.responsiblePersonId !== undefined) data.responsiblePersonId = this.optional(input.responsiblePersonId);
    if (input.active !== undefined) data.active = Boolean(input.active);
    if (input.sortOrder !== undefined) data.sortOrder = Number(input.sortOrder) || 0;
    return this.prisma.$transaction(async tx => {
      const client = level === "macroprocesses" ? tx.macroprocess : level === "business-processes" ? tx.businessProcess : tx.subprocess;
      const current = await (client as any).findUnique({ where: { id } });
      if (!current) throw new NotFoundException("No se encontró el registro");
      const updated = await (client as any).update({ where: { id }, data });
      await tx.audit.create({ data: { occurredAt: new Date(), userId: actorId, action: "UPDATE", entity: level.toUpperCase(), recordId: id, oldValue: this.snapshot(current), newValue: this.snapshot(updated), result: "OK", origin: "WEB" } });
      return updated;
    }).catch(error => { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new BadRequestException("El código ya existe dentro de este nivel"); throw error; });
  }

  async linkInitiative(subprocessId: string, input: Record<string, unknown>, actorId: string) {
    const initiativeId = this.text(input.initiativeId, "La iniciativa", 40);
    const relationshipType: InitiativeSubprocessType = input.relationshipType === "PRIMARY" ? "PRIMARY" : "RELATED";
    return this.prisma.$transaction(async tx => {
      const relation = await tx.initiativeSubprocess.upsert({ where: { initiativeId_subprocessId: { initiativeId, subprocessId } }, create: { initiativeId, subprocessId, relationshipType, observations: this.optional(input.observations), createdBy: actorId }, update: { relationshipType, observations: this.optional(input.observations) } });
      await tx.audit.create({ data: { occurredAt: new Date(), userId: actorId, action: "LINK", entity: "INITIATIVE_SUBPROCESS", recordId: relation.id, newValue: this.snapshot(relation), result: "OK", origin: "WEB" } });
      return relation;
    }).catch(error => { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new BadRequestException("La iniciativa ya tiene otro subproceso principal"); throw error; });
  }

  async unlinkInitiative(subprocessId: string, initiativeId: string, actorId: string) {
    return this.prisma.$transaction(async tx => {
      const current = await tx.initiativeSubprocess.findUnique({ where: { initiativeId_subprocessId: { initiativeId, subprocessId } } });
      if (!current) throw new NotFoundException("No se encontró la relación");
      await tx.initiativeSubprocess.delete({ where: { initiativeId_subprocessId: { initiativeId, subprocessId } } });
      await tx.audit.create({ data: { occurredAt: new Date(), userId: actorId, action: "UNLINK", entity: "INITIATIVE_SUBPROCESS", recordId: current.id, oldValue: this.snapshot(current), result: "OK", origin: "WEB" } });
      return { ok: true };
    });
  }
}
