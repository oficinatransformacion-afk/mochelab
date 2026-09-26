const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("../apps/api/node_modules/pg");

function readEnvValue(filePath, key) {
  const content = fs.readFileSync(filePath, "utf8");
  const line = content.split(/\r?\n/).find((candidate) => candidate.startsWith(`${key}=`));
  if (!line) throw new Error(`${key} no está configurada en ${filePath}`);
  return line.slice(key.length + 1).trim().replace(/^"|"$/g, "");
}

function targetDatabase() {
  const argument = process.argv.find((item) => item.startsWith("--database="));
  const database = argument?.slice("--database=".length) || "mochelab_dev";
  if (!["mochelab_dev", "mochelab_prod"].includes(database)) {
    throw new Error(`BLOQUEADO: ${database} no es un destino permitido para esta auditoría`);
  }
  return database;
}

function targetUrl(database) {
  const url = new URL(readEnvValue(path.resolve(".env"), "DATABASE_URL"));
  url.pathname = `/${database}`;
  url.searchParams.delete("sslmode");
  url.searchParams.delete("sslcert");
  url.searchParams.delete("sslkey");
  url.searchParams.delete("sslrootcert");
  return url.toString();
}

const source = JSON.parse(fs.readFileSync(path.resolve(".artifact-work/atf-responses.local.json"), "utf8"));
const dnis = source.people.map((person) => person.dni);
const pool = new Pool({
  connectionString: targetUrl(targetDatabase()),
  ssl: {
    ca: fs.readFileSync(path.resolve(".certs/ca.pem"), "utf8"),
    rejectUnauthorized: true,
  },
});

