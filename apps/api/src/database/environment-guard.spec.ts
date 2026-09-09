import { describe, expect, it } from "vitest";
import { assertSafeDatabaseWrite, databaseName } from "./environment-guard";

const url = (name: string) => `postgresql://user:secret@db.example.com:5432/${name}?sslmode=require`;

describe("database environment guard", () => {
  it("identifica la base configurada", () => {
    expect(databaseName(url("mochelab_dev"))).toBe("mochelab_dev");
  });

  it("permite escrituras de prueba sin confirmación productiva", () => {
    expect(assertSafeDatabaseWrite(url("mochelab_dev"), "seed", [], {})).toBe("mochelab_dev");
  });

  it("bloquea producción sin doble confirmación", () => {
    expect(() => assertSafeDatabaseWrite(url("mochelab_prod"), "legacy-import", ["--confirm-production"], {})).toThrow("BLOQUEADO");
  });

  it("permite una importación productiva con doble confirmación", () => {
    expect(assertSafeDatabaseWrite(url("mochelab_prod"), "legacy-import", ["--confirm-production"], {
      MOCHELAB_PRODUCTION_WRITE_CONFIRMATION: "MOCHELAB_PROD",
    })).toBe("mochelab_prod");
  });

  it("prohíbe datos de visualización en producción aun con confirmación", () => {
    expect(() => assertSafeDatabaseWrite(url("mochelab_prod"), "visualization-seed", ["--confirm-production"], {
      MOCHELAB_PRODUCTION_WRITE_CONFIRMATION: "MOCHELAB_PROD",
    })).toThrow("datos de visualización");
  });
});

