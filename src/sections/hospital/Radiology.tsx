import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Bot,
  Camera,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Cpu,
  Download,
  Eye,
  FileCheck,
  FileSpreadsheet,
  FileText,
  HelpCircle,
  Layers,
  Mic,
  MicOff,
  Maximize2,
  Package,
  Pencil,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  Scan,
  ScanLine,
  Search,
  Send,
  Shield,
  Sparkles,
  Tag,
  Upload,
  UserCheck,
  Volume2,
  VolumeX,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Badge, Modal } from "@/components/ui";
import { OrderStatusChip } from "@/astra/clinical/workflow/OrderStatusChip";
import { submitResultReport } from "@/astra/clinical/results/resultsClient";
import { labVoiceLine } from "@/astra/clinical/results/resultsLoop";
import { voiceEngine } from "@/astra/voice/voiceEngine";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { HospitalPrintEngine } from "@/lib/printEngine";
import { MedicalImageAnnotatorModal } from "@/components/MedicalImageAnnotatorModal";
import {
  getTemplateForModality,
  standardizeRadiologyText,
} from "@/lib/radiologyUtils";

interface RadiologyStudy {
  id: string;
  uhid: string;
  patientName: string;
  age: number;
  gender: "Male" | "Female";
  procedureName: string;
  modality: "USG" | "X-Ray" | "CT" | "MRI" | "Endoscopy";
  orderedAt: string;
  fee: number;
  status: "Pending" | "Finalized";
  findings: string;
  impression: string;
  scanImageUrl?: string;
  radiologist: string;
}

const INITIAL_STUDIES: RadiologyStudy[] = [
  {
    id: "RAD-2026-7712",
    uhid: "UHID-2026-8803",
    patientName: "Vikram Reddy",
    age: 58,
    gender: "Male",
    procedureName: "USG Abdomen & Pelvis",
    modality: "USG",
    orderedAt: "2026-08-08 10:15 AM",
    fee: 1200,
    status: "Finalized",
    findings: `LIVER: Normal in size (13.8 cm) with smooth margins. Grade 1 fatty infiltration noted. No focal liver lesion.
GALLBLADDER: Distended with a 6.2 mm mobile calculus in the neck region. No gallbladder wall thickening (2.1 mm). CBD is normal (3.8 mm).
KIDNEYS: Bilateral kidneys are normal in size and echotexture. No hydronephrosis or renal calculus.
SPLEEN & PANCREAS: Normal.
URINARY BLADDER: Well distended, smooth regular mucosal walls, no intravesical calculus or mass.`,
    impression: `1. Cholelithiasis with 6.2 mm solitary gallstone in gallbladder neck.
2. Grade 1 Fatty Liver (Hepatic Steatosis).`,
    scanImageUrl:
      "https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=1200&q=80",
    radiologist: "Dr. Murali Praveen, M.D. (Radiodiagnosis)",
  },
  {
    id: "RAD-2026-7713",
    uhid: "UHID-2026-8804",
    patientName: "Sunita Devi",
    age: 38,
    gender: "Female",
    procedureName: "Chest X-Ray PA View",
    modality: "X-Ray",
    orderedAt: "2026-08-08 11:00 AM",
    fee: 2500,
    status: "Finalized",
    findings: `LUNG FIELDS: Clear bilateral lung parenchyma without active consolidation, cavitation, or pleural effusion.
CARDIAC SILHOUETTE: Normal transverse cardiac diameter. CTR < 0.5.
HILA & MEDIASTINUM: Unremarkable.
BONY CAGE: Intact ribs and clavicles.`,
    impression: `1. Normal Chest Radiograph PA View.
2. No active cardiopulmonary lesions.`,
    scanImageUrl:
      "https://images.unsplash.com/photo-1516549655169-df83a0774514?auto=format&fit=crop&w=1200&q=80",
    radiologist: "Dr. Murali Praveen, M.D. (Radiodiagnosis)",
  },
  {
    id: "RAD-2026-7714",
    uhid: "UHID-2026-8805",
    patientName: "Suresh Verma",
    age: 45,
    gender: "Male",
    procedureName: "CT Brain (Plain)",
    modality: "CT",
    orderedAt: "2026-08-08 11:30 AM",
    fee: 3500,
    status: "Pending",
    findings: "",
    impression: "",
    radiologist: "Dr. Murali Praveen, M.D. (Radiodiagnosis)",
  },
  {
    id: "RAD-2026-7715",
    uhid: "UHID-2026-8801",
    patientName: "Rajesh Kumar",
    age: 42,
    gender: "Male",
    procedureName: "MRI Lumbar Spine",
    modality: "MRI",
    orderedAt: "2026-08-08 12:00 PM",
    fee: 5500,
    status: "Pending",
    findings: "",
    impression: "",
    radiologist: "Dr. Murali Praveen, M.D. (Radiodiagnosis)",
  },
  {
    id: "RAD-2026-7716",
    uhid: "UHID-2026-8802",
    patientName: "Ananya Sharma",
    age: 29,
    gender: "Female",
    procedureName: "NT Scan (Nuchal Translucency)",
    modality: "USG",
    orderedAt: "2026-08-08 12:30 PM",
    fee: 1800,
    status: "Pending",
    findings: "",
    impression: "",
    radiologist: "Dr. Murali Praveen, M.D. (Radiodiagnosis)",
  },
];

