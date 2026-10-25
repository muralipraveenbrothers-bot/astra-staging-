import { useState, useMemo } from "react";
import {
  AlertTriangle, Activity, ArrowRight, Brain, CheckCircle, ClipboardList,
  Droplets, FileText, FlaskConical, Heart, HeartPulse, HelpCircle,
  Layers, Mic, Pill, Printer, Radio, Shield, ShieldAlert, Sparkles,
  Stethoscope, Syringe, Thermometer, TrendingUp, User, Users, Waypoints,
} from "lucide-react";
import { toast } from "sonner";
import { GlassCard, SectionTitle, Badge, Modal } from "@/components/ui";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { cn, uid, sleep, nowTime } from "@/lib/utils";

/* ---------- Types ---------- */

type RiskStatus = "stable" | "borderline" | "critical";
type StageMarker = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
type OrganStatus = "safe" | "borderline" | "compromised";

interface Stage {
  id: StageMarker;
  label: string;
  agent: string;
  icon: any;
}

const stages: Stage[] = [
  { id: 0, label: "Patient Snapshot", agent: "Reception Agent", icon: User },
  { id: 1, label: "Clinical Ingress", agent: "Clinical Agent", icon: Stethoscope },
  { id: 2, label: "Clinical Roadmap", agent: "Clinical Agent", icon: Waypoints },
  { id: 3, label: "Deep Dive", agent: "Clinical Agent", icon: Brain },
  { id: 4, label: "Investigation Node", agent: "Lab/Radiology Agents", icon: FlaskConical },
  { id: 5, label: "Therapeutic Release", agent: "Pharmacy Agent", icon: Pill },
  { id: 6, label: "Organ Safety Grid", agent: "Clinical Agent", icon: Heart },
  { id: 7, label: "Ward Monitoring", agent: "Hospital Agent", icon: Activity },
  { id: 8, label: "Patient Education", agent: "Hospital Agent", icon: Mic },
  { id: 9, label: "References & Case Discussion", agent: "Clinical Agent", icon: Layers },
  { id: 10, label: "Doctor Orders & Discharge", agent: "Clinical Agent", icon: ClipboardList },
];

/* ---------- Mock data generators ---------- */

const mockDifferentials = () => [
  { diagnosis: "Cellulitis", probability: 85, risk: "moderate" as const, reasoning: "Acute spreading erythema, edema, warmth — classic cellulitis presentation with systemic inflammatory response." },
  { diagnosis: "Deep Vein Thrombosis", probability: 10, risk: "moderate" as const, reasoning: "Unilateral leg swelling in elderly — Doppler required to rule out. Pain is less severe than inflammation suggests." },
  { diagnosis: "Necrotizing Fasciitis", probability: 5, risk: "critical" as const, reasoning: "RED FLAG: Pain out of proportion, rapid progression, systemic toxicity — requires immediate surgical evaluation." },
];

const mockInvestigations = () => [
  { test: "CBC", utility: 95, reasoning: "Detect leukocytosis, neutrophilia — hallmark of bacterial infection", ruleIn: "WBC > 11,000 + Neutrophilia", ruleOut: "Normal WBC with left shift", priority: "stat" as const },
  { test: "CRP", utility: 90, reasoning: "Quantify inflammatory burden and monitor treatment response", ruleIn: "CRP > 50 mg/L", ruleOut: "CRP < 10", priority: "stat" as const },
  { test: "Venous Doppler", utility: 85, reasoning: "Mandatory in elderly unilateral leg swelling — rule out DVT before anticoagulation", ruleIn: "Non-compressible vein", ruleOut: "Normal flow", priority: "urgent" as const },
  { test: "Blood Cultures × 2", utility: 80, reasoning: "Identify causative organism if sepsis suspected", ruleIn: "Bacterial growth", ruleOut: "No growth at 48h", priority: "urgent" as const },
  { test: "Lactate", utility: 75, reasoning: "Screen for tissue hypoperfusion and septic shock", ruleIn: "Lactate > 2 mmol/L", ruleOut: "Lactate < 2", priority: "stat" as const },
  { test: "Renal Function", utility: 70, reasoning: "Baseline before aggressive IV antibiotic therapy", ruleIn: "Cr > 1.2 (AKI risk)", ruleOut: "Normal Cr", priority: "routine" as const },
];

