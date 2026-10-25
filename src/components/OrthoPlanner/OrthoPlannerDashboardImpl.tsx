import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  Bone,
  Save,
  Maximize2,
  Monitor,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Patient } from "@/types";
import type { PlannerMeasurement, SlicerStatus } from "@/types/orthoPlanner";
import { OrthoPlannerErrorBoundary } from "@/components/OrthoPlannerErrorBoundary";
import { auditLogger } from "@/services/auditLogger";
import { getSlicerStatus, launchSlicerPlanner } from "@/services/orthoPlannerTools";
import {
  FRACTURE_CLASSIFICATIONS,
  type FractureClassification,
} from "@/services/orthoClassificationData";
import type { PlannerLandmark } from "@/types/orthoPlanner";
import { useStore } from "@/lib/store";
import { addLandmark, deleteLandmark, nextLandmarkName, renameLandmark } from "./landmarkLogic";
import { patientRecordToPatient } from "./patientMapping";
import type { PlannerView } from "./viewPresets";
import { LeftPanel } from "./LeftPanel";
import { CenterPanel } from "./CenterPanel";
import { RightPanel } from "./RightPanel";

interface Props {
  selectedPatient: Patient | null;
  patients: Patient[];
  radiologyReports: any[];
  universalOrders: any[];
  onNavigate?: (destination: string) => void;
}

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

