import { useState } from "react";
import { CheckCircle, Eye, EyeOff, Info, Pencil, Plus, RefreshCw, Sparkles, XCircle } from "lucide-react";
import { toast } from "sonner";
import { GlassCard, SectionTitle, Badge, Modal } from "@/components/ui";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { cn, uid, sleep, nowTime } from "@/lib/utils";
import type { CDSDifferential, DxStatus } from "@/lib/types";

const mockDdx = (): CDSDifferential[] => [
  { id: uid("ddx"), rank: 1, diagnosis: "Viral pharyngitis", probability: "high", confidenceScore: 85, risk: "low", rulesIn: ["Fever", "Sore throat", "Cough"], rulesOut: ["No exudate", "No lymphadenopathy"], reasoning: "Classic viral presentation with gradual onset, associated coryza symptoms, and lack of bacterial features.", guidelines: ["UpToDate · Acute pharyngitis", "IDSA Guidelines 2024"], alternatives: ["Streptococcal pharyngitis", "Infectious mononucleosis"], redFlags: [], escalation: "None required", status: "pending" },
  { id: uid("ddx"), rank: 2, diagnosis: "Streptococcal pharyngitis (GAS)", probability: "moderate", confidenceScore: 62, risk: "moderate", rulesIn: ["Fever >38.5°C", "Tonsillar exudate", "Anterior cervical lymphadenopathy"], rulesOut: ["No scarlatiniform rash", "No palatal petechiae"], reasoning: "Centor criteria score of 3 (fever, exudate, tender nodes) warrants consideration of GAS infection.", guidelines: ["Centor Criteria", "National Formulary · §5.1.1"], alternatives: ["Viral pharyngitis", "Peritonsillar abscess"], redFlags: ["Trismus suggests peritonsillar abscess"], escalation: "ENT referral if Centor = 4 or trismus present", status: "pending" },
  { id: uid("ddx"), rank: 3, diagnosis: "Infectious mononucleosis", probability: "low", confidenceScore: 35, risk: "low", rulesIn: ["Fatigue", "Lymphadenopathy", "Age 15-25"], rulesOut: ["No splenomegaly", "No hepatomegaly"], reasoning: "EBV infection typically presents with severe fatigue, generalized lymphadenopathy, and atypical lymphocytes.", guidelines: ["UpToDate · EBV infection"], alternatives: ["CMV infection", "Acute HIV"], redFlags: [], escalation: "Monitor for splenic rupture - avoid contact sports", status: "pending" },
  { id: uid("ddx"), rank: 4, diagnosis: "Peritonsillar abscess (rule out)", probability: "rule-out", confidenceScore: 20, risk: "high", rulesIn: ["Trismus", "Muffled voice", "Severe unilateral pain"], rulesOut: ["No trismus on exam", "No uvular deviation"], reasoning: "Peritonsillar abscess requires prompt ENT evaluation for possible drainage.", guidelines: ["ClinicalKey · ENT emergencies"], alternatives: ["Retropharyngeal abscess", "Ludwig angina"], redFlags: ["Airway compromise risk", "Sepsis"], escalation: "Immediate ENT referral if suspected", status: "pending" },
];

