import { useEffect, useMemo, useState } from "react";
import type { UserCapabilities } from "@mochelab/shared";
import { AlertTriangle, ArrowRight, BriefcaseBusiness, ClipboardCheck, GraduationCap, RefreshCw, Target, Users } from "lucide-react";
import { MultiSelect } from "../components/MultiSelect";
import { apiUrl, demoHeaders } from "../directory/DirectoryShell";

type Group = { name: string; value: number };
type Data = {
  filters: { teams: { id: string; label: string }[]; periods: { id: string; label: string; status: string }[] };
  capabilities: { people: number; assignments: number; courses: number; completedCourses: number; pendingCourses: number; learningCompletion: number; roleMaturityAverage: number; teamMaturityAverage: number; roleLevels: Group[]; teamLevels: Group[] };
  strategy: { objectives: number; objectiveAverage: number; objectiveStatuses: Group[]; initiatives: number; initiativeStatuses: Group[]; projectedBenefit: number; actualBenefit: number };
};

const money = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", maximumFractionDigits: 0 });
const total = (groups: Group[]) => groups.reduce((sum, item) => sum + item.value, 0);
const attention = (groups: Group[]) => groups.filter(item => /riesgo|atras|pendiente|sin resultado|deten/i.test(item.name)).reduce((sum, item) => sum + item.value, 0);

