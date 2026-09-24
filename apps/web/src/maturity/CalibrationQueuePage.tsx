import { useEffect, useMemo, useState } from "react";
import { ArrowUpDown, BarChart3, CheckCircle2, ChevronLeft, ChevronRight, Scale, Search, X } from "lucide-react";
import { ConfirmationDialog } from "../components/ConfirmationDialog";
import { MultiSelect } from "../components/MultiSelect";
import { apiUrl, demoHeaders } from "../directory/DirectoryShell";
import { compareRoleThenPerson } from "../utils/ordering";

type ReviewStatus = "PENDIENTE" | "CALIBRADA";
type PeriodStatus = "PLANIFICADO" | "AUTOEVALUACION" | "CALIBRACION" | "CERRADO" | "CANCELADO";
type Assessment = { id: string; person: string; roleId: string; role: string; team: string; period: string; score: number; submittedAt: string; submittedAtEpoch: number; status: ReviewStatus; modelVersion: string | null };
type Period = { id: string; name: string; status: { code: PeriodStatus; name: string } };
type ResponseRow = { behaviorId: string; statement: string; score: number; comments: string | null; dimensionCode: string; dimensionName: string };
type ResultDetail = { scopeType: "SECTION" | "DIMENSION" | "LEVEL" | "TOTAL"; scopeCode: string; scopeName: string; score: number | null };
type CalibrationDetail = { id: string; person: string; role: string; team: string; period: string; periodStatus: PeriodStatus; model: { id: string; name: string; version: string } | null; integrity: { canCalibrate: boolean; reason: string | null }; originalScore: number; calibratedScore: number | null; calibratedAt: string | null; calibrationComments: string | null; level: string; responses: ResponseRow[]; resultDetails: ResultDetail[] };
type DimensionScore = { code: string; name: string; score: number };
type SaveMode = "STAY" | "NEXT";
type SortMode = "ROLE_PERSON" | "PERSON" | "SCORE_ASC" | "SCORE_DESC" | "NEWEST";

function levelFor(score: number): string {
  if (score < 1) return "Postulante";
  if (score < 1.5) return "Principiante";
  return "Oficial";
}

function dimensionTone(score: number) {
  if (score < 1) return "bg-rose-500";
  if (score < 1.5) return "bg-amber-500";
  return "bg-emerald-500";
}

export function nextPendingId(rows: Assessment[], currentId: string): string | null {
  return rows.find((row) => row.id !== currentId && row.status === "PENDIENTE")?.id ?? null;
}

function DimensionSummary({ detail }: { detail: CalibrationDetail }) {
  const dimensions = useMemo<DimensionScore[]>(() => {
    const stored = detail.resultDetails
      .filter((item) => item.scopeType === "DIMENSION" && item.score !== null)
      .map((item) => ({ code: item.scopeCode, name: item.scopeName, score: Number(item.score) }));
    if (stored.length) return stored;
    const grouped = new Map<string, { name: string; total: number; count: number }>();
    for (const response of detail.responses) {
      const current = grouped.get(response.dimensionCode) ?? { name: response.dimensionName, total: 0, count: 0 };
      current.total += response.score;
      current.count += 1;
      grouped.set(response.dimensionCode, current);
    }
    return [...grouped.entries()].map(([code, value]) => ({ code, name: value.name, score: value.total / value.count }));
  }, [detail]);

  return <section className="rounded-2xl border border-slate-200 bg-white p-5">
    <div className="flex items-start gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-50 text-cyan-700"><BarChart3 size={20}/></span>
      <div><h3 className="font-bold">Resumen por dimensión</h3><p className="mt-1 text-sm text-slate-500">Resultado enviado; la calibración modifica únicamente el puntaje global.</p></div>
    </div>
    <div className="mt-5 space-y-4">
      {dimensions.map((dimension) => <div key={dimension.code}>
        <div className="mb-1.5 flex items-center justify-between gap-4 text-sm"><span className="font-semibold text-slate-700">{dimension.name}</span><strong className="tabular-nums">{dimension.score.toFixed(2)}</strong></div>
        <div className="relative h-2.5 overflow-hidden rounded-full bg-slate-100"><span className="absolute inset-y-0 left-1/2 z-10 border-l border-dashed border-slate-400"/><span className="absolute inset-y-0 left-3/4 z-10 border-l border-dashed border-slate-400"/><span className={`block h-full rounded-full ${dimensionTone(dimension.score)}`} style={{ width: `${Math.min(Math.max(dimension.score / 2 * 100, 0), 100)}%` }}/></div>
      </div>)}
      {!dimensions.length && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Esta evaluación no tiene resultados por dimensión.</p>}
    </div>
  </section>;
}

