import React from "react";
import { User, FileText, Scan, Bone, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Patient } from "@/types";
import { XRayUploadAnalyzer } from "./XRayUploadAnalyzer";
import { ORTHO_BONES, type FractureClassification } from "@/services/orthoClassificationData";

interface Props {
  patient: Patient | null;
  mods: string[];
  selectedBone: string;
  setSelectedBone: (b: string) => void;
  onOpenRadio: () => void;
  onClassificationDetected: (c: FractureClassification) => void;
}

export function LeftPanel({
  patient,
  mods,
  selectedBone,
  setSelectedBone,
  onOpenRadio,
  onClassificationDetected,
}: Props) {
  return (
    <aside className="col-span-3 min-h-0 overflow-y-auto border-r border-slate-700/40 bg-slate-900/40 p-3 space-y-3">
      {/* Patient Header */}
      <div className="rounded-lg border border-slate-700/40 bg-slate-900/60 p-3">
        <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase text-slate-400">
          <User size={11} /> Patient Context
        </div>
        {patient ? (
          <div className="space-y-1 text-[11px]">
            <div className="font-semibold text-white">{patient.name}</div>
            <div className="text-slate-400">{patient.uhid} · {patient.age}y · {patient.gender}</div>
            {patient.primaryDiagnosis && (
              <div className="mt-1 rounded bg-rose-500/10 px-2 py-0.5 text-rose-300">
                Dx: {patient.primaryDiagnosis}
              </div>
            )}
          </div>
        ) : (
          <div className="text-[11px] text-slate-500">No patient selected</div>
        )}
      </div>

      {/* Bone Anatomical Model Selector */}
      <div className="rounded-lg border border-slate-700/40 bg-slate-900/60 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-slate-400">
            <Bone size={11} className="text-cyan-400" /> Anatomical Bone Model
          </div>
          <span className="text-[9px] text-slate-500 font-mono">3D Mesh</span>
        </div>

        <div className="grid grid-cols-1 gap-1">
          {ORTHO_BONES.map((b) => {
            const active = selectedBone === b.id;
            return (
              <button
                key={b.id}
                onClick={() => setSelectedBone(b.id)}
                className={cn(
                  "flex items-center justify-between px-2.5 py-1.5 rounded text-xs font-semibold transition-all border text-left",
                  active
                    ? "bg-cyan-500/20 text-cyan-200 border-cyan-500/40 shadow-sm"
                    : "bg-slate-800/60 text-slate-400 border-slate-700/40 hover:bg-slate-800 hover:text-slate-200"
                )}
              >
                <span>{b.name}</span>
                <span className="text-[9px] font-mono text-slate-500 uppercase">{b.region}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* AI X-Ray Upload & Auto-Slicer */}
      <XRayUploadAnalyzer
        selectedBone={selectedBone}
        onClassificationDetected={onClassificationDetected}
      />

      {/* Radiology Modalities */}
      <div className="rounded-lg border border-slate-700/40 bg-slate-900/60 p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-slate-400">
            <Scan size={11} /> Imaging Studies
          </div>
          <button
            onClick={onOpenRadio}
            className="text-[10px] text-cyan-300 hover:underline flex items-center gap-1"
          >
            <FileText size={10} /> Open Radiology
          </button>
        </div>
        {mods.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {mods.map((m) => (
              <span
                key={m}
                className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] text-cyan-300"
              >
                {m}
              </span>
            ))}
          </div>
        ) : (
          <div className="text-[10px] text-slate-500">No active DICOM series linked</div>
        )}
      </div>
    </aside>
  );
}
