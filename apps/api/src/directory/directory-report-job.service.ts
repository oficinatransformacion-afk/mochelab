import { ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, mkdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DirectoryReportService, type DirectoryReportFilters } from "./directory-report.service";

type ReportJobStatus = "QUEUED" | "PROCESSING" | "READY" | "FAILED";

type ReportJob = {
  id: string;
  ownerId: string;
  status: ReportJobStatus;
  progress: number;
  createdAt: Date;
  updatedAt: Date;
  filename: string | null;
  filePath: string | null;
  error: string | null;
};

export type ReportJobView = {
  id: string;
  status: ReportJobStatus;
  progress: number;
  createdAt: string;
  updatedAt: string;
  filename: string | null;
  error: string | null;
  downloadUrl: string | null;
};

const READY_TTL_MS = 60 * 60 * 1000;
const FINISHED_TTL_MS = 15 * 60 * 1000;

@Injectable()
export class DirectoryReportJobService {
  private readonly logger = new Logger(DirectoryReportJobService.name);
  private readonly jobs = new Map<string, ReportJob>();
  private readonly outputDirectory = join(tmpdir(), "mochelab-participation-reports");

  constructor(private readonly reports: DirectoryReportService) {}

  async create(input: {
    filters: DirectoryReportFilters;
    teamScope: string[] | null;
    userId: string;
    actor: string;
  }): Promise<ReportJobView> {
    await this.cleanupExpired();
    const existing = [...this.jobs.values()].find(job => job.ownerId === input.userId && ["QUEUED", "PROCESSING"].includes(job.status));
    if (existing) return this.view(existing);
    const now = new Date();
    const job: ReportJob = {
      id: randomUUID(),
      ownerId: input.userId,
      status: "QUEUED",
      progress: 5,
      createdAt: now,
      updatedAt: now,
      filename: null,
      filePath: null,
      error: null,
    };
    this.jobs.set(job.id, job);
    const timer = setTimeout(() => void this.run(job.id, input), 0);
    timer.unref();
    return this.view(job);
  }

  async status(id: string, ownerId: string): Promise<ReportJobView> {
    await this.cleanupExpired();
    return this.view(this.ownedJob(id, ownerId));
  }

  async download(id: string, ownerId: string) {
    await this.cleanupExpired();
    const job = this.ownedJob(id, ownerId);
    if (job.status !== "READY" || !job.filePath || !job.filename) {
      throw new ConflictException(job.status === "FAILED" ? job.error ?? "El reporte no pudo generarse" : "El reporte todavía no está listo");
    }
    try {
      await access(job.filePath);
    } catch {
      this.jobs.delete(job.id);
      throw new NotFoundException("El archivo temporal venció. Genera nuevamente el reporte.");
    }
    const stream = createReadStream(job.filePath);
    stream.once("close", () => {
      this.jobs.delete(job.id);
      void unlink(job.filePath!).catch(() => undefined);
    });
    return { filename: job.filename, stream };
  }

  private async run(id: string, input: { filters: DirectoryReportFilters; teamScope: string[] | null; userId: string; actor: string }) {
    const job = this.jobs.get(id);
    if (!job) return;
    job.status = "PROCESSING";
    job.progress = 20;
    job.updatedAt = new Date();
    try {
      const result = await this.reports.export(input.filters, input.teamScope, input.userId, input.actor);
      await mkdir(this.outputDirectory, { recursive: true });
      const filePath = join(this.outputDirectory, `${job.id}.xlsx`);
      await writeFile(filePath, result.buffer);
      job.status = "READY";
      job.progress = 100;
      job.filename = result.filename;
      job.filePath = filePath;
      job.updatedAt = new Date();
    } catch (error) {
      this.logger.error(`Falló el reporte de participación ${job.id}`, error instanceof Error ? error.stack : String(error));
      job.status = "FAILED";
      job.progress = 100;
      job.error = "No se pudo generar el reporte. Intenta nuevamente o aplica filtros para reducir el volumen.";
      job.updatedAt = new Date();
    }
  }

  private ownedJob(id: string, ownerId: string) {
    const job = this.jobs.get(id);
    if (!job || job.ownerId !== ownerId) throw new NotFoundException("No se encontró la solicitud de reporte");
    return job;
  }

  private view(job: ReportJob): ReportJobView {
    return {
      id: job.id,
      status: job.status,
      progress: job.progress,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
      filename: job.filename,
      error: job.error,
      downloadUrl: job.status === "READY" ? `/api/people-reports/jobs/${job.id}/download` : null,
    };
  }

  private async cleanupExpired() {
    const now = Date.now();
    const removals: Promise<unknown>[] = [];
    for (const [id, job] of this.jobs) {
      const ttl = job.status === "READY" ? READY_TTL_MS : job.status === "FAILED" ? FINISHED_TTL_MS : null;
      if (ttl === null || now - job.updatedAt.getTime() <= ttl) continue;
      this.jobs.delete(id);
      if (job.filePath) removals.push(unlink(job.filePath).catch(() => undefined));
    }
    await Promise.all(removals);
  }
}
