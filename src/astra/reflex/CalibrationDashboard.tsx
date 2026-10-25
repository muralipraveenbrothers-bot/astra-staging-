import React, { useEffect, useState } from "react";
import { AlertCircle, BarChart3, Save } from "lucide-react";
import { apiFetch } from "@/services/apiFetch";

interface ShadowSchema { id: string; mode: "SHADOW" | "ASSIST" | "AUTO"; topConfusions?: unknown[] }

export function CalibrationDashboard() {
  const [schemas, setSchemas] = useState<ShadowSchema[]>([]);
  const [selected, setSelected] = useState("");
  const [mode, setMode] = useState<"SHADOW" | "ASSIST" | "AUTO">("SHADOW");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    apiFetch("/api/reflex/shadow").then((r) => r.json()).then((body) => setSchemas(body.schemas ?? [])).catch(() => setSchemas([]));
  }, []);

  const save = async () => {
    if (!selected || reason.trim().length < 15) {
      setMessage("Admin reason required");
      return;
    }
    const body = await apiFetch(`/api/reflex/schemas/${encodeURIComponent(selected)}/mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, reason, outcomes: [] }),
    }).then((r) => r.json());
    setMessage(body.ok ? "Mode request recorded" : (body.error ?? body.reasons?.join(", ") ?? "Mode change refused"));
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2"><BarChart3 size={18} className="text-cyan-300" /> Calibration Dashboard</h2>
          <p className="text-xs text-slate-400">Clinical schema AUTO is disabled; promotion requires labelled shadow outcomes and admin reason.</p>
        </div>
      </div>
      {schemas.length === 0 ? <div className="rounded border border-white/10 p-3 text-sm text-slate-400">No reflex data yet</div> : (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4">
          <div className="space-y-2">
            {schemas.filter((s) => s.id.startsWith("clinical.")).map((schema) => (
              <button key={schema.id} type="button" onClick={() => { setSelected(schema.id); setMode(schema.mode); }} className="w-full rounded-lg border border-white/10 bg-slate-950/40 p-3 text-left hover:bg-white/[0.05] focus:outline-none focus:ring-2 focus:ring-cyan-400">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-cyan-200">{schema.id}</span>
                  <span className="rounded border border-cyan-500/30 px-2 py-0.5 text-[10px] text-cyan-200">{schema.mode}</span>
                </div>
                <ReliabilitySvg />
                <p className="mt-1 text-[10px] text-slate-400">Outcomes by language: none labelled yet · ECE/Brier pending · promotion readiness blocked in SHADOW.</p>
              </button>
            ))}
          </div>
          <div className="rounded-lg border border-white/10 bg-slate-950/50 p-3 space-y-3">
            <h3 className="text-sm font-bold text-white">Mode change</h3>
            <select value={selected} onChange={(e) => setSelected(e.target.value)} className="w-full rounded bg-slate-950 border border-slate-700 p-2 text-xs text-white">
              <option value="">Select schema</option>
              {schemas.filter((s) => s.id.startsWith("clinical.")).map((s) => <option key={s.id} value={s.id}>{s.id}</option>)}
            </select>
            <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} className="w-full rounded bg-slate-950 border border-slate-700 p-2 text-xs text-white">
              <option value="SHADOW">SHADOW</option>
              <option value="ASSIST">ASSIST</option>
              <option value="AUTO" disabled title="Clinical schemas cannot select AUTO">AUTO disabled for clinical</option>
            </select>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Admin reason" className="min-h-20 w-full rounded bg-slate-950 border border-slate-700 p-2 text-xs text-white" />
            <button type="button" onClick={save} className="flex items-center gap-2 rounded bg-cyan-600 px-3 py-2 text-xs font-bold text-white"><Save size={14} /> Save</button>
            {message && <p className="flex items-center gap-1 text-xs text-amber-200"><AlertCircle size={13} /> {message}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function ReliabilitySvg() {
  return (
    <svg viewBox="0 0 120 42" className="mt-2 h-14 w-full" role="img" aria-label="Reliability chart">
      <line x1="8" y1="34" x2="112" y2="34" stroke="#475569" />
      <line x1="8" y1="34" x2="112" y2="4" stroke="#164e63" />
      <polyline points="8,34 32,30 56,24 80,17 112,10" fill="none" stroke="#22d3ee" strokeWidth="2" />
    </svg>
  );
}