export function CalibrationQueuePage() {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [status, setStatus] = useState<"TODAS" | ReviewStatus>("PENDIENTE");
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState("TODOS");
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [team, setTeam] = useState("TODOS");
  const [sortMode, setSortMode] = useState<SortMode>("ROLE_PERSON");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CalibrationDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [score, setScore] = useState(Number.NaN);
  const [scoreInput, setScoreInput] = useState("");
  const [comments, setComments] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState<SaveMode | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`${apiUrl}/api/maturity/admin/calibrations`, { headers: demoHeaders }),
      fetch(`${apiUrl}/api/maturity/admin/periods`, { headers: demoHeaders }),
    ]).then(async ([calibrationsResponse, periodsResponse]) => {
      if (!calibrationsResponse.ok) throw new Error("No se pudo cargar la bandeja de calibración");
      const calibrationRows = await calibrationsResponse.json();
      const rows: Assessment[] = calibrationRows.map((row: any) => ({
        id: row.id,
        person: row.personRole.person.names,
        roleId: row.personRole.role.id,
        role: row.personRole.role.name,
        team: row.personRole.team.sourceId,
        period: row.period.name,
        score: Number(row.selfAssessmentScore ?? row.score),
        submittedAt: new Date(row.evaluatedAt).toLocaleDateString("es-PE"),
        submittedAtEpoch: new Date(row.evaluatedAt).getTime(),
        status: row.calibratedAt ? "CALIBRADA" : "PENDIENTE",
        modelVersion: row.selfAssessment?.modelVersion?.version ?? null,
      }));
      setAssessments(rows);
      if (periodsResponse.ok) setPeriods(await periodsResponse.json());
      const initial = rows.find((row) => row.status === "PENDIENTE") ?? rows[0];
      if (initial) { setPeriod(initial.period); setSelectedId(initial.id); }
    }).catch((loadError: Error) => setError(loadError.message));
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es");
    const rows = assessments.filter((assessment) => {
      const matchesStatus = status === "TODAS" || assessment.status === status;
      const matchesSearch = !term || [assessment.person, assessment.role, assessment.team].some((value) => value.toLocaleLowerCase("es").includes(term));
      return matchesStatus && matchesSearch && (period === "TODOS" || assessment.period === period) && (!roleIds.length || roleIds.includes(assessment.roleId)) && (team === "TODOS" || assessment.team === team);
    });
    if (sortMode === "PERSON") return rows.sort((a, b) => a.person.localeCompare(b.person, "es"));
    if (sortMode === "SCORE_ASC") return rows.sort((a, b) => a.score - b.score || a.person.localeCompare(b.person, "es"));
    if (sortMode === "SCORE_DESC") return rows.sort((a, b) => b.score - a.score || a.person.localeCompare(b.person, "es"));
    if (sortMode === "NEWEST") return rows.sort((a, b) => b.submittedAtEpoch - a.submittedAtEpoch);
    return rows.sort(compareRoleThenPerson((assessment) => assessment.role, (assessment) => assessment.person));
  }, [assessments, period, roleIds, search, sortMode, status, team]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    let active = true;
    setLoadingDetail(true); setError(""); setMessage("");
    fetch(`${apiUrl}/api/maturity/admin/calibrations/${selectedId}`, { headers: demoHeaders }).then(async (response) => {
      if (!response.ok) throw new Error("No se pudo cargar la calibración seleccionada");
      return response.json() as Promise<CalibrationDetail>;
    }).then((item) => {
      if (!active) return;
      const initialScore = item.calibratedScore ?? item.originalScore;
      setDetail(item); setScore(initialScore); setScoreInput(initialScore.toFixed(2)); setComments(item.calibrationComments ?? "");
    }).catch((loadError: Error) => { if (active) setError(loadError.message); }).finally(() => { if (active) setLoadingDetail(false); });
    return () => { active = false; };
  }, [selectedId]);

  useEffect(() => {
    if (!filtered.length) { setSelectedId(null); return; }
    if (!selectedId || !filtered.some((row) => row.id === selectedId)) setSelectedId(filtered[0].id);
  }, [filtered, selectedId]);

  const periodScopedRows = assessments.filter((row) => period === "TODOS" || row.period === period);
  const roleOptions = [...new Map(periodScopedRows.map((row) => [row.roleId, { id: row.roleId, label: row.role }])).values()].sort((a, b) => a.label.localeCompare(b.label, "es"));
  const teamOptions = [...new Set(periodScopedRows.filter((row) => !roleIds.length || roleIds.includes(row.roleId)).map((row) => row.team))].sort((a, b) => a.localeCompare(b, "es"));
  const term = search.trim().toLocaleLowerCase("es");
  const summaryRows = periodScopedRows.filter((row) => (!roleIds.length || roleIds.includes(row.roleId)) && (team === "TODOS" || row.team === team) && (!term || [row.person, row.role, row.team].some((value) => value.toLocaleLowerCase("es").includes(term))));
  const calibrated = summaryRows.filter((row) => row.status === "CALIBRADA").length;
  const pending = summaryRows.filter((row) => row.status === "PENDIENTE").length;
  const selectedPeriod = periods.find((item) => item.name === period);
  const readonly = Boolean(detail?.calibratedAt);
  const changed = Boolean(detail) && Number.isFinite(score) && Math.abs(score - detail!.originalScore) > 0.000001;
  const significantAdjustment = Boolean(detail) && Number.isFinite(score) && Math.abs(score - detail!.originalScore) > 0.25;
  const valid = Boolean(detail?.integrity.canCalibrate) && !readonly && Number.isFinite(score) && score >= 0 && score <= 2 && (!changed || Boolean(comments.trim()));
  const finalLevel = Number.isFinite(score) ? levelFor(score) : "—";
  const selectedIndex = detail ? filtered.findIndex((row) => row.id === detail.id) : -1;
  const comparableRows = detail ? assessments.filter((row) => row.period === detail.period && row.role === detail.role) : [];
  const roleAverage = comparableRows.length ? comparableRows.reduce((total, row) => total + row.score, 0) / comparableRows.length : null;
  const roleDifference = detail && roleAverage !== null ? detail.originalScore - roleAverage : null;

  async function save(mode: SaveMode) {
    if (!detail || !valid) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`${apiUrl}/api/maturity/admin/calibrations/${detail.id}`, { method: "PATCH", headers: { ...demoHeaders, "Content-Type": "application/json" }, body: JSON.stringify({ calibratedScore: score, comments: comments.trim() || undefined }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setError(body.message ?? "No se pudo guardar la calibración"); return; }
      const savedAt = new Date().toISOString();
      setAssessments((current) => current.map((row) => row.id === detail.id ? { ...row, status: "CALIBRADA", score } : row));
      setDetail({ ...detail, calibratedScore: score, calibratedAt: savedAt, calibrationComments: comments, level: body.level ?? finalLevel.toUpperCase() });
      setMessage(`Calibración guardada. Nivel final: ${body.level ? body.level.charAt(0) + body.level.slice(1).toLocaleLowerCase("es") : finalLevel}.`);
      setConfirming(null);
      if (mode === "NEXT") {
        const nextId = nextPendingId(filtered, detail.id);
        if (nextId) setSelectedId(nextId);
        else setMessage("Calibración guardada. No quedan pendientes con los filtros actuales.");
      }
    } finally { setSaving(false); }
  }

  const stages = ["Configuración", "Autoevaluación", "Calibración", "Cierre"];
  const activeStage = selectedPeriod?.status.code === "PLANIFICADO" ? 0 : selectedPeriod?.status.code === "AUTOEVALUACION" ? 1 : selectedPeriod?.status.code === "CERRADO" ? 3 : 2;

  return <main className="min-h-screen bg-slate-100 text-slate-950">
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-[96rem] items-center justify-between px-5 py-4 lg:px-8"><a href="/" className="text-lg font-bold tracking-tight">Mochelab <span className="text-emerald-600">2.0</span></a><span className="rounded-full bg-slate-900 px-3 py-1 text-sm font-semibold text-white">Administrador</span></div></header>
    <div className="mx-auto max-w-[96rem] px-5 py-8 lg:px-8">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div><p className="text-sm font-semibold uppercase tracking-wider text-emerald-700">Madurez por rol</p><h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Centro de calibración</h1><p className="mt-3 text-base text-slate-600">Revisa, calibra y avanza entre personas sin salir de la bandeja.</p></div>
        <nav className="flex flex-wrap gap-2 text-sm font-bold"><a href="/madurez/periodos" className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-slate-700">Períodos</a><a href="/madurez/configuracion" className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-slate-700">Formulario</a><a href="/madurez/equipos" className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-slate-700">Madurez de equipos</a></nav>
      </div>

      <section className="mt-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-5 lg:grid-cols-[minmax(15rem,22rem)_1fr] lg:items-center">
          <label className="text-sm font-bold text-slate-700">Período de evaluación<select value={period} onChange={(event) => { setPeriod(event.target.value); setRoleIds([]); setTeam("TODOS"); }} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal"><option value="TODOS">Todos los períodos</option>{[...new Set(assessments.map((row) => row.period))].map((value) => <option key={value}>{value}</option>)}</select></label>
          <ol className="grid grid-cols-4 gap-2" aria-label="Etapas del período">{stages.map((stage, index) => <li key={stage} className={`rounded-xl px-3 py-3 text-center text-xs font-bold sm:text-sm ${index < activeStage ? "bg-emerald-50 text-emerald-800" : index === activeStage ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-400"}`}>{index < activeStage && <CheckCircle2 size={14} className="mr-1 inline"/>}{stage}</li>)}</ol>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-sky-50 p-4"><p className="text-sm font-semibold text-sky-800">Recibidas</p><strong className="mt-1 block text-2xl">{summaryRows.length}</strong></div><div className="rounded-xl bg-emerald-50 p-4"><p className="text-sm font-semibold text-emerald-800">Calibradas</p><strong className="mt-1 block text-2xl">{calibrated}</strong></div><div className="rounded-xl bg-amber-50 p-4"><p className="text-sm font-semibold text-amber-800">Pendientes</p><strong className="mt-1 block text-2xl">{pending}</strong></div></div>
      </section>

      {error && <p role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 font-semibold text-rose-900">{error}</p>}
      {message && <p role="status" className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 font-semibold text-emerald-900">{message}</p>}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(22rem,.82fr)_minmax(34rem,1.18fr)] xl:items-start">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-4">
            <div className="flex flex-wrap gap-2" aria-label="Filtrar por estado">{(["PENDIENTE", "CALIBRADA", "TODAS"] as const).map((option) => <button type="button" key={option} onClick={() => setStatus(option)} className={`rounded-full px-3 py-2 text-sm font-semibold ${status === option ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600"}`}>{option === "PENDIENTE" ? `Pendientes (${pending})` : option === "CALIBRADA" ? `Calibradas (${calibrated})` : `Todas (${summaryRows.length})`}</button>)}</div>
            <label className="relative mt-3 block"><Search size={18} className="pointer-events-none absolute left-3 top-3 text-slate-400"/><span className="sr-only">Buscar</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Persona, rol o equipo" className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600"/></label>
            <div className="mt-3 grid gap-3 sm:grid-cols-2"><div><span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Rol</span><MultiSelect label="Roles" options={roleOptions} value={roleIds} onChange={(values) => { setRoleIds(values); setTeam("TODOS"); }} emptyLabel="Todos los roles"/></div><label className="text-xs font-bold uppercase tracking-wide text-slate-500">Equipo<select aria-label="Filtrar por equipo" value={team} onChange={(event) => setTeam(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal normal-case text-slate-700"><option value="TODOS">Todos los equipos</option>{teamOptions.map((value) => <option key={value}>{value}</option>)}</select></label></div>
            <label className="mt-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500"><ArrowUpDown size={15}/><span className="sr-only">Ordenar listado</span><select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)} className="min-h-10 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal normal-case text-slate-700"><option value="ROLE_PERSON">Rol y persona</option><option value="PERSON">Nombre</option><option value="SCORE_ASC">Puntaje: menor a mayor</option><option value="SCORE_DESC">Puntaje: mayor a menor</option><option value="NEWEST">Envío más reciente</option></select></label>
            {(roleIds.length > 0 || team !== "TODOS") && <div className="mt-3 flex flex-wrap items-center gap-2">{team !== "TODOS" && <button type="button" onClick={() => setTeam("TODOS")} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">Equipo: {team}<X size={12}/></button>}<button type="button" onClick={() => { setRoleIds([]); setTeam("TODOS"); }} className="text-xs font-bold text-red-700">Limpiar filtros</button></div>}
          </div>
          <div className="max-h-[54rem] divide-y divide-slate-200 overflow-y-auto">{filtered.map((assessment) => <button type="button" key={assessment.id} onClick={() => setSelectedId(assessment.id)} className={`grid w-full grid-cols-[1fr_auto] gap-3 p-4 text-left transition ${selectedId === assessment.id ? "bg-emerald-50 ring-2 ring-inset ring-emerald-500" : "hover:bg-slate-50"}`}><span className="min-w-0"><span className="block truncate font-bold">{assessment.person}</span><span className="mt-1 block truncate text-sm text-slate-500">{assessment.role} · {assessment.team}</span><span className="mt-2 flex items-center gap-2 text-xs text-slate-500"><i className={`h-2 w-2 rounded-full ${assessment.status === "PENDIENTE" ? "bg-amber-500" : "bg-emerald-500"}`}/>{assessment.status === "PENDIENTE" ? "Pendiente" : "Calibrada"} · {assessment.score.toFixed(2)} · {assessment.submittedAt}</span></span><ChevronRight size={19} className="mt-1 text-slate-400"/></button>)}{!filtered.length && <div className="p-10 text-center"><p className="font-semibold">No hay resultados.</p><p className="mt-2 text-sm text-slate-500">Cambia los filtros para ampliar la búsqueda.</p></div>}</div>
        </section>

        <section className="xl:sticky xl:top-5">
          {loadingDetail && <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">Cargando revisión…</div>}
          {!loadingDetail && detail && <div className="flex flex-col gap-5">
            <article className="order-1 rounded-2xl bg-slate-950 p-5 text-white shadow-sm"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><p className="text-sm font-semibold text-emerald-400">Persona y rol</p><h2 className="mt-1 text-2xl font-bold" style={{ color: "#ffffff" }}>{detail.person}</h2><p className="mt-1 text-slate-300">{detail.role} · {detail.team} · {detail.period}</p>{detail.model?<p className="mt-3 rounded-lg bg-white/10 px-3 py-2 text-sm text-slate-100">Modelo aplicado: <strong>{detail.model.name}</strong> · versión {detail.model.version}</p>:<p className="mt-3 rounded-lg bg-rose-950 px-3 py-2 text-sm font-semibold text-rose-200">No se identificó la versión histórica del modelo.</p>}</div><span className={`w-fit rounded-full px-3 py-1 text-sm font-bold ${readonly ? "bg-emerald-400 text-emerald-950" : "bg-amber-300 text-amber-950"}`}>{readonly ? "Calibrada" : "Pendiente"}</span></div><div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4"><button type="button" disabled={selectedIndex <= 0} onClick={() => setSelectedId(filtered[selectedIndex - 1]?.id ?? null)} className="inline-flex items-center gap-1 text-sm font-bold disabled:opacity-30"><ChevronLeft size={17}/>Anterior</button><span className="text-sm text-slate-300">Persona {selectedIndex + 1} de {filtered.length}</span><button type="button" disabled={selectedIndex < 0 || selectedIndex >= filtered.length - 1} onClick={() => setSelectedId(filtered[selectedIndex + 1]?.id ?? null)} className="inline-flex items-center gap-1 text-sm font-bold disabled:opacity-30">Siguiente<ChevronRight size={17}/></button></div></article>
            <div className="order-3"><DimensionSummary detail={detail}/></div>
            <article className="order-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="grid gap-4 sm:grid-cols-2"><div className="rounded-xl bg-slate-50 p-4"><p className="text-sm text-slate-500">Puntaje enviado</p><strong className="mt-1 block text-3xl">{detail.originalScore.toFixed(2)}</strong><span className="text-sm text-slate-500">{levelFor(detail.originalScore)}</span></div><label className="rounded-xl bg-emerald-50 p-4 text-sm font-bold text-emerald-900">Puntaje calibrado<input aria-label="Puntaje calibrado" disabled={readonly||!detail.integrity.canCalibrate} type="number" min="0" max="2" step=".01" value={scoreInput} onChange={(event) => { setScoreInput(event.target.value); setScore(event.target.value.trim() ? Number(event.target.value) : Number.NaN); }} onBlur={() => { if (Number.isFinite(score)) setScoreInput(score.toFixed(2)); }} className="mt-2 w-full rounded-xl border border-emerald-300 bg-white p-3 text-2xl font-bold text-slate-950 disabled:bg-slate-100"/><span className="mt-2 block text-right">Nivel: {finalLevel}</span></label></div>
              {roleAverage !== null && roleDifference !== null && <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-sky-50 p-4 text-sm"><div><span className="text-sky-800">Promedio de {detail.role}</span><strong className="mt-1 block text-xl text-slate-950">{roleAverage.toFixed(2)}</strong></div><div><span className="text-sky-800">Diferencia de la persona</span><strong className={`mt-1 block text-xl ${roleDifference > 0 ? "text-emerald-700" : roleDifference < 0 ? "text-amber-700" : "text-slate-700"}`}>{roleDifference > 0 ? "+" : ""}{roleDifference.toFixed(2)}</strong></div></div>}
              <label className="mt-5 block text-sm font-bold text-slate-700">Justificación del ajuste {changed && <span className="text-rose-700">(obligatoria)</span>}<textarea disabled={readonly||!detail.integrity.canCalibrate} rows={3} value={comments} onChange={(event) => setComments(event.target.value)} placeholder="Describe la evidencia que sustenta el ajuste" className={`mt-2 w-full rounded-xl border p-3 font-normal ${changed && !comments.trim() ? "border-rose-400" : "border-slate-300"}`}/></label>
              {significantAdjustment && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">La diferencia supera ±0.25. Verifica el resultado y documenta la evidencia.</p>}
              {!detail.integrity.canCalibrate && !readonly && <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-900">No se puede calibrar: {detail.integrity.reason}.</p>}
              <details className="mt-5 border-t border-slate-200 pt-4"><summary className="cursor-pointer text-sm font-bold text-slate-700">Ver respuestas originales ({detail.responses.length})</summary><div className="mt-3 max-h-72 space-y-3 overflow-y-auto pr-2">{detail.responses.map((response) => <div key={response.behaviorId} className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-bold text-emerald-700">{response.dimensionName}</p><p className="mt-1 text-sm">{response.statement}</p><p className="mt-1 text-sm font-bold">Puntaje: {response.score}</p></div>)}</div></details>
              <div className="sticky bottom-0 z-20 -mx-5 mt-5 flex flex-col gap-3 border-t border-slate-200 bg-white/95 px-5 pb-1 pt-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between"><a href={`/madurez/calibracion?id=${detail.id}`} className="text-sm font-bold text-slate-600 underline decoration-slate-300 underline-offset-4">Abrir revisión completa</a>{!readonly && <div className="flex flex-col gap-2 sm:flex-row"><button type="button" disabled={!valid} onClick={() => setConfirming("STAY")} className="rounded-xl border border-emerald-600 px-4 py-2.5 text-sm font-bold text-emerald-800 disabled:border-slate-300 disabled:text-slate-400">Guardar</button><button type="button" disabled={!valid} onClick={() => setConfirming("NEXT")} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:bg-slate-300">Guardar y abrir siguiente</button></div>}</div>
              {readonly && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">Resultado final guardado. La calibración quedó cerrada para esta persona y rol.</p>}
            </article>
          </div>}
          {!loadingDetail && !detail && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><Scale className="mx-auto text-slate-400"/><h2 className="mt-3 font-bold">Selecciona una autoevaluación</h2><p className="mt-2 text-sm text-slate-500">El resumen y los controles de calibración aparecerán aquí.</p></div>}
        </section>
      </div>
    </div>
    {confirming && detail && <ConfirmationDialog title={confirming === "NEXT" ? "Guardar y continuar" : "Confirmar calibración final"} description="Este resultado quedará cerrado para la persona y el rol seleccionados." icon={<Scale size={20}/>} confirmLabel={confirming === "NEXT" ? "Guardar y abrir siguiente" : "Guardar resultado final"} busy={saving} error={error} onClose={() => { if (!saving) setConfirming(null); }} onConfirm={() => void save(confirming)}><div className="rounded-xl bg-slate-50 p-4"><strong>{detail.person}</strong><span className="mt-1 block text-sm text-slate-500">{detail.role} · {detail.team} · {detail.period}</span></div><dl className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-xl border p-3"><dt className="text-xs font-bold uppercase text-slate-500">Enviado</dt><dd className="mt-1 text-2xl font-bold">{detail.originalScore.toFixed(2)}</dd></div><div className="rounded-xl border p-3"><dt className="text-xs font-bold uppercase text-slate-500">Final</dt><dd className="mt-1 text-2xl font-bold">{score.toFixed(2)}</dd><small>{finalLevel}</small></div></dl>{changed && <p className="mt-4 rounded-xl bg-sky-50 p-3 text-sm font-semibold text-sky-900">Ajuste de {(score - detail.originalScore).toFixed(2)} puntos. La justificación quedará registrada.</p>}<p className="mt-4 text-sm text-slate-700">Después de guardar no podrá modificarse desde la bandeja.</p></ConfirmationDialog>}
  </main>;
}