async function main() {
  const expectedDatabase = targetDatabase();
  const database = await pool.query("select current_database() as name");
  if (database.rows[0]?.name !== expectedDatabase) {
    throw new Error(`BLOQUEADO: se esperaba ${expectedDatabase} y se obtuvo ${database.rows[0]?.name ?? "desconocida"}`);
  }

  await pool.query("begin read only");
  try {
    const requiredTables = [
      "assessment_model", "assessment_model_version", "assessment_section",
      "assessment_dimension_version", "assessment_item_version", "period_assessment_model",
      "assessment_result_detail", "role_self_assessment", "role_maturity",
    ];
    const schemaTables = await pool.query(
      `select table_name from information_schema.tables where table_schema = 'public' and table_name = any($1::text[])`,
      [requiredTables],
    );
    const schemaColumns = await pool.query(
      `select table_name, column_name from information_schema.columns
        where table_schema = 'public'
          and ((table_name = 'person_role' and column_name = 'development_path_mode')
            or (table_name = 'role_self_assessment' and column_name in ('person_id','role_id','model_version_id','submission_mode'))
            or (table_name = 'role_maturity' and column_name in ('person_id','role_id','model_version_id')))`,
    );
    const foundTables = new Set(schemaTables.rows.map((row) => row.table_name));
    const foundColumns = new Set(schemaColumns.rows.map((row) => `${row.table_name}.${row.column_name}`));
    const requiredColumns = [
      "person_role.development_path_mode", "role_self_assessment.person_id", "role_self_assessment.role_id",
      "role_self_assessment.model_version_id", "role_self_assessment.submission_mode",
      "role_maturity.person_id", "role_maturity.role_id", "role_maturity.model_version_id",
    ];
    const missingTables = requiredTables.filter((table) => !foundTables.has(table));
    const missingColumns = requiredColumns.filter((column) => !foundColumns.has(column));
    if (missingTables.length || missingColumns.length) {
      console.log(JSON.stringify({
        environment: expectedDatabase === "mochelab_prod" ? "PRODUCCIÓN" : "PRUEBAS",
        database: database.rows[0].name,
        readyForAtfImport: false,
        missingTables,
        missingColumns,
        nextStep: "Desplegar primero las migraciones validadas en PRUEBAS y repetir esta auditoría",
      }, null, 2));
      return;
    }
    const roles = await pool.query(
      `select id, source_id as "sourceId", name
         from role
        where upper(name) = 'ATF' or source_id = 'MAT-07'
        order by source_id`,
    );
    const people = await pool.query(
      `select p.id, p.dni, p.names as "fullName", p.email,
              count(distinct case when r.id is not null then pr.id end)::int as "atfAssignmentCount",
              count(distinct rsa.id)::int as "assessmentCount",
              count(distinct rm.id)::int as "maturityCount",
              count(distinct case when rm.calibrated_at is not null then rm.id end)::int as "calibratedCount"
         from person p
         left join person_role pr on pr.person_id = p.id
         left join role r on r.id = pr.role_id and (upper(r.name) = 'ATF' or r.source_id = 'MAT-07')
         left join role_self_assessment rsa on rsa.person_role_id = pr.id and r.id is not null
         left join role_maturity rm on rm.person_role_id = pr.id and r.id is not null
        where p.dni = any($1::text[])
        group by p.id, p.dni, p.names, p.email
        order by p.dni`,
      [dnis],
    );
    const periods = await pool.query(
      `select p.code, p.name, p.active, cv.code as status,
              count(distinct rsa.id)::int as "atfAssessmentCount"
         from period p
         join catalog_value cv on cv.id = p.status_id
         left join role_self_assessment rsa on rsa.period_id = p.id
         left join person_role pr on pr.id = rsa.person_role_id
         left join role r on r.id = pr.role_id and (upper(r.name) = 'ATF' or r.source_id = 'MAT-07')
        group by p.id, cv.code
        order by p.start_date desc`,
    );
    const assignments = await pool.query(
      `select p.dni, p.names as "fullName", r.source_id as "roleSourceId", r.name as "roleName",
              t.source_id as "teamSourceId", pg.name as "programName", pr.development_path_mode::text as "developmentPathMode"
         from person p
         join person_role pr on pr.person_id = p.id
         join role r on r.id = pr.role_id
         join team t on t.id = pr.team_id
         join program pg on pg.id = t.program_id
        where p.dni = any($1::text[])
          and (upper(r.name) = 'ATF' or r.source_id = 'MAT-07')
        order by p.dni, t.source_id`,
      [dnis],
    );
    const model = await pool.query(
      `select r.source_id as "roleSourceId", r.name as "roleName", am.code as "modelCode",
              amv.version, amv.status::text as status,
              count(distinct aiv.id)::int as "itemCount"
         from role r
         left join assessment_model am on am.role_id = r.id
         left join assessment_model_version amv on amv.assessment_model_id = am.id
         left join assessment_section ase on ase.model_version_id = amv.id
         left join assessment_dimension_version adv on adv.section_id = ase.id
         left join assessment_item_version aiv on aiv.dimension_id = adv.id and aiv.active
        where upper(r.name) = 'ATF' or r.source_id = 'MAT-07'
        group by r.source_id, r.name, am.code, amv.version, amv.status
        order by amv.version`,
    );
    const maturityLevels = await pool.query(
      `select cv.code, cv.name
         from catalog_value cv
         join catalog c on c.id = cv.catalog_id
        where c.code = 'NIVEL_MADUREZ'
        order by cv.sort_order, cv.code`,
    );
    const periodStatuses = await pool.query(
      `select cv.code, cv.name
         from catalog_value cv
         join catalog c on c.id = cv.catalog_id
        where c.code = 'ESTADO_PERIODO_MADUREZ'
        order by cv.sort_order, cv.code`,
    );
    const loaded = await pool.query(
      `select p.dni, p.names as "fullName", rsa.calculated_score::text as "calculatedScore",
              count(distinct sar.behavior_id)::int as "responseCount",
              count(distinct ard.id)::int as "resultDetailCount",
              rm.self_assessment_score::text as "selfAssessmentScore", cv.code as "levelCode",
              rm.calibrated_at as "calibratedAt"
         from role_self_assessment rsa
         join person_role pr on pr.id = rsa.person_role_id
         join person p on p.id = pr.person_id
         join role r on r.id = pr.role_id
         join period pe on pe.id = rsa.period_id
         left join self_assessment_response sar on sar.self_assessment_id = rsa.id
         left join assessment_result_detail ard on ard.self_assessment_id = rsa.id
         left join role_maturity rm on rm.self_assessment_id = rsa.id
         left join catalog_value cv on cv.id = rm.level_id
        where pe.code = '202608' and (upper(r.name) = 'ATF' or r.source_id = 'MAT-07') and p.dni = any($1::text[])
        group by p.dni, p.names, rsa.calculated_score, rm.self_assessment_score, cv.code, rm.calibrated_at
        order by p.dni`,
      [dnis],
    );

    const foundDnis = new Set(people.rows.map((person) => person.dni));
    const report = {
      environment: expectedDatabase === "mochelab_prod" ? "PRODUCCIÓN" : "PRUEBAS",
      database: database.rows[0].name,
      source: {
        modelVersion: source.modelVersion,
        people: source.people.length,
        responses: source.people.reduce((sum, person) => sum + person.answers.length, 0),
        dnis,
      },
      target: {
        roles: roles.rows,
        people: people.rows,
        assignments: assignments.rows,
        missingDnis: dnis.filter((dni) => !foundDnis.has(dni)),
        periods: periods.rows,
        models: model.rows,
        maturityLevels: maturityLevels.rows,
        periodStatuses: periodStatuses.rows,
        loadedAssessments: loaded.rows,
      },
    };
    if (process.argv.includes("--backup")) {
      const stamp = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
      const directory = path.resolve(".artifact-work/backups");
      fs.mkdirSync(directory, { recursive: true });
      const backupPath = path.join(directory, `${expectedDatabase}_atf_202608_before_${stamp}.json`);
      fs.writeFileSync(backupPath, JSON.stringify(report, null, 2), "utf8");
      report.backupPath = backupPath;
    }
    if (process.argv.includes("--concise")) {
      console.log(JSON.stringify({
        environment: report.environment,
        database: report.database,
        source: report.source,
        models: report.target.models,
        periodStatuses: report.target.periodStatuses,
        loadedAssessments: report.target.loadedAssessments,
      }, null, 2));
    } else {
      console.log(JSON.stringify(report, null, 2));
    }
  } finally {
    await pool.query("rollback");
  }
}

main().finally(() => pool.end());
