import { useEffect, useMemo, useState } from "react";
import { apiUrl, demoHeaders } from "../directory/DirectoryShell";

type ReviewStatus = "PENDIENTE" | "CALIBRADA";

const sampleAssessments = [
  { id: "1", person: "María Torres", role: "Product Owner", team: "Equipo 12", period: "2026-1", score: 1.83, submittedAt: "04 sep 2026", status: "PENDIENTE" as ReviewStatus },
  { id: "2", person: "Carlos Rojas", role: "Scrum Master", team: "Equipo 18", period: "2026-1", score: 1.64, submittedAt: "03 sep 2026", status: "PENDIENTE" as ReviewStatus },
  { id: "3", person: "Ana Salazar", role: "Developer", team: "Equipo 33", period: "2026-1", score: 1.42, submittedAt: "02 sep 2026", status: "PENDIENTE" as ReviewStatus },
  { id: "4", person: "Luis Vega", role: "Product Owner", team: "Equipo 3", period: "2026-1", score: 1.91, submittedAt: "29 ago 2026", status: "CALIBRADA" as ReviewStatus },
];

function levelFor(score: number): string {
  if (score < 0.5) return "Postulante";
  if (score < 1.5) return "Principiante";
  return "Oficial";
}

export function CalibrationQueuePage() {
  const [assessments, setAssessments] = useState(sampleAssessments.slice(0,0));
  const [status, setStatus] = useState<"TODAS" | ReviewStatus>("PENDIENTE");
  const [search, setSearch] = useState("");
  const [period,setPeriod]=useState("TODOS"),[team,setTeam]=useState("TODOS");
  useEffect(() => { fetch(`${apiUrl}/api/maturity/admin/calibrations`, { headers: demoHeaders }).then((response) => response.json()).then((rows) => setAssessments(rows.map((row: any) => ({ id: row.id, person: row.personRole.person.names, role: row.personRole.role.name, team: row.personRole.team.sourceId, period: row.period.name, score: Number(row.selfAssessmentScore ?? row.score), submittedAt: new Date(row.evaluatedAt).toLocaleDateString("es-PE"), status: (row.calibratedAt?"CALIBRADA":"PENDIENTE") as ReviewStatus })))).catch(() => setAssessments([])); }, []);
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es");
    return assessments.filter((assessment) => {
      const matchesStatus = status === "TODAS" || assessment.status === status;
      const matchesSearch = !term || [assessment.person, assessment.role, assessment.team]
        .some((value) => value.toLocaleLowerCase("es").includes(term));
      return matchesStatus && matchesSearch&&(period==="TODOS"||assessment.period===period)&&(team==="TODOS"||assessment.team===team);
    });
  }, [search,status,period,team,assessments]);

  const pending = assessments.filter((assessment) => assessment.status === "PENDIENTE").length;

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
          <a href="/" className="text-lg font-bold tracking-tight">Mochelab <span className="text-emerald-600">2.0</span></a>
          <span className="rounded-full bg-slate-900 px-3 py-1 text-sm font-semibold text-white">Administrador</span>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-emerald-700">Madurez por rol</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Autoevaluaciones</h1>
            <p className="mt-3 text-base text-slate-600">Revisa los resultados enviados y completa su calibración.</p>
          </div>
          <div className="flex items-center gap-4">
            <a href="/madurez/periodos" className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:border-slate-500">Períodos</a>
            <a href="/madurez/configuracion" className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:border-slate-500">Configurar formulario</a>
            <div className="rounded-2xl bg-slate-950 px-5 py-4 text-white shadow-lg">
              <span className="text-sm text-slate-400">Pendientes</span>
              <strong className="ml-4 text-3xl text-emerald-400">{pending}</strong>
            </div>
          </div>
        </div>

        <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-200 p-5 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-2" aria-label="Filtrar por estado">
              {(["PENDIENTE", "CALIBRADA", "TODAS"] as const).map((option) => (
                <button
                  type="button"
                  key={option}
                  onClick={() => setStatus(option)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${status === option ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                >
                  {option === "PENDIENTE" ? "Pendientes" : option === "CALIBRADA" ? "Calibradas" : "Todas"}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2"><select aria-label="Filtrar por período" value={period} onChange={e=>setPeriod(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="TODOS">Todos los períodos</option>{[...new Set(assessments.map(x=>x.period))].map(x=><option key={x}>{x}</option>)}</select><select aria-label="Filtrar por equipo" value={team} onChange={e=>setTeam(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="TODOS">Todos los equipos</option>{[...new Set(assessments.map(x=>x.team))].map(x=><option key={x}>{x}</option>)}</select></div>
            <label className="relative block md:w-80">
              <span className="sr-only">Buscar por persona, rol o equipo</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar persona, rol o equipo"
                className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-base outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600"
              />
            </label>
          </div>

          <div className="hidden grid-cols-[1.5fr_1fr_0.8fr_0.6fr_0.8fr_auto] gap-4 bg-slate-50 px-6 py-3 text-sm font-semibold text-slate-500 lg:grid">
            <span>Persona y rol</span><span>Equipo</span><span>Período</span><span>Puntaje</span><span>Estado</span><span>Acción</span>
          </div>
          <div className="divide-y divide-slate-200">
            {filtered.map((assessment) => (
              <article key={assessment.id} className="grid gap-4 px-5 py-5 lg:grid-cols-[1.5fr_1fr_0.8fr_0.6fr_0.8fr_auto] lg:items-center lg:px-6">
                <div><h2 className="font-bold">{assessment.person}</h2><p className="mt-1 text-sm text-slate-500">{assessment.role} · Enviada {assessment.submittedAt}</p></div>
                <p className="text-sm font-medium text-slate-700">{assessment.team}</p>
                <p className="text-sm font-medium text-slate-700">{assessment.period}</p>
                <div><p className="text-xl font-bold tabular-nums">{assessment.score.toFixed(2)}</p><p className="text-sm text-slate-500">{levelFor(assessment.score)}</p></div>
                <span className={`w-fit rounded-full px-3 py-1 text-sm font-semibold ${assessment.status === "PENDIENTE" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
                  {assessment.status === "PENDIENTE" ? "Pendiente" : "Calibrada"}
                </span>
                <a
                  href={`/madurez/calibracion?id=${assessment.id}`}
                  className="w-fit rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-500"
                >
                  {assessment.status === "PENDIENTE" ? "Revisar" : "Ver detalle"}
                </a>
              </article>
            ))}
            {filtered.length === 0 && (
              <div className="px-6 py-14 text-center"><p className="font-semibold">No se encontraron autoevaluaciones.</p><p className="mt-2 text-sm text-slate-500">Prueba otro estado o término de búsqueda.</p></div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
