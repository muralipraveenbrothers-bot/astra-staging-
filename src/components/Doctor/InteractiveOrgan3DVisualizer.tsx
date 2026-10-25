import React, { useState } from "react";
import { Patient } from "../../types";
import {
  Heart,
  Activity,
  Zap,
  ShieldAlert,
  Sliders,
  RotateCw,
  Eye,
  Crosshair,
  Sparkles,
  Layers,
  Thermometer,
  AlertTriangle,
  Microscope,
  Cpu,
  Brain,
  Droplets,
  Wind,
  Stethoscope,
  ChevronRight,
} from "lucide-react";

export type OrganSystemType = "cardiac" | "respiratory" | "hepatic_gi" | "renal" | "neuro" | "vascular";

interface Organ3DVisualizerProps {
  patient: Patient | null;
  onExecuteCommand?: (commandText: string) => void;
}

export const InteractiveOrgan3DVisualizer: React.FC<Organ3DVisualizerProps> = ({
  patient,
  onExecuteCommand,
}) => {
  const diagnosis = patient?.primaryDiagnosis?.toLowerCase() || "";
  const condition = patient?.condition?.toLowerCase() || "";

  // Auto-detect organ system based on disease
  const getDefaultOrganSystem = (): OrganSystemType => {
    if (diagnosis.includes("dengue") || diagnosis.includes("fever") || diagnosis.includes("anemia") || diagnosis.includes("bleed")) {
      return "vascular";
    }
    if (diagnosis.includes("stemi") || diagnosis.includes("heart") || diagnosis.includes("cardiac") || diagnosis.includes("chest pain") || diagnosis.includes("angina")) {
      return "cardiac";
    }
    if (diagnosis.includes("pneumonia") || diagnosis.includes("copd") || diagnosis.includes("asthma") || diagnosis.includes("lung") || diagnosis.includes("respiratory")) {
      return "respiratory";
    }
    if (diagnosis.includes("renal") || diagnosis.includes("kidney") || diagnosis.includes("kft") || diagnosis.includes("nephro")) {
      return "renal";
    }
    if (diagnosis.includes("stroke") || diagnosis.includes("neuro") || diagnosis.includes("seizure") || diagnosis.includes("brain")) {
      return "neuro";
    }
    if (diagnosis.includes("liver") || diagnosis.includes("jaundice") || diagnosis.includes("gastric") || diagnosis.includes("cirrhosis")) {
      return "hepatic_gi";
    }
    return "cardiac";
  };

  const [activeOrgan, setActiveOrgan] = useState<OrganSystemType>(getDefaultOrganSystem());
  const [rotationAngle, setRotationAngle] = useState<number>(15);
  const [viewMode, setViewMode] = useState<"3d_mesh" | "vascular_flow" | "pathology_slice" | "cellular_layer">("3d_mesh");
  const [selectedHotspot, setSelectedHotspot] = useState<string | null>("h1");
  const [isRotating, setIsRotating] = useState(true);

  // Organ systems config
  const organSystemsConfig: Record<
    OrganSystemType,
    {
      title: string;
      icon: any;
      diseaseMatchText: string;
      statusColor: string;
      riskScore: string;
      perfusionScore: number;
      inflammatoryScore: number;
      hotspots: { id: string; name: string; x: number; y: number; detail: string; severity: "NORMAL" | "ATTENTION" | "CRITICAL"; actionCmd: string }[];
    }
  > = {
    cardiac: {
      title: "3D Cardiovascular & Myocardial Matrix",
      icon: Heart,
      diseaseMatchText: diagnosis.includes("stemi") ? "Acute Coronary Ischemia / STEMI" : "Cardiac Rhythm & Myocardial Perfusion",
      statusColor: "from-rose-500 to-amber-500",
      riskScore: "HIGH ISCHEMIC RISK",
      perfusionScore: 68,
      inflammatoryScore: 82,
      hotspots: [
        { id: "h1", name: "LAD Coronary Artery", x: 48, y: 38, detail: "75% Stenosis in Mid LAD. Subendocardial ischemic strain noted.", severity: "CRITICAL", actionCmd: "Bed 1 Order Coronary Angiogram and Troponin-I" },
        { id: "h2", name: "Left Ventricle Apex", x: 58, y: 62, detail: "Apical hypokinesis with reduced ejection fraction (EF: 42%).", severity: "ATTENTION", actionCmd: "Bed 1 Order Cardiology Consult and 2D Echo" },
        { id: "h3", name: "Sinoatrial Node", x: 38, y: 28, detail: "Sinus rhythm maintaining 92 bpm with occasional PACs.", severity: "NORMAL", actionCmd: "Bed 1 Vitals monitoring every 1 hour" },
      ],
    },
    respiratory: {
      title: "3D Pulmonary Alveolar & Bronchial Tree",
      icon: Wind,
      diseaseMatchText: "Alveolar Fluid Infiltration & Oxygenation Index",
      statusColor: "from-cyan-500 to-blue-600",
      riskScore: "MODERATE RESPIRATORY DISTRESS",
      perfusionScore: 74,
      inflammatoryScore: 65,
      hotspots: [
        { id: "h1", name: "Right Lower Lobe Alveoli", x: 62, y: 65, detail: "Exudative alveolar consolidation with decreased compliance.", severity: "CRITICAL", actionCmd: "Bed 1 Order Chest X-Ray and ABG" },
        { id: "h2", name: "Carina & Major Bronchi", x: 50, y: 35, detail: "Mild mucosal hyperemia and tenacious thick secretions.", severity: "ATTENTION", actionCmd: "Bed 1 Nebulization and Physiotherapy Request" },
        { id: "h3", name: "Left Pleural Cavity", x: 35, y: 55, detail: "Minimal fluid collection (<15 ml). No pneumothorax.", severity: "NORMAL", actionCmd: "Bed 1 Oxygen support 4L/min via cannula" },
      ],
    },
    vascular: {
      title: "3D Hematologic & Microvascular Permeability Engine",
      icon: Droplets,
      diseaseMatchText: diagnosis.includes("dengue") ? "Dengue Hemorrhagic Capillary Leak Syndrome" : "Systemic Vasculature & Platelet Matrix",
      statusColor: "from-amber-500 to-rose-600",
      riskScore: "CRITICAL THROMBOCYTOPENIA",
      perfusionScore: 55,
      inflammatoryScore: 91,
      hotspots: [
        { id: "h1", name: "Capillary Endothelium", x: 52, y: 48, detail: "Increased vascular permeability driven by NS1 cytokine release.", severity: "CRITICAL", actionCmd: "Bed 1 Order CBC and Hematocrit q6h" },
        { id: "h2", name: "Splenic Sinusoids", x: 38, y: 58, detail: "Splenomegaly with rapid platelet sequestration.", severity: "CRITICAL", actionCmd: "Bed 1 Blood Bank Request for PRBC and Platelets" },
        { id: "h3", name: "Peripheral Microvasculature", x: 65, y: 35, detail: "Petechial rash distribution on forearms.", severity: "ATTENTION", actionCmd: "Bed 1 IV Fluids Normal Saline @ 100ml/hr" },
      ],
    },
    renal: {
      title: "3D Nephron Architecture & Glomerular Filtration",
      icon: Activity,
      diseaseMatchText: "Renal Clearance & Electrolyte Balance",
      statusColor: "from-emerald-500 to-teal-600",
      riskScore: "ACUTE KIDNEY INJURY STAGE 2",
      perfusionScore: 62,
      inflammatoryScore: 78,
      hotspots: [
        { id: "h1", name: "Glomerular Basement Membrane", x: 45, y: 42, detail: "Decreased GFR (38 mL/min/1.73m²). Elevated Serum Creatinine.", severity: "CRITICAL", actionCmd: "Bed 1 Order KFT and Electrolytes" },
        { id: "h2", name: "Proximal Convoluted Tubules", x: 55, y: 60, detail: "Ischemic tubular injury with protein leak.", severity: "ATTENTION", actionCmd: "Bed 1 Nephrology Consultation Request" },
        { id: "h3", name: "Renal Artery Bifurcation", x: 50, y: 25, detail: "Patent blood flow, resistive index 0.68.", severity: "NORMAL", actionCmd: "Bed 1 Urine Output Monitoring q2h" },
      ],
    },
    neuro: {
      title: "3D Cerebral Parenchyma & Neuro-Vascular Network",
      icon: Brain,
      diseaseMatchText: "Cerebral Perfusion & Intracranial Pressure",
      statusColor: "from-purple-500 to-indigo-600",
      riskScore: "ISCHEMIC PENUMBRA DETECTED",
      perfusionScore: 71,
      inflammatoryScore: 58,
      hotspots: [
        { id: "h1", name: "Middle Cerebral Artery (MCA) Territory", x: 52, y: 40, detail: "Focal hypoperfusion penumbra in right parietal cortex.", severity: "CRITICAL", actionCmd: "Bed 1 Order NCCT Brain and Neurology Consult" },
        { id: "h2", name: "Circle of Willis", x: 50, y: 52, detail: "Slight tortuosity, no aneurysm detected.", severity: "NORMAL", actionCmd: "Bed 1 GCS Neurologic Assessment q1h" },
        { id: "h3", name: "Internal Capsule", x: 42, y: 46, detail: "Intact motor fibers, mild localized edema.", severity: "ATTENTION", actionCmd: "Bed 1 Elevate head end of bed 30 degrees" },
      ],
    },
    hepatic_gi: {
      title: "3D Hepatic Parenchyma & Biliary Architecture",
      icon: Stethoscope,
      diseaseMatchText: "Hepatosplenomegaly & Synthetic Function",
      statusColor: "from-yellow-500 to-amber-600",
      riskScore: "HEPATIC PARENCHYMAL STRAIN",
      perfusionScore: 79,
      inflammatoryScore: 70,
      hotspots: [
        { id: "h1", name: "Hepatic Lobule Parenchyma", x: 48, y: 45, detail: "Transaminase elevation (ALT: 185 U/L, AST: 210 U/L).", severity: "ATTENTION", actionCmd: "Bed 1 Order LFT and USG Abdomen" },
        { id: "h2", name: "Portal Vein Trunk", x: 56, y: 58, detail: "Normal flow velocity (24 cm/s), no thrombus.", severity: "NORMAL", actionCmd: "Bed 1 Monitor Prothrombin Time INR" },
        { id: "h3", name: "Gallbladder & Cystic Duct", x: 40, y: 62, detail: "Mild gallbladder wall edema (3.8 mm).", severity: "ATTENTION", actionCmd: "Bed 1 Diet Order Low Fat Soft Diet" },
      ],
    },
  };

  const currConfig = organSystemsConfig[activeOrgan];
  const activeSpot = currConfig.hotspots.find((h) => h.id === selectedHotspot) || currConfig.hotspots[0];

  return (
    <div className="relative rounded-3xl p-5 border border-[#E3E8EF] bg-white shadow-elevation-1 overflow-hidden font-sans">
      {/* Background Subtle Mesh Grid Lines */}
      <div className="absolute inset-0 bg-[radial-gradient(#1769AA_1px,transparent_1px)] [background-size:24px_24px] opacity-[0.03] pointer-events-none" />

      {/* Header Banner */}
      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#E3E8EF]">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-[#F1F4F7] border border-[#E3E8EF] text-[#1769AA] shadow-sm">
              <Cpu className="w-5 h-5 text-[#1769AA]" />
            </span>
            <div>
              <h2 className="text-base font-bold text-[#0B1F3A] tracking-tight flex items-center gap-2">
                {currConfig.title}
                <span className="bg-[#F1F4F7] text-[#1769AA] border border-[#E3E8EF] text-[10px] px-2 py-0.5 rounded-md font-semibold">
                  3D HOLO-ENGINE
                </span>
              </h2>
              <p className="text-xs text-[#667085]">
                Patient Disease Match: <strong className="text-[#1769AA] font-semibold">{currConfig.diseaseMatchText}</strong>
              </p>
            </div>
          </div>
        </div>

        {/* Organ Selector Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 bg-[#F7F8FA] p-1.5 rounded-2xl border border-[#E3E8EF]">
          {(["cardiac", "respiratory", "vascular", "renal", "neuro", "hepatic_gi"] as OrganSystemType[]).map((sys) => {
            const IconComp = organSystemsConfig[sys].icon;
            const isSel = activeOrgan === sys;
            return (
              <button
                key={sys}
                onClick={() => {
                  setActiveOrgan(sys);
                  setSelectedHotspot("h1");
                }}
                className={`relative px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-150 cursor-pointer flex items-center gap-1.5 capitalize ${
                  isSel
                    ? "bg-[#1769AA] text-white shadow-sm font-bold"
                    : "bg-white text-[#667085] hover:text-[#0B1F3A] hover:bg-[#F1F4F7] border border-[#E3E8EF]"
                }`}
              >
                <IconComp className={`w-3.5 h-3.5 ${isSel ? "text-white" : "text-[#1769AA]"}`} />
                <span className="hidden sm:inline">{sys.replace("_", " ")}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Visualizer Body */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mt-4 relative z-10">
        {/* 3D Holographic Canvas Stage (7 Cols) */}
        <div className="lg:col-span-7 flex flex-col justify-between rounded-2xl bg-slate-950/80 border border-slate-800 p-4 relative min-h-[360px] shadow-inner overflow-hidden">
          {/* Canvas Top Toolbar Controls */}
          <div className="flex items-center justify-between text-xs font-mono text-slate-400 border-b border-slate-800/80 pb-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setRotationAngle((prev) => (prev + 45) % 360)}
                className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-slate-700/80 transition-colors flex items-center gap-1 cursor-pointer"
                title="Rotate 3D Hologram"
              >
                <RotateCw className="w-3.5 h-3.5 text-cyan-400" /> <span>3D Orbit {rotationAngle}°</span>
              </button>

              <button
                onClick={() => setIsRotating(!isRotating)}
                className={`p-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer border ${
                  isRotating
                    ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/40"
                    : "bg-slate-900 text-slate-400 border-slate-800"
                }`}
              >
                {isRotating ? "Auto-Scan ON" : "Auto-Scan OFF"}
              </button>
            </div>

            <div className="flex items-center gap-1">
              {(["3d_mesh", "vascular_flow", "pathology_slice", "cellular_layer"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setViewMode(m)}
                  className={`px-2 py-1 rounded text-[10px] font-bold uppercase transition-all cursor-pointer ${
                    viewMode === m
                      ? "bg-cyan-600 text-white font-bold border border-cyan-400/40"
                      : "bg-slate-900 text-slate-400 hover:text-cyan-300 border border-transparent"
                  }`}
                >
                  {m.replace("_", " ")}
                </button>
              ))}
            </div>
          </div>

          {/* 3D Interactive Organ Canvas Display */}
          <div className="relative flex-1 flex items-center justify-center my-4 group">
            {/* Holographic Projection Pedestal Glow */}
            <div className="absolute bottom-2 w-64 h-8 bg-cyan-500/20 rounded-full blur-xl animate-pulse" />
            <div className="absolute bottom-0 w-48 h-3 border-b-2 border-cyan-400 rounded-full shadow-[0_0_20px_#06b6d4]" />

            {/* Simulated 3D Rotatable Organ Wireframe/Visual */}
            <div
              className="relative transition-transform duration-700 ease-out cursor-grab active:cursor-grabbing"
              style={{
                transform: `perspective(800px) rotateY(${rotationAngle}deg) rotateX(10deg)`,
              }}
            >
              {/* Dynamic SVG 3D Organ Illustration according to selected system */}
              <svg
                width="280"
                height="240"
                viewBox="0 0 280 240"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="filter drop-shadow-[0_0_25px_rgba(6,182,212,0.6)]"
              >
                {/* Holographic Scanline Grid */}
                <pattern id="scangrid" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(6,182,212,0.15)" strokeWidth="1" />
                </pattern>
                <rect width="280" height="240" fill="url(#scangrid)" />

                {/* System Specific 3D Isometric Vectors */}
                {activeOrgan === "cardiac" && (
                  <g className="animate-pulse duration-1000">
                    <path
                      d="M140 40 C100 10, 50 60, 80 120 C100 160, 140 200, 140 200 C140 200, 180 160, 200 120 C230 60, 180 10, 140 40 Z"
                      fill="url(#cardiacGrad)"
                      stroke="#f43f5e"
                      strokeWidth="3"
                    />
                    <path d="M140 40 L140 200" stroke="#06b6d4" strokeWidth="2" strokeDasharray="4 4" />
                    <path d="M100 80 Q140 100 180 80" stroke="#fbbf24" strokeWidth="3" />
                    <circle cx="140" cy="110" r="35" stroke="#f43f5e" strokeWidth="2" fill="rgba(244,63,94,0.1)" />
                  </g>
                )}

                {activeOrgan === "respiratory" && (
                  <g>
                    {/* Trachea */}
                    <path d="M140 30 L140 80" stroke="#06b6d4" strokeWidth="8" strokeLinecap="round" />
                    <path d="M140 80 L100 120 M140 80 L180 120" stroke="#06b6d4" strokeWidth="6" strokeLinecap="round" />
                    {/* Left & Right Lung Lobes */}
                    <path
                      d="M100 120 C70 120 50 150 60 190 C70 210 110 200 110 160 Z"
                      fill="rgba(6,182,212,0.25)"
                      stroke="#38bdf8"
                      strokeWidth="3"
                    />
                    <path
                      d="M180 120 C210 120 230 150 220 190 C210 210 170 200 170 160 Z"
                      fill="rgba(6,182,212,0.25)"
                      stroke="#38bdf8"
                      strokeWidth="3"
                    />
                  </g>
                )}

                {activeOrgan === "vascular" && (
                  <g>
                    <path d="M60 120 Q140 20 220 120 Q140 220 60 120 Z" fill="rgba(245,158,11,0.1)" stroke="#f59e0b" strokeWidth="3" />
                    <circle cx="140" cy="120" r="50" stroke="#f43f5e" strokeWidth="2" strokeDasharray="6 4" />
                    {/* Particle Blood Cells */}
                    <circle cx="120" cy="110" r="8" fill="#f43f5e" />
                    <circle cx="155" cy="130" r="10" fill="#f43f5e" />
                    <circle cx="130" cy="140" r="6" fill="#38bdf8" />
                  </g>
                )}

                {activeOrgan === "renal" && (
                  <g>
                    {/* Kidney Bean Shape */}
                    <path
                      d="M110 50 C70 50 60 100 60 140 C60 180 80 200 120 190 C150 180 140 140 120 130 C100 120 110 80 110 50 Z"
                      fill="rgba(16,185,129,0.2)"
                      stroke="#10b981"
                      strokeWidth="3"
                    />
                    <path d="M120 130 L170 150" stroke="#38bdf8" strokeWidth="4" />
                  </g>
                )}

                {activeOrgan === "neuro" && (
                  <g>
                    <path
                      d="M140 50 C90 50 60 80 60 120 C60 160 90 190 140 190 C190 190 220 160 220 120 C220 80 190 50 140 50 Z"
                      fill="rgba(168,85,247,0.2)"
                      stroke="#a855f7"
                      strokeWidth="3"
                    />
                    <path d="M80 120 Q140 80 200 120 M90 150 Q140 110 190 150 M100 90 Q140 60 180 90" stroke="#e0e7ff" strokeWidth="2" />
                  </g>
                )}

                {activeOrgan === "hepatic_gi" && (
                  <g>
                    <path
                      d="M70 70 L210 80 C210 80 200 160 140 180 C90 170 70 120 70 70 Z"
                      fill="rgba(234,179,8,0.2)"
                      stroke="#eab308"
                      strokeWidth="3"
                    />
                  </g>
                )}

                {/* Gradients */}
                <defs>
                  <linearGradient id="cardiacGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="#881337" stopOpacity="0.4" />
                  </linearGradient>
                </defs>
              </svg>

              {/* Hotspot Markers Overlay */}
              {currConfig.hotspots.map((spot) => {
                const isSel = selectedHotspot === spot.id;
                return (
                  <button
                    key={spot.id}
                    onClick={() => setSelectedHotspot(spot.id)}
                    style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 p-2 rounded-full cursor-pointer transition-all duration-300 ${
                      isSel
                        ? "scale-125 z-30 ring-4 ring-cyan-400 bg-cyan-500 shadow-[0_0_20px_#06b6d4]"
                        : "scale-100 z-20 bg-slate-900/90 border border-cyan-400 hover:scale-110"
                    }`}
                  >
                    <span
                      className={`block w-2.5 h-2.5 rounded-full ${
                        spot.severity === "CRITICAL"
                          ? "bg-rose-500 animate-ping"
                          : spot.severity === "ATTENTION"
                          ? "bg-amber-400"
                          : "bg-emerald-400"
                      }`}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Holographic Status Footer Bar */}
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-300 pt-2 border-t border-slate-800/80">
            <span className="flex items-center gap-1.5 text-cyan-400">
              <Sparkles className="w-3.5 h-3.5 animate-spin" />
              HOTSPOT INSPECTION: <strong className="text-white uppercase">{activeSpot.name}</strong>
            </span>
            <span className="bg-rose-500/20 text-rose-300 border border-rose-500/40 px-2.5 py-0.5 rounded-full font-bold">
              {currConfig.riskScore}
            </span>
          </div>
        </div>

        {/* 3D Pathology Metrics & Instant Action Panel (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col justify-between space-y-4">
          {/* Selected Hotspot Detailed Inspector Card */}
          <div className="p-4 rounded-2xl bg-slate-950/90 border border-cyan-500/40 shadow-xl space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <Crosshair className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-bold text-white uppercase font-mono">{activeSpot.name}</h3>
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full font-mono ${
                  activeSpot.severity === "CRITICAL"
                    ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                    : activeSpot.severity === "ATTENTION"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                    : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                }`}
              >
                {activeSpot.severity}
              </span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed font-sans">{activeSpot.detail}</p>

            {/* Quick Action Bus Trigger for this 3D Hotspot */}
            {onExecuteCommand && (
              <button
                onClick={() => onExecuteCommand(activeSpot.actionCmd)}
                className="w-full mt-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(6,182,212,0.4)] transition-all cursor-pointer font-sans"
              >
                <Zap className="w-3.5 h-3.5 text-amber-300 animate-bounce" />
                <span>EXECUTE HOTSPOT COMMAND</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Organ Function & Tissue Permeability Meters */}
          <div className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-3 font-mono">
            <div className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
              <span>Organ Perfusion & Oxygenation</span>
              <span className="text-cyan-400 font-bold">{currConfig.perfusionScore}%</span>
            </div>
            <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
              <div
                className="h-full bg-gradient-to-r from-rose-500 via-amber-500 to-emerald-400 transition-all duration-500"
                style={{ width: `${currConfig.perfusionScore}%` }}
              />
            </div>

            <div className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between pt-1">
              <span>Tissue Inflammatory Strain Index</span>
              <span className="text-rose-400 font-bold">{currConfig.inflammatoryScore}%</span>
            </div>
            <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
              <div
                className="h-full bg-gradient-to-r from-emerald-400 via-amber-500 to-rose-500 transition-all duration-500"
                style={{ width: `${currConfig.inflammatoryScore}%` }}
              />
            </div>
          </div>

          {/* Futuristic 3D Quick Command Launcher Bar */}
          <div className="p-3.5 rounded-2xl bg-gradient-to-r from-slate-950 via-cyan-950/30 to-slate-950 border border-cyan-500/30 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-slate-300 uppercase font-mono flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              Astra 3D Organ Bus:
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onExecuteCommand && onExecuteCommand(`Bed 1 Order 3D CT Scan and Ultrasound for ${activeOrgan}`)}
                className="bg-slate-900 hover:bg-cyan-900/60 text-cyan-300 border border-cyan-500/40 font-semibold text-[11px] px-2.5 py-1.5 rounded-xl transition-all cursor-pointer font-sans"
              >
                + 3D Radiology Scan
              </button>
              <button
                onClick={() => onExecuteCommand && onExecuteCommand(`Bed 1 Order organ biomarker labs for ${activeOrgan}`)}
                className="bg-slate-900 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-500/40 font-semibold text-[11px] px-2.5 py-1.5 rounded-xl transition-all cursor-pointer font-sans"
              >
                + Biomarker Panel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
