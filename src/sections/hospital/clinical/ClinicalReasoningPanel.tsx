import { useState } from "react";
import { GlassCard, SectionTitle } from "@/components/ui";
import { AlertTriangle } from "lucide-react";
import { CALCS, TOKEN } from "./clinicalConsts";
import { DiagnosisCausePanel } from "./DiagnosisCausePanel";

const H = { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` };
const api = (m: string, p: string, b?: unknown) => fetch(`/api/clinical${p}`, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined }).then((r) => r.json());
const SEV: Record<string, string> = { normal: "text-emerald-400", mild: "text-yellow-400", moderate: "text-orange-400", severe: "text-red-400", critical: "text-rose-500 font-bold animate-pulse" };

export function ClinicalReasoningPanel() {
  const [tab, setTab] = useState<"reason" | "calc" | "dx">("reason");
  const [query, setQuery] = useState(""); const [reasoning, setReasoning] = useState<any>(null); const [mcp, setMcp] = useState<any>(null); const [interpretation, setInterpretation] = useState<any>(null); const [sourcePlan, setSourcePlan] = useState<any>(null); const [safety, setSafety] = useState<any>(null); const [evidence, setEvidence] = useState<any>(null); const [rl, setRl] = useState(false);
  const [calcId, setCalcId] = useState("bmi"); const [fields, setFields] = useState<Record<string, string>>({}); const [result, setResult] = useState<any>(null); const [err, setErr] = useState("");
  const [speakState, setSpeakState] = useState("");
  const runR = async () => { if (!query.trim()) return; setRl(true); setErr(""); try { const body = await api("POST", "/reason", { query }); setReasoning(body.reasoning); setMcp(body.mcp); setInterpretation(body.interpretation); setSourcePlan(body.sourcePlan); setSafety(body.safety); setEvidence(body.evidence); } catch (e) { setErr(String(e)); } finally { setRl(false); } };
  const speak = async () => {
    const text = reasoning?.understanding || query;
    if (!text) return;
    setSpeakState("speaking…");
    try {
      const r = await fetch("/api/avatar/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, language: "en-IN", mode: "avatar" }) });
      const j = await r.json();
      setSpeakState(j.status ? `${j.status}${j.note ? " — " + j.note : ""}` : "failed");
    } catch (e) { setSpeakState(String(e)); }
  };
  const runC = async () => { setErr(""); setResult(null); try { const b: any = {}; const c = CALCS.find((x) => x.id === calcId)!; for (const f of c.fields) { const v = fields[f.k] ?? f.v; b[f.k] = f.bool ? v === "true" : f.options ? v : Number(v); } const r = await api("POST", `/calculate/${calcId}`, b); if (r.error) setErr(r.error); else setResult(r.result); } catch (e) { setErr(String(e)); } };
  const calc = CALCS.find((c) => c.id === calcId)!;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <SectionTitle title="🧠 Clinical AI Reasoning" subtitle="Differential Dx + evidence calculators" />
        <div className="ml-auto flex gap-2">
          <button onClick={() => setTab("reason")} className={`btn-xs ${tab === "reason" ? "bg-violet-600" : "bg-slate-700"}`}>DDx</button>
          <button onClick={() => setTab("calc")} className={`btn-xs ${tab === "calc" ? "bg-cyan-600" : "bg-slate-700"}`}>Calc</button>
          <button onClick={() => setTab("dx")} className={`btn-xs ${tab === "dx" ? "bg-emerald-600" : "bg-slate-700"}`}>Dx & Cause</button>
        </div>
      </div>
      {err && <div className="text-xs text-rose-300 bg-rose-900/30 px-3 py-1 rounded">{err}</div>}
      {tab === "reason" && <GlassCard>
        <div className="flex gap-2 mb-3"><input className="input-dark text-xs flex-1" placeholder="fever with falling platelets and petechial rash" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runR()} /><button onClick={runR} disabled={rl} className="btn-xs bg-violet-600">{rl ? "..." : "Analyze"}</button>{reasoning && <button onClick={speak} className="btn-xs bg-cyan-700">Speak + Avatar</button>}</div>
        {speakState && <div className="text-[11px] text-slate-400 mb-2">{speakState}</div>}
        {reasoning && <div className="space-y-2 text-xs">
          {(interpretation || sourcePlan || safety) && <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px]">
            {interpretation && <div className="p-2 rounded bg-violet-900/20 border border-violet-800"><b className="text-violet-300">Turn interpretation</b><div>{interpretation.intent} · {interpretation.responseMode}</div><div className="text-slate-400">{interpretation.language} · evidence: {interpretation.evidenceSufficiency}</div></div>}
            {sourcePlan && <div className="p-2 rounded bg-cyan-900/20 border border-cyan-800"><b className="text-cyan-300">Evidence plan</b><div>{sourcePlan.stores?.join(" · ") || "No internal store selected"}</div><div className="text-slate-400">RAG: {sourcePlan.ragRequired ? "required" : "not required"} · patient truth: {sourcePlan.patientTruthRequired ? "required" : "optional"}</div></div>}
            {safety && <div className="p-2 rounded bg-amber-900/20 border border-amber-800"><b className="text-amber-300 flex items-center gap-1"><AlertTriangle size={12}/> Safety gate</b><div>Doctor confirmation required</div><div className="text-slate-400">{safety.openCriticalAlertCount ?? 0} critical alerts · {safety.staleSources?.length ?? 0} stale sources</div></div>}
            {evidence && <div className="p-2 rounded bg-slate-800/70 border border-slate-700"><b className="text-slate-200">Evidence provenance</b><div>{evidence.citationCount ?? 0} citation(s) · sufficiency: {evidence.sufficiency}</div><div className="text-slate-400">Patient facts: {evidence.livePatientFactsMustComeFrom}</div></div>}
          </div>}
          <div><b className="text-violet-300">Understanding:</b> {reasoning.understanding}</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div className="p-2 rounded bg-emerald-900/20 border border-emerald-800"><b className="text-emerald-400">Likely</b>{reasoning.differential?.likely?.map((d: string, i: number) => <div key={i}>• {d}</div>)}</div>
            <div className="p-2 rounded bg-amber-900/20 border border-amber-800"><b className="text-amber-400">Possible</b>{reasoning.differential?.possible?.map((d: string, i: number) => <div key={i}>• {d}</div>)}</div>
            <div className="p-2 rounded bg-rose-900/20 border border-rose-800"><b className="text-rose-400 flex items-center gap-1"><AlertTriangle size={12}/> Must Not Miss</b>{reasoning.differential?.mustNotMiss?.map((d: string, i: number) => <div key={i}>• {d}</div>)}</div>
          </div>
          <div><b className="text-cyan-300">Next Tests:</b><ul className="list-disc list-inside text-slate-300">{reasoning.nextHighValueTest?.map((t: string, i: number) => <li key={i}>{t}</li>)}</ul></div>
          <div className="text-[11px] text-slate-400 italic">{reasoning.uncertaintyStatement}</div>
          {mcp?.servers && <div className="text-[11px] text-slate-400">MCP: {mcp.servers.map((s: { id: string; status: string }) => `${s.id} (${s.status})`).join(" · ") || "none configured"} — tools are listed, never auto-run.</div>}
        </div>}
      </GlassCard>}
      {tab === "calc" && <GlassCard>
        <div className="flex gap-2 mb-3 flex-wrap">{CALCS.map((c) => <button key={c.id} onClick={() => { setCalcId(c.id); setResult(null); setFields({}); }} className={`btn-xs ${calcId === c.id ? "bg-cyan-600" : "bg-slate-700"}`}><c.icon size={12}/> {c.name}</button>)}</div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">{calc.fields.map((f) => <div key={f.k}><label className="text-[10px] text-slate-400">{f.l}</label>
          {f.options ? <select className="input-dark text-xs w-full" onChange={(e) => setFields((p) => ({ ...p, [f.k]: e.target.value }))}>{f.options.map((o) => <option key={o}>{o}</option>)}</select>
          : f.bool ? <select className="input-dark text-xs w-full" onChange={(e) => setFields((p) => ({ ...p, [f.k]: e.target.value }))}><option value="false">No</option><option value="true">Yes</option></select>
          : <input className="input-dark text-xs w-full" defaultValue={f.v} onChange={(e) => setFields((p) => ({ ...p, [f.k]: e.target.value }))} />}</div>)}</div>
        <button onClick={runC} className="btn-xs bg-cyan-600">Calculate</button>
        {result && <div className="mt-3 p-3 rounded bg-slate-800/60 border border-cyan-800"><div className="flex items-center gap-2"><calc.icon size={16} className="text-cyan-400"/><b className="text-white">{result.name}</b></div><div className={`text-2xl font-bold mt-1 ${SEV[result.severity] ?? "text-white"}`}>{result.value} <span className="text-sm text-slate-400">{result.unit}</span></div><div className="text-sm text-slate-300">{result.interpretation}</div><div className="text-[10px] text-slate-500">{result.formula} · {result.source}</div></div>}
      </GlassCard>}
      {tab === "dx" && (
        <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
          <DiagnosisCausePanel />
        </div>
      )}
    </div>
  );
}
