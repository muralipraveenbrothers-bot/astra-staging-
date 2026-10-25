import React, { useState } from "react";
import {
  Download,
  Layers,
  Target,
  AlertTriangle,
  Activity,
  Crosshair,
  Scissors,
  Ruler,
  Bone,
  CheckCircle2,
  Save,
  ChevronRight,
  Cpu,
  Activity as ActIcon,
  Sparkles,
  MapPin,
  Trash2,
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SlicerStatus, PlannerLandmark } from "@/types/orthoPlanner";
import type { FractureClassification } from "@/services/orthoClassificationData";
import { OrthoTreatmentProtocolPanel } from "./OrthoTreatmentProtocolPanel";

type WF =
  | "IMPORT"
  | "SEGMENT"
  | "LANDMARKS"
  | "PATHOLOGY"
  | "REDUCTION"
  | "ALIGNMENT"
  | "OSTEOTOMY"
  | "MEASUREMENTS"
  | "IMPLANT"
  | "REVIEW"
  | "EXPORT";

const STEPS: { id: WF; label: string; icon: typeof Target }[] = [
  { id: "IMPORT", label: "Import", icon: Download },
  { id: "SEGMENT", label: "Segment", icon: Layers },
  { id: "LANDMARKS", label: "Landmarks", icon: Target },
  { id: "PATHOLOGY", label: "Classification", icon: AlertTriangle },
  { id: "REDUCTION", label: "Reduction", icon: Activity },
  { id: "ALIGNMENT", label: "Alignment", icon: Crosshair },
  { id: "OSTEOTOMY", label: "Osteotomy (VSP)", icon: Scissors },
  { id: "MEASUREMENTS", label: "Measure", icon: Ruler },
  { id: "IMPLANT", label: "Implant / Fixation", icon: Bone },
  { id: "REVIEW", label: "Review", icon: CheckCircle2 },
  { id: "EXPORT", label: "Export", icon: Save },
];

interface Props {
  step: WF;
  setStep: (s: WF) => void;
  measure: string;
  slicer: SlicerStatus | null;
  recon: boolean;
  setRecon: (v: boolean) => void;
  classification: FractureClassification | null;
  reductionProgress: number;
  implantActive: boolean;
  osteotomyActive: boolean;
  onApplyReduction: () => void;
  onToggleImplant: () => void;
  onToggleOsteotomy: () => void;
  onSlicer: () => void;
  onAsk: () => void;
  landmarks?: PlannerLandmark[];
  onDeleteLandmark?: (id: string) => void;
  onRenameLandmark?: (id: string, newName: string) => void;
  nextPresetName?: string;
  selectedBone?: string;
}

