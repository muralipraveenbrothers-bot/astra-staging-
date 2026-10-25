import { cn } from "@/lib/utils";
import type { AnatomyVisualMode } from "@/types/orthoPlanner";
import { Globe, Box, Layers } from "lucide-react";

interface Props {
  mode: AnatomyVisualMode;
  onModeChange: (mode: AnatomyVisualMode) => void;
  atlasAvailable: boolean;
}

const MODES: { id: AnatomyVisualMode; label: string; icon: typeof Globe; desc: string }[] = [
  { id: "astra_atlas", label: "ASTRA ATLAS", icon: Globe, desc: "Detailed 3D" },
  { id: "clinical_holo", label: "CLINICAL HOLO", icon: Box, desc: "Organ 3D" },
  { id: "lightweight", label: "LIGHTWEIGHT", icon: Layers, desc: "SVG Native" },
];

export function AnatomyVisualModeSelector({ mode, onModeChange, atlasAvailable }: Props) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-slate-700/40 bg-slate-900/80 p-1">
      {MODES.map((m) => {
        const Icon = m.icon;
        const disabled = m.id === "astra_atlas" && !atlasAvailable;
        return (
          <button
            key={m.id}
            onClick={() => !disabled && onModeChange(m.id)}
            disabled={disabled}
            title={disabled ? "Atlas not available — build Human Atlas first" : m.desc}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-semibold transition-all",
              mode === m.id
                ? "bg-cyan-500/20 text-cyan-200 border border-cyan-500/40"
                : disabled
                ? "text-slate-600 cursor-not-allowed"
                : "text-slate-400 hover:text-cyan-300 hover:bg-slate-800 border border-transparent"
            )}
          >
            <Icon size={11} />
            <span>{m.label}</span>
          </button>
        );
      })}
    </div>
  );
}