export function OrthoPlannerDashboard({
  selectedPatient,
  patients,
  radiologyReports,
  universalOrders,
  onNavigate,
}: Props) {
  const [view, setView] = useState<PlannerView>("AP");
  const [step, setStep] = useState<WF>("PATHOLOGY");
  const [fs, setFs] = useState(false);
  const [measure, setMeasure] = useState<"none" | "distance" | "angle">("none");
  const [measures, setMeasures] = useState<PlannerMeasurement[]>([]);
  const [status, setStatus] = useState<"DRAFT" | "REVIEW" | "FINALIZED">("DRAFT");
  const [slicer, setSlicer] = useState<SlicerStatus | null>(null);
  const [recon, setRecon] = useState(false);

  // Fracture & 3D Reconstruction states
  const [selectedBone, setSelectedBone] = useState<string>("humerus");
  const [classification, setClassification] = useState<FractureClassification | null>(
    FRACTURE_CLASSIFICATIONS[0]
  );
  const [reductionProgress, setReductionProgress] = useState<number>(0);
  const [implantActive, setImplantActive] = useState<boolean>(false);
  const [osteotomyActive, setOsteotomyActive] = useState<boolean>(false);
  const [freeFlapActive, setFreeFlapActive] = useState<boolean>(false);
  const [useSlicerGLTF, setUseSlicerGLTF] = useState<boolean>(false);
  const [landmarks, setLandmarks] = useState<Record<string, PlannerLandmark[]>>({});

  // Patient picker from store
  const storePatients = useStore().patients;
  const [pickedPatientId, setPickedPatientId] = useState<string | null>(null);

  // Convert PatientRecord → Patient-like for display
  const storeAsPatients = useMemo(() => {
    return storePatients.map(patientRecordToPatient);
  }, [storePatients]);

  const effectivePatient = selectedPatient
    ?? storeAsPatients.find((p) => p.uhid === pickedPatientId)
    ?? storeAsPatients[0]
    ?? null;

  const currentLandmarks = landmarks[selectedBone] || [];
  const nextPresetName = nextLandmarkName(selectedBone, currentLandmarks);

  useEffect(() => {
    getSlicerStatus().then(setSlicer);
  }, []);

  // Update classification when selectedBone changes
  useEffect(() => {
    const matched = FRACTURE_CLASSIFICATIONS.find((f) => f.bone === selectedBone);
    if (matched) {
      setClassification(matched);
      setReductionProgress(0);
      setImplantActive(false);
      setOsteotomyActive(false);
      setUseSlicerGLTF(false);
    }
  }, [selectedBone]);

  // Use a ref to avoid stale closure in event listener
  const handleCmdRef = useRef<(a: string, args: string) => void>(() => {});

  const handleAddLandmark = useCallback((x: number, y: number, z: number) => {
    setLandmarks((prev) => addLandmark(prev, selectedBone, { x, y, z }));
  }, [selectedBone]);

  const handleDeleteLandmark = useCallback((lmId: string) => {
    setLandmarks((prev) => deleteLandmark(prev, selectedBone, lmId));
  }, [selectedBone]);

  const handleRenameLandmark = useCallback((lmId: string, newName: string) => {
    setLandmarks((prev) => renameLandmark(prev, selectedBone, lmId, newName));
  }, [selectedBone]);

  const doSave = useCallback(() => {
    setStatus("REVIEW");
    auditLogger.log({
      action: "CLINICAL_DATA_ACCESSED",
      performedBy: "OrthoPlanner",
      userRole: "Doctor",
      details: `Plan draft marked for review on this screen only: ${selectedPatient?.name} - ${classification?.name}`,
      sourceModule: "ortho_planner",
      patientUhid: selectedPatient?.uhid,
    });
  }, [selectedPatient, classification]);

  const doSlicer = useCallback(async () => {
    const r = await launchSlicerPlanner();
    if (!r.success) alert(r.message);
  }, []);

  // Assign ref after doSave/doSlicer are defined to avoid stale reference
  const handleCmd = useCallback((a: string, args: string) => {
    if (a === "set_view") setView(args as PlannerView);
    else if (a === "reset_view" || a === "fit_view") setView("AP");
    else if (a === "measure_distance") setMeasure("distance");
    else if (a === "measure_angle") setMeasure("angle");
    else if (a === "save_plan") doSave();
    else if (a === "open_reconstruction") setRecon(true);
    else if (a === "launch_slicer") doSlicer();
  }, [doSave, doSlicer]);

  handleCmdRef.current = handleCmd;

  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d) handleCmdRef.current(d.action, d.args);
    };
    window.addEventListener("astra:ortho-command", h);
    return () => window.removeEventListener("astra:ortho-command", h);
  }, []);

  const handleApplyReduction = () => {
    setReductionProgress((prev) => (prev > 0.8 ? 0 : 1));
  };

  const handleToggleImplant = () => {
    setImplantActive((prev) => !prev);
  };

  const handleToggleOsteotomy = () => {
    setOsteotomyActive((prev) => !prev);
  };

  const mods = useMemo(() => {
    if (!selectedPatient) return [];
    const s = new Set<string>();
    radiologyReports
      .filter((r: any) => r.patientUhid === selectedPatient.uhid)
      .forEach((r: any) => {
        if (r.modality) s.add(r.modality);
      });
    return Array.from(s);
  }, [selectedPatient, radiologyReports]);

  const handleStepChange = (newStep: WF) => {
    setStep(newStep);
    if (newStep === "OSTEOTOMY") {
      setOsteotomyActive(true);
    } else if (newStep === "IMPLANT") {
      setImplantActive(true);
    } else if (newStep === "REDUCTION" || newStep === "ALIGNMENT") {
      if (reductionProgress < 0.2) setReductionProgress(0.85);
    } else if (newStep === "MEASUREMENTS") {
      setMeasure("distance");
    }
  };

  return (
    <OrthoPlannerErrorBoundary>
      <div
        className={cn(
          "flex h-full flex-col bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950",
          fs && "fixed inset-0 z-50"
        )}
      >
        <header className="flex items-center justify-between border-b border-slate-700/40 bg-slate-900/60 px-4 py-2">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-300">
              <Bone size={16} />
            </div>
            <div>
              <div className="text-sm font-bold text-white flex items-center gap-2">
                <span>ASTRA OrthoPlanner & Reconstruction 3D</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-mono">
                  AO/OTA + Slicer VSP
                </span>
              </div>
              <div className="text-[10px] text-slate-400">
                3D Bone & Fracture Modeling · {effectivePatient ? effectivePatient.name : "No patient"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Patient picker */}
            {storeAsPatients.length > 0 && (
              <select
                value={pickedPatientId || effectivePatient?.uhid || ""}
                onChange={(e) => setPickedPatientId(e.target.value || null)}
                className="bg-slate-800 text-[10px] text-slate-300 border border-slate-600 rounded px-1.5 py-0.5 max-w-[140px]"
              >
                {storeAsPatients.map((p) => (
                  <option key={p.uhid} value={p.uhid}>{p.name}</option>
                ))}
              </select>
            )}
            {effectivePatient && (
              <div className="text-[10px] text-slate-400">
                {effectivePatient.uhid} · {effectivePatient.age}y/{effectivePatient.gender}
              </div>
            )}
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-bold",
                status === "DRAFT"
                  ? "bg-amber-500/20 text-amber-300"
                  : "bg-cyan-500/20 text-cyan-300"
              )}
            >
              {status}
            </span>
            <span className="flex items-center gap-1 text-[10px]">
              <Monitor
                size={10}
                className={slicer?.ready ? "text-emerald-400" : "text-slate-500"}
              />
              <span className={slicer?.ready ? "text-emerald-300" : "text-amber-300"}>
                {slicer?.ready ? "Slicer Ready" : "3D Slicer not installed, using built-in meshes"}
              </span>
            </span>
            <button
              onClick={doSave}
              className="flex items-center gap-1 rounded border border-cyan-500/40 bg-cyan-500/10 px-2 py-1 text-[10px] text-cyan-300 hover:bg-cyan-500/20"
            >
              <Save size={11} /> Save Plan
            </button>
            <button
              onClick={() => setFs(!fs)}
              className="flex h-6 w-6 items-center justify-center rounded border border-slate-600/40 text-slate-400 hover:text-cyan-300"
            >
              <Maximize2 size={11} />
            </button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-12 gap-0 overflow-hidden">
          <LeftPanel
            patient={effectivePatient}
            mods={mods}
            selectedBone={selectedBone}
            setSelectedBone={setSelectedBone}
            onOpenRadio={() => onNavigate?.("radiology")}
            onClassificationDetected={(c) => {
              setClassification(c);
              setSelectedBone(c.bone);
            }}
          />

          <CenterPanel
            view={view}
            setView={setView}
            measure={measure}
            setMeasure={setMeasure}
            patient={effectivePatient}
            selectedBone={selectedBone}
            classification={classification}
            reductionProgress={reductionProgress}
            setReductionProgress={setReductionProgress}
            implantActive={implantActive}
            osteotomyActive={osteotomyActive}
            freeFlapActive={freeFlapActive}
            setFreeFlapActive={setFreeFlapActive}
            useSlicerGLTF={useSlicerGLTF}
            setUseSlicerGLTF={setUseSlicerGLTF}
            onBoneClick={setSelectedBone}
            landmarks={currentLandmarks}
            onLandmarkAdd={handleAddLandmark}
            landmarkStep={step === "LANDMARKS"}
          />

          <RightPanel
            step={step}
            setStep={handleStepChange}
            measure={measure}
            slicer={slicer}
            recon={recon}
            setRecon={setRecon}
            classification={classification}
            reductionProgress={reductionProgress}
            implantActive={implantActive}
            osteotomyActive={osteotomyActive}
            onApplyReduction={handleApplyReduction}
            onToggleImplant={handleToggleImplant}
            onToggleOsteotomy={handleToggleOsteotomy}
            onSlicer={doSlicer}
            landmarks={currentLandmarks}
            onDeleteLandmark={handleDeleteLandmark}
            onRenameLandmark={handleRenameLandmark}
            nextPresetName={nextPresetName}
            selectedBone={selectedBone}
            onAsk={() =>
              window.dispatchEvent(
                new CustomEvent("Astra:command", {
                  detail: {
                    text: `Help plan orthopedic fixation for ${classification?.name || "fracture"} in ${selectedPatient?.name || "patient"}. Step: ${step}`,
                    source: "ortho_planner",
                  },
                })
              )
            }
          />
        </div>
      </div>
    </OrthoPlannerErrorBoundary>
  );
}
