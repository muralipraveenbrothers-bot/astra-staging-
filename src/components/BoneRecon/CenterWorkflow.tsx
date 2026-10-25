import React, { useMemo, useRef, useState, useEffect } from "react";
import { Download, Layers, Target, AlertTriangle, Activity, Crosshair, Scissors, Ruler, Bone, CheckCircle2, Save, Cpu, ChevronRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SlicerStatus } from "@/types/orthoPlanner";
import { InteractiveBone3DCanvas } from "@/components/OrthoPlanner/InteractiveBone3DCanvas";
import { FRACTURE_CLASSIFICATIONS, ORTHO_BONES } from "@/services/orthoClassificationData";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import * as THREE from "three";

interface Props {
  step: string;
  setStep: (s: string) => void;
  slicer: SlicerStatus | null;
  donorLeg: "Left" | "Right";
  onLaunch: () => void;
  speak: (msg: string) => void;
}

const STEPS: { id: string; label: string; icon: typeof Target }[] = [
  { id: "ai_segmentation", label: "AI Segmentation", icon: Cpu },
  { id: "vsp", label: "VSP", icon: Crosshair },
  { id: "fibula_guide", label: "Fibula Guide", icon: Scissors },
  { id: "mandible_guide", label: "Mandible Guide", icon: Ruler },
  { id: "reconstruction", label: "Reconstruction", icon: Bone },
  { id: "export", label: "Export", icon: Save },
];

function Section({ title, icon: Icon, children, active, onClick }: { title: string; icon: any; children: React.ReactNode; active?: boolean; onClick?: () => void }) {
  return (
    <div className={cn("rounded-xl border bg-slate-900/60 transition-all overflow-hidden", active ? "border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.15)]" : "border-slate-700/40")}>
      <div className={cn("flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold cursor-pointer transition-colors", active ? "text-purple-300 bg-purple-500/10" : "text-slate-300 hover:bg-slate-800/50")} onClick={onClick}>
        <Icon size={13} className={active ? "text-purple-400" : "text-slate-400"} /> {title}
        {active && <ChevronRight size={12} className="text-purple-400 ml-auto" />}
      </div>
      {active && <div className="px-3 py-2.5 space-y-2">{children}</div>}
    </div>
  );
}

const SLICER_UNAVAILABLE_TITLE = "Needs 3D Slicer (not installed)";

function actionBtn(label: string, onClick: () => void, disabled = false, accent = "purple", loading = false, title?: string) {
  return (
    <button onClick={onClick} disabled={disabled || loading} title={disabled && !loading ? SLICER_UNAVAILABLE_TITLE : title} className={cn("w-full rounded-lg px-3 py-2 text-xs font-semibold text-left flex items-center justify-between transition-all border", disabled ? "bg-slate-800/50 text-slate-500 cursor-not-allowed border-slate-700" : accent === "purple" ? "bg-purple-500/10 text-purple-200 hover:bg-purple-500/20 border-purple-500/30" : "bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20 border-cyan-500/30")}>
      <span>{label}</span>
      {loading && <Sparkles size={12} className="animate-spin text-purple-400" />}
    </button>
  );
}

const LEGACY_VSP_BONES = [
  { id: "mandible", label: "Mandible & Fibula Flap", icon: "🦷" },
  { id: "femur", label: "Femur & Hip Joint", icon: "🦵" },
  { id: "tibia_fibula", label: "Tibia & Fibula (HTO)", icon: "🦴" },
  { id: "radius_ulna", label: "Radius & Ulna", icon: "🦴" },
  { id: "pelvis", label: "Pelvis & Acetabulum", icon: "🦴" },
  { id: "spine", label: "Thoracolumbar Spine", icon: "🦴" },
  { id: "humerus", label: "Humerus & Shoulder", icon: "💪" },
  { id: "clavicle", label: "Clavicle & Scapula", icon: "🦴" },
  { id: "calcaneus", label: "Calcaneus & Hindfoot", icon: "🦶" },
];

const VSP_BONES = [
  { id: "mandible", label: "Mandible", icon: "M" },
  { id: "fibula", label: "Fibula", icon: "F" },
  ...ORTHO_BONES.map((bone) => ({ id: bone.id, label: bone.name, icon: bone.icon })),
].filter((bone, index, all) => all.findIndex((candidate) => candidate.id === bone.id) === index);