export default function DifferentialDiagnosis({ patientId, patientName }: { patientId: string; patientName: string }) {
  const { account } = useAuth();
  const { cdsDifferentials, setCdsDifferentials, logAudit } = useStore();
  const doctorName = account?.name ?? "Dr. Admin";
  const [differentials, setDifferentials] = useState<CDSDifferential[]>(cdsDifferentials);
  const [generating, setGenerating] = useState(false);
  const [explainModal, setExplainModal] = useState<CDSDifferential | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [primaryDx, setPrimaryDx] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customReason, setCustomReason] = useState("");

  const sync = (d: CDSDifferential[]) => { setDifferentials(d); setCdsDifferentials(d); };

  const generate = async () => {
    if (!patientId) { toast.error("Select a patient first"); return; }
    setGenerating(true);
    logAudit("DDx generation requested", `Patient ${patientId}`, doctorName);
    await sleep(2000);
    const results = mockDdx();
    sync(results);
    setGenerating(false);
    logAudit("DDx generated", `${results.length} differentials returned`, "CDS agent");
    toast.success("Differential diagnoses ready");
  };

  const decide = (item: CDSDifferential, status: DxStatus) => {
    const updated = differentials.map((d) => (d.id === item.id ? { ...d, status } : d));
    sync(updated);
    logAudit(`DDx ${status}`, `#${item.rank} ${item.diagnosis} — ${status} by ${doctorName}`, doctorName);
    toast(status === "accepted" ? "Diagnosis accepted" : status === "rejected" ? "Diagnosis rejected" : "Marked for edit");
  };

  const confirmPrimary = () => {
    if (!primaryDx) { toast.error("Select a primary diagnosis first"); return; }
    sync(differentials.map((d) => d.id === primaryDx ? { ...d, confirmedBy: doctorName, confirmedAt: nowTime() } : d));
    logAudit("Primary diagnosis finalized", `${differentials.find((d) => d.id === primaryDx)?.diagnosis} confirmed by ${doctorName}`, doctorName);
    setConfirmOpen(false);
    toast.success("Primary diagnosis confirmed");
  };

  const addCustom = () => {
    if (!customName.trim()) return;
    const d: CDSDifferential = {
      id: uid("ddx"), rank: differentials.length + 1, diagnosis: customName.trim(),
      probability: "low", confidenceScore: 0, risk: "low", rulesIn: [], rulesOut: [],
      reasoning: customReason || "Manual override — entered by physician", guidelines: [], alternatives: [],
      redFlags: [], escalation: "None", status: "accepted",
    };
    sync([...differentials, d]);
    logAudit("Custom DDx added", `${d.diagnosis} — manual override by ${doctorName}`, doctorName);
    setCustomOpen(false); setCustomName(""); setCustomReason("");
    toast.success("Custom diagnosis added");
  };

  const probColor = (p: string) =>
    p === "high" ? "green" : p === "moderate" ? "amber" : p === "low" ? "neutral" : "red";
  const riskColor = (r: string) =>
    r === "critical" ? "red" : r === "high" ? "amber" : r === "moderate" ? "cyan" : "green";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionTitle title="Differential Diagnosis" subtitle="AI-ranked differentials with evidence and guidelines" />
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => setCustomOpen(true)}><Plus size={14} /> Manual Override</button>
          <button className="btn-neon" onClick={() => void generate()} disabled={!patientId || generating}>
            {generating ? <><RefreshCw size={14} className="animate-spin" /> Generating…</> : <><Sparkles size={14} /> Generate DDx</>}
          </button>
        </div>
      </div>

      {differentials.length === 0 && !generating && (
        <GlassCard>
          <p className="text-sm text-slate-500 text-center py-4">No differentials yet. Enter patient symptoms and generate a DDx list.</p>
        </GlassCard>
      )}

      {generating && (
        <GlassCard>
          <div className="flex items-center justify-center gap-3 py-6">
            <span className="h-5 w-5 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
            <p className="text-sm text-slate-400">Analyzing presentation, ranking differentials…</p>
          </div>
        </GlassCard>
      )}

      {differentials.map((d, i) => (
        <GlassCard key={d.id} className={cn(
          "transition-all",
          d.status === "accepted" ? "border-emerald-400/30" :
          d.status === "rejected" ? "border-red-400/30 opacity-60" :
          d.status === "edited" ? "border-amber-400/30" : ""
        )}>
          <div className="flex items-start gap-3">
            <span className="h-7 w-7 rounded-full bg-violet-500/20 border border-violet-400/40 flex items-center justify-center text-xs font-bold text-violet-300 shrink-0 mt-0.5">
              {d.rank}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-semibold text-white">{d.diagnosis}</h3>
                <Badge tone={probColor(d.probability)} className="!text-[9px]">{d.probability}</Badge>
                <Badge tone={riskColor(d.risk)} className="!text-[9px] uppercase">{d.risk} risk</Badge>
                {d.confidenceScore > 0 && (
                  <span className="text-[10px] text-slate-500 font-mono">CI: {d.confidenceScore}%</span>
                )}
                {d.status !== "pending" && (
                  <Badge tone={d.status === "accepted" ? "green" : d.status === "rejected" ? "red" : "amber"} className="!text-[8px]">{d.status}</Badge>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                <div>
                  <p className="text-[10px] font-semibold text-slate-500 uppercase mb-1">Rules In</p>
                  <div className="flex flex-wrap gap-1">
                    {d.rulesIn.map((r, i) => <Badge key={i} tone="green" className="!text-[8px]">{r}</Badge>)}
                    {d.rulesIn.length === 0 && <span className="text-[10px] text-slate-500">None</span>}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-500 uppercase mb-1">Rules Out</p>
                  <div className="flex flex-wrap gap-1">
                    {d.rulesOut.map((r, i) => <Badge key={i} tone="neutral" className="!text-[8px]">{r}</Badge>)}
                    {d.rulesOut.length === 0 && <span className="text-[10px] text-slate-500">None</span>}
                  </div>
                </div>
              </div>

              <div className="mt-2">
                <p className="text-[10px] font-semibold text-slate-500 uppercase mb-1">Reasoning</p>
                <p className="text-xs text-slate-300 leading-relaxed">{d.reasoning}</p>
              </div>

              {d.guidelines.length > 0 && (
                <div className="mt-2">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase mb-1">Guidelines</p>
                  <div className="flex flex-wrap gap-1">
                    {d.guidelines.map((g, i) => <Badge key={i} tone="violet" className="!text-[8px]">{g}</Badge>)}
                  </div>
                </div>
              )}

              {d.redFlags.length > 0 && (
                <div className="mt-2 rounded-lg border border-red-400/30 bg-red-400/10 p-2">
                  <p className="text-[10px] font-bold text-red-300 uppercase">Red Flags</p>
                  {d.redFlags.map((rf, i) => <p key={i} className="text-xs text-red-200">⚠ {rf}</p>)}
                  <p className="text-xs text-amber-300 mt-1">Escalation: {d.escalation}</p>
                </div>
              )}

              <div className="flex gap-2 mt-3 flex-wrap">
                <button className="btn-ghost !text-xs !py-1" onClick={() => decide(d, "accepted")}><CheckCircle size={12} /> Accept</button>
                <button className="btn-ghost !text-xs !py-1" onClick={() => decide(d, "edited")}><Pencil size={12} /> Edit</button>
                <button className="btn-ghost !text-xs !py-1" onClick={() => decide(d, "rejected")}><XCircle size={12} /> Reject</button>
                <button className="btn-ghost !text-xs !py-1" onClick={() => setExplainModal(d)}><Info size={12} /> AI Explain</button>
              </div>
            </div>
          </div>
        </GlassCard>
      ))}

      {differentials.length > 0 && (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Primary Diagnosis:</span>
            <select className="input-dark !w-64" value={primaryDx ?? ""} onChange={(e) => setPrimaryDx(e.target.value)}>
              <option value="">— Select —</option>
              {differentials.map((d) => (
                <option key={d.id} value={d.id}>{d.diagnosis}</option>
              ))}
            </select>
          </div>
          <button className="btn-neon" onClick={() => setConfirmOpen(true)} disabled={!primaryDx}>
            <CheckCircle size={14} /> Confirm Primary
          </button>
        </div>
      )}

      <Modal open={!!explainModal} onClose={() => setExplainModal(null)} title="AI Explain — Differential" wide>
        {explainModal && (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-white">{explainModal.diagnosis}</h3>
            <div className="flex gap-2">
              <Badge tone={probColor(explainModal.probability)}>Probability: {explainModal.probability}</Badge>
              <Badge tone={riskColor(explainModal.risk)}>Risk: {explainModal.risk}</Badge>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <p className="text-xs text-slate-300 leading-relaxed">{explainModal.reasoning}</p>
            </div>
            <p className="text-xs text-slate-500">Alternatives: {explainModal.alternatives.join(", ")}</p>
            <p className="text-xs text-slate-500 italic">Generated via CDS agent (qwen3:14b · most-reliable routing). This is decision support only.</p>
          </div>
        )}
      </Modal>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Confirm Primary Diagnosis">
        <div className="space-y-3">
          <p className="text-sm text-slate-300">You are about to confirm the primary diagnosis for <strong className="text-white">{patientName || patientId}</strong>.</p>
          {primaryDx && (
            <div className="rounded-lg border border-white/10 p-3">
              <p className="text-sm font-semibold text-white">{differentials.find((d) => d.id === primaryDx)?.diagnosis}</p>
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <button className="btn-ghost" onClick={() => setConfirmOpen(false)}>Cancel</button>
            <button className="btn-neon" onClick={confirmPrimary}><CheckCircle size={14} /> Confirm</button>
          </div>
        </div>
      </Modal>

      <Modal open={customOpen} onClose={() => setCustomOpen(false)} title="Manual Override — Add Diagnosis">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-400 mb-1 block">Diagnosis Name</label>
            <input className="input-dark" placeholder="e.g. Acute tonsillitis" value={customName} onChange={(e) => setCustomName(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400 mb-1 block">Reasoning</label>
            <textarea className="input-dark resize-none" rows={3} placeholder="Why is this being added?" value={customReason} onChange={(e) => setCustomReason(e.target.value)} />
          </div>
          <div className="flex gap-2 justify-end">
            <button className="btn-ghost" onClick={() => setCustomOpen(false)}>Cancel</button>
            <button className="btn-neon" onClick={addCustom}><Plus size={14} /> Add</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
