import { describe, expect, it, vi } from "vitest";
import { CatalogsRepository } from "./catalogs.repository";

describe("CatalogsRepository catalog administration", () => {
  it("creates a catalog with a normalized unique code and an audit record", async () => {
    const created = { id:"catalog-1", code:"TIPO_PROVEEDOR", name:"Tipo de proveedor", description:null, active:true };
    const transaction = { catalog:{ create:vi.fn().mockResolvedValue(created) }, audit:{ create:vi.fn().mockResolvedValue({}) } };
    const prisma = { $transaction:vi.fn(async (callback:(tx:typeof transaction)=>unknown) => callback(transaction)) };
    const repository = new CatalogsRepository(prisma as never);

    const result = await repository.createCatalog({ code:"tipo proveedor", name:" Tipo de proveedor " }, "admin-1");

    expect(result).toEqual(created);
    expect(transaction.catalog.create).toHaveBeenCalledWith({ data:{ code:"TIPO_PROVEEDOR", name:"Tipo de proveedor", description:null, active:true } });
    expect(transaction.audit.create).toHaveBeenCalledWith({ data:expect.objectContaining({ userId:"admin-1", action:"CREATE", entity:"CATALOG", recordId:"catalog-1" }) });
  });

  it("returns a clear error when the catalog code already exists", async () => {
    const prisma = { $transaction:vi.fn().mockRejectedValue({ code:"P2002" }) };
    const repository = new CatalogsRepository(prisma as never);

    await expect(repository.createCatalog({ code:"ESTADO", name:"Estado" }, "admin-1"))
      .rejects.toThrow("Ya existe un catálogo con ese código");
  });

  it("does not deactivate a catalog while it contains active values", async () => {
    const prisma = { catalog:{ findUnique:vi.fn().mockResolvedValue({ id:"catalog-1", code:"ESTADO", name:"Estado", active:true, _count:{values:2} }) } };
    const repository = new CatalogsRepository(prisma as never);

    await expect(repository.updateCatalog("catalog-1", { active:false }, "admin-1"))
      .rejects.toThrow("Desactiva primero los valores activos del catálogo");
  });
});
