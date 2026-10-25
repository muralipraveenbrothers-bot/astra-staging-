import React from "react";
import { Stethoscope, Wrench, ShieldAlert, CheckCircle2, AlertTriangle, Layers, Activity, Maximize, Minimize, Move } from "lucide-react";
import type { FractureClassification } from "@/services/orthoClassificationData";
import { SEVERITY_COLOR } from "@/services/orthoClassificationData";

interface TreatmentPanelProps {
  classification: FractureClassification | null;
  onApplyReduction: () => void;
  onToggleImplant: () => void;
  onToggleOsteotomy: () => void;
  reductionProgress: number;
  implantActive: boolean;
  osteotomyActive: boolean;
}

export function OrthoTreatmentProtocolPanel({
  classification,
  onApplyReduction,
  onToggleImplant,
  onToggleOsteotomy,
  reductionProgress,
  implantActive,
  osteotomyActive,
}: TreatmentPanelProps) {
  if (!classification) {
    return (
      <div className="rounded-xl border border-slate-700/40 bg-slate-900/60 p-4 text-center text-xs text-slate-500">
        Select a bone or upload an X-ray to view orthopedic classification and treatment options.
      </div>
    );
  }

  const { treatmentOptions, system, code, name, description, severity } = classification;

  return (
    <div className="space-y-3.5">
      {/* Classification Card */}
      <div className="rounded-xl border border-amber-500/30 bg-slate-900/90 p-4 space-y-3 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm">
              {system} CLASSIFICATION
            </span>
            <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border shadow-sm ${SEVERITY_COLOR[severity] || "bg-slate-800 text-slate-400 border-slate-700"}`}>
              {severity} SEVERITY
            </span>
          </div>
          <span className="font-mono text-sm font-bold text-white bg-slate-950 px-2.5 py-0.5 rounded border border-slate-700 shadow-inner">
            {code}
          </span>
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-100">{name}</h3>
          <p className="text-[11px] text-slate-400 leading-relaxed mt-1">{description}</p>
        </div>
      </div>

      {/* 3D Segment Analytics */}
      {classification.reconstruction3DParams && (
        <div className="rounded-xl border border-indigo-500/30 bg-slate-900/90 p-4 space-y-3 shadow-lg">
          <div className="text-xs font-bold text-indigo-300 flex items-center gap-1.5 uppercase">
            <Layers className="w-4 h-4" /> AI Segment Analysis
          </div>
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div className="bg-slate-800/50 p-2 rounded border border-slate-700">
              <span className="text-slate-400 block mb-0.5">Total Fragments</span>
              <span className="text-indigo-300 font-bold text-xs">{classification.reconstruction3DParams.fragments} Parts</span>
            </div>
            <div className="bg-slate-800/50 p-2 rounded border border-slate-700">
              <span className="text-slate-400 block mb-0.5">Complexity</span>
              <span className="text-amber-300 font-bold text-xs">{classification.reconstruction3DParams.fragments > 2 ? "Comminuted (High)" : "Simple (Low)"}</span>
            </div>
            <div className="col-span-2 bg-slate-800/50 p-2 rounded border border-slate-700 space-y-1.5 mt-1">
              <div className="flex justify-between items-center border-b border-slate-700 pb-1">
                <span className="flex items-center gap-1 text-emerald-400 font-semibold"><Maximize size={10}/> Largest Segment</span>
                <span className="text-slate-200">Proximal Diaphysis</span>
              </div>
              <div className="flex justify-between items-center border-b border-slate-700 pb-1">
                <span className="flex items-center gap-1 text-rose-400 font-semibold"><Minimize size={10}/> Smallest Segment</span>
                <span className="text-slate-200">{classification.reconstruction3DParams.fragments > 2 ? "Butterfly Wedge (Comminution)" : "Distal Fragment"}</span>
              </div>
              <div className="flex justify-between items-center pt-0.5">
                <span className="flex items-center gap-1 text-cyan-400 font-semibold"><Move size={10}/> Handlability</span>
                <span className="text-slate-200 text-right">{classification.reconstruction3DParams.fragments > 2 ? "Difficult (Requires bridge plating)" : "Easy (Direct reduction)"}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Interactive 3D Reconstruction Actions */}
      <div className="rounded-xl border border-cyan-500/30 bg-slate-900/90 p-4 space-y-3 shadow-lg">
        <div className="text-xs font-bold text-cyan-300 flex items-center gap-1.5 uppercase">
          <Layers className="w-4 h-4" /> 3D Virtual Reconstruction Tools
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            onClick={onApplyReduction}
            className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all border ${
              reductionProgress > 0.8
                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.2)]"
                : "bg-cyan-500/20 text-cyan-200 hover:bg-cyan-500/30 border-cyan-500/40 shadow-[0_0_10px_rgba(6,182,212,0.15)]"
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>{reductionProgress > 0.8 ? "Reduction Complete (100%)" : "Simulate Reduction"}</span>
          </button>

          <button
            onClick={onToggleImplant}
            className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all border ${
              implantActive
                ? "bg-blue-500/30 text-blue-200 border-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.2)]"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700 border-slate-700"
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>{implantActive ? "Fixation Fitted" : "Fit Locking Plate"}</span>
          </button>

          <button
            onClick={onToggleOsteotomy}
            className={`col-span-2 px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all border ${
              osteotomyActive
                ? "bg-purple-500/30 text-purple-200 border-purple-400 shadow-[0_0_10px_rgba(168,85,247,0.2)]"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700 border-slate-700"
            }`}
          >
            <span>{osteotomyActive ? "Hide VSP Osteotomy Planes" : "Plan VSP Osteotomy & Resection Planes"}</span>
          </button>
        </div>
      </div>

      {/* Surgical & Conservative Treatment Protocol */}
      <div className="rounded-xl border border-slate-700/50 bg-slate-900/80 p-4 space-y-4 shadow-lg">
        <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5 uppercase">
          <Stethoscope className="w-4 h-4 text-emerald-400" /> Evidence-Based Treatment Options
        </div>

        {/* Surgical Protocol */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-bold text-cyan-300 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" /> Surgical Interventions:
          </div>
          <ul className="space-y-1.5 text-xs text-slate-300 pl-5 list-disc">
            {treatmentOptions.surgical.map((s, idx) => (
              <li key={idx} className="leading-snug">{s}</li>
            ))}
          </ul>
        </div>

        {/* Implants & Hardware */}
        <div className="space-y-2 border-t border-slate-800/80 pt-3">
          <div className="text-[11px] font-bold text-indigo-300 flex items-center gap-1.5">
            <Wrench className="w-3.5 h-3.5 text-indigo-400" /> Recommended Hardware / Implants:
          </div>
          <div className="flex flex-wrap gap-1.5">
            {treatmentOptions.implants.map((imp, idx) => (
              <span
                key={idx}
                className="px-2 py-1 rounded bg-indigo-500/10 text-indigo-200 border border-indigo-500/30 text-[10px] font-mono shadow-sm"
              >
                {imp}
              </span>
            ))}
          </div>
        </div>

        {/* Conservative Protocol */}
        <div className="space-y-1.5 border-t border-slate-800/80 pt-3">
          <div className="text-[11px] font-bold text-amber-300 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" /> Conservative Management:
          </div>
          <ul className="space-y-1.5 text-xs text-slate-300 pl-5 list-disc">
            {treatmentOptions.conservative.map((c, idx) => (
              <li key={idx} className="leading-snug">{c}</li>
            ))}
          </ul>
        </div>

        {/* Post-Op Protocol */}
        <div className="border-t border-slate-800/80 pt-3 text-xs">
          <span className="font-bold text-emerald-400 uppercase tracking-wider text-[10px]">Post-Operative Rehab: </span>
          <span className="text-slate-300 block mt-1">{treatmentOptions.postOpCare}</span>
        </div>

        {/* Complications */}
        {treatmentOptions.complications && treatmentOptions.complications.length > 0 && (
          <div className="border-t border-slate-800/80 pt-3 text-xs">
            <div className="text-[11px] font-bold text-rose-400 flex items-center gap-1.5 mb-1.5">
              <ShieldAlert className="w-3.5 h-3.5" /> High-Risk Complications:
            </div>
            <div className="flex flex-wrap gap-1.5">
              {treatmentOptions.complications.map((comp, idx) => (
                <span
                  key={idx}
                  className="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20 text-[9px] font-medium"
                >
                  {comp}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