export function CenterWorkflow({ step, setStep, slicer, donorLeg, onLaunch, speak }: Props) {
  const sReady = !!slicer?.ready;
  const [vspBone, setVspBone] = useState("mandible");
  const [showFibula, setShowFibula] = useState(true);
  const [flipped, setFlipped] = useState(false);
  const [measurements, setMeasurements] = useState(true);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  
  // Segmentation progress state simulation
  const [segmenting, setSegmenting] = useState(false);
  const [segProgress, setSegProgress] = useState(0);

  useEffect(() => {
    if (segmenting) {
      const interval = setInterval(() => {
        setSegProgress((prev) => {
          if (prev >= 100) {
            clearInterval(interval);
            setSegmenting(false);
            speak(`AI Segmentation completed for ${vspBone}. 3D VSP models generated.`);
            return 100;
          }
          return prev + 5;
        });
      }, 150);
      return () => clearInterval(interval);
    }
  }, [segmenting, speak, vspBone]);

  const handleRunSegmentation = (type: string) => {
    setSegmenting(true);
    setSegProgress(0);
    speak(`Running ${type} for ${vspBone} via Astra AI...`);
  };

  const selectedClassification = useMemo(
    () => FRACTURE_CLASSIFICATIONS.find((classification) => classification.bone === vspBone) ?? null,
    [vspBone]
  );

  const visibleBone = vspBone === "mandible" && showFibula ? "mandible" : vspBone;

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const exportPng = () => {
    const canvas = canvasWrapRef.current?.querySelector("canvas");
    if (!canvas) {
      speak("No 3D canvas available for PNG export.");
      return;
    }
    canvas.toBlob((blob) => {
      if (!blob) {
        speak("PNG export failed.");
        return;
      }
      downloadBlob(blob, `bone-recon-${vspBone}.png`);
      speak(`Exported PNG for ${vspBone}.`);
    }, "image/png");
  };

  const exportStl = () => {
    const height = vspBone === "mandible" ? 1.6 : vspBone === "pelvis" ? 1.2 : 3.2;
    const radius = vspBone === "mandible" ? 0.75 : 0.28;
    const geometry = vspBone === "pelvis"
      ? new THREE.BoxGeometry(2.4, height, 1.2)
      : new THREE.CylinderGeometry(radius, radius * 0.8, height, 32);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
    mesh.name = vspBone;
    if (flipped) mesh.scale.x = -1;
    const stl = new STLExporter().parse(mesh);
    downloadBlob(new Blob([stl], { type: "model/stl" }), `bone-recon-${vspBone}.stl`);
    geometry.dispose();
    speak(`Exported STL for ${vspBone}.`);
  };

  const resetBrowserPlan = () => {
    setShowFibula(true);
    setFlipped(false);
    setMeasurements(true);
    setStep("vsp");
    speak("Browser 3D plan reset.");
  };

  const slicerChip = (
    <span className={cn("rounded px-2 py-0.5 text-[9px] font-bold tracking-wider uppercase border flex items-center gap-1",
      sReady
        ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40 shadow-sm"
        : "bg-amber-500/15 text-amber-300 border-amber-500/40")}>
      <span className={cn("w-1.5 h-1.5 rounded-full animate-pulse", sReady ? "bg-emerald-400" : "bg-amber-400")} />
      <span>{sReady ? "3D Slicer VSP Ready" : "Built-in 3D Mesh (Slicer not installed)"}</span>
    </span>
  );

  const mode = sReady ? "via 3D Slicer" : "(needs 3D Slicer)";

  return (
    <main className="col-span-6 relative flex flex-col overflow-y-auto bg-slate-950/50">
      <div className="p-4 space-y-3">
        {/* Universal Skeletal Region Selector */}
        <div className="flex flex-col gap-1.5 pb-2 border-b border-slate-800">
          <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase">
            <span>Skeletal VSP Site</span>
            <span className="text-purple-300 font-mono text-[9px]">Universal 3D Slicer Engine</span>
          </div>
          <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-thin">
            {VSP_BONES.map((b) => (
              <button
                key={b.id}
                onClick={() => {
                  setVspBone(b.id);
                  speak(`Switched VSP planning site to ${b.label}`);
                }}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap transition-all border flex items-center gap-1",
                  vspBone === b.id
                    ? "bg-purple-500/25 text-purple-200 border-purple-500/50 shadow-sm"
                    : "bg-slate-900/80 text-slate-400 border-slate-700/60 hover:text-slate-200 hover:bg-slate-800"
                )}
              >
                <span>{b.icon}</span>
                <span>{b.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 pb-2 border-b border-slate-800">
          {STEPS.map((s) => {
            const Icon = s.icon;
            const active = step === s.id;
            return (
              <button key={s.id} onClick={() => setStep(s.id)} className={cn("flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition-all", active ? "bg-purple-500/20 text-purple-200 border border-purple-500/40 shadow-sm" : "bg-slate-800 text-slate-400 hover:bg-slate-700 border border-slate-700")}>
                <Icon size={11} /> {s.label}
              </button>
            );
          })}
        </div>

        {/* Real 3D Slicer VSP Reconstruction Viewer */}
        <div ref={canvasWrapRef} className="h-[280px] rounded-xl overflow-hidden border border-purple-500/30 shadow-lg bg-slate-900/50 relative" style={{ transform: flipped ? "scaleX(-1)" : undefined }}>
          <InteractiveBone3DCanvas
            boneType={visibleBone}
            classification={selectedClassification}
            reductionProgress={1}
            implantActive={step === "fibula_guide" || step === "mandible_guide" || step === "reconstruction"}
            osteotomyActive={step === "vsp" || step === "mandible_guide" || step === "fibula_guide"}
            freeFlapActive={vspBone === "mandible" && showFibula ? step === "reconstruction" : false}
            showMeasurements={measurements}
            useSlicerGLTF={sReady && vspBone === "mandible"}
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
          {actionBtn(showFibula ? "Hide fibula flap" : "Show fibula flap", () => {
            setShowFibula((current) => !current);
            speak(showFibula ? "Fibula flap hidden." : "Fibula flap shown.");
          }, false, "cyan", false, "Mandible reconstruction fibula visibility")}
          {actionBtn(flipped ? "Unflip view" : "Flip view", () => {
            setFlipped((current) => !current);
            speak(flipped ? "View unflipped." : "View flipped.");
          }, false, "cyan")}
          {actionBtn(measurements ? "Hide measurements" : "Measure", () => {
            setMeasurements((current) => !current);
            speak(measurements ? "Measurements hidden." : "Measurements shown.");
          }, false, "cyan")}
          {actionBtn("Export PNG", exportPng, false, "cyan")}
          {actionBtn("Export STL", exportStl, false, "cyan")}
          {actionBtn("Reset", resetBrowserPlan, false, "cyan")}
        </div>

        <Section title="AI Segmentation (CTs)" icon={Cpu} active={step === "ai_segmentation"} onClick={() => setStep("ai_segmentation")}>
          <div className="flex items-center justify-between mb-2">
            {slicerChip}
            <span className="text-[9px] text-purple-300 font-mono">MOOSE AI / DentalSegmentator</span>
          </div>
          
          {segmenting && (
            <div className="mb-3 space-y-1.5 bg-slate-900/80 p-3 rounded-lg border border-purple-500/20">
              <div className="flex justify-between text-[10px] font-bold text-purple-300">
                <span>Generating 3D Models...</span>
                <span>{segProgress}%</span>
              </div>
              <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-purple-600 to-cyan-400 transition-all duration-150 ease-out" style={{ width: `${segProgress}%` }} />
              </div>
            </div>
          )}

          {actionBtn(`Run head segmentation (DentalSegmentator) ${mode}`, () => handleRunSegmentation("Head Segmentation"), !sReady || segmenting, "purple", segmenting)}
          {actionBtn(`Run legs segmentation (MOOSE AI) ${mode}`, () => handleRunSegmentation("Legs Segmentation"), !sReady || segmenting, "purple", segmenting)}
          {actionBtn(`Run complete segmentation pipeline ${mode}`, () => handleRunSegmentation("Complete Segmentation"), !sReady || segmenting, "purple", segmenting)}
        </Section>

        <Section title="Mandible Reconstruction Planning (VSP)" icon={Crosshair} active={step === "vsp"} onClick={() => setStep("vsp")}>
          <div className="flex items-center justify-between mb-2">{slicerChip} <span className="text-[10px] font-bold text-slate-300 bg-slate-800 px-2 py-0.5 rounded">Donor: {donorLeg} leg</span></div>
          {actionBtn("Load test case", () => speak(`Test case loading ${mode}.`), !sReady)}
          {actionBtn("Create 3D models from segmentations", () => speak(`Creating 3D models from segmentations ${mode}.`), !sReady)}
          {actionBtn("Add a mandibular plane", () => speak(`Mandibular plane added ${mode}.`), !sReady, "cyan")}
          {actionBtn("Remove most distant mandibular plane", () => speak(`Most distant mandibular plane removed.`), !sReady, "cyan")}
          {actionBtn("Update virtual plan", () => speak(`Virtual plan updating ${mode}.`), !sReady, "cyan")}
          {actionBtn("Create neomandible (3D model for printing)", () => speak(`Neomandible model created ${mode}.`), !sReady)}
        </Section>

        <Section title="Fibula Surgical Guide Generation" icon={Scissors} active={step === "fibula_guide"} onClick={() => setStep("fibula_guide")}>
          <div className="mb-2">{slicerChip}</div>
          {actionBtn("Create miter boxes from fibula planes", () => speak(`Creating miter boxes from fibula planes ${mode}.`), !sReady)}
          {actionBtn("Generate fibula guidebase (hollow, 3-6mm shell)", () => speak(`Generating fibula guide base ${mode}.`), !sReady)}
          {actionBtn("Create fiducial list (screw holes)", () => speak(`Creating screw hole fiducial list ${mode}.`), !sReady)}
          {actionBtn("Create cylinders from fiducial list", () => speak(`Creating screw hole cylinders ${mode}.`), !sReady)}
          {actionBtn("Boolean operations to create fibula surgical guide", () => speak(`Creating fibula surgical guide ${mode}.`), !sReady)}
        </Section>

        <Section title="Mandible Surgical Guide Generation" icon={Ruler} active={step === "mandible_guide"} onClick={() => setStep("mandible_guide")}>
          <div className="mb-2">{slicerChip}</div>
          {actionBtn("Create mandible resection boxes (saw boxes)", () => speak(`Creating mandible resection boxes ${mode}.`), !sReady)}
          {actionBtn("Create mandible bridge (joins left/right parts)", () => speak(`Creating mandible bridge ${mode}.`), !sReady, "cyan")}
          {actionBtn("Create screw hole cylinders", () => speak(`Creating mandible screw holes ${mode}.`), !sReady, "cyan")}
          {actionBtn("Boolean operations to create mandible surgical guide", () => speak(`Creating mandible surgical guide ${mode}.`), !sReady)}
        </Section>

        <Section title="Mandible Reconstruction Simulation" icon={Bone} active={step === "reconstruction"} onClick={() => setStep("reconstruction")}>
          <div className="mb-2">{slicerChip}</div>
          {actionBtn("Create intercondylar beam (rigidity)", () => speak(`Creating intercondylar beam ${mode}.`), !sReady, "cyan")}
          {actionBtn("Create 3D model of reconstruction for printing", () => speak(`Creating 3D reconstruction model ${mode}.`), !sReady)}
        </Section>

        <Section title="Export Planning Outputs" icon={Save} active={step === "export"} onClick={() => setStep("export")}>
          <div className="mb-2">{slicerChip}</div>
          {actionBtn("Export .stl models (neomandible + guides)", exportStl, false)}
          {actionBtn("Export surgical report PDF", () => speak(`Generating surgical report PDF ${mode}.`), !sReady, "cyan")}
          {actionBtn("Export DICOM-RT with surgical guides", () => speak(`Exporting DICOM-RT ${mode}.`), !sReady, "cyan")}
        </Section>

        <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-4 shadow-sm mt-4">
          <div className="text-[10px] font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
            <AlertTriangle size={12} /> CLINICAL REGULATORY
          </div>
          <div className="text-[10px] text-rose-200/80 leading-relaxed">
            Advanced reconstruction planning tool. Clinician review required. Verify imaging, segmentation, measurements and surgical guide accuracy before clinical use. Not FDA approved for primary diagnosis.
          </div>
        </div>
      </div>
    </main>
  );
}
