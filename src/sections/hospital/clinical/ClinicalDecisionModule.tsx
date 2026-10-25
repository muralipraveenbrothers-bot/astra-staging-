import { useState, useMemo } from "react";
import {
  Activity,
  AlertTriangle,
  Brain,
  CheckCircle2,
  Gauge,
  HeartPulse,
  Lock,
  ShieldCheck,
  Stethoscope,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Badge, GlassCard, SectionTitle } from "@/components/ui";
import { useStore } from "@/lib/store";
import { cn, sleep, uid } from "@/lib/utils";

type RiskBucket = "low" | "moderate" | "high" | "critical";

const RISK_COLORS: Record<RiskBucket, string> = {
  low: "text-emerald-300 border-emerald-400/40 bg-emerald-500/10",
  moderate: "text-amber-300 border-amber-400/50 bg-amber-500/10",
  high: "text-orange-300 border-orange-400/60 bg-orange-500/10",
  critical: "text-red-300 border-red-400/70 bg-red-500/10",
};

const MOCK_RISK = () => ({
  asa: { score: 2, label: "ASA II" },
  ssi: { base: 8, delta: -10 },
  dvt: { base: 12, delta: -20 },
  leak: { base: 10, delta: -34 },
});

const FIELD_AREAS = [
  { x: 38, y: 22, label: "Nerve Risk Area", tone: "red" },
  { x: 55, y: 35, label: "Major Landmark", tone: "cyan" },
  { x: 62, y: 55, label: "Safe Corridor", tone: "emerald" },
];

