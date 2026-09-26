import { useEffect, useMemo, useState } from "react";
import { Award, BookOpenCheck, BriefcaseBusiness, Building2, Mail, MapPin, Phone, UsersRound } from "lucide-react";
import { apiUrl, demoHeaders, DirectoryShell } from "./DirectoryShell";

type CourseRow = { id: string; score: string | null; course: { name: string; module: { name: string } }; status: { name: string } };
type MaturityRow = { id: string; roleId:string;score: string; calibratedScore: string | null; evaluatedAt: string; period: { name: string }; level: { name: string };role:{name:string};modelVersion:{version:string;assessmentModel:{name:string}}|null };
type AssignmentRow = { id: string; roleId:string;startDate: string | null; endDate: string | null; role: { name: string }; team: { sourceId: string; program: { name: string } }; status: { name: string }; onboardingStatus: { name: string }; courses: CourseRow[] };
type Profile = { id: string; dni: string; names: string; email: string | null; phone: string | null; position: string | null; company: { name: string }; management: { name: string } | null; division: { name: string } | null; businessPartnerValue: { name: string } | null; occupationLevel: { name: string } | null; status: { name: string }; maturityResults:MaturityRow[];assignments: AssignmentRow[] };

const completed = (course: CourseRow) => course.status.name.toUpperCase() === "TERMINADO";
const displayScore = (value: string | null) => value === null ? "—" : Number(value).toFixed(2);

