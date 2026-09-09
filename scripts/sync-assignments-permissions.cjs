const fs = require("node:fs");
const path = require("node:path");

for (const line of fs.readFileSync(path.resolve(".env"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (!match) continue;
  let value = match[2];
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
  if (!(match[1] in process.env)) process.env[match[1]] = value;
}
process.env.AIVEN_CA_CERT_PATH = path.resolve(".certs/ca.pem");

const { PrismaService } = require("../apps/api/dist/database/prisma.service.js");
const prisma = new PrismaService();

async function main() {
  const result = await prisma.$transaction(async (tx) => {
    const module = await tx.systemModule.upsert({
      where: { code: "ASIGNACIONES" },
      create: { code: "ASIGNACIONES", name: "Asignaciones", route: "/asignaciones", icon: "clipboard-list", sortOrder: 25 },
      update: { name: "Asignaciones", route: "/asignaciones", icon: "clipboard-list", sortOrder: 25, active: true },
    });
    const profiles = await tx.catalogValue.findMany({
      where: { catalog: { code: "PERFIL_USUARIO" }, code: { in: ["USUARIO", "ADMIN", "SYSTEM"] } },
      select: { id: true, code: true },
    });
    for (const profile of profiles) {
      const administrator = profile.code === "ADMIN" || profile.code === "SYSTEM";
      await tx.profileModule.upsert({
        where: { profileId_moduleId: { profileId: profile.id, moduleId: module.id } },
        create: { profileId: profile.id, moduleId: module.id, canView: true, canCreate: true, canEdit: true, canDelete: administrator },
        update: { canView: true, canCreate: true, canEdit: true, canDelete: administrator },
      });
    }
    return { module: module.code, profiles: profiles.map((profile) => profile.code) };
  });
  console.log(JSON.stringify(result));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
