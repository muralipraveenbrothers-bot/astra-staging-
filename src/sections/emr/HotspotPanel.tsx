import { AlertTriangle, Beaker, ChevronRight, FileImage, FileText, Pill, ShieldCheck, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Hotspot } from "./types";

const STATUS_STYLE: Record<string, string> = {
  critical: "border-red-500/50 bg-red-500/10 text-red-300",
  attention: "border-amber-500/50 bg-amber-500/10 text-amber-300",
  review: "border-blue-500/50 bg-blue-500/10 text-blue-300",
  normal: "border-emerald-500/50 bg-emerald-500/10 text-emerald-300",
};

const SOURCE_LABEL: Record<string, string> = {
  "clinician-selected": "Clinician selected",
  "report-linked": "Report-linked",
  "lab-linked": "Lab-linked",
  "ai-suggestion": "AI suggestion",
  "imaging-linked": "Imaging-linked",
};

function ResIcon({ type }: { type: string }) {
  switch (type) {
    case "lab": return <Beaker size={12} className="text-cyan-300" />;
    case "imaging": return <FileImage size={12} className="text-violet-300" />;
    case "report": return <FileText size={12} className="text-emerald-300" />;
    case "trend": return <Zap size={12} className="text-amber-300" />;
    case "medication": return <Pill size={12} className="text-pink-300" />;
    default: return <FileText size={12} className="text-slate-400" />;
  }
}

export function HotspotPanel({ hotspot }: { hotspot: Hotspot | null }) {
  if (!hotspot) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <div className="max-w-[220px]">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
            <ChevronRight size={20} />
          </div>
          <div className="text-xs font-semibold text-slate-300">Select a hotspot</div>
          <div className="mt-1 text-[11px] leading-relaxed text-slate-500">
            Click any glowing marker on the 3D anatomy to view clinical context, linked data, and safety information.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3 text-slate-200 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-700">
      {/* Header */}
      <div className={cn("rounded-xl border p-3", STATUS_STYLE[hotspot.status])}>
        <div className="flex items-center justify-between">
          <div className="text-sm font-bold text-white">{hotspot.label}</div>
          {hotspot.patientAffected && (
            <span className="rounded-full border border-red-400/50 bg-red-500/15 px-2 py-0.5 text-[9px] font-bold uppercase text-red-300">Patient Affected</span>
          )}
        </div>
        <div className="mt-1 text-[10px] uppercase tracking-wider opacity-80">{hotspot.system} System</div>
      </div>

      {/* Source */}
      <div className="flex items-center gap-2 rounded-lg border border-slate-700/40 bg-slate-800/40 px-3 py-2 text-[11px] text-slate-400">
        <ShieldCheck size={13} className="text-cyan-400" />
        <span>Source: <span className="font-semibold text-slate-300">{SOURCE_LABEL[hotspot.source]}</span></span>
      </div>

      {/* Anatomical location */}
      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Anatomical Location</div>
        <div className="rounded-lg border border-slate-700/40 bg-slate-800/40 p-2.5 text-[11px] leading-relaxed text-slate-300">{hotspot.anatomicalLocation}</div>
      </div>

      {/* Landmarks */}
      {hotspot.landmarks && hotspot.landmarks.length > 0 && (
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Key Landmarks</div>
          <div className="flex flex-wrap gap-1">
            {hotspot.landmarks.map((l) => (
              <span key={l} className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-medium text-cyan-200">{l}</span>
            ))}
          </div>
        </div>
      )}

      {/* Clinical significance */}
      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Clinical Significance</div>
        <div className="rounded-lg border border-slate-700/40 bg-slate-800/40 p-2.5 text-[11px] leading-relaxed text-slate-300">{hotspot.clinicalSignificance}</div>
      </div>

      {/* Safety note */}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5">
        <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-400"><AlertTriangle size={12} /> Safety Note</div>
        <div className="text-[11px] leading-relaxed text-amber-200/90">{hotspot.safetyNote}</div>
      </div>

      {/* Linked resources */}
      <div>
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Linked Clinical Data</div>
        <div className="flex flex-col gap-1">
          {hotspot.linkedResources.map((r) => (
            <button key={r.label} className="flex items-center justify-between rounded-lg border border-slate-700/50 bg-slate-800/40 px-2.5 py-1.5 text-left text-[11px] transition-colors hover:border-cyan-500/40 hover:bg-cyan-500/10">
              <span className="flex items-center gap-2 text-slate-200"><ResIcon type={r.type} />{r.label}</span>
              <ChevronRight size={13} className="text-slate-500" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}