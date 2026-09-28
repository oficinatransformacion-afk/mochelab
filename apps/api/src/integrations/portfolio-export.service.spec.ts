import { afterEach, describe, expect, it, vi } from "vitest";
import { ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { PORTFOLIO_HEADERS, PortfolioExportService } from "./portfolio-export.service";

const secret = "portfolio-secret-with-at-least-32-characters";

describe("PortfolioExportService", () => {
  afterEach(() => {
    delete process.env.PORTFOLIO_EXPORT_ENABLED;
    delete process.env.PORTFOLIO_EXPORT_SECRET;
    vi.restoreAllMocks();
  });

  it("permanece desactivado por defecto", async () => {
    const service = new PortfolioExportService({ requireConnection: vi.fn(), $queryRaw: vi.fn() } as never);
    await expect(service.export(secret)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("rechaza una clave inválida", async () => {
    process.env.PORTFOLIO_EXPORT_ENABLED = "true";
    process.env.PORTFOLIO_EXPORT_SECRET = secret;
    const service = new PortfolioExportService({ requireConnection: vi.fn(), $queryRaw: vi.fn() } as never);
    await expect(service.export("incorrecta")).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("entrega exactamente 38 columnas sin duplicados", async () => {
    process.env.PORTFOLIO_EXPORT_ENABLED = "true";
    process.env.PORTFOLIO_EXPORT_SECRET = secret;
    const record = Object.fromEntries(PORTFOLIO_HEADERS.map((header) => [header, header === "ID_INICIATIVA" ? "1" : ""]));
    const prisma = { requireConnection: vi.fn(), $queryRaw: vi.fn().mockResolvedValue([record]) };
    const result = await new PortfolioExportService(prisma as never).export(secret);
    expect(result.headers).toHaveLength(38);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toHaveLength(38);
    expect(result.meta.columns).toBe(38);
  });

  it("bloquea una exportación con ID_INICIATIVA duplicados", async () => {
    process.env.PORTFOLIO_EXPORT_ENABLED = "true";
    process.env.PORTFOLIO_EXPORT_SECRET = secret;
    const record = Object.fromEntries(PORTFOLIO_HEADERS.map((header) => [header, header === "ID_INICIATIVA" ? "1" : ""]));
    const prisma = { requireConnection: vi.fn(), $queryRaw: vi.fn().mockResolvedValue([record, record]) };
    await expect(new PortfolioExportService(prisma as never).export(secret)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
