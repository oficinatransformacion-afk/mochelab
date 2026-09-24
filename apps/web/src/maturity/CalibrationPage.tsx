import { useEffect, useMemo, useState } from "react";
import { BarChart3, Scale } from "lucide-react";
import { ConfirmationDialog } from "../components/ConfirmationDialog";
import { apiUrl, demoHeaders } from "../directory/DirectoryShell";

type ResponseRow = { behaviorId: string; statement: string; score: number; comments: string | null; dimensionCode: string; dimensionName: string };
type ResultDetail = { scopeType: "SECTION" | "DIMENSION" | "LEVEL" | "TOTAL"; scopeCode: string; scopeName: string; score: number | null; positiveCount: number | null; responseCount: number; completionPercentage: number | null; weight: number };
type Detail = { id: string; personId: string; person: string; role: string; team: string; period: string; periodStatus:string; model:{id:string;name:string;version:string}|null; integrity:{canCalibrate:boolean;reason:string|null}; originalScore: number; calibratedScore: number | null; calibratedAt: string | null; calibrationComments: string | null; level:string; responses: ResponseRow[]; resultDetails: ResultDetail[]; people: { id: string; names: string }[]; officialTeamMaturities: { id: string }[] };
type DimensionScore = { code: string; name: string; score: number; sectionCode: string; sectionName: string };

function scoreTone(score: number) {
  if (score < 1) return { bar: "bg-rose-500", text: "text-rose-700" };
  if (score < 1.5) return { bar: "bg-amber-500", text: "text-amber-700" };
  return { bar: "bg-emerald-500", text: "text-emerald-700" };
}

function resultingLevel(score: number) {
  if (!Number.isFinite(score)) return "—";
  return score < 1 ? "Postulante" : score < 1.5 ? "Principiante" : "Oficial";
}

function displayLevel(level:string){return level.charAt(0)+level.slice(1).toLocaleLowerCase("es")}

function DimensionScoreChart({ details, responses }: { details: ResultDetail[]; responses: ResponseRow[] }) {
  const dimensions = useMemo<DimensionScore[]>(() => {
    const sectionNames = new Map(details.filter(item => item.scopeType === "SECTION").map(item => [item.scopeCode, item.scopeName]));
    const stored = details.filter(item => item.scopeType === "DIMENSION" && item.score !== null).map(item => {
      const [sectionCode = "GENERAL"] = item.scopeCode.split(":");
      return { code: item.scopeCode, name: item.scopeName, score: item.score!, sectionCode, sectionName: sectionNames.get(sectionCode) ?? "Evaluación integral" };
    });
    if (stored.length) return stored;
    const grouped = new Map<string, { name: string; total: number; count: number }>();
    for (const response of responses) {
      const current = grouped.get(response.dimensionCode) ?? { name: response.dimensionName, total: 0, count: 0 };
      current.total += response.score;
      current.count += 1;
      grouped.set(response.dimensionCode, current);
    }
    return [...grouped.entries()].map(([code, item]) => ({ code, name: item.name, score: item.total / item.count, sectionCode: "GENERAL", sectionName: "Evaluación integral" }));
  }, [details, responses]);
  const groups = useMemo(() => {
    const rows = new Map<string, { name: string; items: DimensionScore[] }>();
    for (const dimension of dimensions) {
      const group = rows.get(dimension.sectionCode) ?? { name: dimension.sectionName, items: [] };
      group.items.push(dimension);
      rows.set(dimension.sectionCode, group);
    }
    return [...rows.entries()];
  }, [dimensions]);

  return <article className="rounded-2xl bg-white p-5 shadow-sm">
    <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-50 text-cyan-700"><BarChart3 size={21}/></span><div><h2 className="text-xl font-bold">Puntaje global por dimensión</h2><p className="mt-1 text-sm text-slate-600">Las barras muestran el resultado enviado en una escala de 0 a 2. Permiten identificar qué dimensiones elevan o reducen el puntaje global.</p></div></div>
    <div className="mt-5 flex flex-wrap gap-4 text-xs font-semibold text-slate-600"><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-rose-500"/>Postulante: menor a 1</span><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-amber-500"/>Principiante: 1 a 1.49</span><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-emerald-500"/>Oficial: 1.5 a 2</span></div>
    <div className="mt-6 space-y-7">{groups.map(([sectionCode, group]) => <section key={sectionCode}><div className="mb-3 flex items-center justify-between border-b pb-2"><h3 className="font-bold text-slate-800">{group.name}</h3><span className="text-xs font-semibold text-slate-400">{group.items.length} dimensiones</span></div><div className="space-y-4">{group.items.map(dimension => { const tone = scoreTone(dimension.score); return <div key={dimension.code} className="grid gap-2 md:grid-cols-[minmax(11rem,18rem)_minmax(14rem,1fr)_5.5rem] md:items-center"><p className="text-sm font-semibold text-slate-700">{dimension.name}</p><div className="relative h-4 overflow-hidden rounded-full bg-slate-100" aria-label={`${dimension.name}: ${dimension.score.toFixed(2)} de 2`} role="img"><span className="absolute inset-y-0 left-1/2 z-10 border-l border-dashed border-slate-400/70"/><span className="absolute inset-y-0 left-3/4 z-10 border-l border-dashed border-slate-400/70"/><span className={`block h-full rounded-full ${tone.bar}`} style={{ width: `${Math.max(0, Math.min(dimension.score / 2 * 100, 100))}%` }}/></div><p className={`text-right text-sm font-bold ${tone.text}`}>{dimension.score.toFixed(2)} <span className="font-medium text-slate-400">/ 2</span></p></div>})}</div></section>)}</div>
    <p className="mt-6 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">La calibración ajusta únicamente el puntaje global final. Los resultados por dimensión y las respuestas originales se conservan sin cambios.</p>
  </article>;
}