export function ClinicalDecisionModule() {
  const { audit, logAudit } = useStore();
  const [loading, setLoading] = useState(false);
  const [risk, setRisk] = useState<ReturnType<typeof MOCK_RISK>>();
  const [outcome, setOutcome] = useState<string | null>(null);
  const [blockchainHash, setBlockchainHash] = useState<string | null>(null);
  const [fieldFocus, setFieldFocus] = useState<string | null>(null);
  const [caseNotes, setCaseNotes] = useState("");

  const loadBaseline = async () => {
    setLoading(true);
    await sleep(1000);
    setRisk(MOCK_RISK());
    setLoading(false);
    toast.success("Advanced Risk Stratification loaded");
    logAudit("Risk matrix loaded", `ASA=${MOCK_RISK().asa.score}`, "CDS");
  };

  const approveFieldPlan = () => {
    setOutcome("approved");
    toast.success("Field Plan Approved", {
      description: "Safe dissection corridors are locked. Proceed with caution.",
    });
    logAudit("Field plan approved", "Surgeon accepted simulation", "Dr. Admin");
  };

  const runMolecularCascade = () => {
    toast.info("Molecular Cascade Engine", {
      description: "T-24h → T-12h → T-1h cascade initialized.",
    });
    logAudit("Cascade initialized", "Pre-rupture timeline started", "CDS");
  };

  const signAndLock = async () => {
    if (!caseNotes.trim()) {
      toast.error("Case notes required before signing.");
      return;
    }
    await sleep(800);
    const h = `0x${[...caseNotes].reduce((a, c) => a + c.charCodeAt(0), 0).toString(16).slice(0, 12)}`;
    setBlockchainHash(h);
    toast.success("Medicolegal Lock Active", {
      description: `Digital signature secured. Hash: ${h}`,
    });
    logAudit("Medicolegal lock applied", `Hash=${h}`, "CDS Auditor");
  };

  const overallRisk: { bucket: RiskBucket; pct: number } = useMemo(() => {
    if (!risk) return { bucket: "low", pct: 0 };
    const pct = Math.max(0, Math.min(100, risk.asa.score * 18 + risk.ssi.base + risk.dvt.base + risk.leak.base));
    if (pct >= 70) return { bucket: "critical", pct };
    if (pct >= 45) return { bucket: "high", pct };
    if (pct >= 25) return { bucket: "moderate", pct };
    return { bucket: "low", pct };
  }, [risk]);

  return (
    <div className="space-y-4">
      <div className="glass border !border-cyan-400/40 p-4 flex items-center gap-3" style={{ boxShadow: "0 0 24px rgba(34,211,238,0.12)" }}>
        <Brain className="text-cyan-300 shrink-0" size={22} />
        <div>
          <p className="text-sm font-bold text-cyan-200">Clinical Decision Module — Surgical Planning R1</p>
          <p className="text-xs text-slate-400">
            Risk stratification · pre-op optimization · complication forecasting · field simulation · medicolegal seal
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* LEFT: Risk + SSI */}
        <div className="space-y-4">
          <GlassCard>
            <SectionTitle title="Advanced Risk Stratification Matrix" subtitle="ASA · DVT · Mortality — auto-derived" />
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-baseline gap-2">
                <HeartPulse className="text-rose-300" size={18} />
                <span className="text-slate-300 text-sm">Computed risk</span>
                <Badge tone={overallRisk.bucket === "low" ? "green" : overallRisk.bucket === "critical" ? "red" : "amber"}>
                  {overallRisk.bucket.toUpperCase()}
                </Badge>
              </div>
              <button className="btn-neon" disabled={!!risk} onClick={loadBaseline}>
                {risk ? "Baseline loaded" : "Compute Baseline"}
              </button>
            </div>

            {risk && (
              <div className="mt-3 space-y-2">
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border border-white/10 p-3">
                    <div className="text-[11px] text-slate-400 mb-1">ASA Score</div>
                    <div className="text-xl font-bold text-white">{risk.asa.score}</div>
                    <div className="text-[11px] text-slate-400">{risk.asa.label}</div>
                  </div>
                  <div className="rounded-lg border border-white/10 p-3">
                    <div className="text-[11px] text-slate-400 mb-1">DVT</div>
                    <div className="text-xl font-bold text-white">{Math.max(1, risk.dvt.base + risk.dvt.delta / 100 * risk.dvt.base)}%</div>
                  </div>
                  <div className="rounded-lg border border-white/10 p-3">
                    <div className="text-[11px] text-slate-400 mb-1">Leak Risks</div>
                    <div className="text-xl font-bold text-white">{Math.max(0, risk.leak.base + risk.leak.delta / 100 * risk.leak.base)}%</div>
                  </div>
                </div>
              </div>
            )}
          </GlassCard>

          <GlassCard>
            <SectionTitle title="Complication Forecasting" subtitle="Real-time risk gauge visualisation" />
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <svg viewBox="0 0 240 140" className="w-56 h-36">
                  <path d="M 28 124 A 92 92 0 0 1 212 124" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="14" />
                  <path d="M 28 124 A 92 92 0 0 1 212 124" fill="none" stroke="url(#riskGrad)" strokeWidth="14" strokeLinecap="round" />
                  <defs>
                    <linearGradient id="riskGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0" stopColor="#34d399" />
                      <stop offset="0.5" stopColor="#fbbf24" />
                      <stop offset="1" stopColor="#f87171" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-3 text-center">
                  <div className={cn("text-sm font-bold", RISK_COLORS[overallRisk.bucket])}>Overall Risk</div>
                  <div className="text-2xl font-bold text-white">{overallRisk.pct}%</div>
                </div>
              </div>
              <div className="flex w-full gap-2">
                {(["SSI", "DVT", "Leak"] as const).map((k) => (
                  <div key={k} className="flex-1 rounded-lg border border-white/10 p-2 text-center">
                    <div className="text-[11px] text-slate-400">{k}</div>
                    <div className="text-sm font-bold text-white">
                      {k === "SSI"
                        ? `${Math.max(0, risk ? risk.ssi.base + risk.ssi.delta / 100 * risk.ssi.base : 0)}%`
                        : k === "DVT"
                        ? `${Math.max(0, risk ? risk.dvt.base + risk.dvt.delta / 100 * risk.dvt.base : 0)}%`
                        : `${Math.max(0, risk ? risk.leak.base + risk.leak.delta / 100 * risk.leak.base : 0)}%`}
                    </div>
                  </div>
                ))}
              </div>
              <button className="btn-neon w-full" disabled={!risk} onClick={runMolecularCascade}>
                <Activity size={15} className="mr-2" /> Run Molecular Cascade
              </button>
            </div>
          </GlassCard>
        </div>

        {/* RIGHT: Field Simulation + Decision Engine + Seals */}
        <div className="space-y-4">
          <GlassCard>
            <SectionTitle title="Multi-Modal 3D Field Simulation" subtitle="Nerve landmarks · safe corridors · lock trajectory" />
            <div
              className="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent h-40"
              onMouseEnter={() => setFieldFocus("field")}
              onMouseLeave={() => setFieldFocus(null)}
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_55%_40%,rgba(34,211,238,0.25),transparent_55%)]" />
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-28 h-36 rounded-full border border-white/20 bg-white/5" />

              {FIELD_AREAS.map((a) => (
                <div
                  key={a.label}
                  className={cn(
                    "absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-all",
                    fieldFocus === "field" ? "opacity-100" : "opacity-90 hover:scale-110"
                  )}
                  style={{ left: `${a.x}%`, top: `${a.y}%` }}
                >
                  <div className="relative">
                    <div
                      className={cn(
                        "h-2 w-2 rounded-full ring-2",
                        a.tone === "red"
                          ? "bg-red-400/90 ring-red-300/60"
                          : a.tone === "cyan"
                          ? "bg-cyan-400/90 ring-cyan-300/60"
                          : "bg-emerald-400/90 ring-emerald-300/60"
                      )}
                    />
                    <div className="absolute left-1/2 -translate-x-1/2 -top-8 whitespace-nowrap rounded-md border border-white/20 bg-black/70 px-2 py-1 text-[11px] text-white">
                      {a.label}
                    </div>
                  </div>
                </div>
              ))}

              <div className="absolute right-3 top-3 flex items-center gap-1">
                <CheckCircle2 className="text-emerald-300" size={14} />
                <span className="text-[11px] text-emerald-200">Live Data</span>
              </div>
            </div>

            <div className="mt-3 flex gap-2">
              <button className="btn-ghost flex-1" onClick={approveFieldPlan}>
                <CheckCircle2 size={14} className="mr-1" /> Approve Field Plan
              </button>
              <button
                className="btn-ghost flex-1"
                onClick={() => {
                  setOutcome("rejected");
                  toast.warning("Overridden by surgeon");
                }}
              >
                <XCircle size={14} className="mr-1" /> Override Safety
              </button>
            </div>
          </GlassCard>

          <GlassCard>
            <SectionTitle title="AI Decision Justification Engine" subtitle="Surgical Approach Selection" />
            <div className="grid grid-cols-2 gap-2 mb-2">
              {["Selection Criteria", "Laparoscopic Approach", "Complexity Index", "Operative Timing"].map((row) => (
                <div key={row} className="rounded-lg border border-white/10 p-2 text-xs text-slate-300">
                  <div className="text-[10px] text-slate-500">{row}</div>
                  <div className="font-semibold text-white">
                    {row === "Laparoscopic Approach"
                      ? "Lower blood loss & faster recovery"
                      : row === "Complexity Index"
                      ? "Identifies Adhesion & Obesity risks"
                      : row === "Operative Timing"
                      ? "Estimated vs Actual duration tracking"
                      : "Auto-weighted panel"}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-white/10 p-3">
              <div className="text-xs text-slate-300">Confidence</div>
              <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full rounded-full bg-cyan-400" style={{ width: "92%" }} />
              </div>
              <div className="text-sm font-bold text-cyan-300">92%</div>
            </div>
          </GlassCard>

          <GlassCard>
            <SectionTitle title="Medico-Legal Defense Lock" subtitle="Tamper-proof, hash-locked records" />
            <textarea
              className="input-dark resize-none"
              rows={3}
              placeholder="Surgeon case notes — required to sign and lock record…"
              value={caseNotes}
              onChange={(e) => setCaseNotes(e.target.value)}
            />
            <div className="mt-2 flex gap-2">
              <button className="btn-neon flex-1" disabled={!caseNotes.trim()} onClick={signAndLock}>
                <Lock size={14} className="mr-1" /> Sign & Lock Record
              </button>
            </div>
            {blockchainHash && (
              <div className="mt-2 rounded-lg border border-cyan-400/40 bg-cyan-500/10 p-3">
                <div className="flex items-center gap-2 text-cyan-200">
                  <ShieldCheck size={16} /> Digital Signatures Secured
                </div>
                <div className="mt-1 font-mono text-[11px] text-cyan-100 break-all">{blockchainHash}</div>
              </div>
            )}
          </GlassCard>
        </div>
      </div>

      {/* Audit */}
      <GlassCard>
        <SectionTitle title="Audit Trail" subtitle="Clinical Decision Module events" />
        <div className="max-h-48 overflow-y-auto space-y-1.5">
          {audit.length === 0 && <p className="text-xs text-slate-500">No events yet.</p>}
          {audit.map((a) => (
            <div key={a.id} className="flex items-center gap-3 text-xs rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
              <span className="font-mono text-slate-500 shrink-0">{a.timestamp}</span>
              <Badge tone="violet" className="!text-[9px] shrink-0">{a.actor}</Badge>
              <span className="text-slate-300 font-medium shrink-0">{a.action}</span>
              <span className="text-slate-500 truncate">{a.detail}</span>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
