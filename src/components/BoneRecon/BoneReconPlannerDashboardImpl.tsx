import { useState, useCallback, useEffect, useMemo } from "react";
import { Bone, Save, Cpu, Monitor, Crosshair } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Patient } from "@/types";
import type { SlicerStatus } from "@/types/orthoPlanner";
import { auditLogger } from "@/services/auditLogger";
import { getSlicerStatus, launchSlicerPlanner } from "@/services/orthoPlannerTools";
import { OrthoPlannerErrorBoundary } from "@/components/OrthoPlannerErrorBoundary";
import { LeftPanel } from "./LeftPanel";
import { CenterWorkflow } from "./CenterWorkflow";
import { VoicePanel } from "./VoicePanel";

interface Props {
  selectedPatient: Patient | null;
  patients: Patient[];
  radiologyReports: any[];
  universalOrders: any[];
  onNavigate?: (destination: string) => void;
}

function mapActionToStep(a: string): string {
  switch (a) {
    case "load_test_case": case "create_models": case "add_cut_plane": case "remove_cut_plane": case "create_neomandible": return "vsp";
    case "generate_fibula_guidebase": case "create_fibula_guide": return "fibula_guide";
    case "create_mandible_resection": case "create_mandible_guide": return "mandible_guide";
    case "run_head_segmentation": case "run_legs_segmentation": return "ai_segmentation";
    default: return "vsp";
  }
}

export function BoneReconPlannerDashboard({ selectedPatient, patients, radiologyReports, universalOrders, onNavigate }: Props) {
  const [fs, setFs] = useState(false);
  const [slicer, setSlicer] = useState<SlicerStatus | null>(null);
  const [donorLeg, setDonorLeg] = useState<"Left" | "Right">("Left");
  const [status, setStatus] = useState<"DRAFT" | "REVIEW" | "FINALIZED">("DRAFT");
  const [headCt, setHeadCt] = useState<string | null>(null);
  const [legCt, setLegCt] = useState<string | null>(null);
  const [step, setStep] = useState<string>("ai_segmentation");
  const [voiceLog, setVoiceLog] = useState<string[]>([]);

  useEffect(() => { getSlicerStatus().then(setSlicer); }, []);

  useEffect(() => {
    const h = (e: Event) => { const d = (e as CustomEvent).detail; if (d) handleCmd(d.action, d.args); };
    window.addEventListener("astra:bonerecon-command", h);
    return () => window.removeEventListener("astra:bonerecon-command", h);
  }, []);

  const speak = useCallback((msg: string) => {
    setVoiceLog((prev) => [msg, ...prev].slice(0, 30));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("astra:copilot-speak", { detail: { text: msg, source: "bonerecon" } }));
    }
  }, []);

  const handleCmd = useCallback((a: string, args: string) => {
    if (a === "open_dashboard") { onNavigate?.("bone-recon"); return; }
    if (a === "donor_leg") { setDonorLeg(args === "Right" ? "Right" : "Left"); speak(`Donor leg set to ${args}.`); return; }
    if (a === "select_mandible_ct") { setStep("vsp"); setHeadCt("MANDIBLE CT"); speak("Mandible CT selected."); return; }
    if (a === "select_fibula_ct") { setStep("vsp"); setLegCt("FIBULA CT"); speak("Fibula CT selected."); return; }
    const slicerOnly = ["load_test_case", "create_models", "add_cut_plane", "remove_cut_plane", "create_neomandible", "generate_fibula_guidebase", "create_fibula_guide", "create_mandible_resection", "create_mandible_guide", "run_head_segmentation", "run_legs_segmentation"];
    if (slicerOnly.includes(a)) {
      if (!slicer?.ready) { speak("This step needs 3D Slicer with the BoneReconstructionPlanner extension."); return; }
      speak(`${a.replace(/_/g, " ")} will run inside Slicer.`);
      setStep(mapActionToStep(a));
      return;
    }
    setStep(mapActionToStep(a));
  }, [slicer, onNavigate, speak]);
