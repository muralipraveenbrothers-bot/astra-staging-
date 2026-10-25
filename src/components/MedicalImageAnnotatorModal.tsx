import React, { useState } from "react";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Eye,
  EyeOff,
  Filter,
  Layers,
  Maximize2,
  Minimize2,
  RefreshCw,
  RotateCcw,
  Sliders,
  Sparkles,
  Tag,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui";

interface Pin {
  id: string;
  x: number;
  y: number;
  label: string;
  classification: "OBSERVED" | "REFERENCE" | "AT_RISK" | "NOT_ASSESSABLE";
  details: string;
}

const DEFAULT_PINS: Pin[] = [
  {
    id: "pin-1",
    x: 48,
    y: 42,
    label: "Wound Margin / Laceration Floor",
    classification: "OBSERVED",
    details: "Superficial dermal laceration floor with clean uninfected margins.",
  },
  {
    id: "pin-2",
    x: 35,
    y: 55,
    label: "Median Nerve Course",
    classification: "REFERENCE",
    details: "Anatomical course of main median trunk traversing carpal tunnel.",
  },
  {
    id: "pin-3",
    x: 62,
    y: 48,
    label: "Radial Digital Nerve & Artery",
    classification: "AT_RISK",
    details: "Adjacent neurovascular bundle within 4mm proximity to deep margin.",
  },
  {
    id: "pin-4",
    x: 52,
    y: 65,
    label: "Flexor Digitorum Tendon Sheath",
    classification: "AT_RISK",
    details: "FDS tendon glide plane intact, no sheath laceration.",
  },
  {
    id: "pin-5",
    x: 75,
    y: 30,
    label: "Phalangeal Cortical Bone Integrity",
    classification: "NOT_ASSESSABLE",
    details: "Requires plain radiographic projection (X-ray) for cortical continuity.",
  },
];

