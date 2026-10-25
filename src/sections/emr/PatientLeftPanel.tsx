import { Activity, AlertTriangle, Bell, ClipboardList, FileText, FlaskConical, Heart, Pill, Settings, Stethoscope, User, Waves } from "lucide-react";
import { cn } from "@/lib/utils";
import { PATIENT } from "./types";

const NAV = [
  { icon: Heart, label: "Anatomy" }, { icon: Waves, label: "Timeline" },
  { icon: FileText, label: "Reports" }, { icon: Pill, label: "Medications" },
  { icon: ClipboardList, label: "Orders" }, { icon: Settings, label: "Settings" },
];

function TrendIcon({ trend }: { trend?: string }) {
  if (trend === "up") return <span className="text-[10px] font-bold text-red-400">▲</span>;
  if (trend === "down") return <span className="text-[10px] font-bold text-amber-400">▼</span>;
  return null;
}

export function PatientLeftPanel() {
  const p = PATIENT;
  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3 text-slate-200 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-700">
      <div className="flex items-center gap-3 rounded-xl border border-cyan-500/20 bg-slate-800/60 p-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-500/20 text-cyan-300"><User size={18} /></div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-white">{p.displayName}</div>
          <div className="text-[10px] text-slate-400">{p.mrn} · {p.age}{p.sex} · Since {p.admitted}</div>
        </div>
      </div>
      <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3">
        <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-400"><Stethoscope size={12} /> Primary Diagnosis</div>
        <div className="text-xs font-semibold text-white">{p.primaryDiagnosis}</div>
        <div className="mt-1 text-[10px] text-slate-400">Δ {p.differentialDiagnosis}</div>
        <div className="mt-2 flex flex-wrap gap-1">
          {p.allergies.map((a) => (<span key={a} className="rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[9px] font-semibold text-red-300">⚠ {a}</span>))}
        </div>
      </div>
      <div>
        <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400"><Bell size={12} /> Clinical Alerts</div>
        <div className="flex flex-col gap-1">
          {p.alerts.map((a, i) => (
            <div key={i} className={cn("flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px]", a.level === "critical" ? "border-red-500/40 bg-red-500/10 text-red-300" : a.level === "warning" ? "border-amber-500/30 bg-amber-500/10 text-amber-300" : "border-slate-600/40 bg-slate-700/30 text-slate-300")}>
              {a.level === "critical" ? <AlertTriangle size={12} /> : <Activity size={12} />}{a.label}
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400"><Activity size={12} /> Vitals</div>
        <div className="grid grid-cols-2 gap-1.5">
          {p.vitals.map((v) => (
            <div key={v.label} className="rounded-lg border border-slate-700/50 bg-slate-800/40 px-2 py-1.5">
              <div className="text-[9px] text-slate-500">{v.label}</div>
              <div className={cn("text-xs font-semibold", v.status === "abnormal" ? "text-amber-300" : "text-slate-200")}>{v.value}</div>
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400"><FlaskConical size={12} /> Key Labs</div>
        <div className="flex flex-col gap-1">
          {p.labs.map((l) => (
            <div key={l.label} className="flex items-center justify-between rounded-lg border border-slate-700/50 bg-slate-800/40 px-2.5 py-1.5">
              <span className="text-[11px] text-slate-300">{l.label}</span>
              <span className="flex items-center gap-1"><TrendIcon trend={l.trend} /><span className={cn("text-[11px] font-semibold", l.status === "critical" ? "text-red-400" : l.status === "abnormal" ? "text-amber-300" : "text-slate-200")}>{l.value}</span></span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400"><Pill size={12} /> Medications</div>
        <div className="flex flex-col gap-1">
          {p.medications.map((m) => (<div key={m} className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-2.5 py-1.5 text-[11px] text-emerald-200">{m}</div>))}
        </div>
      </div>
      <div className="mt-auto">
        <div className="flex flex-col gap-1 rounded-xl border border-slate-700/40 bg-slate-800/40 p-2">
          {NAV.map((n, i) => (
            <div key={n.label} className={cn("flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] transition-colors", i === 0 ? "bg-cyan-500/15 text-cyan-300" : "text-slate-400 hover:bg-slate-700/40 hover:text-slate-200")}><n.icon size={13} />{n.label}</div>
          ))}
        </div>
      </div>
    </div>
  );
}