export function DashboardPage({ loadCapabilities }: { loadCapabilities: () => Promise<UserCapabilities> }) {
  const [data, setData] = useState<Data | null>(null);
  const [, setAccess] = useState<UserCapabilities | null>(null);
  const [tab, setTab] = useState<"capabilities" | "strategy">("capabilities");
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [periodIds, setPeriodIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => { void loadCapabilities().then(setAccess).catch(error => setError(error.message)); }, [loadCapabilities]);
  useEffect(() => {
    const query = new URLSearchParams();
    if (teamIds.length) query.set("teamIds", teamIds.join(","));
    if (periodIds.length) query.set("periodIds", periodIds.join(","));
    setError("");
    fetch(`${apiUrl}/api/dashboard?${query}`, { headers: demoHeaders })
      .then(async response => { if (!response.ok) throw new Error("No se pudo cargar el resumen ejecutivo"); return response.json() as Promise<Data>; })
      .then(setData)
      .catch(reason => setError(reason instanceof Error ? reason.message : "Error inesperado"));
  }, [teamIds, periodIds, reload]);

  const roleEvaluations = data ? total(data.capabilities.roleLevels) : 0;
  const pendingMaturity = data ? Math.max(0, data.capabilities.assignments - roleEvaluations) : 0;
  const strategyAlerts = useMemo(() => data ? attention(data.strategy.objectiveStatuses) + attention(data.strategy.initiativeStatuses) : 0, [data]);

  return <main className="min-h-screen bg-slate-50 text-slate-950">
    <div className="mx-auto max-w-7xl px-5 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-sm font-bold uppercase tracking-[0.16em] text-emerald-700">Resumen ejecutivo</p><h1 className="mt-2 text-3xl font-bold">Visión integral de Mochelab</h1><p className="mt-2 text-slate-600">Primero lo que está ocurriendo; luego, dónde intervenir.</p></div>
        <button type="button" onClick={() => setReload(value => value + 1)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:border-slate-300" title="Volver a consultar los indicadores con los filtros actuales"><RefreshCw size={16}/>Actualizar datos</button>
      </header>

      <section className="mt-6 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2">
        <MultiSelect label="Equipos" options={data?.filters.teams ?? []} value={teamIds} onChange={setTeamIds} emptyLabel="Todos los equipos"/>
        <MultiSelect label="Períodos" options={(data?.filters.periods ?? []).map(({ id, label }) => ({ id, label }))} value={periodIds} onChange={setPeriodIds} emptyLabel="Todos los períodos"/>
      </section>

      <nav className="mt-6 flex gap-2 border-b border-slate-200" aria-label="Perspectiva del resumen">
        <Tab active={tab === "capabilities"} onClick={() => setTab("capabilities")}>Capacidades</Tab>
        <Tab active={tab === "strategy"} onClick={() => setTab("strategy")}>Estrategia</Tab>
      </nav>
      {error && <p className="mt-5 rounded-xl bg-rose-100 p-4 font-bold text-rose-800">{error}</p>}

      {data && tab === "capabilities" && <>
        <SectionTitle title="Estado general" subtitle="Lectura rápida de personas, asignaciones, aprendizaje y madurez."/>
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi icon={<Users size={19}/>} label="Personas activas" value={data.capabilities.people} href="/personas" action="Ver personas"/>
          <Kpi icon={<BriefcaseBusiness size={19}/>} label="Roles asignados" value={data.capabilities.assignments} href="/asignaciones" action="Gestionar asignaciones"/>
          <Kpi icon={<GraduationCap size={19}/>} label="Avance formativo" value={`${data.capabilities.learningCompletion}%`} href="/rutas" action="Revisar rutas"/>
          <Kpi icon={<Target size={19}/>} label="Madurez promedio de roles" value={data.capabilities.roleMaturityAverage.toFixed(2)} href="/madurez/equipos" action="Analizar madurez"/>
        </section>

        <SectionTitle title="Requiere atención" subtitle="Pendientes que ameritan intervención operativa."/>
        <section className="grid gap-4 lg:grid-cols-2">
          <AlertCard value={data.capabilities.pendingCourses} title="Cursos pendientes" detail={`De ${data.capabilities.courses} cursos asignados`} href="/rutas" action="Revisar rutas de aprendizaje"/>
          <AlertCard value={pendingMaturity} title="Asignaciones sin evaluación de madurez" detail={`${roleEvaluations} evaluaciones registradas para los filtros actuales`} href="/madurez/equipos" action="Revisar pendientes de madurez"/>
        </section>

        <SectionTitle title="Prioridades para hoy" subtitle="Accesos directos a las intervenciones con mayor impacto operativo."/>
        <ActionQueue items={[
          { value: data.capabilities.pendingCourses, title: "Acompañar rutas con cursos pendientes", detail: "Revisa el avance y actualiza los cursos de las personas con menor progreso.", href: "/rutas", action: "Ir a rutas" },
          { value: pendingMaturity, title: "Completar evaluaciones de madurez", detail: "Consolida resultados faltantes de roles y equipos para el período seleccionado.", href: "/madurez/equipos", action: "Ir a madurez" },
          { value: data.capabilities.assignments, title: "Validar asignaciones activas", detail: "Confirma que las personas tengan el rol y equipo correctos antes de medir su avance.", href: "/asignaciones", action: "Ir a asignaciones" }
        ]}/>

        <SectionTitle title="Distribución y contexto" subtitle="Composición de los resultados actuales; no representa una tendencia histórica."/>
        <section className="grid gap-5 lg:grid-cols-2">
          <Distribution title="Nivel de madurez de roles" value={data.capabilities.roleMaturityAverage.toFixed(2)} groups={data.capabilities.roleLevels} href="/madurez/equipos"/>
          <Distribution title="Nivel de madurez de equipos" value={data.capabilities.teamMaturityAverage.toFixed(2)} groups={data.capabilities.teamLevels} href="/madurez/equipos"/>
        </section>
      </>}

      {data && tab === "strategy" && <>
        <SectionTitle title="Estado general" subtitle="Resultados clave del ciclo estratégico y su portafolio."/>
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi icon={<Target size={19}/>} label="Objetivos" value={data.strategy.objectives} href="/objetivos" action="Ver objetivos"/>
          <Kpi icon={<Target size={19}/>} label="Cumplimiento OKR" value={`${data.strategy.objectiveAverage}%`} href="/objetivos" action="Analizar cumplimiento"/>
          <Kpi icon={<BriefcaseBusiness size={19}/>} label="Iniciativas" value={data.strategy.initiatives} href="/portafolio" action="Ver portafolio"/>
          <Kpi icon={<BriefcaseBusiness size={19}/>} label="Beneficio real" value={money.format(data.strategy.actualBenefit)} href="/portafolio" action="Revisar beneficios"/>
        </section>

        <SectionTitle title="Requiere atención" subtitle="Objetivos e iniciativas en estados que demandan seguimiento."/>
        <section className="grid gap-4 lg:grid-cols-2">
          <AlertCard value={attention(data.strategy.objectiveStatuses)} title="Objetivos con alerta" detail={`${data.strategy.objectives} objetivos en el alcance actual`} href="/objetivos" action="Revisar objetivos"/>
          <AlertCard value={attention(data.strategy.initiativeStatuses)} title="Iniciativas con alerta" detail={`${strategyAlerts} alertas estratégicas en total`} href="/portafolio" action="Revisar portafolio"/>
        </section>

        <SectionTitle title="Distribución y contexto" subtitle="Cómo se distribuyen los estados del alcance seleccionado."/>
        <section className="grid gap-5 lg:grid-cols-2">
          <Distribution title="Estado de objetivos" value={`${data.strategy.objectiveAverage}%`} groups={data.strategy.objectiveStatuses} href="/objetivos"/>
          <Distribution title="Estado del portafolio" value={`${data.strategy.initiatives}`} groups={data.strategy.initiativeStatuses} href="/portafolio"/>
        </section>
      </>}
    </div>
  </main>;
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) { return <button type="button" onClick={onClick} className={`border-b-2 px-4 py-3 text-sm font-bold ${active ? "border-slate-950 text-slate-950" : "border-transparent text-slate-400 hover:text-slate-700"}`}>{children}</button>; }
function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) { return <div className="mb-3 mt-7"><h2 className="text-lg font-bold">{title}</h2><p className="mt-1 text-sm text-slate-500">{subtitle}</p></div>; }
function Kpi({ icon, label, value, href, action }: { icon: React.ReactNode; label: string; value: string | number; href: string; action: string }) { return <a href={href} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300"><span className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-50 text-cyan-600">{icon}</span><p className="mt-4 text-sm font-semibold text-slate-500">{label}</p><strong className="mt-1 block text-3xl">{value}</strong><span className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-emerald-700">{action}<ArrowRight size={14} className="transition group-hover:translate-x-1"/></span></a>; }
function AlertCard({ value, title, detail, href, action }: { value: number; title: string; detail: string; href: string; action: string }) { return <a href={href} className="group flex items-center gap-4 rounded-2xl border border-rose-100 bg-white p-5 shadow-sm hover:border-rose-200"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-rose-50 text-rose-600"><AlertTriangle size={21}/></span><div className="min-w-0 flex-1"><div className="flex items-baseline gap-2"><strong className="text-2xl text-rose-700">{value}</strong><h3 className="font-bold">{title}</h3></div><p className="mt-1 text-sm text-slate-500">{detail}</p><span className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-red-700">{action}<ArrowRight size={14}/></span></div></a>; }
function ActionQueue({items}:{items:{value:number;title:string;detail:string;href:string;action:string}[]}){return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center gap-3 border-b px-5 py-4"><span className="grid h-9 w-9 place-items-center rounded-xl bg-red-50 text-red-700"><ClipboardCheck size={18}/></span><div><h3 className="font-bold">Cola de acción</h3><p className="text-sm text-slate-500">Empieza por los pendientes más relevantes.</p></div></div><div className="divide-y">{items.sort((a,b)=>b.value-a.value).map((item,index)=><a key={item.title} href={item.href} className="group flex items-center gap-4 px-5 py-4 hover:bg-slate-50"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-bold text-slate-700">{index+1}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h4 className="font-bold">{item.title}</h4><span className="ds-badge ds-badge-danger">{item.value}</span></div><p className="mt-1 text-sm text-slate-500">{item.detail}</p></div><span className="hidden shrink-0 items-center gap-1 text-sm font-bold text-red-700 sm:inline-flex">{item.action}<ArrowRight size={14}/></span></a>)}</div></section>}
function Distribution({ title, value, groups, href }: { title: string; value: string; groups: Group[]; href: string }) { const maximum = Math.max(1, ...groups.map(item => item.value)); return <a href={href} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-start justify-between gap-3"><h3 className="font-bold">{title}</h3><strong className="text-2xl text-emerald-700">{value}</strong></div><div className="mt-5 space-y-4">{groups.map(item => <div key={item.name}><div className="mb-1.5 flex justify-between gap-3 text-sm"><span className="truncate text-slate-600">{item.name}</span><strong>{item.value}</strong></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-cyan-500" style={{ width: `${item.value * 100 / maximum}%` }}/></div></div>)}{!groups.length && <p className="text-sm text-slate-500">Sin resultados para los filtros seleccionados.</p>}</div></a>; }
