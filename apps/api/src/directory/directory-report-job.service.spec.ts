import { describe, expect, it, vi } from "vitest";
import { DirectoryReportJobService } from "./directory-report-job.service";

describe("DirectoryReportJobService", () => {
  it("genera el archivo fuera de la solicitud y lo deja listo para descargar", async () => {
    const reports = {
      export: vi.fn().mockResolvedValue({
        buffer: Buffer.from("xlsx-test"),
        filename: "participacion_resumen_2026-11-19.xlsx",
        people: 1,
        assignments: 1,
      }),
    };
    const service = new DirectoryReportJobService(reports as never);

    const created = await service.create({ filters: {}, teamScope: null, userId: "user-1", actor: "local.test@example.invalid" });
    expect(created.status).toBe("QUEUED");

    await vi.waitFor(async () => {
      expect((await service.status(created.id, "user-1")).status).toBe("READY");
    });
    const ready = await service.status(created.id, "user-1");
    expect(ready.progress).toBe(100);
    expect(ready.downloadUrl).toBe(`/api/people-reports/jobs/${created.id}/download`);
    expect(ready.filename).toBe("participacion_resumen_2026-11-19.xlsx");

    const download = await service.download(created.id, "user-1");
    expect(download.filename).toBe("participacion_resumen_2026-11-19.xlsx");
    download.stream.resume();
    await new Promise<void>((resolve, reject) => download.stream.once("close", resolve).once("error", reject));
  });

  it("no permite consultar solicitudes de otro usuario", async () => {
    const reports = { export: vi.fn().mockResolvedValue({ buffer: Buffer.from("x"), filename: "reporte.xlsx" }) };
    const service = new DirectoryReportJobService(reports as never);
    const created = await service.create({ filters: {}, teamScope: null, userId: "user-1", actor: "" });
    await expect(service.status(created.id, "user-2")).rejects.toThrow("No se encontró la solicitud de reporte");
  });

  it("expone un mensaje controlado cuando la generación falla", async () => {
    const reports = { export: vi.fn().mockRejectedValue(new Error("sin memoria")) };
    const service = new DirectoryReportJobService(reports as never);
    const created = await service.create({ filters: {}, teamScope: null, userId: "user-1", actor: "" });

    await vi.waitFor(async () => {
      expect((await service.status(created.id, "user-1")).status).toBe("FAILED");
    });
    const failed = await service.status(created.id, "user-1");
    expect(failed.error).toContain("No se pudo generar el reporte");
  });
});
