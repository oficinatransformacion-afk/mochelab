import { config } from "dotenv";
import { resolve } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { databaseName } from "../src/database/environment-guard";
import { postgresOptions } from "../src/database/postgres-options";
import { maturityTransferExclusion } from "./maturity-transfer-policy";

config({ path:resolve(process.cwd(), "../../.env.local"), quiet:true });
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL no configurada");
const sourceDatabase = databaseName(databaseUrl);
if (sourceDatabase !== "mochelab_local") throw new Error(`Esta auditoría solo puede leer mochelab_local, no ${sourceDatabase}`);

const prisma = new PrismaClient({ adapter:new PrismaPg(postgresOptions(databaseUrl)) });
type IdentityRow = { id:string; personRoleId:string; periodId:string; person:{dni:string;company:{code:string}}; role:{sourceId:string;name:string}; team:{sourceId:string}; period:{code:string}; calibratedAt?:Date|null };
const identityKey = (row:IdentityRow) => `${row.person.company.code}|${row.person.dni}|${row.role.sourceId}|${row.period.code}`;
const identityOf = (row:IdentityRow) => ({ companyCode:row.person.company.code, personDni:row.person.dni, roleCode:row.role.sourceId, periodCode:row.period.code });
const groupDuplicates = (rows:IdentityRow[]) => {
  const grouped = new Map<string, IdentityRow[]>();
  for (const row of rows) grouped.set(identityKey(row), [...(grouped.get(identityKey(row)) ?? []), row]);
  return [...grouped.entries()].filter(([, items]) => items.length > 1).map(([key, items]) => ({ key, records:items.length, teams:[...new Set(items.map(item => item.team.sourceId))] }));
};

async function main() {
  const [models, versions, responses, details, assessments, maturities, duplicateAssignments] = await Promise.all([
    prisma.assessmentModel.count(), prisma.assessmentModelVersion.count(), prisma.selfAssessmentResponse.count(), prisma.assessmentResultDetail.count(),
    prisma.roleSelfAssessment.findMany({ include:{ personRole:{ include:{ person:{ include:{ company:true } }, role:true, team:true } }, period:true } }),
    prisma.roleMaturity.findMany({ include:{ personRole:{ include:{ person:{ include:{ company:true } }, role:true, team:true } }, period:true } }),
    prisma.$queryRaw<{company_code:string;dni:string;role_code:string;assignments:bigint;teams:string[]}[]>`
      select c.code company_code, p.dni, r.source_id role_code, count(*) assignments,
             array_agg(t.source_id order by t.source_id) teams
      from person_role pr
      join person p on p.id = pr.person_id
      join company c on c.id = p.company_id
      join role r on r.id = pr.role_id
      join team t on t.id = pr.team_id
      group by c.code, p.dni, r.source_id
      having count(*) > 1
    `,
  ]);
  const assessmentRows:IdentityRow[] = assessments.map(row => ({ id:row.id, personRoleId:row.personRoleId, periodId:row.periodId, person:row.personRole.person, role:row.personRole.role, team:row.personRole.team, period:row.period }));
  const maturityRows:IdentityRow[] = maturities.map(row => ({ id:row.id, personRoleId:row.personRoleId, periodId:row.periodId, person:row.personRole.person, role:row.personRole.role, team:row.personRole.team, period:row.period, calibratedAt:row.calibratedAt }));
  const transferableAssessments = assessmentRows.filter(row => !maturityTransferExclusion(identityOf(row)));
  const transferableMaturities = maturityRows.filter(row => !maturityTransferExclusion(identityOf(row)));
  const transferableAssessmentIds = transferableAssessments.map(row => row.id);
  const [transferableResponses, transferableResultDetails] = await Promise.all([
    prisma.selfAssessmentResponse.count({ where:{ selfAssessmentId:{ in:transferableAssessmentIds } } }),
    prisma.assessmentResultDetail.count({ where:{ selfAssessmentId:{ in:transferableAssessmentIds } } }),
  ]);
  const maturityByAssessment = new Set(maturities.map(row => row.selfAssessmentId).filter(Boolean));
  const byRolePeriod = new Map<string, {roleCode:string;roleName:string;periodCode:string;assessments:number;maturities:number;calibrations:number}>();
  for (const row of transferableAssessments) {
    const key = `${row.role.sourceId}|${row.period.code}`;
    const item = byRolePeriod.get(key) ?? { roleCode:row.role.sourceId, roleName:row.role.name, periodCode:row.period.code, assessments:0, maturities:0, calibrations:0 };
    item.assessments += 1; byRolePeriod.set(key, item);
  }
  for (const row of transferableMaturities) {
    const key = `${row.role.sourceId}|${row.period.code}`;
    const item = byRolePeriod.get(key) ?? { roleCode:row.role.sourceId, roleName:row.role.name, periodCode:row.period.code, assessments:0, maturities:0, calibrations:0 };
    item.maturities += 1; if (row.calibratedAt) item.calibrations += 1; byRolePeriod.set(key, item);
  }
  const assessmentDuplicates = groupDuplicates(transferableAssessments);
  const maturityDuplicates = groupDuplicates(transferableMaturities);
  const excludedByKey = new Map<string, {identity:ReturnType<typeof identityOf>;reason:string;selfAssessments:number;roleMaturities:number}>();
  for (const row of [...assessmentRows, ...maturityRows]) {
    const identity = identityOf(row), exclusion = maturityTransferExclusion(identity);
    if (!exclusion) continue;
    const key = identityKey(row), current = excludedByKey.get(key) ?? { identity, reason:exclusion.reason, selfAssessments:0, roleMaturities:0 };
    if (assessmentRows.includes(row)) current.selfAssessments += 1;
    else current.roleMaturities += 1;
    excludedByKey.set(key, current);
  }
  const report = {
    sourceDatabase,
    generatedAt:new Date().toISOString(),
    identityRule:"companyCode + personDni + roleCode + periodCode",
    counts:{ models, modelVersions:versions, selfAssessments:assessments.length, responses, resultDetails:details, roleMaturities:maturities.length, finalCalibrations:maturities.filter(row => row.calibratedAt).length },
    transferableCounts:{ selfAssessments:transferableAssessments.length, responses:transferableResponses, resultDetails:transferableResultDetails, roleMaturities:transferableMaturities.length, finalCalibrations:transferableMaturities.filter(row => row.calibratedAt).length },
    excludedRecords:[...excludedByKey.values()],
    byRolePeriod:[...byRolePeriod.values()].sort((a, b) => a.periodCode.localeCompare(b.periodCode) || a.roleCode.localeCompare(b.roleCode)),
    validation:{
      duplicateSelfAssessments:assessmentDuplicates,
      duplicateRoleMaturities:maturityDuplicates,
      duplicatePersonRoleAssignments:duplicateAssignments.map(row => ({ ...row, assignments:Number(row.assignments) })),
      selfAssessmentsWithoutMaturity:assessments.filter(row => !maturityTransferExclusion({ companyCode:row.personRole.person.company.code, personDni:row.personRole.person.dni, roleCode:row.personRole.role.sourceId, periodCode:row.period.code }) && !maturityByAssessment.has(row.id)).map(row => ({ companyCode:row.personRole.person.company.code, personDni:row.personRole.person.dni, roleCode:row.personRole.role.sourceId, periodCode:row.period.code })),
    },
    readyForTargetSimulation:assessmentDuplicates.length === 0 && maturityDuplicates.length === 0 && duplicateAssignments.length === 0,
  };
  console.log(JSON.stringify(report, null, 2));
}

main().finally(async () => prisma.$disconnect());