const mods = useMemo(() => {
    if (!selectedPatient) return [];
    const s = new Set<string>();
    radiologyReports.filter((r: any) => r.patientUhid === selectedPatient.uhid).forEach((r: any) => { if (r.modality) s.add(r.modality); });
    return Array.from(s);
  }, [selectedPatient, radiologyReports]);

  const doLaunchSlicer = useCallback(async () => {
    auditLogger.log({ action: "SLICER_LAUNCH_REQUESTED", performedBy: "BoneReconPlanner", userRole: "Doctor", details: `Slicer launch (${donorLeg} leg)`, sourceModule: "bone_recon", patientUhid: selectedPatient?.uhid });
    const r = await launchSlicerPlanner();
    if (r.success) {
      auditLogger.log({ action: "SLICER_LAUNCHED", performedBy: "BoneReconPlanner", userRole: "Doctor", details: "Slicer launched with BoneReconstructionPlanner", sourceModule: "bone_recon" });
      speak("Slicer reconstruction planner launched. The module is opening.");
    } else {
      auditLogger.log({ action: "SLICER_LAUNCH_FAILED", performedBy: "BoneReconPlanner", userRole: "Doctor", details: r.message, sourceModule: "bone_recon" });
      speak(r.message);
    }
  }, [selectedPatient, donorLeg, speak]);

  const doSave = useCallback(() => {
    setStatus("REVIEW");
    auditLogger.log({ action: "SURGICAL_PLAN_REVIEWED", performedBy: "BoneReconPlanner", userRole: "Doctor", details: `Plan reviewed for ${selectedPatient?.name}`, sourceModule: "bone_recon", patientUhid: selectedPatient?.uhid });
    speak("Draft marked for review on this screen only. Nothing was saved to the hospital record.");
  }, [selectedPatient, speak]);

  return (
    <OrthoPlannerErrorBoundary>
      <div className={cn("flex h-full flex-col bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950", fs && "fixed inset-0 z-50")}>
        <header className="flex items-center justify-between border-b border-slate-700/40 bg-slate-900/60 px-4 py-2">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-500/20 text-purple-300"><Bone size={16} /></div>
            <div>
              <div className="text-sm font-bold text-white">ASTRA BoneReconstructionPlanner</div>
              <div className="text-[10px] text-slate-400">Mandible / Fibula Free Flap · VSP · {selectedPatient ? selectedPatient.name : "No patient"}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {selectedPatient && <div className="text-[10px] text-slate-400">{selectedPatient.uhid} · {selectedPatient.age}y/{selectedPatient.gender}</div>}
            <span className={"flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full border " + (slicer?.ready ? "bg-emerald-500/10 border-emerald-500/30" : "bg-amber-500/10 border-amber-500/30")}>
              <span className={"w-1.5 h-1.5 rounded-full " + (slicer?.ready ? "bg-emerald-400 animate-pulse" : "bg-amber-400")} />
              <Monitor size={10} className={slicer?.ready ? "text-emerald-400" : "text-amber-300"} />
              <span className={"font-bold " + (slicer?.ready ? "text-emerald-300" : "text-amber-200")}>{slicer?.ready ? "Slicer VSP Ready" : "Slicer not confirmed"}</span>
            </span>
            <button onClick={doLaunchSlicer} className="flex items-center gap-1 rounded border border-purple-500/40 bg-purple-500/10 px-2 py-1 text-[10px] text-purple-200 hover:bg-purple-500/20"><Cpu size={11} /> Launch Slicer VSP</button>
            <button onClick={doSave} className="flex items-center gap-1 rounded border border-cyan-500/40 bg-cyan-500/10 px-2 py-1 text-[10px] text-cyan-300 hover:bg-cyan-500/20"><Save size={11} /> Save Plan</button>
            <button onClick={() => setFs(!fs)} className="flex h-6 w-6 items-center justify-center rounded border border-slate-600/40 text-slate-400 hover:text-cyan-300"><Crosshair size={11} /></button>
          </div>
        </header>
        <div className="grid min-h-0 flex-1 grid-cols-12 gap-0">
          <LeftPanel patient={selectedPatient} mods={mods} headCt={headCt} legCt={legCt} donorLeg={donorLeg} setDonorLeg={setDonorLeg} onOpenRadio={() => onNavigate?.("radiology")} />
          <CenterWorkflow step={step} setStep={setStep} slicer={slicer} donorLeg={donorLeg} onLaunch={doLaunchSlicer} speak={speak} />
          <VoicePanel voiceLog={voiceLog} speak={speak} onAsk={() => window.dispatchEvent(new CustomEvent("Astra:command", { detail: { text: `Guide me through the BoneReconstructionPlanner workflow for ${selectedPatient?.name || "this patient"} (donor leg ${donorLeg}). Current step: ${step}`, source: "bonerecon" } }))} />
        </div>
      </div>
    </OrthoPlannerErrorBoundary>
  );
}