export function CalibrationPage() {
  const id = new URLSearchParams(location.search).get("id");
  const [data, setData] = useState<Detail | null>(null), [score, setScore] = useState(0), [scoreInput, setScoreInput] = useState("0.00"), [comments, setComments] = useState(""), [message, setMessage] = useState(""), [confirming, setConfirming] = useState(false), [saving, setSaving] = useState(false), [confirmError, setConfirmError] = useState("");
  const [evaluateMastery,setEvaluateMastery]=useState(false),[training, setTraining] = useState(false), [trainedPersonId, setTrainedPersonId] = useState(""), [trainingEvidence, setTrainingEvidence] = useState(""), [camp, setCamp] = useState(false), [campName, setCampName] = useState(""), [campDate, setCampDate] = useState(""), [campEvidence, setCampEvidence] = useState("");

  useEffect(() => {
    if (!id) { setMessage("Selecciona una autoevaluación desde la bandeja."); return; }
    fetch(`${apiUrl}/api/maturity/admin/calibrations/${id}`, { headers: demoHeaders }).then(async response => {
      if (!response.ok) throw new Error("No se pudo cargar la calibración");
      return response.json() as Promise<Detail>;
    }).then(item => { const initialScore = item.calibratedScore ?? item.originalScore; setData(item); setScore(initialScore); setScoreInput(initialScore.toFixed(2)); setComments(item.calibrationComments ?? ""); }).catch((error: Error) => setMessage(error.message));
  }, [id]);

  if (!data) return <main className="min-h-screen bg-slate-100 p-8">{message || "Cargando calibración…"}</main>;
  const readonly = Boolean(data.calibratedAt), official = Number.isFinite(score) && score >= 1.5, changed = Number.isFinite(score) && Math.abs(score - data.originalScore) > 0.000001, significantAdjustment = changed && Math.abs(score - data.originalScore) > 0.25, wantsMastery = official&&evaluateMastery;
  const masteryComplete = training && Boolean(trainedPersonId) && Boolean(trainingEvidence.trim()) && camp && Boolean(campName.trim()) && Boolean(campDate) && Boolean(campEvidence.trim()) && data.officialTeamMaturities.length > 0;
  const valid = !readonly && data.integrity.canCalibrate && Number.isFinite(score) && score >= 0 && score <= 2 && (!changed || Boolean(comments.trim())) && (!wantsMastery || masteryComplete);
  const originalLevel=resultingLevel(data.originalScore),finalLevel=readonly?displayLevel(data.level):(wantsMastery&&masteryComplete?"Maestro":resultingLevel(score));

  async function save() {
    if (!valid) return;
    setSaving(true); setConfirmError("");
    const mastery = wantsMastery&&masteryComplete ? { trainedPersonId, trainingEvidence: trainingEvidence.trim(), trainingVerified: true, campVerified: true, campName: campName.trim(), campDate, campEvidence: campEvidence.trim(), teamMaturityId: data!.officialTeamMaturities[0].id } : undefined;
    try {
      const response = await fetch(`${apiUrl}/api/maturity/admin/calibrations/${data!.id}`, { method: "PATCH", headers: { ...demoHeaders, "Content-Type": "application/json" }, body: JSON.stringify({ calibratedScore: score, comments: comments || undefined, mastery }) });
      const body = await response.json().catch(() => ({}));
      if (response.ok) { setData({ ...data!, calibratedScore: score, calibratedAt: new Date().toISOString(), calibrationComments: comments,level:body.level??data!.level }); setScoreInput(score.toFixed(2)); setMessage(`Calibración guardada. Nivel final: ${body.level}.`); setConfirming(false); }
      else setConfirmError(body.message ?? "No se pudo guardar la calibración");
    } finally { setSaving(false); }
  }

  return <main className="min-h-screen bg-slate-100 text-slate-950"><header className="border-b bg-white"><div className="mx-auto flex max-w-7xl justify-between px-5 py-4"><a href="/madurez/calibraciones" className="font-bold">← Calibraciones</a><b>Administrador</b></div></header><div className="mx-auto max-w-7xl px-5 py-8"><h1 className="text-3xl font-bold">Revisión y calibración</h1><p className="mt-2 text-slate-600">{data.person} · {data.role} · {data.team} · {data.period}</p>{data.model?<p className="mt-3 w-fit rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Modelo aplicado: {data.model.name} · versión {data.model.version}</p>:<p className="mt-3 w-fit rounded-xl bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-900">No se identificó la versión histórica del modelo.</p>}<div className="mt-8 grid gap-7 2xl:grid-cols-[minmax(0,1fr)_22rem]"><section className="space-y-5"><DimensionScoreChart details={data.resultDetails ?? []} responses={data.responses}/><details className="rounded-2xl bg-white p-5 shadow-sm"><summary className="cursor-pointer font-bold text-slate-700">Ver respuestas originales ({data.responses.length})</summary><div className="mt-4 max-h-[34rem] overflow-y-auto pr-2">{data.responses.map(item => <div key={item.behaviorId} className="border-t py-4"><p className="text-sm font-semibold text-emerald-700">{item.dimensionName}</p><p className="mt-1">{item.statement}</p><p className="mt-2 font-bold">Puntaje: {item.score}</p>{item.comments && <p className="text-sm text-slate-500">{item.comments}</p>}</div>)}</div></details>
    {official && !readonly&&<article className="rounded-2xl bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-bold">Evaluación para nivel Maestro</h2><p className="mt-2 text-sm text-slate-600">Actívala únicamente cuando quieras verificar los criterios adicionales de Maestro.</p></div><button type="button" role="switch" aria-checked={evaluateMastery} onClick={()=>setEvaluateMastery(value=>!value)} className={`relative h-7 w-12 shrink-0 rounded-full transition ${evaluateMastery?"bg-emerald-600":"bg-slate-300"}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${evaluateMastery?"left-6":"left-1"}`}/></button></div>{evaluateMastery&&<div className="mt-5 border-t pt-5"><p className="text-sm font-semibold text-slate-700">Para Maestro deben cumplirse y documentarse las tres condiciones.</p><label className="mt-4 flex gap-3"><input type="checkbox" checked={training} onChange={event => setTraining(event.target.checked)}/>Ha formado a una persona</label>{training && <div className="mt-2 grid gap-2"><select value={trainedPersonId} onChange={event => setTrainedPersonId(event.target.value)} className="rounded-xl border p-3"><option value="">Selecciona la persona formada</option>{data.people.map(person => <option key={person.id} value={person.id}>{person.names}</option>)}</select><textarea value={trainingEvidence} onChange={event => setTrainingEvidence(event.target.value)} placeholder="Evidencia o detalle de la formación" className="rounded-xl border p-3"/></div>}<label className="mt-4 flex gap-3"><input type="checkbox" checked={camp} onChange={event => setCamp(event.target.checked)}/>Ha facilitado un campamento</label>{camp && <div className="mt-2 grid gap-2 sm:grid-cols-2"><input value={campName} onChange={event => setCampName(event.target.value)} placeholder="Nombre del campamento" className="rounded-xl border p-3"/><input type="date" max={new Date().toISOString().slice(0, 10)} value={campDate} onChange={event => setCampDate(event.target.value)} className="rounded-xl border p-3"/><textarea value={campEvidence} onChange={event => setCampEvidence(event.target.value)} placeholder="Evidencia o detalle del campamento" className="rounded-xl border p-3 sm:col-span-2"/></div>}<p className={`mt-4 rounded-xl p-3 text-sm font-semibold ${data.officialTeamMaturities.length ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>{data.officialTeamMaturities.length ? "✓ El equipo está en nivel Oficial" : "El equipo aún no está en nivel Oficial"}</p></div>}</article>}
    </section><aside><div className="rounded-2xl bg-slate-950 p-6 text-white"><p className="text-sm text-emerald-400">Puntaje enviado</p><p className="text-4xl font-bold">{data.originalScore.toFixed(2)}</p><p className="mt-1 text-sm text-slate-400">Nivel enviado: <b className="text-white">{originalLevel}</b></p><label className="mt-6 block text-sm font-semibold text-emerald-400">Puntaje calibrado<input aria-label="Puntaje calibrado" disabled={readonly||!data.integrity.canCalibrate} type="number" min="0" max="2" step=".01" value={scoreInput} onChange={event => { const value = event.target.value; setScoreInput(value); setScore(value.trim() === "" ? Number.NaN : Number(value)); }} onBlur={() => { if (Number.isFinite(score)) setScoreInput(score.toFixed(2)); }} className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-900 p-3 text-3xl font-bold text-white caret-white [-webkit-text-fill-color:white] disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-800 disabled:opacity-100"/></label><div className="mt-3 flex items-center justify-between text-sm"><span className="text-slate-400">Nivel final</span><strong className={originalLevel!==finalLevel?"text-amber-300":"text-white"}>{finalLevel}</strong></div>{originalLevel!==finalLevel&&<p className="mt-3 rounded-lg bg-amber-950/70 p-3 text-sm font-semibold text-amber-200">Cambio de nivel: {originalLevel} → {finalLevel}</p>}<label className="mt-5 block text-sm font-semibold text-emerald-400">Justificación del ajuste {changed&&<span className="text-rose-300">(obligatoria)</span>}<textarea aria-invalid={changed&&!comments.trim()} disabled={readonly||!data.integrity.canCalibrate} rows={4} value={comments} onChange={event=>setComments(event.target.value)} className={`mt-2 w-full rounded-xl border bg-slate-900 p-3 font-normal text-white caret-white [-webkit-text-fill-color:white] disabled:bg-slate-800 ${changed&&!comments.trim()?"border-rose-400":"border-slate-600"}`} placeholder="Describe la evidencia que sustenta el ajuste"/></label>{changed&&!comments.trim()&&<p className="mt-2 text-sm font-semibold text-rose-300">Debes justificar por qué cambia el puntaje.</p>}{significantAdjustment && <p role="alert" className="mt-4 rounded-lg border border-amber-400/60 bg-amber-950/70 p-3 text-sm font-semibold text-amber-200">La diferencia supera ±0.25. Verifica el resultado y detalla la evidencia del ajuste.</p>}{!data.integrity.canCalibrate&&!readonly&&<p role="alert" className="mt-4 rounded-lg bg-rose-950 p-3 text-sm font-semibold text-rose-200">No se puede calibrar: {data.integrity.reason}.</p>}{readonly && <p className="mt-4 rounded-lg bg-emerald-950 p-3 text-sm font-semibold text-emerald-300">Calibración final guardada</p>}<button disabled={!valid} onClick={() => { setConfirmError(""); setConfirming(true); }} className="mt-6 w-full rounded-xl bg-emerald-500 p-3 font-bold text-slate-950 disabled:bg-slate-700 disabled:text-slate-400">Guardar calibración</button></div>{message && <p className="mt-4 rounded-xl bg-emerald-50 p-4 font-semibold text-emerald-900">{message}</p>}</aside></div></div>{confirming && <ConfirmationDialog title="Confirmar calibración final" description="Este resultado quedará cerrado para el período seleccionado." icon={<Scale size={20}/>} confirmLabel="Guardar resultado final" busy={saving} error={confirmError} onClose={() => setConfirming(false)} onConfirm={() => void save()}><div className="rounded-xl bg-slate-50 p-4"><strong>{data.person}</strong><span className="mt-1 block text-sm text-slate-500">{data.role} · {data.team} · {data.period}</span></div><dl className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-xl border p-3"><dt className="text-xs font-bold uppercase text-slate-500">Puntaje enviado</dt><dd className="mt-1 text-2xl font-bold">{data.originalScore.toFixed(2)}</dd><small>{originalLevel}</small></div><div className="rounded-xl border p-3"><dt className="text-xs font-bold uppercase text-slate-500">Puntaje final</dt><dd className="mt-1 text-2xl font-bold">{score.toFixed(2)}</dd><small>{finalLevel}</small></div></dl>{originalLevel!==finalLevel&&<p className="mt-4 rounded-xl bg-sky-50 p-3 text-sm font-semibold text-sky-900">El nivel cambiará de {originalLevel} a {finalLevel}.</p>}{significantAdjustment && <p role="alert" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">La diferencia supera ±0.25. Confirma que la justificación contiene la evidencia del ajuste.</p>}<p className="mt-4 text-sm text-slate-700">Después de guardar, la calibración no podrá modificarse.</p></ConfirmationDialog>}</main>;
}