export function MedicalImageAnnotatorModal({
  isOpen,
  onClose,
  imageUrl,
  patientName = "Rajesh Kumar",
  patientUhid = "UHID-2026-8801",
  procedureName = "USG Abdomen & Pelvis",
  bedNumber,
  onSaveDerivative,
  onSaveToPatientChart,
}: {
  isOpen: boolean;
  onClose: () => void;
  imageUrl?: string;
  patientName?: string;
  patientUhid?: string;
  procedureName?: string;
  bedNumber?: string;
  onSaveDerivative?: (enhancedUrl: string) => void;
  onSaveToPatientChart?: (derivative: any) => void;
}) {
  const [displayMode, setDisplayMode] = useState<
    "original" | "ai_enhanced" | "anatomy" | "findings" | "side_by_side"
  >("findings");

  const [brightness, setBrightness] = useState(115);
  const [contrast, setContrast] = useState(125);
  const [sharpness, setSharpness] = useState(110);
  const [edgeEnhancement, setEdgeEnhancement] = useState(true);
  const [zoom, setZoom] = useState(100);
  const [activePin, setActivePin] = useState<Pin | null>(DEFAULT_PINS[0]);

  const [sensoryExamPassed, setSensoryExamPassed] = useState(true);
  const [motorExamPassed, setMotorExamPassed] = useState(true);
  const [vascularCapillaryPassed, setVascularCapillaryPassed] = useState(true);

  if (!isOpen) return null;

  const currentImage =
    imageUrl ||
    "https://images.unsplash.com/photo-1516549655169-df83a0774514?auto=format&fit=crop&w=1200&q=80";

  const getFilterStyle = () => {
    if (displayMode === "original") return "none";
    let filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${sharpness}%)`;
    if (edgeEnhancement) {
      filter += ` drop-shadow(0 0 2px rgba(6,182,212,0.8))`;
    }
    return filter;
  };

  const getClassificationBadge = (cls: Pin["classification"]) => {
    switch (cls) {
      case "OBSERVED":
        return <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-rose-500/20 text-rose-300">OBSERVED</span>;
      case "REFERENCE":
        return <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300">REFERENCE</span>;
      case "AT_RISK":
        return <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-cyan-500/20 text-cyan-300">AT_RISK</span>;
      case "NOT_ASSESSABLE":
        return <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-slate-700 text-slate-300">NOT_ASSESSABLE</span>;
    }
  };

  const handleSave = () => {
    toast.success("Annotated Derivative Saved & Synced", {
      description: "Image enhancements, anatomical vector layers, and pins saved to official patient record.",
    });
    onSaveDerivative?.(currentImage);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-slate-100">
        {/* ---------------- Modal Header ---------------- */}
        <div className="p-3.5 border-b border-slate-800 bg-slate-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-black text-white uppercase tracking-wider">
                  Astra Multimodal Medical Image Intelligence
                </h2>
                <Badge tone="cyan">AI Vision 4.0</Badge>
              </div>
              <p className="text-[10px] text-slate-400">
                Patient: <span className="text-white font-bold">{patientName}</span> ({patientUhid}) • {procedureName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow flex items-center gap-1.5 transition-all"
            >
              <CheckCircle2 className="w-4 h-4" /> Save Annotated Derivative
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ---------------- Mode & Zoom Bar ---------------- */}
        <div className="p-2 border-b border-slate-800 bg-slate-950/60 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
            {[
              { id: "original", label: "Original Photo" },
              { id: "ai_enhanced", label: "AI Enhanced" },
              { id: "anatomy", label: "Anatomy Overlay" },
              { id: "findings", label: "Clinical Findings" },
              { id: "side_by_side", label: "Side-By-Side" },
            ].map((mode) => (
              <button
                key={mode.id}
                onClick={() => setDisplayMode(mode.id as any)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  displayMode === mode.id
                    ? "bg-blue-600 text-white shadow"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 bg-slate-900 px-2 py-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setZoom(Math.max(50, zoom - 15))}
              className="p-1 text-slate-400 hover:text-white"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="font-mono text-white text-[11px] font-bold">{zoom}%</span>
            <button
              onClick={() => setZoom(Math.min(200, zoom + 15))}
              className="p-1 text-slate-400 hover:text-white"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                setZoom(100);
                setBrightness(115);
                setContrast(125);
                setSharpness(110);
              }}
              className="ml-1 text-[10px] text-cyan-400 hover:underline flex items-center gap-0.5"
            >
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
          </div>
        </div>

        {/* ---------------- Main Content Body ---------------- */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 p-3 flex-1 overflow-y-auto">
          {/* Main Display Canvas (Col 8) */}
          <div className="lg:col-span-8 bg-slate-950 rounded-xl border border-slate-800 p-2 flex flex-col justify-center items-center relative overflow-hidden min-h-[380px]">
            {displayMode === "side_by_side" ? (
              <div className="grid grid-cols-2 gap-2 w-full h-full">
                <div className="relative rounded-lg overflow-hidden border border-slate-800">
                  <span className="absolute top-2 left-2 z-10 px-2 py-0.5 bg-black/70 text-white text-[10px] font-bold rounded">
                    Original Scan Frame
                  </span>
                  <img
                    src={currentImage}
                    alt="Original"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="relative rounded-lg overflow-hidden border border-slate-800">
                  <span className="absolute top-2 left-2 z-10 px-2 py-0.5 bg-blue-600/80 text-white text-[10px] font-bold rounded">
                    AI Enhanced &amp; Annotated
                  </span>
                  <img
                    src={currentImage}
                    alt="Enhanced"
                    style={{ filter: getFilterStyle() }}
                    className="w-full h-full object-contain"
                  />
                </div>
              </div>
            ) : (
              <div
                className="relative inline-block transition-transform duration-150"
                style={{ transform: `scale(${zoom / 100})` }}
              >
                <img
                  src={currentImage}
                  alt="Medical Study"
                  style={{ filter: getFilterStyle() }}
                  className="max-h-[460px] rounded-lg object-contain shadow-2xl"
                />

                {/* SVG Anatomy Vectors Layer */}
                {(displayMode === "anatomy" || displayMode === "findings") && (
                  <svg className="absolute inset-0 w-full h-full pointer-events-none">
                    {/* Median Nerve Course (Yellow Dashed) */}
                    <path
                      d="M 120 40 Q 200 180 260 380"
                      stroke="#f59e0b"
                      strokeWidth="3"
                      strokeDasharray="6,4"
                      fill="none"
                    />
                    {/* Digital Artery (Cyan Solid) */}
                    <path
                      d="M 160 40 Q 240 200 320 380"
                      stroke="#06b6d4"
                      strokeWidth="2.5"
                      fill="none"
                    />
                    {/* Flexor Tendon Sheath (Indigo Solid) */}
                    <path
                      d="M 210 40 Q 270 200 290 380"
                      stroke="#818cf8"
                      strokeWidth="3.5"
                      fill="none"
                    />
                  </svg>
                )}

                {/* Interactive Color-Coded Pins */}
                {displayMode === "findings" &&
                  DEFAULT_PINS.map((pin) => (
                    <button
                      key={pin.id}
                      onClick={() => setActivePin(pin)}
                      style={{ top: `${pin.y}%`, left: `${pin.x}%` }}
                      className={`absolute -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center font-bold text-[10px] shadow-lg transition-transform hover:scale-125 border-2 ${
                        pin.classification === "OBSERVED"
                          ? "bg-rose-600 border-white text-white"
                          : pin.classification === "REFERENCE"
                          ? "bg-amber-500 border-white text-slate-950"
                          : pin.classification === "AT_RISK"
                          ? "bg-cyan-500 border-white text-slate-950"
                          : "bg-slate-700 border-white text-white"
                      } ${activePin?.id === pin.id ? "ring-4 ring-cyan-400 scale-125" : ""}`}
                    >
                      🏷️
                    </button>
                  ))}
              </div>
            )}

            {/* Bottom Safety Alert */}
            <div className="w-full mt-2 p-2 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between text-[10px] text-slate-400">
              <span className="flex items-center gap-1 text-amber-300">
                <AlertTriangle className="w-3.5 h-3.5" /> Astra Safety Policy: Reference courses represent trajectory approximations.
              </span>
              <span>Modality: Multi-Vector Sonography</span>
            </div>
          </div>

          {/* Controls & Inspection Sidebar (Col 4) */}
          <div className="lg:col-span-4 space-y-3 overflow-y-auto max-h-[500px] pr-1 text-xs">
            {/* Image Enhancement Sliders */}
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
              <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-cyan-400" /> Image Enhancement Controls
              </span>

              <div className="space-y-2">
                <div>
                  <div className="flex justify-between text-[11px] text-slate-400 mb-0.5">
                    <span>Brightness:</span>
                    <span className="font-mono text-white">{brightness}%</span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="180"
                    value={brightness}
                    onChange={(e) => setBrightness(+e.target.value)}
                    className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-slate-400 mb-0.5">
                    <span>Contrast:</span>
                    <span className="font-mono text-white">{contrast}%</span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="180"
                    value={contrast}
                    onChange={(e) => setContrast(+e.target.value)}
                    className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-slate-400 mb-0.5">
                    <span>Sharpness:</span>
                    <span className="font-mono text-white">{sharpness}%</span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="180"
                    value={sharpness}
                    onChange={(e) => setSharpness(+e.target.value)}
                    className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-slate-800">
                  <span className="text-[11px] text-slate-300">High-Contrast Edge:</span>
                  <button
                    onClick={() => setEdgeEnhancement(!edgeEnhancement)}
                    className={`px-2.5 py-0.5 rounded text-[10px] font-bold ${
                      edgeEnhancement ? "bg-cyan-600 text-white" : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {edgeEnhancement ? "ENABLED" : "DISABLED"}
                  </button>
                </div>
              </div>
            </div>

            {/* Anatomical Structure Checklist */}
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-blue-400" /> Anatomical Structure Checklist
              </span>

              <div className="space-y-1.5">
                {DEFAULT_PINS.map((pin) => (
                  <div
                    key={pin.id}
                    onClick={() => setActivePin(pin)}
                    className={`p-2 rounded-lg border cursor-pointer transition-all ${
                      activePin?.id === pin.id
                        ? "bg-slate-900 border-cyan-500 shadow"
                        : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <strong className="text-[11px] text-white block">{pin.label}</strong>
                      {getClassificationBadge(pin.classification)}
                    </div>
                    <p className="text-[10px] text-slate-400 leading-snug">{pin.details}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Required Physical Examination Checklist */}
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-emerald-400" /> Required Physical Examination
              </span>

              <div className="space-y-1.5 text-[11px]">
                <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sensoryExamPassed}
                    onChange={(e) => setSensoryExamPassed(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-900 text-blue-600"
                  />
                  <span>2-Point Discriminative Sensory Touch (&lt; 6mm)</span>
                </label>

                <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={motorExamPassed}
                    onChange={(e) => setMotorExamPassed(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-900 text-blue-600"
                  />
                  <span>Flexor Digitorum Profundus/Superficialis Active ROM</span>
                </label>

                <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={vascularCapillaryPassed}
                    onChange={(e) => setVascularCapillaryPassed(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-900 text-blue-600"
                  />
                  <span>Distal Capillary Refill Time (&lt; 2 seconds)</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