const PROCEDURE_TEMPLATES_CHIPS = [
  "USG Whole Abdomen",
  "USG Pelvis (Transabdominal)",
  "Transvaginal Sonography (TVS)",
  "Early Pregnancy / Viability Scan",
  "NT Scan (Nuchal Translucency)",
  "Level II Anomaly Scan (TIFFA)",
  "Fetal Growth & Well-being Scan",
  "Follicular Tracking",
  "FAST / eFAST Scan",
  "POCUS (Point-of-Care Ultrasound)",
  "USG KUB (Kidney, Ureters, Bladder)",
  "USG Scrotum / Testes",
  "USG Thyroid / Neck",
  "USG Breast (Sonomammography)",
  "Doppler Studies (Arterial, Venous, Carotid, Renal, Obstetric)",
  "USG Other (manual entry)",
  "Chest PA View",
  "Abdomen (Plain)",
  "Cervical Spine",
  "Lumbar Spine",
  "Pelvis",
  "Skull",
  "Upper Limb (Hand, Forearm, Shoulder)",
  "Lower Limb (Knee, Ankle, Foot)",
  "X-Ray Other (manual entry)",
  "CT Brain (Plain/Contrast)",
  "CT Chest",
  "CT Abdomen & Pelvis",
  "CT KUB",
  "CT Angiography (Brain/Coronary/Peripheral)",
  "CT Spine (Cervical/Lumbar)",
  "CT Sinuses",
  "CT Other (manual entry)",
  "MRI Brain",
  "MRI Spine (Cervical/Lumbar)",
  "MRI Knee",
  "MRI Shoulder",
  "MRI Abdomen & Pelvis",
  "MRI Angiography",
  "MRI Breast",
  "MRI Other (manual entry)",
  "Upper GI Endoscopy (OGD)",
  "Diagnostic Colonoscopy",
  "Diagnostic Hysteroscopy",
  "Endoscopy Other (manual entry)",
];