const mockMedications = () => [
  { layer: 1, label: "Stabilize", items: [{ drug: "IV Normal Saline", dose: "500ml bolus", frequency: "Stat then 100ml/hr", note: "If BP drifts < 100 systolic" }, { drug: "Paracetamol", dose: "1g", frequency: "Q6H PRN fever > 38.5°C", note: "Max 4g/day" }] },
  { layer: 2, label: "Target", items: [{ drug: "Inj. Flucloxacillin", dose: "1g", frequency: "IV QID", note: "Empiric skin flora coverage. Check renal function before aggressive dosing." }] },
  { layer: 3, label: "Escalation (if no response in 48h)", items: [{ drug: "IV Clindamycin", dose: "600mg", frequency: "TDS", note: "Add if suspected MRSA or streptococcal toxic shock" }, { drug: "IV Ceftriaxone", dose: "2g", frequency: "OD", note: "Broaden coverage if Gram-negative suspected" }] },
];

const mockOrganGrid = () => [
  { organ: "Kidney", status: "safe" as OrganStatus, value: "Cr 0.9", detail: "Normal renal function" },
  { organ: "Heart", status: "borderline" as OrganStatus, value: "HR 105", detail: "Sinus tachycardia — likely reactive to infection. Monitor for atrial strain." },
  { organ: "Brain", status: "safe" as OrganStatus, value: "GCS 15", detail: "Alert and oriented. No focal deficits." },
  { organ: "Liver", status: "safe" as OrganStatus, value: "LFT normal", detail: "No hepatic impairment" },
  { organ: "Lungs", status: "safe" as OrganStatus, value: "SpO₂ 97%", detail: "Adequate oxygenation" },
];

const mockHopeEngine = () => ({
  masqueraders: ["Lupus (cutaneous vasculitis mimicking cellulitis)", "Tuberculosis (cold abscess)", "Syphilis (gummatous lesions)", "Lymphoma (cutaneous involvement)"],
  occultToxicity: ["Heavy metal poisoning (lead, arsenic — examine occupation)", "Environmental toxins (pesticide exposure)"],
  rareGenetics: ["Hereditary angioedema", "Fabry disease (painful crises)", "Acute intermittent porphyria"],
  rescueTreatments: ["Immunomodulators (corticosteroids if inflammatory)", "High-dose vitamins (thiamine in metabolic crises)", "IVIG if autoimmune suspected"],
  wildcardTherapies: ["Methylene Blue for refractory vasoplegia", "Angiotensin II for catecholamine-resistant shock"],
  contradictions: ["Rising calcium → hyperparathyroidism?", "Falling Hb despite no bleed → hemolysis?"],
});

/* ---------- Sub-components ---------- */

function StageBadge({ stage, active }: { stage: StageMarker; active: StageMarker }) {
  const s = stages.find((x) => x.id === stage)!;
  return (
    <Badge tone={stage === active ? "cyan" : stage < active ? "green" : "neutral"} className={cn("!text-[8px] shrink-0", stage === active && "animate-pulse")}>
      {stage === active ? "● " : ""}Stage {stage}: {s.label}
    </Badge>
  );
}