export function RightPanel({
  step,
  setStep,
  measure,
  slicer,
  recon,
  setRecon,
  classification,
  reductionProgress,
  implantActive,
  osteotomyActive,
  onApplyReduction,
  onToggleImplant,
  onToggleOsteotomy,
  onSlicer,
  onAsk,
  landmarks = [],
  onDeleteLandmark,
  onRenameLandmark,
  nextPresetName = "Landmark",
  selectedBone = "",
}: Props) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");

  return (
    <aside className="col-span-3 min-h-0 overflow-y-auto border-l border-slate-700/40 bg-slate-900/40 p-3 space-y-3">
      {/* Step Workflow Selector */}
      <div className="rounded-lg border border-slate-700/40 bg-slate-900/60 p-3">
        <div className="mb-2 text-[10px] font-bold uppercase text-slate-400">
          Ortho Surgical Workflow
        </div>
        <div className="grid grid-cols-2 gap-1">
          {STEPS.map((s, idx) => {
            const Icon = s.icon;
            const active = step === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setStep(s.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[10px] transition-all border",
                  active
                    ? "bg-cyan-500/20 text-cyan-200 border-cyan-500/40 font-bold"
                    : "text-slate-400 hover:bg-slate-800 border-transparent hover:text-slate-200"
                )}
              >
                <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-slate-800 text-[8px] font-bold text-slate-500">
                  {idx + 1}
                </span>
                <Icon size={11} />
                <span className="truncate">{s.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Landmarks Panel */}
      <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-300">
            <MapPin size={11} /> Landmarks
            <span className="ml-1 text-amber-400/70">({landmarks.length})</span>
          </div>
          {step === "LANDMARKS" && (
            <span className="text-[9px] text-emerald-300 animate-pulse font-semibold">● Click bone to place</span>
          )}
        </div>

        {landmarks.length === 0 ? (
          <div className="text-[10px] text-amber-200/50">
            {step === "LANDMARKS"
              ? `Click on the bone to place: "${nextPresetName}"`
              : 'Select "Landmarks" step to begin placing.'}
          </div>
        ) : (
          <div className="space-y-1">
            {landmarks.map((lm, idx) => (
              <div key={lm.id} className="flex items-center gap-1.5 rounded bg-slate-800/60 px-1.5 py-1">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-500/20 text-[8px] font-bold text-amber-300">
                  {idx + 1}
                </span>
                {renamingId === lm.id ? (
                  <input
                    autoFocus
                    className="flex-1 bg-slate-700 text-[10px] text-white rounded px-1 py-0.5 border border-cyan-500/40 outline-none"
                    value={renameVal}
                    onChange={(e) => setRenameVal(e.target.value)}
                    onBlur={() => {
                      if (renameVal.trim()) onRenameLandmark?.(lm.id, renameVal.trim());
                      setRenamingId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        if (renameVal.trim()) onRenameLandmark?.(lm.id, renameVal.trim());
                        setRenamingId(null);
                      } else if (e.key === "Escape") {
                        setRenamingId(null);
                      }
                    }}
                  />
                ) : (
                  <span className="flex-1 text-[10px] text-slate-200 truncate">{lm.name}</span>
                )}
                <button
                  title="Rename"
                  onClick={() => { setRenamingId(lm.id); setRenameVal(lm.name); }}
                  className="text-slate-500 hover:text-cyan-300 transition-colors"
                >
                  <Pencil size={9} />
                </button>
                <button
                  title="Delete"
                  onClick={() => onDeleteLandmark?.(lm.id)}
                  className="text-slate-500 hover:text-rose-400 transition-colors"
                >
                  <Trash2 size={9} />
                </button>
              </div>
            ))}
            {step === "LANDMARKS" && (
              <div className="text-[9px] text-amber-200/60 pt-0.5">
                Next: <span className="text-amber-300 font-semibold">{nextPresetName}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* AO/OTA Classification & Treatment Protocol Details */}
      <OrthoTreatmentProtocolPanel
        classification={classification}
        onApplyReduction={onApplyReduction}
        onToggleImplant={onToggleImplant}
        onToggleOsteotomy={onToggleOsteotomy}
        reductionProgress={reductionProgress}
        implantActive={implantActive}
        osteotomyActive={osteotomyActive}
      />

      {/* Mandible / Fibula VSP Free-Flap Module */}
      <div className="rounded-lg border border-purple-500/30 bg-purple-950/30 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-purple-300">
            <Cpu size={12} /> Mandible & Fibula VSP Reconstruction
          </div>
          <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-200 border border-purple-500/40">
            Slicer 3D Engine
          </span>
        </div>
        <div className="text-[10px] text-purple-200/80 leading-relaxed">
          Automated bone segmentation, cutting guides, and vascularized fibula free-flap inset angles.
        </div>
        <button
          onClick={onSlicer}
          className="w-full rounded-md px-2.5 py-1.5 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all bg-purple-500/20 text-purple-200 hover:bg-purple-500/30 border border-purple-500/40 shadow-sm"
        >
          <Sparkles size={12} className="text-purple-300" />
          <span>Launch Slicer VSP Planner</span>
        </button>
      </div>

      {/* Ask Astra Co-Pilot */}
      <div className="rounded-lg border border-slate-700/40 bg-slate-900/60 p-3">
        <div className="mb-1.5 text-[10px] font-bold uppercase text-slate-400">Ask Astra AI Co-Pilot</div>
        <button
          onClick={onAsk}
          className="w-full rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/20 flex items-center justify-center gap-1.5 transition-all"
        >
          <ActIcon size={12} />
          <span>Ask about Surgical Technique</span>
        </button>
      </div>
    </aside>
  );
}