export function Radiology() {
  const { account } = useAuth();
  const [studies, setStudies] = useState<RadiologyStudy[]>(INITIAL_STUDIES);
  const [selectedStudyId, setSelectedStudyId] = useState<string>(INITIAL_STUDIES[0].id);

  const selectedStudy = useMemo(() => {
    return studies.find((s) => s.id === selectedStudyId) || studies[0];
  }, [studies, selectedStudyId]);

  // Form Inputs
  const [findingsInput, setFindingsInput] = useState<string>(selectedStudy.findings);
  const [impressionInput, setImpressionInput] = useState<string>(selectedStudy.impression);
  const [scanImage, setScanImage] = useState<string | undefined>(selectedStudy.scanImageUrl);

  // Sync inputs on study switch
  useEffect(() => {
    setFindingsInput(selectedStudy.findings);
    setImpressionInput(selectedStudy.impression);
    setScanImage(selectedStudy.scanImageUrl);
  }, [selectedStudyId]);

  // Voice Dictation State
  const [isListening, setIsListening] = useState<boolean>(false);
  const [dictationTarget, setDictationTarget] = useState<"findings" | "impression" | "auto">("findings");
  const [liveTranscript, setLiveTranscript] = useState<string>("");
  const recognitionRef = useRef<any>(null);

  // Image Annotator Modal State
  const [annotatorOpen, setAnnotatorOpen] = useState(false);

  // OCR Loading
  const [ocrLoading, setOcrLoading] = useState(false);

  // Web Speech API Initialization
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-IN";

      recognition.onresult = (event: any) => {
        let current = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          current += event.results[i][0].transcript;
        }
        setLiveTranscript(current);

        if (event.results[event.results.length - 1].isFinal) {
          const finalizedText = standardizeRadiologyText(current.trim());
          if (dictationTarget === "findings") {
            setFindingsInput((prev) => (prev ? `${prev}\n${finalizedText}` : finalizedText));
          } else if (dictationTarget === "impression") {
            setImpressionInput((prev) => (prev ? `${prev}\n${finalizedText}` : finalizedText));
          } else {
            // Smart auto-parse: check if text contains "impression:" or "conclusion:"
            const lower = finalizedText.toLowerCase();
            if (lower.includes("impression:") || lower.includes("conclusion:")) {
              const parts = finalizedText.split(/impression:|conclusion:/i);
              if (parts[0].trim()) {
                setFindingsInput((prev) => (prev ? `${prev}\n${parts[0].trim()}` : parts[0].trim()));
              }
              if (parts[1]?.trim()) {
                setImpressionInput((prev) => (prev ? `${prev}\n${parts[1].trim()}` : parts[1].trim()));
              }
            } else {
              setFindingsInput((prev) => (prev ? `${prev}\n${finalizedText}` : finalizedText));
            }
          }
          setLiveTranscript("");
        }
      };

      recognition.onerror = () => {
        setIsListening(false);
      };
      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, [dictationTarget]);

  const handleToggleDictation = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      toast.info("Voice Scribe Stopped");
      return;
    }
    const recognition = recognitionRef.current;
    if (!recognition) {
      toast.error("Microphone did not start. Nothing was captured.");
      return;
    }
    try {
      recognition.start();
      setIsListening(true);
      toast.success(`Voice Scribe Listening (Target: ${dictationTarget.toUpperCase()})`);
    } catch {
      setIsListening(false);
      toast.error("Microphone did not start. Nothing was captured.");
    }
  };

  const handleApplyTemplate = (procName: string) => {
    const template = getTemplateForModality(procName, selectedStudy.modality);
    setFindingsInput(template.findings);
    setImpressionInput(template.impression);
    toast.success(`Loaded Template: ${procName}`);
  };

  const handleInsertSnippet = (snippet: string) => {
    if (dictationTarget === "findings") {
      setFindingsInput((prev) => (prev ? `${prev}\n${snippet}` : snippet));
    } else {
      setImpressionInput((prev) => (prev ? `${prev}\n${snippet}` : snippet));
    }
    toast.success(`Snippet inserted: "${snippet}"`);
  };

  const handleOCRHandwritten = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    toast.info("Handwritten OCR is not connected. The file was not read. Type the report yourself.");
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setScanImage(dataUrl);
      toast.success("Scan Image Frame Attached to Report");
    };
    reader.readAsDataURL(file);
  };

  const handleFinalizeReport = async () => {
    setStudies((prev) =>
      prev.map((s) =>
        s.id === selectedStudy.id
          ? {
              ...s,
              findings: findingsInput,
              impression: impressionInput,
              scanImageUrl: scanImage,
              status: "Finalized",
            }
          : s
      )
    );

    // R5-06 closed loop: radiology reports are image/PDF-only — no structured
    // values, so the server flags "critical check not possible - manual review"
    // and the ordering doctor is still notified. No result is missed.
    const submission = await submitResultReport({
      patientUhid: selectedStudy.uhid,
      patientName: selectedStudy.patientName,
      orderId: selectedStudy.id,
      testName: selectedStudy.procedureName,
      department: "radiology",
      pdfOnly: true,
      impression: impressionInput,
    });
    try { voiceEngine.speak(labVoiceLine("report_uploaded"), "en-IN"); } catch { /* best-effort */ }

    if (submission.ok && submission.criticalCheck?.manualReviewRequired) {
      toast.success(`Radiology Report for ${selectedStudy.patientName} Finalized!`, {
        description: "Demo study on this screen. Not a live result. Not sent.",
      });
    } else if (submission.ok) {
      toast.success(`Radiology Report for ${selectedStudy.patientName} Finalized!`, {
        description: "Demo study on this screen. Not a live result. It was not added to the Reception print queue.",
      });
    } else {
      toast.error("Demo study was not saved as a live result", { description: submission.error });
    }
  };

  const handlePrintReport = () => {
    HospitalPrintEngine.printRadiologyReport({
      patientName: selectedStudy.patientName,
      uhid: selectedStudy.uhid,
      age: selectedStudy.age,
      gender: selectedStudy.gender,
      modality: selectedStudy.modality,
      procedureName: selectedStudy.procedureName,
      doctorName: selectedStudy.radiologist,
      findings: findingsInput,
      impression: impressionInput,
    });
  };

  return (
    <div className="space-y-4 max-w-[1550px] mx-auto p-1 text-slate-100">
      {/* ---------------- 1. Workstation Header & Global Voice Controls ---------------- */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
            <ScanLine className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-white tracking-tight">
                Radiology, USG &amp; Endoscopy Workstation
              </h1>
              <Badge tone="cyan">Voice Scribe Active</Badge>
              <OrderStatusChip patientUhid={selectedStudy.uhid} role="radiology" />
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Perform ultrasound/CT/MRI scans, apply specialty report templates, use voice dictation, and route signed reports to Reception
            </p>
          </div>
        </div>

        {/* Global Voice Dictation Quick Toggle Button */}
        <button
          onClick={handleToggleDictation}
          className={`px-5 py-2.5 rounded-xl text-xs font-black shadow-lg flex items-center gap-2 transition-all active:scale-95 ${
            isListening
              ? "bg-rose-600 hover:bg-rose-500 text-white animate-pulse shadow-rose-900/50"
              : "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-900/40"
          }`}
        >
          {isListening ? (
            <>
              <MicOff className="w-4 h-4" /> Listening... Speak Findings
            </>
          ) : (
            <>
              <Mic className="w-4 h-4" /> Voice Dictate Findings
            </>
          )}
        </button>
      </div>

      {/* ---------------- 2. Main Workstation 2-Column Grid ---------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* LEFT COLUMN: Scan Queue (lg:col-span-4) */}
        <div className="lg:col-span-4 space-y-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-xl space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Search className="w-3.5 h-3.5 text-cyan-400" /> Scan Queue ({studies.length})
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-200 font-bold">Demo studies</span>
            </div>

            {/* Scrollable Patient Scan Cards List */}
            <div className="space-y-2.5 max-h-[640px] overflow-y-auto pr-1">
              {studies.map((s) => {
                const isSelected = s.id === selectedStudyId;
                return (
                  <div
                    key={s.id}
                    onClick={() => setSelectedStudyId(s.id)}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? "bg-slate-800 border-blue-500 shadow-lg shadow-blue-950/40"
                        : "bg-slate-950 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-start justify-between mb-1">
                      <strong className="text-xs font-bold text-white block">
                        {s.procedureName}
                      </strong>
                      <span
                        className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${
                          s.status === "Finalized"
                            ? "bg-emerald-500/20 text-emerald-300"
                            : "bg-amber-500/20 text-amber-300"
                        }`}
                      >
                        {s.status}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-300">
                      Patient: <span className="font-semibold text-white">{s.patientName}</span> ({s.age}Y / {s.gender})
                    </p>

                    <div className="flex items-center justify-between text-[10px] text-slate-400 mt-2 pt-1.5 border-t border-slate-800/80">
                      <span>Ordered: {s.orderedAt}</span>
                      <span className="font-mono font-bold text-cyan-300 text-[11px]">Fee: ${s.fee}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Radiologist Diagnostic Workspace (lg:col-span-8) */}
        <div className="lg:col-span-8 space-y-3">
          {/* Patient Header Box matching Screenshot */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 shadow-xl space-y-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="text-base font-bold text-white">{selectedStudy.patientName}</span>
                <span className="text-xs px-2.5 py-0.5 rounded-lg bg-cyan-500/20 text-cyan-300 font-mono font-bold">
                  {selectedStudy.uhid}
                </span>
              </div>
              <div className="text-right">
                <span className="text-sm font-bold text-cyan-300 font-mono">Fee: ${selectedStudy.fee}</span>
                <p className="text-[10px] text-slate-400">{selectedStudy.radiologist}</p>
              </div>
            </div>

            <div className="text-xs text-slate-300">
              Procedure: <span className="font-bold text-white">{selectedStudy.procedureName}</span> ({selectedStudy.modality})
            </div>

            {/* Specialty Procedure Template Selector */}
            <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400 fill-current" /> Load Pre-Built Structured Procedure Template:
                </span>
                <button
                  onClick={() => handleApplyTemplate(selectedStudy.procedureName)}
                  className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow transition-all"
                >
                  ✨ Auto-Fill {selectedStudy.procedureName} Template
                </button>
              </div>

              {/* Template Selection Chips matching Screenshot */}
              <div className="flex flex-wrap gap-1.5 max-h-[140px] overflow-y-auto pr-1">
                {PROCEDURE_TEMPLATES_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    onClick={() => handleApplyTemplate(chip)}
                    className="px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white text-[10px] font-semibold transition-all"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>

            {/* Voice Scribe Target Section & Controls */}
            <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-white flex items-center gap-1.5">
                  <Mic className="w-3.5 h-3.5 text-cyan-400" /> Voice Scribe Target Section:
                </span>
                <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                  <button
                    onClick={() => setDictationTarget("findings")}
                    className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                      dictationTarget === "findings" ? "bg-blue-600 text-white shadow" : "text-slate-400"
                    }`}
                  >
                    Findings
                  </button>
                  <button
                    onClick={() => setDictationTarget("impression")}
                    className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                      dictationTarget === "impression" ? "bg-blue-600 text-white shadow" : "text-slate-400"
                    }`}
                  >
                    Impression
                  </button>
                  <button
                    onClick={() => setDictationTarget("auto")}
                    className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                      dictationTarget === "auto" ? "bg-blue-600 text-white shadow" : "text-slate-400"
                    }`}
                  >
                    ⚡ Smart Auto-Parse
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleToggleDictation}
                  className={`px-4 py-2 rounded-xl text-xs font-bold shadow flex items-center gap-2 ${
                    isListening
                      ? "bg-rose-600 text-white animate-pulse"
                      : "bg-blue-600 hover:bg-blue-500 text-white"
                  }`}
                >
                  {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  {isListening
                    ? `Stop Scribe (${dictationTarget.toUpperCase()})`
                    : `Start Voice Dictation (${dictationTarget.toUpperCase()})`}
                </button>

                <div className="flex-1 min-w-0 text-xs text-slate-400 italic truncate">
                  {liveTranscript
                    ? `Live: "${liveTranscript}"`
                    : "Ready for speech input or quick snippet click..."}
                </div>
              </div>

              {/* Quick Radiology Snippets (1-Click Insertion) */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-800/80">
                <span className="text-[10px] text-slate-400 font-bold uppercase">Quick Snippets:</span>
                {[
                  { label: "+ Gallbladder calculus 6mm", text: "Gallbladder wall 2.2mm with solitary 6mm calculus." },
                  { label: "+ Grade 1 Fatty Liver", text: "Mild diffuse hyperechoic liver parenchyma consistent with Grade 1 Hepatic Steatosis." },
                  { label: "+ Normal Bilateral Kidneys", text: "Bilateral kidneys normal size, smooth contours, no hydronephrosis." },
                  { label: "+ Fetal Heart Rate 158bpm", text: "Single intrauterine fetus, active cardiac motion, FHR 158 bpm." },
                  { label: "+ Clear CT Neuro", text: "Symmetrical ventricles, intact calvarium, no acute hemorrhage or infarction." },
                ].map((snip, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleInsertSnippet(snip.text)}
                    className="px-2 py-0.5 rounded bg-slate-950 hover:bg-slate-800 border border-slate-800 text-[10px] text-cyan-300 font-semibold"
                  >
                    {snip.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Scan Frame & Handwritten Note OCR Section */}
            <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-white flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5 text-cyan-400" /> Scan Frame / Handwritten Note OCR Upload
                </span>
                <div className="flex items-center gap-2">
                  <label className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow flex items-center gap-1.5 cursor-pointer">
                    <Sparkles className="w-3.5 h-3.5" /> OCR Handwritten Note (GPT-4o Vision)
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleOCRHandwritten}
                      className="hidden"
                    />
                  </label>

                  <label className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
                    <Upload className="w-3.5 h-3.5" /> Upload DICOM / Frame
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* Displayed Image Frame Preview matching Screenshot */}
              {scanImage && (
                <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-slate-950 max-h-[260px] group">
                  <img
                    src={scanImage}
                    alt="Scan Frame"
                    className="w-full h-full object-cover max-h-[260px]"
                  />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <button
                      onClick={() => setAnnotatorOpen(true)}
                      className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-lg flex items-center gap-2"
                    >
                      <Layers className="w-4 h-4" /> Open Multimodal Image Annotator &amp; Vector Overlay
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Detailed Findings Textarea */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-slate-300">
                  Detailed Ultrasound / Endoscopy Findings
                </label>
                <button
                  onClick={() => {
                    setDictationTarget("findings");
                    handleToggleDictation();
                  }}
                  className="text-[10px] text-cyan-400 font-bold hover:underline flex items-center gap-1"
                >
                  🎙️ Dictate Into Findings
                </button>
              </div>
              <textarea
                value={findingsInput}
                onChange={(e) => setFindingsInput(e.target.value)}
                rows={5}
                className="w-full p-3 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white font-mono leading-relaxed focus:border-cyan-500"
                placeholder="Enter organ dimensions, echotextures, doppler waveforms..."
              />
            </div>

            {/* Radiology Impression Textarea */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-slate-300">
                  Radiology Impression &amp; Clinical Conclusion
                </label>
                <button
                  onClick={() => {
                    setDictationTarget("impression");
                    handleToggleDictation();
                  }}
                  className="text-[10px] text-cyan-400 font-bold hover:underline flex items-center gap-1"
                >
                  🎙️ Dictate Into Impression
                </button>
              </div>
              <textarea
                value={impressionInput}
                onChange={(e) => setImpressionInput(e.target.value)}
                rows={3}
                className="w-full p-3 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white font-mono leading-relaxed focus:border-cyan-500"
                placeholder="Enter numbered clinical impression (e.g. 1. Cholelithiasis with 6.2mm stone...)"
              />
            </div>

            {/* Finalize & Print Controls matching Screenshot */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-800">
              <button
                onClick={handlePrintReport}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold flex items-center justify-center gap-2 transition-all"
              >
                <Printer className="w-4 h-4" /> Preview Official Printable Report
              </button>

              <button
                onClick={handleFinalizeReport}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-2 transition-all active:scale-95"
              >
                <CheckCircle2 className="w-4 h-4" /> Finalize, Sign &amp; Dispatch to Reception Print Hub
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ---------------- 3. Multimodal Medical Image Annotator Modal ---------------- */}
      <MedicalImageAnnotatorModal
        isOpen={annotatorOpen}
        onClose={() => setAnnotatorOpen(false)}
        imageUrl={scanImage}
        patientName={selectedStudy.patientName}
        patientUhid={selectedStudy.uhid}
        procedureName={selectedStudy.procedureName}
        onSaveDerivative={(enhanced) => {
          setScanImage(enhanced);
          toast.success("Enhanced Scan Frame Saved to Study");
        }}
      />
    </div>
  );
}
