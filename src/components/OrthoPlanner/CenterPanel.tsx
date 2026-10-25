import React, { useState, useEffect } from "react";
import {
  Bone, RotateCcw, Ruler, Compass, Layers, Sparkles,
  SlidersHorizontal, Move3d, Component, BookOpen,
  SplitSquareHorizontal, X, ArrowRight, Puzzle
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Patient } from "@/types";
import { InteractiveBone3DCanvas } from "./InteractiveBone3DCanvas";
import { OrthoPlannerErrorBoundary } from "@/components/OrthoPlannerErrorBoundary";
import type { FractureClassification } from "@/services/orthoClassificationData";
import { HumanAtlasViewer } from "@/components/HumanAtlas/HumanAtlasViewer";
import { atlasNameToBoneId, BONE_ATLAS_LABEL } from "./atlasLogic";
import type { PlannerView } from "./viewPresets";

type CanvasMode = "fracture" | "atlas" | "compare";

interface Props {
  view: PlannerView;
  setView: (v: PlannerView) => void;
  measure: "none" | "distance" | "angle";
  setMeasure: (m: "none" | "distance" | "angle") => void;
  patient: Patient | null;
  selectedBone: string;
  classification: FractureClassification | null;
  reductionProgress: number;
  setReductionProgress: (v: number) => void;
  implantActive: boolean;
  osteotomyActive: boolean;
  freeFlapActive: boolean;
  setFreeFlapActive: (v: boolean) => void;
  useSlicerGLTF: boolean;
  setUseSlicerGLTF: (v: boolean) => void;
  onBoneClick?: (boneName: string) => void;
  landmarks?: import("@/types/orthoPlanner").PlannerLandmark[];
  onLandmarkAdd?: (x: number, y: number, z: number) => void;
  landmarkStep?: boolean;
}

// Map bone id from left-panel to atlas search term — keyed by orthoClassificationData id
const VIEWS: PlannerView[] = ["AP", "PA", "lateral", "oblique", "superior", "inferior"];