function PatientSnapshot({ patientId, patientName }: { patientId: string; patientName: string }) {
  const { patients, vitals } = useStore();
  const p = patients.find((x) => x.id === patientId);
  const v = vitals.filter((x) => x.patientId === patientId);
  const latest = v[0];
  const risk: RiskStatus = p?.age && p.age > 60 ? "borderline" : "stable";

  const riskColor = (r: RiskStatus): "cyan" | "green" | "red" | "violet" | "neutral" | "amber" =>
    r === "critical" ? "red" : r === "borderline" ? "amber" : "green";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-full bg-gradient-to-br from-violet-500/30 to-cyan-500/30 border border-violet-400/40 flex items-center justify-center text-lg font-bold text-violet-300 shrink-0">
          {patientName?.charAt(0) || "?"}
        </div>
        <div className="flex-1">
          <div className="text-lg font-bold text-white">{patientName || "—"}</div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>{p?.age || "--"}Y</span>
            <span>{p?.gender || "--"}</span>
            <span>{p?.id || patientId}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className={cn("rounded-lg px-3 py-1.5 border text-xs font-semibold flex items-center gap-1.5",
            risk === "borderline" ? "border-amber-400/40 bg-amber-400/10 text-amber-300" :
            "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
          )}>
            <span className={cn("h-2 w-2 rounded-full",
            risk === "borderline" ? "bg-amber-400" :
            "bg-emerald-400"
            )} />
            {risk === "borderline" ? "BORDERLINE" : "STABLE"}
          </div>
        </div>
      </div>
      {latest && (
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "HR", value: `${latest.pulse}`, icon: HeartPulse, status: latest.pulse > 100 ? "high" : "normal" as const },
            { label: "BP", value: latest.bp, icon: Activity, status: "normal" as const },
            { label: "SpO₂", value: `${latest.spo2}%`, icon: Thermometer, status: latest.spo2 >= 95 ? "normal" : "low" as const },
            { label: "Temp", value: `${latest.tempF}°F`, icon: Thermometer, status: latest.tempF > 100.4 ? "high" : "normal" as const },
          ].map(({ label, value, icon: Icon, status }) => (
            <div key={label} className={cn("rounded-lg border px-3 py-2 flex items-center gap-2",
              status === "high" ? "border-red-400/30 bg-red-400/5" : "border-white/5 bg-white/[0.02]"
            )}>
              <Icon size={16} className={status === "high" ? "text-red-400" : "text-slate-500"} />
              <div>
                <p className="text-[9px] text-slate-500 uppercase">{label}</p>
                <p className={cn("text-sm font-bold", status === "high" ? "text-red-300" : "text-white")}>{value}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-slate-400 italic">Problem: "Acute spreading erythema and edema of right leg for 2 days."</p>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-slate-500">Key Trend:</span>
        <Badge tone="amber" className="!text-[8px]">HR 105 ↑</Badge>
        <Badge tone="neutral" className="!text-[8px]">BP 110/70 ↔</Badge>
        <Badge tone="green" className="!text-[8px]">SpO₂ 97% 🟢</Badge>
      </div>
    </div>
  );
}

function ClinicalIngress() {
  const [showRedFlags, setShowRedFlags] = useState(false);
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-violet-400/20 bg-violet-400/5 p-3">
        <p className="text-xs font-semibold text-violet-300 mb-1">Problem Representation</p>
        <p className="text-sm text-white">"65-year-old male with acute spreading erythema and edema of right leg for 2 days."</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/5 p-3">
          <p className="text-[10px] font-bold text-emerald-300 uppercase">Primary Direction</p>
          <p className="text-sm font-semibold text-white">Infectious / Inflammatory</p>
          <p className="text-xs text-slate-400">Cellulitis dominant — 85%</p>
        </div>
        <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-3">
          <p className="text-[10px] font-bold text-amber-300 uppercase">Risk Detector</p>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
            <span className="text-sm font-semibold text-amber-300">Borderline</span>
          </div>
          <p className="text-xs text-slate-400">Age + inflammatory burden</p>
        </div>
        <div className="rounded-lg border border-red-400/20 bg-red-400/5 p-3">
          <p className="text-[10px] font-bold text-red-300 uppercase">Top 3 Directions</p>
          <div className="text-xs text-slate-300 mt-1">
            <p>1. Cellulitis (85%)</p>
            <p>2. DVT (10%)</p>
            <p className="text-red-300 font-semibold">3. Necrotizing Fasciitis (5% — RED FLAG)</p>
          </div>
        </div>
      </div>
      <button className="btn-ghost !text-xs" onClick={() => setShowRedFlags(!showRedFlags)}>
        <ShieldAlert size={12} className="text-red-400" />
        {showRedFlags ? "Hide" : "Show"} Red Flag Awareness
      </button>
      {showRedFlags && (
        <div className="space-y-2">
          {[
            { flag: "Necrotizing Fasciitis", severity: "critical", action: "Pain out of proportion, crepitus, rapid progression — immediate surgical consult" },
            { flag: "Sepsis", severity: "high", action: "Hypotension, altered sensorium, lactate > 2 — initiate sepsis protocol" },
            { flag: "Compartment Syndrome", severity: "high", action: "Severe pain with passive stretch, paresthesia — measure compartment pressure" },
          ].map(({ flag, severity, action }) => (
            <div key={flag} className="flex items-start gap-2 rounded-lg border border-red-400/20 bg-red-400/5 p-2">
              <AlertTriangle size={14} className="text-red-400 shrink-0 mt-0.5" />
              <div>
                <div className="flex items-center gap-1.5">
                  <Badge tone={severity === "critical" ? "red" : "amber"} className="!text-[8px] uppercase">{severity}</Badge>
                  <span className="text-xs font-semibold text-white">{flag}</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">{action}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RoadmapContent() {
  const diffs = mockDifferentials();
  return (
    <div className="space-y-3">
      <div>
        <p className="text-[10px] font-semibold text-slate-500 uppercase mb-2">Differential Diagnosis (Ranked)</p>
        <div className="space-y-1.5">
          {diffs.map((d) => (
            <div key={d.diagnosis} className={cn("flex items-center gap-2 rounded-lg border px-3 py-2",
              d.risk === "critical" ? "border-red-400/30 bg-red-400/5" : "border-white/5 bg-white/[0.02]"
            )}>
              <div className="flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-white">{d.diagnosis}</span>
                  <Badge tone={d.risk === "critical" ? "red" : d.risk === "moderate" ? "amber" : "green"} className="!text-[8px]">{d.probability}%</Badge>
                </div>
                <p className="text-[10px] text-slate-400">{d.reasoning}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
          <p className="text-[10px] font-semibold text-slate-500 uppercase mb-1">Investigations</p>
          <p className="text-xs text-slate-300">CBC, CRP, Venous Doppler</p>
        </div>
        <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
          <p className="text-[10px] font-semibold text-slate-500 uppercase mb-1">Initial Management</p>
          <p className="text-xs text-slate-300">IV fluids, IV antibiotics, limb elevation</p>
        </div>
        <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-3">
          <p className="text-[10px] font-semibold text-amber-300 uppercase mb-1">Escalation Trigger</p>
            <p className="text-xs text-slate-300">HR {'>'} 110 or BP {'<'} 90 systolic</p>
        </div>
        <div className="rounded-lg border border-cyan-400/20 bg-cyan-400/5 p-3">
          <p className="text-[10px] font-semibold text-cyan-300 uppercase mb-1">Follow-up</p>
          <p className="text-xs text-slate-300">Mark margins of redness, re-evaluate in 12h</p>
        </div>
      </div>
    </div>
  );
}

function DeepDive() {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-violet-400/20 bg-violet-400/5 p-3">
        <p className="text-[10px] font-bold text-violet-300 uppercase mb-2">Pathophysiology Cascade</p>
        <div className="space-y-2 text-xs text-slate-300">
          <div className="flex items-center gap-2">
            <ArrowRight size={12} className="text-violet-400 shrink-0" />
            <span>Bacterial entry → TLR4 activation → TNF-α surge → IL-1 & IL-6 release</span>
          </div>
          <div className="flex items-center gap-2">
            <ArrowRight size={12} className="text-violet-400 shrink-0" />
            <span>Endothelial permeability ↑ → Capillary leak → Swelling → Pain</span>
          </div>
        </div>
      </div>
      <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-3">
        <div className="flex items-center gap-2">
          <Brain size={14} className="text-amber-400" />
          <span className="text-[10px] font-bold text-amber-300 uppercase">Inner Thought</span>
        </div>
        <p className="text-xs text-slate-300 italic mt-1">"Lactate stable → compensated inflammatory stage. Monitor for transition to decompensation."</p>
      </div>
      <div className="rounded-lg border border-cyan-400/20 bg-cyan-400/5 p-3">
        <p className="text-[10px] font-bold text-cyan-300 uppercase mb-1">Clinical Reasoning</p>
        <ul className="text-xs text-slate-300 space-y-1 list-disc list-inside">
          <li>Unilateral lower limb erythema + edema + fever = cellulitis until proven otherwise</li>
          <li>Elderly age + tachycardia = lower threshold for IV antibiotics and admission</li>
          <li>Pain out of proportion = red flag for necrotizing fasciitis</li>
          <li>Venous Doppler mandatory before anticoagulation if DVT suspected</li>
        </ul>
      </div>
    </div>
  );
}

function InvestigationNode() {
  const invs = mockInvestigations();
  return (
    <div className="space-y-2">
      {invs.map((inv) => (
        <div key={inv.test} className="flex items-start gap-2 rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
          <FlaskConical size={14} className="text-cyan-400 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-semibold text-white">{inv.test}</span>
              <Badge tone={inv.priority === "stat" ? "red" : inv.priority === "urgent" ? "amber" : "neutral"} className="!text-[7px] uppercase">{inv.priority}</Badge>
              <span className="text-[9px] font-mono text-cyan-300">Utility {inv.utility}%</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">{inv.reasoning}</p>
            <div className="flex gap-3 mt-0.5 text-[9px] text-slate-500">
              <span>Rule In: {inv.ruleIn}</span>
              <span>Rule Out: {inv.ruleOut}</span>
            </div>
          </div>
        </div>
      ))}
      <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/5 p-2 text-[10px] text-emerald-300">
        <CheckCircle size={10} className="inline mr-1" /> Orders routed to Lab/Radiology dashboards + Billing Agent sync
      </div>
    </div>
  );
}

function TherapeuticRelease() {
  const layers = mockMedications();
  return (
    <div className="space-y-3">
      {layers.map((layer) => (
        <div key={layer.layer}>
          <div className="flex items-center gap-2 mb-1.5">
            <span className={cn("h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-bold",
              layer.layer === 1 ? "bg-emerald-400/20 text-emerald-300 border border-emerald-400/40" :
              layer.layer === 2 ? "bg-violet-400/20 text-violet-300 border border-violet-400/40" :
              "bg-amber-400/20 text-amber-300 border border-amber-400/40"
            )}>{layer.layer}</span>
            <span className="text-[10px] font-bold text-slate-400 uppercase">{layer.label}</span>
          </div>
          <div className="space-y-1.5 ml-7">
            {layer.items.map((item) => (
              <div key={item.drug} className="flex items-start gap-2 rounded-lg border border-white/5 bg-white/[0.02] p-2">
                <Pill size={12} className="text-amber-400 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-semibold text-white">{item.drug}</span>
                    <Badge tone="neutral" className="!text-[7px]">{item.dose}</Badge>
                    <Badge tone="violet" className="!text-[7px]">{item.frequency}</Badge>
                  </div>
                  <p className="text-[9px] text-slate-400 mt-0.5">{item.note}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-2 flex items-start gap-2">
        <ShieldAlert size={12} className="text-amber-400 mt-0.5 shrink-0" />
        <p className="text-[10px] text-amber-300">Safety: Check renal function before aggressive dosing. Inventory sync pulls most available/profitable brand from pharmacy.</p>
      </div>
    </div>
  );
}

function OrganSafetyGrid() {
  const organs = mockOrganGrid();
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
      {organs.map((o) => (
        <div key={o.organ} className={cn("rounded-lg border p-3",
          o.status === "compromised" ? "border-red-400/30 bg-red-400/5" :
          o.status === "borderline" ? "border-amber-400/30 bg-amber-400/5" :
          "border-emerald-400/20 bg-emerald-400/5"
        )}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white">{o.organ}</span>
            <Badge tone={o.status === "compromised" ? "red" : o.status === "borderline" ? "amber" : "green"} className="!text-[8px]">{o.status === "compromised" ? "🔴" : o.status === "borderline" ? "🟠" : "🟢"} {o.status.toUpperCase()}</Badge>
          </div>
          <p className="text-lg font-bold text-white mt-1">{o.value}</p>
          <p className="text-[10px] text-slate-400">{o.detail}</p>
        </div>
      ))}
    </div>
  );
}

function WardMonitoringTab() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div className="rounded-lg border border-cyan-400/20 bg-cyan-400/5 p-3">
          <p className="text-[10px] font-bold text-cyan-300 uppercase mb-1">Trend Monitor</p>
          <p className="text-xs text-slate-300">Tracks vitals + CRP q12h</p>
          <div className="flex items-center gap-2 mt-2">
            <TrendingUp size={14} className="text-emerald-400" />
            <span className="text-[10px] text-emerald-300">HR trending down — responding</span>
          </div>
        </div>
        <div className="rounded-lg border border-red-400/20 bg-red-400/5 p-3">
          <p className="text-[10px] font-bold text-red-300 uppercase mb-1">Emergency Pathway</p>
          <p className="text-xs text-slate-300">CRP ↑ + BP ↓ → 🔴 Possible Sepsis</p>
          <div className="flex items-center gap-2 mt-2">
            <AlertTriangle size={14} className="text-amber-400" />
            <span className="text-[10px] text-amber-300">No sepsis criteria met currently</span>
          </div>
        </div>
      </div>
      <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Auto-drafted Progress Note (SOAP)</p>
        <div className="text-[10px] text-slate-400 space-y-1">
          <p><strong className="text-slate-300">S:</strong> Patient reports reduced pain in right leg. Still some swelling.</p>
          <p><strong className="text-slate-300">O:</strong> HR 98, BP 112/72, Temp 37.8°C. Erythema border stable — no proximal spread.</p>
          <p><strong className="text-slate-300">A:</strong> Cellulitis responding to IV Flucloxacillin. No signs of necrosis or sepsis.</p>
          <p><strong className="text-slate-300">P:</strong> Continue current antibiotics. Mark margins. Re-check CRP tomorrow.</p>
        </div>
      </div>
    </div>
  );
}

function PatientEducationTab() {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/5 p-3">
        <p className="text-[10px] font-bold text-emerald-300 uppercase mb-1">Attender Support</p>
        <p className="text-sm text-white">"Mr. Surya is responding well; vitals are stable. Please keep the leg elevated."</p>
        <div className="flex flex-wrap gap-1.5 mt-2">
          <Badge tone="cyan" className="!text-[8px]">Elevate leg above heart level</Badge>
          <Badge tone="cyan" className="!text-[8px]">Complete antibiotic course</Badge>
          <Badge tone="cyan" className="!text-[8px]">Report if redness spreads</Badge>
          <Badge tone="cyan" className="!text-[8px]">Monitor temperature</Badge>
        </div>
      </div>
      <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Disease Explanation (Simple Terms)</p>
        <p className="text-xs text-slate-300">Cellulitis is a bacterial skin infection that causes redness, swelling, and pain. It is treated with antibiotics and rest. Most patients improve within 48-72 hours of starting treatment.</p>
      </div>
    </div>
  );
}

function ReferencesTab() {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-violet-400/20 bg-violet-400/5 p-3">
        <p className="text-[10px] font-bold text-violet-300 uppercase mb-1">Knowledge References</p>
        <div className="text-xs text-slate-300 space-y-1">
          <p>• Pathophysiology: Harrison's Principles of Internal Medicine, Ch. 124 (Skin Infections)</p>
          <p>• Drug Mechanism: Flucloxacillin — bactericidal, inhibits cell wall synthesis (PHP binding)</p>
          <p>• Guidelines: IDSA Practice Guidelines for Skin and Soft Tissue Infections (2024)</p>
          <p>• Risk Stratification: CURB-65, qSOFA for sepsis screening</p>
        </div>
      </div>
      <div className="rounded-lg border border-cyan-400/20 bg-cyan-400/5 p-3">
        <p className="text-[10px] font-bold text-cyan-300 uppercase mb-1">MDT Integration</p>
        <div className="space-y-1.5 text-xs text-slate-300">
          <div className="flex items-start gap-2">
            <Badge tone="violet" className="!text-[7px] shrink-0 mt-0.5">Surgery</Badge>
            <span>Evaluate for necrotizing fasciitis if pain out of proportion or crepitus present</span>
          </div>
          <div className="flex items-start gap-2">
            <Badge tone="cyan" className="!text-[7px] shrink-0 mt-0.5">Medicine</Badge>
            <span>Optimize antibiotic therapy; monitor renal function and electrolyte balance</span>
          </div>
          <div className="flex items-start gap-2">
            <Badge tone="amber" className="!text-[7px] shrink-0 mt-0.5">Radiology</Badge>
            <span>Venous Doppler to rule out DVT; MRI if deep abscess suspected</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function DoctorOrdersDischarge() {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-3">
        <div className="flex items-center gap-2">
          <ShieldAlert size={14} className="text-amber-400" />
          <p className="text-[10px] font-bold text-amber-300 uppercase">All AI suggestions unchecked — physician must confirm</p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/5 p-3">
          <p className="text-[10px] font-bold text-emerald-300 uppercase mb-1">Discharge Criteria</p>
          <div className="text-[10px] text-slate-400 space-y-0.5">
            <p>✓ Afebrile for 48h</p>
            <p>✓ CRP trending down</p>
            <p>✓ Oral antibiotics tolerated</p>
            <p>✓ No systemic inflammatory signs</p>
          </div>
        </div>
        <div className="rounded-lg border border-violet-400/20 bg-violet-400/5 p-3">
          <p className="text-[10px] font-bold text-violet-300 uppercase mb-1">Discharge Summary</p>
          <p className="text-[10px] text-slate-400">Auto-compiled narrative summary: admission diagnosis, treatment course, discharge medications, follow-up plan.</p>
        </div>
        <div className="rounded-lg border border-cyan-400/20 bg-cyan-400/5 p-3">
          <p className="text-[10px] font-bold text-cyan-300 uppercase mb-1">Readmission Risk</p>
          <p className="text-lg font-bold text-cyan-300">LOW</p>
          <p className="text-[10px] text-slate-400">LACE Index: 8 (low-moderate risk)</p>
        </div>
      </div>
    </div>
  );
}

function HopeEngine() {
  const [activeTab, setActiveTab] = useState<string>("masqueraders");
  const data = mockHopeEngine();
  const tabs = [
    { key: "masqueraders", label: "Masqueraders", icon: HelpCircle },
    { key: "toxicity", label: "Occult Toxicity", icon: Shield },
    { key: "genetics", label: "Rare Genetics", icon: Brain },
    { key: "rescue", label: "Rescue Rx", icon: Syringe },
    { key: "wildcard", label: "Wildcard", icon: Radio },
    { key: "contradictions", label: "Zero-Error Sentinel", icon: AlertTriangle },
  ];
  const content: Record<string, { title: string; items: string[] }> = {
    masqueraders: { title: "Masqueraders (Zebra Hunting)", items: data.masqueraders },
    toxicity: { title: "Occult Toxicity", items: data.occultToxicity },
    genetics: { title: "Rare Genetic Errors", items: data.rareGenetics },
    rescue: { title: "Rescue Treatments", items: data.rescueTreatments },
    wildcard: { title: "Wildcard Therapies", items: data.wildcardTherapies },
    contradictions: { title: "Zero-Error Sentinel", items: data.contradictions },
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <div className="h-2 w-2 rounded-full bg-purple-400 animate-pulse" />
        <p className="text-[10px] font-bold text-purple-300 uppercase tracking-wider">Hope Engine — Rescue Node Activated</p>
      </div>
      <p className="text-[10px] text-slate-500 italic">When standard management fails or diagnosis remains unclear — shift from "Probable" to "Possible"</p>
      <div className="flex gap-1.5 flex-wrap">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              "flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-medium transition-all border",
              activeTab === key
                ? "bg-purple-500/15 text-purple-300 border-purple-400/40"
                : "text-slate-500 border-white/5 hover:text-slate-300"
            )}
          >
            <Icon size={10} />
            {label}
          </button>
        ))}
      </div>
      <div className="rounded-lg border border-purple-400/20 bg-purple-400/5 p-3">
        <p className="text-[10px] font-bold text-purple-300 uppercase mb-1.5">{content[activeTab]?.title}</p>
        <div className="space-y-1">
          {content[activeTab]?.items.map((item, i) => (
            <div key={i} className="flex items-start gap-2 text-[10px] text-slate-300">
              <span className="text-purple-400 mt-0.5">◇</span>
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- Main Component ---------- */

export default function ClinicalRoadmap({ patientId, patientName }: { patientId: string; patientName: string }) {
  const { account } = useAuth();
  const { patients, logAudit } = useStore();
  const doctorName = account?.name ?? "Dr. Admin";
  const [activeStage, setActiveStage] = useState<StageMarker>(0);
  const [hopeEngineOn, setHopeEngineOn] = useState(false);

  const stageComponents: Record<StageMarker, React.ReactNode> = {
    0: <PatientSnapshot patientId={patientId} patientName={patientName} />,
    1: <ClinicalIngress />,
    2: <RoadmapContent />,
    3: <DeepDive />,
    4: <InvestigationNode />,
    5: <TherapeuticRelease />,
    6: <OrganSafetyGrid />,
    7: <WardMonitoringTab />,
    8: <PatientEducationTab />,
    9: <ReferencesTab />,
    10: <DoctorOrdersDischarge />,
  };

  const activateStage = (s: StageMarker) => {
    setActiveStage(s);
    logAudit("Roadmap stage opened", `Stage ${s}: ${stages.find((x) => x.id === s)?.label}`, doctorName);
  };

  const toggleHopeEngine = () => {
    setHopeEngineOn(!hopeEngineOn);
    logAudit(hopeEngineOn ? "Hope Engine deactivated" : "Hope Engine activated", `Patient ${patientId}`, doctorName);
    toast.success(hopeEngineOn ? "Hope Engine disengaged" : "Hope Engine engaged — rescue logic active");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionTitle title="Clinical Roadmap — GPS Navigation" subtitle="Stage-based clinical pathway with AI-guided decision support" />
        <div className="flex items-center gap-2">
          <button className={cn("btn-ghost !text-xs", hopeEngineOn && "border-purple-400/40 text-purple-300")} onClick={toggleHopeEngine}>
            <Brain size={12} className={hopeEngineOn ? "text-purple-400" : ""} />
            {hopeEngineOn ? "Hope Engine ON" : "Hope Engine"}
          </button>
          <button className="btn-ghost !text-xs" onClick={() => { logAudit("Roadmap printed", `Patient ${patientId}`, doctorName); window.print(); }}>
            <Printer size={12} /> Print
          </button>
        </div>
      </div>

      {/* Stage selector — horizontal scroll */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {stages.map((s) => (
          <button
            key={s.id}
            onClick={() => activateStage(s.id)}
            className={cn(
              "flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-medium whitespace-nowrap transition-all border shrink-0",
              activeStage === s.id
                ? "bg-gradient-to-r from-cyan-500/20 to-violet-500/20 text-white border-violet-400/40"
                : "text-slate-500 border-white/5 hover:border-white/20 hover:text-slate-300"
            )}
          >
            <s.icon size={10} className={activeStage === s.id ? "text-neon-cyan" : ""} />
            <span>Stage {s.id}</span>
          </button>
        ))}
      </div>

      {/* Stage header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-white">
            Stage {activeStage}: {stages.find((s) => s.id === activeStage)?.label}
          </h3>
          <Badge tone="violet" className="!text-[7px]">{stages.find((s) => s.id === activeStage)?.agent}</Badge>
        </div>
        <div className="flex items-center gap-1">
          {stages.filter((s) => s.id <= activeStage).length > 0 && (
            <span className="text-[10px] text-slate-500">
              {activeStage + 1} / {stages.length}
            </span>
          )}
        </div>
      </div>

      {/* Stage content */}
      <GlassCard>
        {stageComponents[activeStage]}
      </GlassCard>

      {/* Navigation arrows */}
      <div className="flex items-center justify-between">
        <button
          className="btn-ghost !text-xs"
          disabled={activeStage === 0}
          onClick={() => activateStage((activeStage - 1) as StageMarker)}
        >
          ← Previous: Stage {activeStage - 1}
        </button>
        <span className="text-[10px] text-slate-500">
          <StageBadge stage={activeStage} active={activeStage} />
        </span>
        <button
          className="btn-neon !text-xs"
          disabled={activeStage === 10}
          onClick={() => activateStage((activeStage + 1) as StageMarker)}
        >
          Next: Stage {activeStage + 1} →
        </button>
      </div>

      {/* Hope Engine section */}
      {hopeEngineOn && <GlassCard><HopeEngine /></GlassCard>}

      {/* Stage progress bar */}
      <div className="flex gap-1">
        {stages.map((s) => (
          <div
            key={s.id}
            className={cn("h-1.5 flex-1 rounded-full transition-all cursor-pointer",
              activeStage === s.id ? "bg-gradient-to-r from-cyan-400 to-violet-400" :
              s.id < activeStage ? "bg-emerald-400/60" : "bg-white/10"
            )}
            onClick={() => activateStage(s.id)}
          />
        ))}
      </div>
    </div>
  );
}
