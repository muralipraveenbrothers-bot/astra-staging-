import { useMemo, useState } from "react";
import { AlertTriangle, BrainCircuit, CheckSquare, FlaskConical, Send, ShieldCheck, Stethoscope, TestTube2, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/services/apiFetch";
import { useAuth } from "@/lib/auth";
import { confirmDiagnosisByDoctor, confirmTickedInvestigations } from "@/lib/clinicalConfirm";
import { publishWorkflowEvent } from "@/astra/clinical/workflow/workflowClient";
import { latestResultReport } from "@/astra/clinical/results/resultsClient";
import { TOKEN } from "./clinicalConsts";

const H = { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` };
const api = (b?: unknown) =>
  apiFetch("/api/clinical/scientist/analyze", { method: "POST", headers: H, body: JSON.stringify(b) }).then(async (r) => {
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  });

export interface PanelPatient {
  name?: string;
  age?: number;
  gender?: string;
  uhid?: string;
  bed?: string;
  diagnosis?: string;
  complaints?: string;
  vitals?: { bp?: string; hr?: number; temp?: number; spo2?: number; rr?: number };
}

interface PanelProps {
  patient?: PanelPatient | null;
  onConfirmDraftOrder?: (draft: any) => void;
  className?: string;
}

const TIER_META: Record<string, { label: string; color: string; border: string; bg: string }> = {
  "most-likely": { label: "Most Likely", color: "#5EF2C2", border: "border-emerald-500/30", bg: "rgba(94,242,194,0.06)" },
  expanded: { label: "Expanded Differential", color: "#FFD84D", border: "border-amber-500/30", bg: "rgba(255,216,77,0.06)" },
  "cant-miss": { label: "Can't-Miss", color: "#FF7A6B", border: "border-rose-500/30", bg: "rgba(255,122,107,0.07)" },
};

const GROUP_ORDER: Record<string, number> = { Urgent: 0, Confirmatory: 1, Optional: 2 };

const LADDER_STEPS = [
  { k: "molecular", label: "MOLECULAR" },
  { k: "cellular", label: "CELLULAR" },
  { k: "tissue", label: "TISSUE" },
  { k: "organ", label: "ORGAN" },
  { k: "system", label: "SYSTEM" },
  { k: "multiOrgan", label: "MULTI-ORGAN" },
];

const LADDER_CSS = `
@keyframes dxp-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
.dxp-rise { animation: dxp-rise .45s both; }
@keyframes dxp-bar { from { width: 0; } }
.dxp-bar { animation: dxp-bar .8s cubic-bezier(.2,.7,.3,1) both; }
`;

export function DiagnosisCausePanel({ patient, onConfirmDraftOrder, className = "" }: PanelProps) {
  const [freeComplaint, setFreeComplaint] = useState("");
  const [freeHistory, setFreeHistory] = useState("");
  const [analysis, setAnalysis] = useState<any>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastCase, setLastCase] = useState<any>(null);
  const [basket, setBasket] = useState<Set<string>>(new Set());
  const [selectedInvestigations, setSelectedInvestigations] = useState<Set<string>>(new Set());
  const [dispatching, setDispatching] = useState(false);
  const [ruledOut, setRuledOut] = useState<Set<string>>(new Set());
  const [confirmedDiagnosis, setConfirmedDiagnosis] = useState<{ diagnosis: string; decisionId: string } | null>(null);
  const [confirmingDx, setConfirmingDx] = useState("");
  const { account } = useAuth();
  const isDoctor = (account?.role ?? "").toLowerCase() === "doctor";
  const [resTest, setResTest] = useState("");
  const [resValue, setResValue] = useState("");
  const [speakState, setSpeakState] = useState("");

  const buildCase = () => {
    if (patient) {
      const v = patient.vitals ?? {};
      const c: any = {
        complaint: [patient.diagnosis, patient.complaints].filter(Boolean).join(" — ") || "Not recorded",
        vitals: { bp: v.bp, hr: v.hr, temp: v.temp, spo2: v.spo2, rr: v.rr },
        patient: { age: patient.age, sex: patient.gender },
      };
      return c;
    }
    const c: any = { complaint: freeComplaint.trim() };
    if (freeHistory.trim()) c.history = freeHistory.trim();
    return c;
  };

  const run = async () => {
    const c = buildCase();
    if (!c.complaint) { setErr("Enter a presenting complaint first."); return; }
    setErr(""); setBusy(true); setBasket(new Set()); setSelectedInvestigations(new Set()); setRuledOut(new Set()); setConfirmedDiagnosis(null);
    try {
      const r = await api({ caseData: c });
      setLastCase(c); setAnalysis(r.analysis);
    } catch (e: any) { setErr(String(e?.message || e)); } finally { setBusy(false); }
  };

  const addResult = async () => {
    if (!analysis || !resTest.trim() || !resValue.trim()) return;
    setErr(""); setBusy(true);
    try {
      const r = await api({ caseData: lastCase, prior: analysis, newResult: { test: resTest.trim(), value: resValue.trim() } });
      setAnalysis(r.analysis);
    } catch (e: any) { setErr(String(e?.message || e)); } finally { setBusy(false); }
  };

  /**
   * R5-06: re-analysis runs ONLY when the doctor presses this button. It pulls
   * the latest uploaded report (closed-loop results) and re-runs R5-03 with it.
   * Every new suggestion restarts unticked and must pass the R5-01 gate —
   * there is no automatic diagnosis change.
   */
  const reanalyzeWithNewResults = async () => {
    if (!patient?.uhid) { toast.error("Select a patient first."); return; }
    setErr(""); setBusy(true);
    try {
      const report = await latestResultReport(patient.uhid);
      if (!report) { toast.info("No uploaded report found for this patient yet."); return; }
      const value = report.pdfOnly
        ? (report.impression?.trim() || "PDF/image-only report — manual review required")
        : report.values.map((v) => `${v.param} ${v.value}${v.unit ? ` ${v.unit}` : ""}`).join("; ");
      const r = await api({ caseData: lastCase ?? buildCase(), prior: analysis ?? undefined, newResult: { test: `${report.testName} (v${report.version})`, value } });
      setAnalysis(r.analysis);
      if (!lastCase) setLastCase(buildCase());
      // Suggestions restart unchecked — nothing is ordered or diagnosed automatically.
      setBasket(new Set()); setSelectedInvestigations(new Set()); setRuledOut(new Set()); setConfirmedDiagnosis(null);
      toast.success("Re-analysis complete — suggestions are unchecked and need your approval (R5-01).", {
        description: `${report.testName} v${report.version}${report.pdfOnly ? " (PDF/image-only — manual review)" : ""} fed into the DDx matrix.`,
      });
    } catch (e: any) { setErr(String(e?.message || e)); } finally { setBusy(false); }
  };

  const speak = async () => {
    if (!analysis?.spokenSummary) return;
    setSpeakState("speaking…");
    try {
      const r = await fetch("/api/avatar/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: analysis.spokenSummary, language: "en-IN", mode: "avatar" }) });
      const j = await r.json();
      setSpeakState(j.status ? `${j.status}${j.note ? " — " + j.note : ""}` : "failed");
    } catch (e) { setSpeakState(String(e)); }
  };

  const focusAnatomy = (structure?: string) => {
    if (!structure) return;
    window.dispatchEvent(new CustomEvent("astra-anatomy-select", { detail: { structure } }));
  };

  const draft = useMemo(() => Array.from(basket), [basket]);
  const selectedPlan = useMemo(() => (analysis?.investigationPlanner ?? []).filter((item: any) => selectedInvestigations.has(item.id)), [analysis, selectedInvestigations]);
  const confirmDraft = () => {
    if (!onConfirmDraftOrder || draft.length === 0) return;
    if (!patient?.uhid) {
      toast.error("No patient selected. Please select a patient before confirming an order.");
      return;
    }
    onConfirmDraftOrder({
      targetDept: "Laboratory Workstation",
      patientName: patient?.name ?? "Active Patient",
      patientUhid: patient.uhid,
      bed: patient?.bed ?? "Bed-01",
      itemSummary: draft.join(" + "),
      items: draft,
      priority: "ROUTINE",
      orderType: "LABORATORY",
    });
    setBasket(new Set());
  };

  const confirmInvestigations = async (only?: "laboratory" | "radiology") => {
    if (!patient?.uhid || selectedInvestigations.size === 0) return;
    setDispatching(true);
    try {
      const plan: any[] = (analysis?.investigationPlanner ?? []).filter((item: any) => !only || item.orderCategory === only);
      const result = await confirmTickedInvestigations({
        plan,
        tickedIds: selectedInvestigations,
        patientUhid: patient.uhid,
        actor: { id: account?.id, role: account?.role },
        publish: publishWorkflowEvent,
      });
      const sent = result.dispatched.map((item) => `${item.name} (${item.orderId})`);
      if (!result.ok) {
        toast.error(`${result.error ?? "Could not send the investigations."}${sent.length ? ` Already sent: ${sent.join(", ")}` : ""}`);
      } else if (sent.length === 0) {
        toast.info("No lab or radiology investigations were ticked for dispatch.");
      } else {
        toast.success(`Investigations sent with doctor approval: ${sent.join(", ")}`);
      }
      if (result.ok) {
        setSelectedInvestigations((prev) => {
          const next = new Set(prev);
          for (const item of plan) next.delete(item.id);
          return next;
        });
      }
    } catch (e: any) {
      toast.error(String(e?.message || e));
    } finally {
      setDispatching(false);
    }
  };

  const toggleRuledOut = (rowId: string) => {
    setRuledOut((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId); else next.add(rowId);
      return next;
    });
  };

  const confirmFinalDiagnosis = async (row: { id: string; diagnosis: string }) => {
    if (!patient?.uhid) { toast.error("Select a patient first."); return; }
    setConfirmingDx(row.id);
    try {
      const result = await confirmDiagnosisByDoctor({
        patientUhid: patient.uhid,
        diagnosis: row.diagnosis,
        ddxRowId: row.id,
        actorRole: account?.role,
        doctorClicked: true,
      });
      if (!result.ok) { toast.error(result.error); return; }
      setConfirmedDiagnosis({ diagnosis: row.diagnosis, decisionId: result.decisionId });
      toast.success(`Final diagnosis confirmed by doctor: ${row.diagnosis}`);
    } finally {
      setConfirmingDx("");
    }
  };

  const matrixRows: any[] = Array.isArray(analysis?.ddxMatrix) ? analysis.ddxMatrix : [];
  const matrixWarning: string | null = analysis
    ? (analysis.schemaWarning ?? (matrixRows.length ? null : "The cause-finder did not return a DDx matrix."))
    : null;
  const orderedMatrix = [...matrixRows].sort((a, b) => {
    const pa = a.pinnedRedFlag && !ruledOut.has(a.id) ? 0 : ruledOut.has(a.id) ? 2 : 1;
    const pb = b.pinnedRedFlag && !ruledOut.has(b.id) ? 0 : ruledOut.has(b.id) ? 2 : 1;
    return pa - pb;
  });

  return (
    <div className={`space-y-3 text-xs ${className}`}>
      <style>{LADDER_CSS}</style>

      {/* Input area */}
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
        {patient ? (
          <div className="flex items-center gap-2 text-[11px] text-slate-300">
            <Stethoscope size={14} className="text-sky-400" />
            <b className="text-white">{patient.name}</b> ({patient.uhid}) · {patient.age}y/{patient.gender} · {patient.bed}
          </div>
        ) : (
          <>
            <textarea className="input-dark text-xs w-full" rows={2} placeholder="Presenting complaint — e.g. 58M chest pain with ST elevation, diaphoresis" value={freeComplaint} onChange={(e) => setFreeComplaint(e.target.value)} />
            <textarea className="input-dark text-xs w-full" rows={1} placeholder="History (optional) — e.g. smoker, diabetic, 2h retrosternal crushing pain" value={freeHistory} onChange={(e) => setFreeHistory(e.target.value)} />
          </>
        )}
        <div className="flex items-center gap-2">
          <button onClick={run} disabled={busy} className="btn-xs bg-violet-600">{busy ? "Analyzing…" : "Run Scientist"}</button>
          {patient?.uhid && (
            <button onClick={reanalyzeWithNewResults} disabled={busy} data-testid="reanalyze-with-new-results" className="btn-xs bg-rose-700" title="Runs R5-03 again with the latest uploaded report. Suggestions stay unticked until you approve them.">
              {busy ? "Re-analyzing…" : "Re-analyze with new results"}
            </button>
          )}
          {analysis && <button onClick={speak} className="btn-xs bg-cyan-700 flex items-center gap-1"><Volume2 size={11} /> Speak</button>}
          {speakState && <span className="text-[10px] text-slate-400">{speakState}</span>}
        </div>
      </div>

      {err && <div className="text-[11px] text-rose-300 bg-rose-900/30 px-3 py-1 rounded">{err}</div>}

      {analysis && (
        <>
          {/* Header meta */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${analysis.mode === "llm-augmented" ? "bg-violet-900/30 text-violet-300 border-violet-500/30" : "bg-slate-800 text-slate-300 border-slate-600/40"}`}>
              <BrainCircuit size={11} className="inline mr-1" />
              {analysis.mode === "llm-augmented" ? `LLM-augmented${analysis.llm?.model ? ` · ${analysis.llm.model}` : ""}` : "Rules-only (all LLMs offline)"}
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-600/40">Revision {analysis.revision}</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-900/30 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
              <ShieldCheck size={11} /> Decision support only — doctor confirms
            </span>
          </div>

          {/* Problem representation + case summary */}
          <div className="rounded-xl border border-violet-500/30 bg-violet-900/15 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-violet-300 mb-1">Problem Representation</div>
            <div className="text-slate-200 leading-relaxed">{analysis.problemRepresentation}</div>
            {analysis.caseSummary?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {analysis.caseSummary.map((s: string, i: number) => (
                  <span key={i} className="px-2 py-0.5 rounded-full text-[10px] bg-white/5 border border-white/10 text-slate-300">{s}</span>
                ))}
              </div>
            )}
          </div>

          {/* Red flags */}
          {analysis.redFlags?.length > 0 && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-950/25 p-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-rose-300 mb-1.5 flex items-center gap-1"><AlertTriangle size={12} /> Deterministic Red-Flag Rules</div>
              {analysis.redFlags.map((f: string, i: number) => <div key={i} className="text-rose-200/90 leading-relaxed">• {f}</div>)}
            </div>
          )}

          {matrixWarning ? (
            <div data-testid="ddx-matrix-fallback" className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-3 text-amber-200">
              <b>DDx matrix unavailable.</b> {matrixWarning} The tiered hypotheses below remain available as decision support.
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-white/60">Rule-In / Rule-Out Matrix</div>
                  <div className="text-[10px] text-slate-500">Percentages are derived estimates. Red flags stay pinned until the doctor marks them ruled out.</div>
                </div>
                <CheckSquare size={15} className="text-cyan-300" />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-[10px]">
                  <thead className="text-slate-400 uppercase">
                    <tr className="border-b border-white/10">
                      <th className="text-left py-1.5 pr-2">Diagnosis</th>
                      <th className="text-left py-1.5 pr-2">Probability</th>
                      <th className="text-left py-1.5 pr-2">Confidence</th>
                      <th className="text-left py-1.5 pr-2">Supports</th>
                      <th className="text-left py-1.5 pr-2">Against / missing</th>
                      <th className="text-left py-1.5 pr-2">Definitive rule-out</th>
                      <th className="text-left py-1.5 pr-2">Settling test</th>
                      <th className="text-left py-1.5 pr-2">Doctor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderedMatrix.map((row: any) => {
                      const isRuledOut = ruledOut.has(row.id);
                      const pinned = row.pinnedRedFlag && !isRuledOut;
                      return (
                      <tr key={row.id} className={`border-b border-white/5 align-top ${pinned ? "bg-rose-950/20" : ""} ${isRuledOut ? "opacity-50" : ""}`}>
                        <td className="py-2 pr-2 text-white font-semibold">
                          {pinned && <span className="mr-1 text-rose-300">PINNED RED FLAG</span>}
                          <span className={isRuledOut ? "line-through" : ""}>{row.diagnosis}</span>
                          {isRuledOut && <span className="ml-1 text-emerald-300 no-underline">ruled out by doctor</span>}
                        </td>
                        <td className="py-2 pr-2">
                          <div className="w-24 h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-cyan-400" style={{ width: `${row.probabilityEstimatePct}%` }} /></div>
                          <span className="font-mono text-cyan-200">{row.probabilityEstimatePct}% est.</span>
                        </td>
                        <td className="py-2 pr-2 text-slate-200">{row.confidence}</td>
                        <td className="py-2 pr-2 text-emerald-200">{row.supports.join("; ")}</td>
                        <td className="py-2 pr-2 text-amber-200">{row.againstOrMissing.join("; ")}</td>
                        <td className="py-2 pr-2 text-slate-300">{row.definitiveRuleOutCriterion}</td>
                        <td className="py-2 pr-2 text-cyan-200">{row.nextTestThatSettlesIt}</td>
                        <td className="py-2 pr-2 space-y-1">
                          {row.pinnedRedFlag && (
                            <button type="button" disabled={!isDoctor} title={isDoctor ? "" : "Doctor only"} onClick={() => toggleRuledOut(row.id)} className="block rounded border border-rose-400/40 px-1.5 py-0.5 text-[9px] text-rose-200 disabled:opacity-40">
                              {isRuledOut ? "Undo rule-out" : "Mark ruled out"}
                            </button>
                          )}
                          {!isRuledOut && (
                            <button type="button" disabled={!isDoctor || confirmingDx === row.id} title={isDoctor ? "" : "Doctor only"} onClick={() => void confirmFinalDiagnosis(row)} className="block rounded border border-emerald-400/40 px-1.5 py-0.5 text-[9px] text-emerald-200 disabled:opacity-40">
                              {confirmingDx === row.id ? "Saving..." : "Confirm as final Dx"}
                            </button>
                          )}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="rounded-lg border border-indigo-500/20 bg-indigo-950/20 p-2 text-[11px] text-indigo-100">
                <b>Cause chain:</b> {analysis.causeChain || "not available"}
              </div>
              {confirmedDiagnosis ? (
                <div data-testid="doctor-confirmed-diagnosis" className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-2 text-[11px] text-emerald-100">
                  <b>Final diagnosis (doctor-confirmed):</b> {confirmedDiagnosis.diagnosis} <span className="text-emerald-300/70">approval {confirmedDiagnosis.decisionId}</span>
                </div>
              ) : (
                <div className="text-[10px] text-slate-500">No final diagnosis is saved until the doctor presses "Confirm as final Dx".</div>
              )}
            </div>
          )}

          {/* Tier cards */}
          {(["most-likely", "expanded", "cant-miss"] as const).map((tier) => {
            const hs = (analysis.hypotheses ?? []).filter((h: any) => h.tier === tier);
            if (hs.length === 0) return null;
            const meta = TIER_META[tier];
            return (
              <div key={tier} className={`rounded-xl border ${meta.border} p-3 space-y-2`} style={{ background: meta.bg }}>
                <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: meta.color }}>{meta.label}</div>
                {hs.map((h: any, i: number) => (
                  <div key={i} className="rounded-lg border border-white/10 bg-black/25 p-2.5 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <b className="text-white">{h.diagnosis}</b>
                      {h.source === "llm" && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-violet-900/40 text-violet-300 border border-violet-500/30">LLM</span>}
                      {h.lastUpdate && <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${h.lastUpdate.delta >= 0 ? "bg-emerald-900/40 text-emerald-300 border-emerald-500/30" : "bg-rose-900/40 text-rose-300 border-rose-500/30"}`}>{h.lastUpdate.delta >= 0 ? "▲" : "▼"} {Math.round(h.lastUpdate.delta * 100)}%</span>}
                      <span className="ml-auto font-mono font-bold" style={{ color: meta.color }}>{Math.round(h.probability * 100)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div className="dxp-bar h-full rounded-full" style={{ width: `${Math.min(100, h.probability * 100)}%`, background: meta.color }} />
                    </div>
                    <div className="text-[10px] text-slate-400">{h.reasoning}</div>
                    {h.supports?.length > 0 && <div className="text-[10px]"><span className="text-emerald-400 font-bold">Supports: </span><span className="text-slate-300">{h.supports.join(" · ")}</span></div>}
                    {h.against?.length > 0 && <div className="text-[10px]"><span className="text-amber-400 font-bold">Against: </span><span className="text-slate-300">{h.against.join(" · ")}</span></div>}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[9px] uppercase tracking-wider text-white/40 font-bold">{h.rootCauseCategory}</span>
                      {h.anatomyFocus && (
                        <button onClick={() => focusAnatomy(h.anatomyFocus)} className="btn-xs bg-slate-700 flex items-center gap-1" title="Highlight organ in 3D anatomy viewer">
                          <FlaskConical size={10} /> {h.anatomyFocus}
                        </button>
                      )}
                    </div>
                    {h.mechanism && <MechanismLadder mechanism={h.mechanism} />}
                  </div>
                ))}
              </div>
            );
          })}

          {/* Unexplained findings */}
          {analysis.unexplainedFindings?.length > 0 && (
            <div className="rounded-xl border border-orange-500/30 bg-orange-950/15 p-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-orange-300 mb-1">Unexplained Findings (anti-anchoring)</div>
              {analysis.unexplainedFindings.map((f: string, i: number) => <div key={i} className="text-orange-200/90 leading-relaxed">• {f}</div>)}
            </div>
          )}

          {analysis.investigationPlanner?.length > 0 && (
            <div className="rounded-xl border border-teal-500/30 bg-teal-950/15 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-teal-300 flex items-center gap-1"><TestTube2 size={12} /> Investigation Planner</div>
                  <div className="text-[10px] text-slate-500">All suggestions start unchecked. Confirming creates orders only for ticked tests through the approval gate.</div>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <button onClick={() => void confirmInvestigations()} disabled={dispatching || selectedPlan.length === 0 || !patient?.uhid || !isDoctor} title={isDoctor ? "" : "Doctor only"} className="btn-xs bg-teal-700 flex items-center gap-1">
                    <Send size={11} /> {dispatching ? "Sending..." : "Confirm Investigations"}
                  </button>
                  <button onClick={() => void confirmInvestigations("laboratory")} disabled={dispatching || !selectedPlan.some((item: any) => item.orderCategory === "laboratory") || !patient?.uhid || !isDoctor} className="btn-xs bg-cyan-800">SEND TO LAB</button>
                  <button onClick={() => void confirmInvestigations("radiology")} disabled={dispatching || !selectedPlan.some((item: any) => item.orderCategory === "radiology") || !patient?.uhid || !isDoctor} className="btn-xs bg-indigo-800">SEND TO RADIOLOGY</button>
                </div>
              </div>
              <div className="space-y-1.5">
                {[...analysis.investigationPlanner].sort((a: any, b: any) => (GROUP_ORDER[a.group] ?? 9) - (GROUP_ORDER[b.group] ?? 9)).map((item: any) => {
                  const checked = selectedInvestigations.has(item.id);
                  const row = analysis.ddxMatrix?.find((r: any) => r.id === item.movesDdxRowId);
                  return (
                    <label key={item.id} className={`block rounded-lg border p-2 cursor-pointer ${checked ? "border-teal-300 bg-teal-900/30" : "border-white/10 bg-black/20"}`}>
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={checked}
                          onChange={() => setSelectedInvestigations((prev) => { const next = new Set(prev); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; })}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <b className="text-white">{item.name}</b>
                            <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-white/10">{item.group}</span>
                            <span className="font-mono text-teal-200">{item.utilityPct}% utility</span>
                            <span className="px-1.5 py-0.5 rounded bg-black/30 text-slate-300 border border-white/10">{item.orderCategory === "radiology" ? "Radiology" : item.orderCategory === "laboratory" ? "Lab" : "Clinical review (not an order)"}</span>
                          </div>
                          <div className="text-slate-300 mt-1">{item.rationale}</div>
                          <div className="text-slate-500">Expected: {item.expectedAbnormalResult}</div>
                          <div className="text-slate-500">Moves: {row?.diagnosis ?? "DDx row not available"}</div>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {analysis.safeInterpretationLine && (
            <div className="rounded-xl border border-sky-500/30 bg-sky-950/15 p-3 text-sky-100">
              <b>Result pattern:</b> {analysis.safeInterpretationLine}
            </div>
          )}

          {/* Tests */}
          {analysis.tests?.length > 0 && (
            <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/15 p-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-300 mb-1.5 flex items-center gap-1"><TestTube2 size={12} /> Ranked Discriminating Tests (info-gain) — tap to draft, never auto-sent</div>
              <div className="flex flex-wrap gap-1.5">
                {analysis.tests.map((t: any) => {
                  const inBasket = basket.has(t.name);
                  return (
                    <button
                      key={t.id}
                      onClick={() => setBasket((p) => { const n = new Set(p); if (n.has(t.name)) n.delete(t.name); else n.add(t.name); return n; })}
                      title={`${t.rationale}\nWould change my mind: ${t.wouldChangeMyMind}`}
                      className={`px-2 py-1 rounded-lg text-[10px] border transition-all ${inBasket ? "border-cyan-400 text-cyan-200 bg-cyan-900/40" : "border-white/15 text-slate-200 bg-white/5 hover:border-cyan-400/60"}`}
                    >
                      {inBasket ? "✓ " : "+ "}{t.name}
                      <span className="ml-1 text-cyan-400/80 font-mono">{(t.informationGain * 100).toFixed(0)}</span>
                      <span className="ml-1 text-slate-400">{t.approximateCostRs} · {t.turnaround}</span>
                    </button>
                  );
                })}
              </div>
              {draft.length > 0 && (
                <div className="mt-2 p-2 rounded-lg border border-cyan-400/40 bg-black/30 space-y-1.5">
                  <div className="text-[10px] font-bold text-cyan-200">Draft order basket ({draft.length}) — nothing sent yet</div>
                  <div className="text-slate-300">{draft.join(" · ")}</div>
                  {onConfirmDraftOrder ? (
                    <button onClick={confirmDraft} className="btn-xs bg-cyan-600">Review & Route to Lab</button>
                  ) : (
                    <div className="text-[10px] text-slate-400 italic">Open the Doctor dashboard to route this draft (doctor confirmation required).</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Add result / update loop */}
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-white/60">Add a result — watch probabilities update</div>
            <div className="flex gap-2">
              <input className="input-dark text-xs flex-1" placeholder="Test (e.g. USG Abdomen)" value={resTest} onChange={(e) => setResTest(e.target.value)} />
              <input className="input-dark text-xs flex-1" placeholder="Result (e.g. dilated CBD)" value={resValue} onChange={(e) => setResValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addResult()} />
              <button onClick={addResult} disabled={busy} className="btn-xs bg-violet-600">{busy ? "…" : "Apply"}</button>
            </div>
            {analysis.update?.entries?.length > 0 && (
              <div className="space-y-1">
                {analysis.update.entries.map((en: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-[11px] font-mono">
                    <span className="text-slate-200 w-40 truncate">{en.diagnosis}</span>
                    <span className="text-slate-400">{(en.before * 100).toFixed(0)}%</span>
                    <span className="text-slate-500">→</span>
                    <span className={en.after > en.before ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>{(en.after * 100).toFixed(0)}%</span>
                    <span className={`px-1 rounded text-[9px] ${en.basis === "likelihood-ratio" ? "bg-violet-900/40 text-violet-300" : "bg-slate-800 text-slate-400"}`}>{en.basis === "likelihood-ratio" ? "LR" : "qual"}</span>
                    <span className="text-slate-500 truncate flex-1">{en.reason}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Evidence */}
          {analysis.evidence?.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-white/60 mb-1.5">Local RAG evidence</div>
              {analysis.evidence.map((e: any, i: number) => (
                <div key={i} className="mb-1.5">
                  <div className="text-[11px] font-bold text-slate-200">{e.title} <span className="text-slate-500 font-normal">— {e.source}</span></div>
                  <div className="text-[10px] text-slate-400 leading-relaxed">{e.snippet}</div>
                </div>
              ))}
              <div className="text-[10px] text-slate-500 italic">{analysis.evidenceNote}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MechanismLadder({ mechanism }: { mechanism: any }) {
  return (
    <div className="mt-1.5 pt-1.5 border-t border-white/10 space-y-1">
      <div className="flex flex-wrap items-center gap-1">
        {LADDER_STEPS.map((s, i) => (
          <span key={s.k} className="flex items-center gap-1">
            {i > 0 && <span className="text-white/25">→</span>}
            <span className="dxp-rise px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-950/60 border border-indigo-500/30 text-indigo-200" style={{ animationDelay: `${i * 110}ms` }} title={mechanism[s.k]}>
              {s.label}
            </span>
          </span>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] text-slate-400">
        {LADDER_STEPS.map((s, i) => mechanism[s.k] && (
          <div key={s.k} className="dxp-rise" style={{ animationDelay: `${i * 110 + 60}ms` }}>
            <span className="text-indigo-300/80 font-bold">{s.label}: </span>{mechanism[s.k]}
          </div>
        ))}
      </div>
      {mechanism.compensationStatus && <div className="text-[10px] text-slate-400 dxp-rise" style={{ animationDelay: "700ms" }}><span className="text-sky-300/80 font-bold">Compensation: </span>{mechanism.compensationStatus}</div>}
      {mechanism.failureWarningSigns && <div className="text-[10px] text-rose-300/90 dxp-rise" style={{ animationDelay: "820ms" }}><span className="font-bold">Failure warning: </span>{mechanism.failureWarningSigns}</div>}
    </div>
  );
}