export function CenterPanel({
  view,
  setView,
  measure,
  setMeasure,
  patient,
  selectedBone,
  classification,
  reductionProgress,
  setReductionProgress,
  implantActive,
  osteotomyActive,
  freeFlapActive,
  setFreeFlapActive,
  useSlicerGLTF,
  setUseSlicerGLTF,
  onBoneClick,
  landmarks = [],
  onLandmarkAdd,
  landmarkStep = false,
}: Props) {
  const [manualMode, setManualMode] = useState(false);
  const [puzzleMode, setPuzzleMode] = useState(false);
  const [canvasMode, setCanvasMode] = useState<CanvasMode>("fracture");

  // When a bone is selected from the left panel, auto-open atlas in skeletal mode
  useEffect(() => {
    // Keep fracture mode in sync; on bone change if we're in atlas/compare, update highlight
  }, [selectedBone]);

  // When user clicks a new bone while in atlas mode, auto-trigger highlight update
  const highlightBone = BONE_ATLAS_LABEL[selectedBone.toLowerCase()] ?? selectedBone;

  const modeButtonCls = (mode: CanvasMode) =>
    cn(
      "px-2 py-1 rounded text-[10px] font-semibold flex items-center gap-1 border transition-all",
      canvasMode === mode
        ? mode === "fracture"
          ? "bg-amber-500/20 text-amber-300 border-amber-500/50"
          : mode === "atlas"
          ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-[0_0_8px_rgba(168,85,129,0.2)]"
          : "bg-violet-500/20 text-violet-300 border-violet-500/50"
        : "bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200"
    );

  return (
    <main className="col-span-6 relative flex flex-col h-full bg-slate-950 p-2 gap-2">

      {/* ── TOOLBAR ── */}
      <div className="flex items-center justify-between px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900/80 backdrop-blur-md flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-[11px] font-bold text-cyan-300">
            <Bone className="w-3.5 h-3.5 text-cyan-400" />
            <span>3D ORTHO &amp; RECONSTRUCTION CANVAS</span>
          </div>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
            {view} VIEW
          </span>
          {selectedBone && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-950/60 text-cyan-300 border border-cyan-500/30 font-bold uppercase">
              {selectedBone}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 flex-wrap justify-end">
          {/* Canvas mode selector */}
          <div className="flex items-center gap-0.5 border border-slate-700 rounded bg-slate-900 p-0.5 mr-1">
            <button
              onClick={() => setCanvasMode("fracture")}
              className={modeButtonCls("fracture")}
              title="Fracture simulation model"
            >
              <Bone className="w-3 h-3" />
              <span>Fracture</span>
            </button>
            <button
              onClick={() => setCanvasMode("atlas")}
              className={modeButtonCls("atlas")}
              title="Full Human Atlas — 2,234 real anatomical structures (BodyParts3D)"
            >
              <BookOpen className="w-3 h-3" />
              <span>Atlas</span>
            </button>
            <button
              onClick={() => setCanvasMode("compare")}
              className={modeButtonCls("compare")}
              title="Side-by-side: Fracture model vs Normal atlas reference"
            >
              <SplitSquareHorizontal className="w-3 h-3" />
              <span>Compare</span>
            </button>
          </div>

          {/* Fracture-mode only buttons */}
          {canvasMode === "fracture" && (
            <>
              <button onClick={() => setPuzzleMode(!puzzleMode)}
                className={cn("px-2 py-1 rounded text-[10px] font-semibold flex items-center gap-1 border transition-all",
                  puzzleMode ? "bg-purple-500/25 text-purple-200 border-purple-500/60 shadow-[0_0_10px_rgba(168,85,247,0.3)] font-bold" : "bg-slate-800 text-slate-400 border-slate-700 hover:text-purple-300")}
                title="Interactive 3D Fracture Reduction Puzzle Matching & Practice">
                <Puzzle className="w-3 h-3 text-purple-400" />
                <span>{puzzleMode ? "🧩 Puzzle Active" : "🧩 Puzzle Match"}</span>
              </button>
              <button onClick={() => setUseSlicerGLTF(!useSlicerGLTF)}
                className={cn("px-2 py-1 rounded text-[10px] font-semibold flex items-center gap-1 border transition-all",
                  useSlicerGLTF ? "bg-purple-500/20 text-purple-300 border-purple-500/50" : "bg-slate-800 text-slate-400 border-slate-700 hover:text-cyan-300")}
                title="Load SlicerBoneReconstructionPlanner Mandible/Fibula mesh">
                <Sparkles className="w-3 h-3 text-purple-400" />
                <span>{useSlicerGLTF ? "Slicer VSP Active" : "Use Slicer VSP mesh (mandible)"}</span>
              </button>
              <button onClick={() => setManualMode(!manualMode)}
                className={cn("px-2 py-1 rounded text-[10px] font-semibold flex items-center gap-1 border transition-all",
                  manualMode ? "bg-amber-500/20 text-amber-300 border-amber-500/50" : "bg-slate-800 text-slate-400 border-slate-700 hover:text-amber-300")}>
                <Move3d className="w-3 h-3" />
                <span>{manualMode ? "Manual Active" : "Free Transform"}</span>
              </button>
              <button onClick={() => setFreeFlapActive(!freeFlapActive)}
                className={cn("px-2 py-1 rounded text-[10px] font-semibold flex items-center gap-1 border transition-all",
                  freeFlapActive ? "bg-rose-500/20 text-rose-300 border-rose-500/50" : "bg-slate-800 text-slate-400 border-slate-700 hover:text-rose-300")}>
                <Component className="w-3 h-3" />
                <span>{freeFlapActive ? "Free-Flap Active" : "Free-Flap"}</span>
              </button>
            </>
          )}

          {/* View angles (fracture + compare only) */}
          {canvasMode !== "atlas" && (
            <div className="flex gap-0.5">
              {VIEWS.map(v => (
                <button key={v} onClick={() => setView(v)}
                  className={cn("flex h-6 w-6 items-center justify-center rounded text-[9px] font-bold transition-all",
                    view === v ? "bg-cyan-500/30 text-cyan-200 border border-cyan-500/50" : "border border-slate-700/60 bg-slate-800/80 text-slate-400 hover:text-cyan-300")}>
                  {v.slice(0, 2).toUpperCase()}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── MAIN CANVAS AREA ── */}
      <div className="relative flex-1 min-h-0 rounded-xl overflow-hidden border border-slate-800 bg-slate-900/30">

        {/* FRACTURE MODE */}
        {canvasMode === "fracture" && (
          <>
            <OrthoPlannerErrorBoundary fallback={
              <div className="flex h-full flex-col items-center justify-center gap-3 bg-slate-950 p-6 text-center">
                <Bone className="h-10 w-10 text-cyan-300" />
                <div className="text-sm font-bold text-white">3D model asset unavailable in staging</div>
                <p className="max-w-md text-xs text-slate-400">The planning workspace, measurements, workflow, and Atlas view remain available. No patient scan or production model has been copied into this isolated preview.</p>
                <button type="button" onClick={() => setCanvasMode("atlas")} className="rounded-md border border-cyan-500/50 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-200">Open anatomy Atlas</button>
              </div>
            }>
              <InteractiveBone3DCanvas
                boneType={selectedBone}
                classification={classification}
                reductionProgress={reductionProgress}
                implantActive={implantActive}
                osteotomyActive={osteotomyActive}
                freeFlapActive={freeFlapActive}
                showMeasurements={measure !== "none"}
                useSlicerGLTF={useSlicerGLTF}
                manualMode={manualMode}
                puzzleMode={puzzleMode}
                view={view}
                onBoneClick={onBoneClick}
                landmarks={landmarks}
                onLandmarkAdd={onLandmarkAdd}
                landmarkStep={landmarkStep}
              />
            </OrthoPlannerErrorBoundary>
            {/* Reduction slider */}
            <div className="absolute top-3 right-3 w-44 bg-slate-900/90 backdrop-blur-md border border-slate-700 rounded-lg p-3 shadow-xl">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] font-bold text-slate-300 flex items-center gap-1">
                  <SlidersHorizontal className="w-3 h-3 text-emerald-400" /> Reduction
                </div>
                <div className="text-[10px] font-mono text-emerald-400">{Math.round(reductionProgress * 100)}%</div>
              </div>
              <input type="range" min="0" max="1" step="0.01" value={reductionProgress}
                onChange={e => setReductionProgress(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500" />
            </div>
            {/* Floating measure toolbar */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-lg border border-slate-700/60 bg-slate-900/90 p-1 backdrop-blur-md shadow-xl">
              <button onClick={() => setView("AP")} className="rounded px-2 py-1 text-[10px] text-slate-400 hover:text-cyan-300" title="Reset view"><RotateCcw size={12}/></button>
              <div className="h-3 w-px bg-slate-700 mx-0.5"/>
              <button onClick={() => setMeasure(measure === "distance" ? "none" : "distance")}
                className={cn("flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium",
                  measure === "distance" ? "text-cyan-300 bg-cyan-500/20 border border-cyan-500/40" : "text-slate-400 hover:text-cyan-300")}
                title="Measure fracture gap">
                <Ruler size={12}/><span>Gap (mm)</span>
              </button>
              <button onClick={() => setMeasure(measure === "angle" ? "none" : "angle")}
                className={cn("flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium",
                  measure === "angle" ? "text-cyan-300 bg-cyan-500/20 border border-cyan-500/40" : "text-slate-400 hover:text-cyan-300")}
                title="Measure angulation">
                <Compass size={12}/><span>Angle (°)</span>
              </button>
            </div>
          </>
        )}

        {/* ATLAS MODE — full Human Atlas viewer */}
        {canvasMode === "atlas" && (
          <HumanAtlasViewer
            highlightStructure={highlightBone}
            onStructureSelect={(name, _system) => {
              const boneId = atlasNameToBoneId(name);
              if (boneId && onBoneClick) onBoneClick(boneId);
            }}
          />
        )}

        {/* COMPARE MODE — split screen side by side */}
        {canvasMode === "compare" && (
          <div className="absolute inset-0 flex">
            {/* Left: Fracture Model */}
            <div className="flex-1 relative border-r border-slate-700/60 min-w-0">
              <div className="absolute top-2 left-2 z-10 px-2 py-1 rounded bg-amber-950/80 border border-amber-500/40 text-[9px] font-bold text-amber-300 uppercase tracking-wide">
                ⚠ Fracture Model · {selectedBone}
              </div>
              <InteractiveBone3DCanvas
                boneType={selectedBone}
                classification={classification}
                reductionProgress={reductionProgress}
                implantActive={implantActive}
                osteotomyActive={osteotomyActive}
                freeFlapActive={freeFlapActive}
                showMeasurements={measure !== "none"}
                useSlicerGLTF={useSlicerGLTF}
                manualMode={false}
              />
            </div>

            {/* Divider with label */}
            <div className="flex flex-col items-center justify-center w-8 flex-shrink-0 bg-slate-900/80 border-x border-slate-700/40 z-10 gap-1">
              <ArrowRight size={12} className="text-slate-600 rotate-180"/>
              <span className="text-[7px] text-slate-600 font-bold uppercase tracking-wider [writing-mode:vertical-rl] py-2">VS</span>
              <ArrowRight size={12} className="text-slate-600"/>
            </div>

            {/* Right: Normal Atlas Reference */}
            <div className="flex-1 relative min-w-0">
              <div className="absolute top-2 left-2 z-10 px-2 py-1 rounded bg-emerald-950/80 border border-emerald-500/40 text-[9px] font-bold text-emerald-300 uppercase tracking-wide">
                ✓ Normal Atlas · {highlightBone}
              </div>
              <HumanAtlasViewer
                highlightStructure={highlightBone}
                compact={true}
                onStructureSelect={() => {}}
              />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
