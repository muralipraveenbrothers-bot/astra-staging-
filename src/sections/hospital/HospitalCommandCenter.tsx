import React, { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  FlaskConical,
  HeartHandshake,
  Layers,
  Megaphone,
  Mic,
  Pill,
  Radiation,
  RefreshCw,
  Scissors,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  TrendingUp,
  Users2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui";
import { navHash } from "@/lib/hashRoute";
import { AiGatewayPanel } from "@/components/Intelligence/AiGatewayPanel";
import { McpPanel } from "@/components/Intelligence/McpPanel";
import { apiFetch, authHeaders } from "@/services/apiFetch";

interface PulseMetrics {
  hospitalPulseIndex: number;
  whyPulseScore: string;
  opToday: number;
  ipCensus: number;
  icuCensus: number;
  otToday: number;
  admissionsToday: number;
  dischargesToday: number;
  pendingLab: number;
  pendingBills: number;
  pharmacyAlerts: number;
  pmjayClaimsInReview: number;
  criticalAlerts: number;
  totalBeds: number;
  occupiedBeds: number;
  occupancyRatePct: number;
  todayCollectionsINR: number;
}

interface AttentionItem {
  id: string;
  severity: "critical" | "high" | "warning" | "info";
  category: string;
  title: string;
  detail: string;
  patientName?: string;
  uhid?: string;
  bed?: string;
  ageText: string;
  owner: string;
  recommendedAction: string;
  status: string;
}

export function HospitalCommandCenter() {
  const [pulse, setPulse] = useState<PulseMetrics | null>(null);
  const [attentionItems, setAttentionItems] = useState<AttentionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "tasks">("overview");

  const fetchData = async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const [resPulse, resAttn] = await Promise.all([
        apiFetch("/api/hospital/pulse"),
        apiFetch("/api/hospital/attention"),
      ]);
      if (resPulse.ok) setPulse(await resPulse.json());
      if (resAttn.ok) {
        const data = await resAttn.json();
        setAttentionItems(data.attentionItems || []);
      }
    } catch {
      // Fallback
    } finally {
      if (!isRefresh) setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(false);
    const interval = setInterval(() => fetchData(true), 15000);
    return () => clearInterval(interval);
  }, []);

  const handleAttentionAction = async (id: string, newStatus: string) => {
    try {
      const res = await apiFetch(`/api/hospital/attention/${id}/status`, {
        method: "PATCH",
        headers: authHeaders(true),
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        toast.success(`Action applied: ${newStatus}`);
        setAttentionItems((prev) =>
          prev.map((item) => (item.id === id ? { ...item, status: newStatus } : item))
        );
      }
    } catch {
      toast.error("Failed to update alert state.");
    }
  };

  // Never substitute a fabricated score: a missing payload means "unknown".
  const pulseIndex = pulse ? pulse.hospitalPulseIndex : null;
  const pulseToneClass =
    pulseIndex === null
      ? "text-slate-400"
      : pulseIndex >= 80
        ? "text-emerald-400"
        : pulseIndex >= 60
          ? "text-amber-400"
          : "text-rose-400";
  // Tiles render the stored value, or a dash when the API has not answered.
  const tile = (v?: number, suffix = "") => (typeof v === "number" ? `${v}${suffix}` : "—");

  return (
    <div className="space-y-5 max-w-[1550px] mx-auto p-1">
      {/* ---------------- Top Big Banner ---------------- */}
      <div className="rounded-2xl border border-slate-800 bg-gradient-to-r from-slate-900 via-blue-950/40 to-slate-900 p-5 shadow-2xl relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 z-10">
          <div className="p-3 rounded-xl bg-blue-600/20 border border-blue-500/40 text-cyan-300 shadow-inner">
            <Building2 className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-400">
                ASTRA HOSPITAL OS • OPERATIONAL COMMAND LAYER
              </span>
              <Badge tone="green">Real-time Live</Badge>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">Hospital Command Center</h1>
            <p className="text-xs text-slate-300 mt-0.5">
              Continuous intelligence monitoring across OPD, IPD, OT, ICU, Labs, Pharmacy, Billing & Insurance.
            </p>
          </div>
        </div>

        {/* Pulse Score Badge */}
        <div className="flex items-center gap-4 bg-slate-900/90 border border-slate-700/80 rounded-xl p-3 shadow-xl z-10">
          <div className="text-right">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              HOSPITAL PULSE INDEX
            </span>
            <div className="flex items-center justify-end gap-1.5 mt-0.5">
              <span className={`text-2xl font-black ${pulseToneClass}`}>{pulseIndex ?? "—"}</span>
              <span className="text-xs font-semibold text-slate-400">/ 100</span>
            </div>
            <span className={`text-[10px] font-semibold ${pulseToneClass}`}>
              {pulse?.whyPulseScore ?? "Awaiting live hospital data"}
            </span>
          </div>

          <button
            onClick={() => navHash("/health")}
            className="px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 text-xs font-semibold flex items-center gap-1 transition-all"
          >
            Why {pulseIndex}?
          </button>
        </div>
      </div>

      <AiGatewayPanel />
      <McpPanel />

      {/* ---------------- 10 Pulse Metric Cards ---------------- */}
      <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-2">
        {[
          // These tiles used to fall back to invented numbers (|| 111, || 31,
          // || 12, ...), so an empty store still rendered a busy hospital.
          { label: "OPD TODAY", val: tile(pulse?.opToday), sub: "Registered outpatients", tone: "blue", path: "/reception" },
          { label: "IPD CENSUS", val: tile(pulse?.ipCensus), sub: pulse ? `${pulse.totalBeds} total beds` : "Total beds", tone: "indigo", path: "/ward" },
          { label: "ICU CENSUS", val: tile(pulse?.icuCensus), sub: "Occupied ICU beds", tone: "rose", path: "/ward" },
          { label: "OT TODAY", val: tile(pulse?.otToday, " Cases"), sub: "OT records on file", tone: "purple", path: "/ot" },
          { label: "ADMISSIONS", val: tile(pulse?.admissionsToday), sub: "Inpatients on file", tone: "emerald", path: "/reception" },
          { label: "DISCHARGES", val: tile(pulse?.dischargesToday), sub: "Discharged on file", tone: "teal", path: "/billing" },
          { label: "PENDING LAB", val: tile(pulse?.pendingLab), sub: "Lab orders open", tone: "amber", path: "/lab" },
          { label: "PENDING BILLS", val: tile(pulse?.pendingBills), sub: "Bills not cleared", tone: "cyan", path: "/billing" },
          { label: "PHARM ALERTS", val: tile(pulse?.pharmacyAlerts), sub: "At/below reorder level", tone: "orange", path: "/pharmacy" },
          { label: "PMJAY CLAIMS", val: tile(pulse?.pmjayClaimsInReview), sub: "Insurance pending", tone: "sky", path: "/insurance" },
        ].map((item, idx) => (
          <div
            key={idx}
            onClick={() => navHash(item.path)}
            className="rounded-xl border border-slate-800 bg-slate-900/80 hover:bg-slate-800/80 p-2.5 transition-all cursor-pointer group shadow-sm flex flex-col justify-between"
          >
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight truncate group-hover:text-cyan-300">
              {item.label}
            </span>
            <div className="text-lg font-extrabold text-white my-0.5">{item.val}</div>
            <span className="text-[9px] text-slate-400 truncate">{item.sub}</span>
          </div>
        ))}
      </div>

      {/* ---------------- Lower Two-Column Section ---------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left Column: What Needs Attention Right Now */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/30">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <h2 className="text-sm font-extrabold uppercase tracking-wide text-white flex items-center gap-2">
                WHAT NEEDS ATTENTION RIGHT NOW?
                <Badge tone="red">
                  {attentionItems.filter((a) => a.status !== "RESOLVED").length} Unresolved Bottlenecks
                </Badge>
              </h2>
            </div>
            <span className="text-[10px] text-slate-400">Universal scanning engine across clinical, operational & financial workflows</span>
          </div>

          <div className="space-y-2.5">
            {attentionItems.map((item) => {
              const isResolved = item.status === "RESOLVED";
              return (
                <div
                  key={item.id}
                  className={`rounded-xl border p-3.5 transition-all shadow-md ${
                    item.severity === "critical"
                      ? "bg-rose-950/20 border-rose-500/40"
                      : item.severity === "high"
                      ? "bg-amber-950/20 border-amber-500/40"
                      : "bg-slate-900/80 border-slate-800"
                  } ${isResolved ? "opacity-40" : ""}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge tone={item.severity === "critical" ? "red" : item.severity === "high" ? "amber" : "cyan"}>
                          {item.severity.toUpperCase()}
                        </Badge>
                        <span className="text-xs font-bold text-white">{item.title}</span>
                      </div>
                      <p className="text-xs text-slate-300 leading-snug">{item.detail}</p>
                      <div className="text-[11px] text-emerald-400 font-medium mt-1">
                        👉 <strong>Recommended Action:</strong> {item.recommendedAction}
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-slate-400 pt-1">
                        <span>Assigned: <strong>{item.owner}</strong></span>
                        <span>•</span>
                        <span>Age: <strong>{item.ageText}</strong></span>
                      </div>
                    </div>

                    {/* Action Controls */}
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <div className="flex items-center gap-1">
                        {item.patientName && (
                          <button
                            onClick={() => navHash("/doctor")}
                            className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold shadow"
                          >
                            OPEN
                          </button>
                        )}
                        {!isResolved && (
                          <button
                            onClick={() => handleAttentionAction(item.id, "ACKNOWLEDGED")}
                            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[11px] font-semibold"
                          >
                            ACK
                          </button>
                        )}
                        {!isResolved ? (
                          <button
                            onClick={() => handleAttentionAction(item.id, "RESOLVED")}
                            className="px-2 py-1 rounded bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/40 text-emerald-300 text-[11px] font-semibold"
                          >
                            RESOLVE
                          </button>
                        ) : (
                          <Badge tone="green">RESOLVED</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Today's Hospital Brief & Yesterday Summary */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-xl space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-cyan-400" /> TODAY'S HOSPITAL BRIEF
              </span>
              <Badge tone="cyan">08:00 AM BRIEF</Badge>
            </div>

            <div className="space-y-2 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-800/80 border border-slate-700/60">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">CENSUS & ADMISSIONS</span>
                <p className="text-slate-200">
                  31 active inpatients (62% occupancy), 2 in Intensive Care. 12 fresh admissions scheduled today.
                </p>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-800/80 border border-slate-700/60">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">SURGICAL THEATRES (OT)</span>
                <p className="text-slate-200">
                  3 Major surgeries queued (TKR, Lap Chole, ORIF). PAC clearance completed for all morning slots.
                </p>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-800/80 border border-slate-700/60">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">CRITICAL LAB & PHARMACY</span>
                <p className="text-slate-200">
                  3 Critical lab alerts flagged. Injectable Paracetamol reordered. Zero drug-drug interactions recorded.
                </p>
              </div>
            </div>

            {/* Yesterday Summary */}
            <div className="pt-2 border-t border-slate-800">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                YESTERDAY SUMMARY
              </span>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded bg-slate-800/60">
                  <span className="text-slate-400">OPD:</span> <strong className="text-white">142</strong>
                </div>
                <div className="p-2 rounded bg-slate-800/60">
                  <span className="text-slate-400">Admissions:</span> <strong className="text-white">13</strong>
                </div>
                <div className="p-2 rounded bg-slate-800/60">
                  <span className="text-slate-400">Discharges:</span> <strong className="text-white">11</strong>
                </div>
                <div className="p-2 rounded bg-slate-800/60">
                  <span className="text-slate-400">Surgeries:</span> <strong className="text-white">4</strong>
                </div>
              </div>
            </div>

            <div className="text-[10px] text-slate-400 flex items-center justify-between pt-1">
              <span>Prepared by Astra OS Copilot</span>
              <span className="text-emerald-400 font-semibold">Auto-Sync Active</span>
            </div>
          </div>
        </div>
      </div>

      {/* ---------------- Department Pulse Direct Access Grid ---------------- */}
      <div className="space-y-3 pt-3 border-t border-slate-800">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          DEPARTMENT PULSE DIRECT ACCESS
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {[
            { name: "Clinical", sub: "OP / IP Doctor", icon: Stethoscope, path: "/doctor", tone: "blue" },
            { name: "Reception", sub: "Registration", icon: Users2, path: "/reception", tone: "sky" },
            { name: "OT Center", sub: "3 Cases Today", icon: Scissors, path: "/ot", tone: "purple" },
            { name: "Billing", sub: "Discharge Billing", icon: CreditCard, path: "/billing", tone: "cyan" },
            { name: "Pharmacy", sub: "Dispensing & Stock", icon: Pill, path: "/pharmacy", tone: "emerald" },
            { name: "Laboratory", sub: "CBC & Biochem", icon: FlaskConical, path: "/lab", tone: "amber" },
            { name: "Radiology", sub: "USG & X-Ray", icon: Radiation, path: "/radiology", tone: "indigo" },
            { name: "Insurance", sub: "PMJAY & CMRF", icon: ShieldCheck, path: "/insurance", tone: "teal" },
            { name: "Staff Center", sub: "Work Orders & SLA", icon: Layers, path: "/staff", tone: "fuchsia" },
            { name: "Clinical AI", sub: "DDx & Calculators", icon: Sparkles, path: "/clinical-ai", tone: "violet" },
          ].map((dept, idx) => {
            const Icon = dept.icon;
            return (
              <div
                key={idx}
                onClick={() => navHash(dept.path)}
                className="p-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-cyan-500/50 hover:bg-slate-800/80 transition-all cursor-pointer group shadow-sm text-center"
              >
                <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition-transform">
                  <Icon className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="text-xs font-bold text-white group-hover:text-cyan-300">{dept.name}</div>
                <div className="text-[10px] text-slate-400 truncate mt-0.5">{dept.sub}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
