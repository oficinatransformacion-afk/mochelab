import { Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { timingSafeEqual } from "crypto";
import { PrismaService } from "../database/prisma.service";

export const PORTFOLIO_HEADERS = [
  "ID_INICIATIVA", "ID_TEAM", "EMPRESA", "ANIO", "CICLO", "AREA_ENFOQUE", "NIVEL", "PROGRAMA",
  "OBJETIVO", "RESULTADO_CLAVE", "TIPO_INICIATIVA", "TALLA", "INICIATIVA", "RELEASE",
  "FECHA_INICIO_EJECUCION", "FECHA_FIN_EJECUCION", "PRIORIDAD", "DUENO_PRODUCTO", "ATF/GESTOR",
  "LIDER_TECNICO", "TIPO_GESTION", "ESTADO_INICIATIVA", "HITO ACOMPAÑAMIENTO", "ESCALAMIENTO",
  "HORIZONTE_RETORNO", "TI_CAPACITY", "CATEGORIA", "IMPACTO", "DESCRIPCION_IMPACTO",
  "BENEFICIO_ECONOMICO_PROYECTADO", "BENEFICIO_ECONOMICO_EJECUTADO",
  "BENEFICIO_MITIGACION_PROYECTADO", "BENEFICIO_MITIGACION_EJECUTADO", "BENEFICIO_POTENCIAL_ANUAL",
  "OBSERVACIONES", "LINK_DOCUMENTACION", "FECHA_CREACION", "ID_OKR",
] as const;

type PortfolioRecord = Record<(typeof PORTFOLIO_HEADERS)[number], string | number | null>;

@Injectable()
export class PortfolioExportService {
  constructor(private readonly prisma: PrismaService) {}

  private verifyKey(received?: string) {
    if (process.env.PORTFOLIO_EXPORT_ENABLED !== "true") {
      throw new ServiceUnavailableException("La exportación temporal de Portafolio está desactivada");
    }
    const expected = process.env.PORTFOLIO_EXPORT_SECRET?.trim();
    if (!expected || expected.length < 32) {
      throw new ServiceUnavailableException("La exportación temporal de Portafolio no está configurada");
    }
    if (!received || received.length !== expected.length || !timingSafeEqual(Buffer.from(received), Buffer.from(expected))) {
      throw new UnauthorizedException("Clave de integración inválida");
    }
  }

  async export(key?: string) {
    this.verifyKey(key);
    this.prisma.requireConnection();
    const records = await this.prisma.$queryRaw<PortfolioRecord[]>(Prisma.sql`
      with responsible_people as (
        select ir.initiative_id,
          string_agg(distinct p.names, '; ' order by p.names) filter (where ir.responsibility_type = 'PRODUCT_OWNER') as product_owners,
          string_agg(distinct p.names, '; ' order by p.names) filter (where ir.responsibility_type in ('ATF', 'MANAGER', 'IMPROVEMENT_SUPERVISOR')) as atf_managers,
          string_agg(distinct p.names, '; ' order by p.names) filter (where ir.responsibility_type = 'TECHNICAL_LEAD') as technical_leads
        from initiative_responsible ir
        join person_role pr on pr.id = ir.person_role_id
        join person p on p.id = pr.person_id
        group by ir.initiative_id
      )
      select
        i.source_id::text as "ID_INICIATIVA", coalesce(t.source_id, '') as "ID_TEAM", c.name as "EMPRESA",
        i.year as "ANIO", cyc.name as "CICLO", fa.name as "AREA_ENFOQUE", lvl.name as "NIVEL",
        prog.name as "PROGRAMA", coalesce(o.objective, i.objective_legacy, '') as "OBJETIVO",
        coalesce(o.key_result, i.key_result_legacy, '') as "RESULTADO_CLAVE", typ.name as "TIPO_INICIATIVA",
        siz.name as "TALLA", i.name as "INICIATIVA", coalesce(i.release, '') as "RELEASE",
        coalesce(to_char(i.execution_start, 'YYYY-MM-DD'), '') as "FECHA_INICIO_EJECUCION",
        coalesce(to_char(i.execution_end, 'YYYY-MM-DD'), '') as "FECHA_FIN_EJECUCION",
        coalesce(pri.name, '') as "PRIORIDAD", coalesce(rp.product_owners, i.product_owner, '') as "DUENO_PRODUCTO",
        coalesce(rp.atf_managers, i.manager, '') as "ATF/GESTOR",
        coalesce(rp.technical_leads, i.technical_lead, '') as "LIDER_TECNICO", mt.name as "TIPO_GESTION",
        st.name as "ESTADO_INICIATIVA", coalesce(i.accompaniment_milestone, '') as "HITO ACOMPAÑAMIENTO",
        coalesce(esc.name, '') as "ESCALAMIENTO", coalesce(rh.name, '') as "HORIZONTE_RETORNO",
        coalesce(tic.name, '') as "TI_CAPACITY", coalesce(cat.name, '') as "CATEGORIA", imp.name as "IMPACTO",
        coalesce(i.impact_description, '') as "DESCRIPCION_IMPACTO",
        coalesce(i.projected_economic_benefit::text, '') as "BENEFICIO_ECONOMICO_PROYECTADO",
        coalesce(i.actual_economic_benefit::text, '') as "BENEFICIO_ECONOMICO_EJECUTADO",
        coalesce(i.projected_mitigation_benefit::text, '') as "BENEFICIO_MITIGACION_PROYECTADO",
        coalesce(i.actual_mitigation_benefit::text, '') as "BENEFICIO_MITIGACION_EJECUTADO",
        coalesce(i.annual_potential_benefit::text, '') as "BENEFICIO_POTENCIAL_ANUAL",
        coalesce(i.observations, '') as "OBSERVACIONES", coalesce(i.documentation_url, '') as "LINK_DOCUMENTACION",
        coalesce(to_char(i.source_created_at, 'YYYY-MM-DD HH24:MI:SS'), to_char(i.created_at, 'YYYY-MM-DD HH24:MI:SS')) as "FECHA_CREACION",
        o.source_id::text as "ID_OKR"
      from initiative i
      left join team t on t.id = i.team_id
      join company c on c.id = i.company_id
      join catalog_value cyc on cyc.id = i.cycle_id
      join catalog_value fa on fa.id = i.focus_area_id
      join catalog_value lvl on lvl.id = i.level_id
      join program prog on prog.id = i.program_id
      join objective o on o.id = i.objective_id
      join catalog_value typ on typ.id = i.type_id
      join catalog_value siz on siz.id = i.size_id
      left join catalog_value pri on pri.id = i.priority_id
      join catalog_value mt on mt.id = i.management_type_id
      join catalog_value st on st.id = i.status_id
      left join catalog_value esc on esc.id = i.escalation_id
      left join catalog_value rh on rh.id = i.return_horizon_id
      left join catalog_value tic on tic.id = i.ti_capacity_id
      left join catalog_value cat on cat.id = i.category_id
      join catalog_value imp on imp.id = i.impact_id
      left join responsible_people rp on rp.initiative_id = i.id
      order by i.source_id
    `);
    const ids = records.map((record) => String(record.ID_INICIATIVA));
    if (new Set(ids).size !== ids.length) {
      throw new ServiceUnavailableException("La exportación contiene ID_INICIATIVA duplicados");
    }
    const rows = records.map((record) => PORTFOLIO_HEADERS.map((header) => record[header] ?? ""));
    return { headers: [...PORTFOLIO_HEADERS], rows, meta: { columns: PORTFOLIO_HEADERS.length, records: rows.length, generatedAt: new Date().toISOString() } };
  }
}