export function PersonProfilePage({ personId }: { personId: string }) {
  const [data, setData] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch(`${apiUrl}/api/people/${personId}/profile`, { headers: demoHeaders })
      .then(async response => { if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message ?? "No se pudo cargar el perfil"); return response.json() as Promise<Profile>; })
      .then(setData).catch(reason => setError(reason instanceof Error ? reason.message : "Error inesperado"));
  }, [personId]);

  const summary = useMemo(() => {
    const assignments = data?.assignments ?? [];
    const courses = assignments.flatMap(assignment => assignment.courses);
    const completedCourses = courses.filter(completed).length;
    const latestMaturity = data?.maturityResults[0];
    const uniqueRoles=new Set(assignments.map(item=>item.roleId));
    const evaluatedRoles=new Set(data?.maturityResults.map(item=>item.roleId)??[]);
    return { assignments, courses, completedCourses, progress: courses.length ? Math.round((completedCourses / courses.length) * 100) : 0, latestMaturity,uniqueRoles:uniqueRoles.size,evaluatedRoles:evaluatedRoles.size };
  }, [data]);
  const maturityByRole=useMemo(()=>{const map=new Map<string,{role:string;teams:string[];rows:MaturityRow[]}>();if(!data)return[];for(const result of data.maturityResults){const current=map.get(result.roleId)??{role:result.role.name,teams:[],rows:[]};current.rows.push(result);current.teams=[...new Set(data.assignments.filter(item=>item.roleId===result.roleId).map(item=>`${item.team.sourceId} · ${item.team.program.name}`))];map.set(result.roleId,current)}return[...map.values()]},[data]);

  return <DirectoryShell title="Perfil 360" description="Vista consolidada de la persona, sus asignaciones, aprendizaje y madurez." active="people">
    {error && <p className="mt-8 rounded-xl bg-rose-100 p-4 font-semibold text-rose-800">{error}</p>}
    {!data && !error && <p className="mt-8 rounded-xl border bg-white p-6 text-slate-500">Cargando perfil de la persona…</p>}
    {data && <div className="mt-8 space-y-5">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-950 shadow-sm">
        <div className="grid gap-5 p-5 2xl:grid-cols-[auto_minmax(0,1fr)_auto] 2xl:items-center">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-slate-100 text-2xl font-bold text-slate-600">{data.names.charAt(0)}</div>
          <div><p className="text-xs font-semibold uppercase tracking-[.12em] text-slate-400">Perfil de colaborador</p><h2 className="mt-1 text-2xl font-bold text-slate-800">{data.names}</h2><p className="mt-1 text-sm text-slate-500">DNI {data.dni} · {data.position ?? data.occupationLevel?.name ?? "Sin puesto registrado"}</p></div>
          <span className="justify-self-start rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 lg:justify-self-end">{data.status.name}</span>
        </div>
        <div className="grid border-t border-slate-100 text-sm sm:grid-cols-2 lg:grid-cols-6">
          <Info icon={Building2} label="Empresa" value={data.company.name} /><Info icon={MapPin} label="Gerencia" value={data.management?.name ?? "Sin asignar"} /><Info icon={MapPin} label="División" value={data.division?.name ?? "Sin asignar"} /><Info icon={UsersRound} label="Business Partner" value={data.businessPartnerValue?.name ?? "Sin asignar"} /><Info icon={Mail} label="Correo" value={data.email ?? "Sin correo"} /><Info icon={Phone} label="Teléfono" value={data.phone ?? "Sin teléfono"} />
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={BriefcaseBusiness} label="Asignaciones" value={summary.assignments.length} detail="Roles vinculados" tone="brand" />
        <Metric icon={BookOpenCheck} label="Avance formativo" value={`${summary.progress}%`} detail={`${summary.completedCourses} de ${summary.courses.length} cursos completados`} tone="cyan" />
        <Metric icon={Award} label="Roles evaluados" value={`${summary.evaluatedRoles} de ${summary.uniqueRoles}`} detail={summary.latestMaturity ? `Último resultado: ${summary.latestMaturity.period.name}` : "Pendiente de evaluación"} tone="success" />
        <Metric icon={Phone} label="Cursos pendientes" value={summary.courses.length - summary.completedCourses} detail="Requieren seguimiento" tone="warning" />
      </section>

      <section className="rounded-2xl border bg-white p-6 shadow-sm"><div><p className="text-xs font-bold uppercase tracking-[.12em] text-[#d71920]">Capacidad personal</p><h2 className="mt-1 text-xl font-extrabold">Madurez por rol</h2><p className="mt-1 text-sm text-slate-500">Un resultado por persona, rol, período y modelo; los equipos se muestran únicamente como contexto.</p></div><div className="mt-5 grid gap-4 lg:grid-cols-2">{maturityByRole.map(group=>{const latest=group.rows[0];return <article key={latest.roleId} className="rounded-xl border border-slate-200 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3>{group.role}</h3><p className="mt-1 text-sm text-slate-500">{latest.modelVersion?`${latest.modelVersion.assessmentModel.name} · ${latest.modelVersion.version}`:"Modelo histórico no identificado"}</p></div><div className="text-right"><span className="ds-badge ds-badge-success">{latest.level.name}</span><strong className="mt-2 block text-2xl">{displayScore(latest.calibratedScore??latest.score)}</strong></div></div><div className="mt-4 flex flex-wrap gap-2">{group.teams.map(team=><span key={team} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{team}</span>)}</div><ol className="mt-5 space-y-3 border-l-2 border-[#7fe8f7] pl-5">{group.rows.map(row=><li key={row.id}><p className="text-sm font-bold">{row.period.name}</p><p className="text-sm text-slate-600">{row.level.name} · {displayScore(row.calibratedScore??row.score)}</p></li>)}</ol></article>})}{!maturityByRole.length&&<p className="rounded-xl border border-dashed p-4 text-sm text-slate-500">Aún no se registran evaluaciones de madurez para sus roles.</p>}</div></section>

      {summary.assignments.length ? summary.assignments.map(assignment => {
        const done = assignment.courses.filter(completed).length;
        const progress = assignment.courses.length ? Math.round((done / assignment.courses.length) * 100) : 0;
        return <section key={assignment.id} className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b bg-[#fbfaf9] px-6 py-5">
            <div><p className="text-xs font-bold uppercase tracking-[.12em] text-[#d71920]">Asignación activa</p><h2 className="mt-1 text-xl font-extrabold">{assignment.role.name}</h2><p className="mt-1 text-sm text-slate-500">{assignment.team.sourceId} · {assignment.team.program.name}</p></div>
            <div className="text-right"><span className="ds-badge ds-badge-success">{assignment.status.name}</span><p className="mt-2 text-xs text-slate-500">Onboarding: {assignment.onboardingStatus.name}</p></div>
          </div>
          <div className="grid gap-6 p-6 xl:grid-cols-[1.25fr_.75fr]">
            <div><div className="flex items-end justify-between gap-3"><div><h3>Ruta de aprendizaje</h3><p className="mt-1 text-sm text-slate-500">{done} de {assignment.courses.length} cursos completados</p></div><strong className="text-2xl text-[#008f68]">{progress}%</strong></div><div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#00a87c]" style={{ width: `${progress}%` }} /></div><div className="mt-5 space-y-2">{assignment.courses.length ? assignment.courses.map(course => <div key={course.id} className="flex items-center justify-between gap-4 rounded-xl border border-slate-100 px-4 py-3"><div><strong className="text-sm">{course.course.name}</strong><small className="mt-1 block text-slate-500">{course.course.module.name}</small></div><div className="text-right"><span className={`ds-badge ${completed(course) ? "ds-badge-success" : "ds-badge-warning"}`}>{course.status.name}</span>{course.score !== null && <small className="mt-1 block text-slate-500">Nota: {course.score}</small>}</div></div>) : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No hay cursos configurados para este rol.</p>}</div></div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-5"><div className="flex items-center gap-2"><Award size={18} className="text-[#d71920]" /><h3>Contexto de la asignación</h3></div><dl className="mt-5 space-y-3 text-sm"><div><dt className="text-slate-500">Rol</dt><dd className="font-bold">{assignment.role.name}</dd></div><div><dt className="text-slate-500">Equipo</dt><dd className="font-bold">{assignment.team.sourceId} · {assignment.team.program.name}</dd></div><div><dt className="text-slate-500">Onboarding</dt><dd className="font-bold">{assignment.onboardingStatus.name}</dd></div></dl><p className="mt-5 text-xs text-slate-500">La madurez del rol se muestra una sola vez en la sección superior.</p></div>
          </div>
        </section>;
      }) : <section className="rounded-2xl border border-dashed bg-white p-10 text-center"><h2>Sin asignaciones activas</h2><p className="mt-2 text-slate-500">Esta persona aún no tiene roles, equipos ni rutas formativas vinculadas.</p></section>}
    </div>}
  </DirectoryShell>;
}

function Info({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: string }) { return <div className="flex items-center gap-3 border-t border-slate-100 px-6 py-4 lg:border-l lg:first:border-l-0"><Icon size={17} className="shrink-0 text-slate-400" /><div><small className="block text-slate-400">{label}</small><span className="block truncate text-sm font-semibold text-slate-700">{value}</span></div></div>; }
function Metric({ icon: Icon, label, value, detail, tone }: { icon: typeof Award; label: string; value: string | number; detail: string; tone: "brand" | "cyan" | "success" | "warning" }) { const styles = { brand: "bg-rose-50 text-rose-600", cyan: "bg-cyan-50 text-cyan-600", success: "bg-emerald-50 text-emerald-600", warning: "bg-amber-50 text-amber-600" }; return <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><span className={`grid h-8 w-8 place-items-center rounded-xl ${styles[tone]}`}><Icon size={16} /></span><p className="mt-3 text-xs font-semibold text-slate-500">{label}</p><strong className="mt-1 block text-2xl font-extrabold text-slate-800">{value}</strong><small className="mt-1 block text-slate-400">{detail}</small></article>; }
