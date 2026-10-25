import { useState } from "react";
import { AlertTriangle, Brain, CheckCircle, FlaskConical, Info, RefreshCw, Shield, Sparkles, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { GlassCard, SectionTitle, Badge, Modal } from "@/components/ui";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { cn, uid, sleep, nowTime } from "@/lib/utils";
import type { RiskLevel } from "@/lib/types";

const riskColor = (r: RiskLevel): "cyan" | "green" | "red" | "violet" | "neutral" | "amber" => {
  if (r === "critical") return "red";
  if (r === "high") return "amber";
  if (r === "moderate") return "cyan";
  return "green";
};

interface Insight {
  id: string;
  category: string;
  summary: string;
  risk: RiskLevel;
  details: string;
  recommendation: string;
  evidence: string;
  confirmed: boolean;
  confirmedBy?: string;
  confirmedAt?: string;
}

interface RedFlag {
  id: string;
  flag: string;
  severity: RiskLevel;
  action: string;
  resolved: boolean;
}

const generateMockInsights = (): Insight[] => [
  { id: uid("ins"), category: "Cardiovascular", risk: "high", summary: "Elevated cardiac risk based on hypertension history and age > 55", details: "Patient has Stage 2 hypertension (BP 152/94) with family history of IHD. 10-year ASCVD risk score estimated at 18.7%.", recommendation: "Initiate antihypertensive therapy. Consider statin if LDL > 130. Arrange ECG and 2D Echo.", evidence: "ACC/AHA Hypertension Guidelines 2024, ASCVD Risk Estimator Plus", confirmed: false },
  { id: uid("ins"), category: "Infectious Disease", risk: "moderate", summary: "Community-acquired pneumonia — CURB-65 score 1", details: "Patient presents with cough, fever 38.2°C, CRP 45. Chest X-ray shows right lower zone infiltrate. CURB-65: 1 (low mortality risk).", recommendation: "Oral antibiotics as per local antibiogram (Amoxicillin-Clavulanate 625mg TDS × 7d). Follow-up in 48h.", evidence: "BTS Guidelines for CAP 2023, CURB-65 validation study", confirmed: false },
  { id: uid("ins"), category: "Metabolic", risk: "low", summary: "Impaired fasting glucose — pre-diabetic range", details: "Fasting glucose 108 mg/dL (normal < 100). HbA1c not yet available.", recommendation: "Lifestyle modification advice. Check HbA1c and repeat fasting glucose in 3 months.", evidence: "ADA Standards of Care 2024", confirmed: false },
  { id: uid("ins"), category: "Renal", risk: "critical", summary: "Acute kidney injury — KDIGO Stage 2", details: "Serum creatinine 2.4 mg/dL (baseline 1.0). Urine output 350 mL/24h. likely pre-renal due to dehydration and NSAID use.", recommendation: "Immediately hold NSAIDs. IV fluid resuscitation. Monitor urine output and serum creatinine q12h. Nephrology consult.", evidence: "KDIGO AKI Guidelines 2023", confirmed: false },
];

const generateMockRedFlags = (): RedFlag[] => [
  { id: uid("rf"), flag: "AKI Stage 2 — urgent nephrology referral needed", severity: "critical", action: "Immediate nephrology consult + hold nephrotoxins", resolved: false },
  { id: uid("rf"), flag: "Chest pain with unstable features — rule out ACS", severity: "high", action: "ECG + Troponin q3h × 2 sets", resolved: false },
  { id: uid("rf"), flag: "Severe hypertension (BP 182/104) — hypertensive urgency", severity: "critical", action: "Urgent BP control with IV labetalol or oral amlodipine", resolved: false },
];

export default function ClinicalInsight({ patientId, patientName }: { patientId: string; patientName: string }) {
  const { account } = useAuth();
  const { logAudit } = useStore();
  const doctorName = account?.name ?? "Dr. Admin";
  const [insights, setInsights] = useState<Insight[]>([]);
  const [redFlags, setRedFlags] = useState<RedFlag[]>([]);
  const [generating, setGenerating] = useState(false);
  const [explainModal, setExplainModal] = useState<Insight | null>(null);
  const [confirmModal, setConfirmModal] = useState<Insight | null>(null);

  const generate = async () => {
    if (!patientId) { toast.error("Select a patient first"); return; }
    setGenerating(true);
    logAudit("Clinical insight generation started", `Patient ${patientId}`, doctorName);
    await sleep(2000);
    setInsights(generateMockInsights());
    setRedFlags(generateMockRedFlags());
    setGenerating(false);
    logAudit("Clinical insights generated", `${insights.length} insights, ${redFlags.length} red flags`, "CDS agent");
    toast.success("Clinical insights ready");
  };

  const confirmInsight = (insight: Insight) => {
    setInsights((p) =>
      p.map((i) => (i.id === insight.id ? { ...i, confirmed: true, confirmedBy: doctorName, confirmedAt: nowTime() } : i))
    );
    logAudit("Insight confirmed", `${insight.category}: ${insight.summary}`, doctorName);
    setConfirmModal(null);
    toast.success("Insight confirmed");
  };

  const resolveFlag = (flag: RedFlag) => {
    setRedFlags((p) => p.map((f) => (f.id === flag.id ? { ...f, resolved: true } : f)));
    logAudit("Red flag resolved", `${flag.flag}`, doctorName);
    toast.success("Red flag marked resolved");
  };

  const riskColor = (r: RiskLevel): "cyan" | "green" | "red" | "violet" | "neutral" | "amber" =>
    r === "critical" ? "red" : r === "high" ? "amber" : r === "moderate" ? "cyan" : "green";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionTitle title="Clinical Insight Engine" subtitle="AI-synthesized clinical summary with risk stratification" />
        <button className="btn-neon" onClick={() => void generate()} disabled={!patientId || generating}>
          {generating ? <><RefreshCw size={14} className="animate-spin" /> Analyzing…</> : <><Sparkles size={14} /> Generate Insights</>}
        </button>
      </div>

      {/* Risk stratification summary */}
      {insights.length > 0 && (
        <GlassCard>
          <SectionTitle title="Risk Stratification" subtitle="Aggregated risk assessment across all systems" />
          <div className="flex gap-3 flex-wrap">
            {(["low", "moderate", "high", "critical"] as RiskLevel[]).map((level) => {
              const count = insights.filter((i) => i.risk === level).length;
              if (count === 0) return null;
              return (
                <div key={level} className={cn(
                  "rounded-lg px-4 py-2 border flex items-center gap-2",
                  level === "critical" ? "border-red-400/40 bg-red-400/10" :
                  level === "high" ? "border-amber-400/40 bg-amber-400/10" :
                  level === "moderate" ? "border-cyan-400/40 bg-cyan-400/10" :
                  "border-emerald-400/40 bg-emerald-400/10"
                )}>
                  <Badge tone={riskColor(level)} className="!text-[10px] uppercase">{level}</Badge>
                  <span className="text-lg font-bold text-white">{count}</span>
                  <span className="text-xs text-slate-400">findings</span>
                </div>
              );
            })}
          </div>
        </GlassCard>
      )}

      {/* Red flags */}
      {redFlags.length > 0 && (
        <GlassCard>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="text-red-400" size={18} />
            <h3 className="font-display text-lg font-bold text-white">Red Flag Alerts</h3>
          </div>
          <div className="space-y-2">
            {redFlags.map((rf) => (
              <div key={rf.id} className={cn(
                "rounded-lg border p-3 flex items-start gap-3",
                rf.resolved ? "border-emerald-400/30 bg-emerald-400/5 opacity-60" : "border-red-400/40 bg-red-400/10"
              )}>
                <Shield className={cn("shrink-0 mt-0.5", rf.resolved ? "text-emerald-400" : "text-red-400")} size={16} />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Badge tone={riskColor(rf.severity)} className="!text-[8px] uppercase">{rf.severity}</Badge>
                    <span className={cn("text-sm font-semibold", rf.resolved ? "text-slate-500 line-through" : "text-white")}>{rf.flag}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">Action: {rf.action}</p>
                </div>
                {!rf.resolved && (
                  <button className="btn-ghost !text-xs !py-1" onClick={() => resolveFlag(rf)}>
                    <CheckCircle size={12} /> Resolve
                  </button>
                )}
                {rf.resolved && <Badge tone="green">Resolved</Badge>}
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* Insights list */}
      {insights.length > 0 && (
        <GlassCard>
          <SectionTitle title="Clinical Insights" subtitle="System-by-system AI analysis" />
          <div className="space-y-3">
            {insights.map((ins) => (
              <div key={ins.id} className={cn(
                "rounded-lg border p-4 transition-all",
                ins.confirmed ? "border-emerald-400/30 bg-emerald-400/5" : "border-white/10 bg-white/[0.03]"
              )}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge tone="violet" className="!text-[9px]">{ins.category}</Badge>
                      <Badge tone={riskColor(ins.risk)} className="!text-[8px] uppercase">{ins.risk}</Badge>
                      {ins.confirmed && <Badge tone="green">Confirmed by {ins.confirmedBy}</Badge>}
                    </div>
                    <h4 className="text-sm font-semibold text-white">{ins.summary}</h4>
                    <p className="text-xs text-slate-400 mt-1">{ins.details}</p>
                    <div className="mt-2 rounded-lg border border-amber-400/20 bg-amber-400/5 p-2">
                      <p className="text-xs font-semibold text-amber-300">Recommendation</p>
                      <p className="text-xs text-slate-300">{ins.recommendation}</p>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1.5 font-mono">Evidence: {ins.evidence}</p>
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <button className="btn-ghost !text-xs !py-1" onClick={() => setExplainModal(ins)}>
                      <Info size={12} /> Explain
                    </button>
                    {!ins.confirmed && (
                      <button className="btn-neon !text-xs !py-1" onClick={() => setConfirmModal(ins)}>
                        <CheckCircle size={12} /> Confirm
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* Explain modal */}
      <Modal open={!!explainModal} onClose={() => setExplainModal(null)} title="AI Explain" wide>
        {explainModal && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge tone="violet">{explainModal.category}</Badge>
              <Badge tone={riskColor(explainModal.risk)} className="uppercase">{explainModal.risk}</Badge>
            </div>
            <p className="text-sm font-semibold text-white">{explainModal.summary}</p>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <p className="text-xs text-slate-300 leading-relaxed">{explainModal.details}</p>
            </div>
            <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-3">
              <p className="text-xs font-semibold text-amber-300">Recommendation</p>
              <p className="text-xs text-slate-300">{explainModal.recommendation}</p>
            </div>
            <p className="text-xs text-slate-500 font-mono">Evidence: {explainModal.evidence}</p>
            <p className="text-xs text-slate-500 italic">Generated via CDS agent (qwen3:14b · most-reliable routing). This is decision support only — physician judgment required.</p>
          </div>
        )}
      </Modal>

      {/* Confirm modal */}
      <Modal open={!!confirmModal} onClose={() => setConfirmModal(null)} title="Confirm Clinical Insight">
        {confirmModal && (
          <div className="space-y-3">
            <p className="text-sm text-slate-300">You are about to confirm this insight. This logs your agreement with the AI recommendation.</p>
            <div className="rounded-lg border border-white/10 p-3">
              <p className="text-sm font-semibold text-white">{confirmModal.summary}</p>
              <p className="text-xs text-slate-400 mt-1">{confirmModal.recommendation}</p>
            </div>
            <div className="flex gap-2 justify-end">
              <button className="btn-ghost" onClick={() => setConfirmModal(null)}>Cancel</button>
              <button className="btn-neon" onClick={() => confirmInsight(confirmModal)}>
                <CheckCircle size={14} /> Confirm
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
