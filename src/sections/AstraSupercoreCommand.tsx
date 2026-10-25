// ============================================================================
// ASTRA AI - Unified Supercore + Clinical Command Center
// Merges: ASTRA Supercore (AI) + Clinical Command & Orders
// Features: Voice mic, conversation, clinical reasoning, order center
//            ASTRA AI copilot panel embedded inside supercore view
// ============================================================================
import React, { useState, useCallback, useEffect, useRef } from "react";
import { ClinicalCommandCenter } from "@/components/ClinicalCommand/ClinicalCommandCenter";
import { OrderCenterModal } from "@/components/CommandCenter/OrderCenterModal";
import { PrintableSlipModal } from "@/components/PrintableSlipModal";
import { initialPatients, initialLabOrders, initialRadiologyReports, initialPrescriptions } from "@/data/mockData";
import { initialUniversalOrders } from "@/components/CommandCenter/mockUniversalOrders";
import { Patient, LabOrder, RadiologyReport, Prescription } from "@/types";
import { AstraUniversalOrder } from "@/components/CommandCenter/universalOrderTypes";
import { toast } from "sonner";
import {
  Sparkles, Mic, Stethoscope, Brain, ClipboardList, Activity,
  Volume2, VolumeX, MicOff, Send, MessageSquare, X, ChevronDown,
  Loader2, Globe, Bot, RotateCcw
} from "lucide-react";
import { useVoicebox } from "../hooks/useVoicebox";
import { detectLanguageFromText, VoiceboxProfile } from "../utils/audioAlerts";
import { askDoctorEngine } from "@/services/doctorEngine";
import { looksLikePhi } from "@/astra/voice/providers/phiGate";


export type AstraAIState = "IDLE" | "LISTENING" | "THINKING" | "SPEAKING" | "INTERRUPTED";

export enum AI_MODEL_STATUS {
  READY = "AI_MODEL_READY",
  STANDBY = "AI_MODEL_STANDBY",
  WORKING = "AI_MODEL_WORKING",
  BUSY = "AI_MODEL_BUSY"
}

interface ChatMessage {
  id: string;
  sender: "doctor" | "astra";
  text: string;
  timestamp: string;
}

interface VoiceMessage {
  id: string;
  type: "speaking" | "listening";
  text: string;
  timestamp: string;
}

interface AstraAICopilotPanelProps {
  selectedPatient?: Patient | null;
  activeDept?: string;
  onOpenOrderCenter?: () => void;
}

const ASTRA_GREETING = "Good day, Doctor. I am ASTRA AI - your intelligent clinical assistant across all hospital dashboards. I understand and speak English, Telugu, Hindi, Tamil, and Kannada with auto-detection. How may I assist you today?";

const SUPERCORE_STATS = [
  { icon: Brain, label: "Active Patients", value: initialPatients.length, tone: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
  { icon: Stethoscope, label: "Active Orders", value: initialUniversalOrders.length + initialLabOrders.length, tone: "text-cyan-400", bg: "bg-cyan-500/10 border-cyan-500/20" },
  { icon: ClipboardList, label: "Pending Scripts", value: initialPrescriptions.length, tone: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/20" },
  { icon: Mic, label: "Voice Sessions", value: "Live", tone: "text-green-400", bg: "bg-green-500/10 border-green-500/20" }
];

const LAST_KNOWLEDGE_UPDATE = new Date().toLocaleString();



// ============================================================================
// ASTRA AI Voice & Conversation Panel (embedded) — keeps every JARVIS feature:
//   mic push-to-talk, text send, LLM streaming, voice speak-back, multilingual
//   auto-detect (EN / HI / TE / TA / KN), profile picker, conversation history.
// Rebranded from JARVIS to ASTRA AI. "jarvis" voice profile kept as alias.
// ============================================================================

export function AstraAICopilotPanel({
  selectedPatient,
  activeDept = "doctor",
  onOpenOrderCenter,
}: AstraAICopilotPanelProps) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [aiState, setAiState] = useState<AstraAIState>("IDLE");
  const [inputQuery, setInputQuery] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [language, setLanguage] = useState("en-IN");
  const [autoSpeakEnabled, setAutoSpeakEnabled] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedVoiceProfile, setSelectedVoiceProfile] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("astra_ai_voice_profile");
      if (saved && ["auto", "astra_ai", "jarvis", "male_voice", "female_voice_1", "female_voice_2"].includes(saved)) {
        return saved;
      }
    }
    return "astra_ai";
  });

  const recognitionRef = useRef<any>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const isRecordingRef = useRef(false);

  // Voicebox hook — maps "astra_ai" / "auto" / "jarvis" -> Voicebox "JARVIS" profile
  // (British male, Kokoro engine). "jarvis" alias kept for backward compatibility.
  const voicebox = useVoicebox({
    department: activeDept,
    mode: "copilot",
    overrideProfile:
      selectedVoiceProfile === "astra_ai" || selectedVoiceProfile === "auto" || selectedVoiceProfile === "jarvis"
        ? "jarvis"
        : (selectedVoiceProfile as VoiceboxProfile),
    clientId: "astra-ai-supercore",
  });

  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    {
      id: "welcome-1",
      sender: "astra",
      text: ASTRA_GREETING,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    if (!isMinimized) chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, isMinimized]);

  const handleSetVoiceProfile = (profile: VoiceboxProfile | "auto") => {
    setSelectedVoiceProfile(profile);
    if (typeof window !== "undefined") localStorage.setItem("astra_ai_voice_profile", profile);
  };

  // ---- Mic recording (JARVIS feature kept, rebranded to ASTRA AI) ----
  const startVoiceRecording = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setChatHistory((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          sender: "astra" as const,
          text: "Speech recognition is not supported in this browser. Please type your message.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
      return;
    }
    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = language;
    recognitionRef.current = recognition;
    setAiState("LISTENING");
    setIsRecording(true);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInputQuery(transcript);
      setIsRecording(false);
      setAiState("IDLE");
      handleSendMessage(transcript);
    };
    recognition.onerror = () => {
      setIsRecording(false);
      setAiState("IDLE");
    };
    recognition.onend = () => {
      setIsRecording(false);
      if (aiState === "LISTENING") setAiState("IDLE");
    };
    try {
      recognition.start();
    } catch {
      /* ignore */
    }
  }, [language, aiState]);

  const stopVoiceRecording = () => {
    try {
      recognitionRef.current?.stop();
    } catch {
      /* ignore */
    }
    setIsRecording(false);
    setAiState("IDLE");
  };

  // ---- Send / stream / speak-back (JARVIS feature kept, rebranded) ----
  const handleSendMessage = async (overrideText?: string) => {
    const text = (overrideText ?? inputQuery).trim();
    if (!text) return;
    setInputQuery("");
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      sender: "doctor" as const,
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setChatHistory((prev) => [...prev, userMsg]);
    setLoading(true);
    setAiState("THINKING");
    const aboutPatient = Boolean(selectedPatient && (looksLikePhi(text) || text.toLowerCase().includes(selectedPatient.name.toLowerCase())));
    const result = await askDoctorEngine(aboutPatient ? { text, patientName: selectedPatient?.name, uhid: selectedPatient?.uhid } : { text });
    const replyText = result.ok ? result.text : (result.error || "FreeLLM, OmniRoute, and Ollama did not answer");
    const astraMsg: ChatMessage = {
      id: `a-${Date.now()}`,
      sender: "astra" as const,
      text: replyText,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setChatHistory((prev) => [...prev, astraMsg]);
    setAiState("SPEAKING");
    setLoading(false);
    if (autoSpeakEnabled) speakMessage(astraMsg.id, replyText);
  };

  const speakMessage = (msgId: string, text: string) => {
    voicebox.stopSpeech();
    setAiState("SPEAKING");
    const detectedLang = detectLanguageFromText(text) || language;
    voicebox.speak(text, {
      profile: voicebox.resolveProfile(text),
      language: detectedLang,
      personality: true,
      onEnd: () => setAiState("IDLE"),
      onError: () => setAiState("IDLE"),
    });
  };

  const stopSpeaking = () => {
    voicebox.stopSpeech();
    setAiState("IDLE");
  };

  // ---- Minimized ASTRA AI launcher (floating orb) ----
  if (isMinimized) {
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <button
          onClick={() => setIsMinimized(false)}
          className="group flex items-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 shadow-xl shadow-amber-900/40 border border-amber-200/60 transition-all hover:scale-105 active:scale-95"
        >
          <Brain className="w-4 h-4 text-slate-950" />
          <span className="text-xs font-black tracking-wide">ASTRA AI</span>
          <span className="text-[9px] text-amber-900/80 font-medium">{aiState}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-amber-500/30 bg-slate-950/95 backdrop-blur-xl shadow-2xl shadow-amber-950/40 overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-3 py-2 bg-gradient-to-r from-amber-600/20 to-yellow-600/10 border-b border-amber-500/20">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-500 to-yellow-600 flex items-center justify-center">
            <Brain className="w-4 h-4 text-slate-950" />
          </div>
          <div>
            <div className="text-xs font-extrabold text-amber-300 tracking-wide">ASTRA AI</div>
            <div className="text-[9px] text-emerald-400 font-mono flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {aiState}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-amber-300"
            title="Voice settings"
          >
            <Volume2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setIsMinimized(true)}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
            title="Minimize"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Voice settings bar */}
      {isSettingsOpen && (
        <div className="shrink-0 px-3 py-2 bg-slate-900/80 border-b border-slate-700/50 space-y-2">
          <div className="text-[10px] text-slate-400 uppercase tracking-wide font-bold">Voice Profile</div>
          <div className="flex flex-wrap gap-1.5">
            {([
              ["auto", "Auto"],
              ["astra_ai", "ASTRA AI"],
              ["jarvis", "ASTRA Human (legacy profile id)"],
              ["male_voice", "Male"],
              ["female_voice_1", "Female 1"],
              ["female_voice_2", "Female 2"],
            ] as [VoiceboxProfile | "auto", string][]).map(([id, label]) => (
              <button
                key={id}
                onClick={() => handleSetVoiceProfile(id)}
                className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-all ${
                  selectedVoiceProfile === id
                    ? "bg-amber-500/20 text-amber-200 border-amber-400/40"
                    : "bg-slate-800 text-slate-400 border-slate-700 hover:border-amber-500/30"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-400">Auto-speak replies</span>
            <button
              onClick={() => setAutoSpeakEnabled(!autoSpeakEnabled)}
              className={`w-8 h-4 rounded-full transition-all ${autoSpeakEnabled ? "bg-emerald-500" : "bg-slate-700"}`}
            >
              <div
                className={`w-3 h-3 rounded-full bg-white transition-all ${autoSpeakEnabled ? "ml-4" : "ml-0.5"}`}
              />
            </button>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-400">Language</span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="bg-slate-800 text-slate-300 text-[10px] rounded border border-slate-700 px-1.5 py-0.5"
            >
              <option value="en-IN">English</option>
              <option value="hi-IN">Hindi</option>
              <option value="te-IN">Telugu</option>
              <option value="ta-IN">Tamil</option>
              <option value="kn-IN">Kannada</option>
            </select>
          </div>
        </div>
      )}

      {/* Conversation history */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-[200px] max-h-[360px]">
        {chatHistory.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.sender === "doctor" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-[11px] leading-relaxed ${
                msg.sender === "doctor"
                  ? "bg-cyan-600 text-white rounded-br-none"
                  : "bg-slate-800 text-slate-200 border border-slate-700/50 rounded-bl-none"
              }`}
            >
              {msg.sender === "astra" && (
                <div className="text-[9px] text-amber-400 font-bold mb-0.5">ASTRA AI</div>
              )}
              <div className="whitespace-pre-wrap">{msg.text}</div>
              <div className="flex items-center justify-between mt-1 gap-2">
                <span className="text-[8px] text-slate-500">{msg.timestamp}</span>
                {msg.sender === "astra" && (
                  <button
                    onClick={() => speakMessage(msg.id, msg.text)}
                    className="text-amber-400 hover:text-amber-300"
                    title="Replay voice"
                  >
                    <Volume2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-slate-800 rounded-2xl px-3 py-2 text-[11px] text-slate-400 border border-slate-700/50">
              <span className="animate-pulse">ASTRA AI is thinking...</span>
            </div>
          </div>
        )}
        <div ref={chatBottomRef} />
      </div>

      {/* Input bar */}
      <div className="shrink-0 p-2 border-t border-slate-700/50 bg-slate-900/60">
        {selectedPatient && (
          <div className="text-[9px] text-slate-500 mb-1 font-mono">
            Patient: {selectedPatient.name} ({selectedPatient.bedNumber})
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <button
            onClick={isRecording ? stopVoiceRecording : startVoiceRecording}
            className={`p-2 rounded-xl border transition-all ${
              isRecording
                ? "bg-rose-600 text-white border-rose-500 animate-pulse"
                : "bg-slate-800 text-slate-300 border-slate-700 hover:border-amber-500/40 hover:text-amber-300"
            }`}
            title={isRecording ? "Stop recording" : "Speak (mic)"}
          >
            {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
          <input
            type="text"
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
            placeholder="Ask ASTRA AI anything..."
            className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
          />
          <button
            onClick={() => handleSendMessage()}
            disabled={!inputQuery.trim() || loading}
            className="p-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white transition-all"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}


// ============================================================================
// Unified Supercore + Clinical Orders workspace. The tabs are working modes
// inside one command surface, not separate dashboards.
// ============================================================================
type ActiveView = "supercore" | "clinical" | "conversation";

export function AstraSupercoreCommand() {
  const [activeView, setActiveView] = useState<ActiveView>("supercore");
  const [patients, setPatients] = useState<Patient[]>(initialPatients);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(initialPatients[0] ?? null);
  const [labOrders, setLabOrders] = useState<LabOrder[]>(initialLabOrders);
  const [radiologyReports, setRadiologyReports] = useState<RadiologyReport[]>(initialRadiologyReports);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>(initialPrescriptions);
  const [universalOrders, setUniversalOrders] = useState<AstraUniversalOrder[]>(initialUniversalOrders);
  const [isOrderCenterOpen, setIsOrderCenterOpen] = useState(false);
  const [printModalState, setPrintModalState] = useState<{ isOpen: boolean; documentType: any; data: any }>({
    isOpen: false,
    documentType: "op_slip",
    data: initialPatients[0],
  });

  const handleSelectPatient = (patient: Patient) => setSelectedPatient(patient);

  const handleAddLabOrder = (order: LabOrder) => {
    setLabOrders((prev) => [order, ...prev]);
    toast.info(`Lab order "${order.testName}" kept on this screen only for ${order.patientName}. Not sent to the lab worklist.`);
  };

  const handleAddPrescription = (rx: Prescription) => {
    setPrescriptions((prev) => [rx, ...prev]);
    toast.info(`Prescription draft (${rx.medicines.length} meds) kept on this screen for ${rx.patientName}. Not sent to pharmacy.`);
  };

  const handleUpdatePatientDx = (uhid: string, dx: string) => {
    setPatients((prev) => prev.map((p) => (p.uhid === uhid ? { ...p, diagnosis: dx, chiefComplaints: dx } : p)));
    toast.info("Diagnosis updated on this screen only. Not written to the hospital EMR.");
  };

  const handleConfirmUniversalOrder = (draft: any): AstraUniversalOrder | null => {
    if (!draft.patientUhid && !selectedPatient?.uhid) {
      toast.error("No patient selected. Please select a patient before confirming an order.");
      return null;
    }
    const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const newOrder: AstraUniversalOrder = {
      orderId: `ORD-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      patientUhid: draft.patientUhid || selectedPatient!.uhid,
      patientName: draft.patientName || selectedPatient?.name || "Unknown Patient",
      bedNumber: draft.bedNumber || selectedPatient?.bedNumber || "OPD Desk",
      orderType: draft.orderType || "LABORATORY",
      itemSummary: draft.orderDescription || draft.itemSummary || "Clinical Order",
      category: draft.orderCategory || "General",
      priority: draft.priority || "ROUTINE",
      destinationDept: draft.targetDepartment || "Laboratory Workstation",
      orderingDoctor: "Dr. Murali Praveen, M.D.",
      createdAt: now,
      status: "DRAFT",
      closedLoopProgress: 0,
      timelineEvents: [
        {
          id: `t-${Date.now()}`,
          timestamp: now,
          event: "Local demo order saved on this screen only (not sent to a department)",
          actor: "Dr. Murali Praveen",
          dept: "Doctor Console",
        },
      ],
    };
    setUniversalOrders((prev) => [newOrder, ...prev]);
    toast.info(`Local demo order ${newOrder.orderId} kept on this screen. Not dispatched to ${newOrder.destinationDept}.`);
    return newOrder;
  };

  const handleOpenPrintModal = (documentType: any, data: any) =>
    setPrintModalState({ isOpen: true, documentType, data });

  return (
    <div className="flex flex-col h-full min-h-0 gap-3">
      <div className="shrink-0 rounded-2xl border border-amber-400/20 bg-gradient-to-r from-slate-950 via-amber-950/10 to-cyan-950/20 p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div><p className="text-[9px] font-bold uppercase tracking-[0.22em] text-amber-400">ONE CLINICAL INTELLIGENCE WORKSPACE</p><h1 className="text-sm font-black text-white">ASTRA Supercore · Clinical Command · Closed-Loop Orders</h1></div>
          <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-[10px] font-bold text-emerald-300">Demo workspace · local orders only</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
        {(
          [
            { id: "supercore", label: "Intelligence & Patient Context", icon: Sparkles, tone: "bg-amber-500/20 text-amber-200 border-amber-400/40" },
            { id: "clinical", label: "Clinical Workbench & Orders", icon: Stethoscope, tone: "bg-cyan-500/20 text-cyan-200 border-cyan-400/40" },
            { id: "conversation", label: "Astra Conversation", icon: MessageSquare, tone: "bg-purple-500/20 text-purple-200 border-purple-400/40" },
          ] as const
        ).map(({ id, label, icon: Icon, tone }) => (
          <button
            key={id}
            onClick={() => setActiveView(id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 border transition-all ${
              activeView === id ? `${tone} shadow-md scale-[1.02]` : "bg-slate-800/60 text-slate-400 border-slate-700/40 hover:text-amber-200 hover:border-amber-500/30"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
        </div>
      </div>

      <p data-testid="supercore-demo-banner" className="mt-2 text-[10px] font-semibold text-amber-200/90">Demo patients and local order lists. Not live hospital EMR sync.</p>

      {/* TAB 1: Supercore (AI) — command stats + embedded ASTRA AI voice panel */}
      {activeView === "supercore" && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            {SUPERCORE_STATS.map(({ icon: Icon, label, value, tone, bg }) => (
              <div key={label} className={`rounded-xl border p-3 ${bg}`}>
                <div className={`flex items-center gap-2 text-[11px] font-bold ${tone}`}>
                  <Icon className="w-4 h-4" />
                  {label}
                </div>
                <div className="text-xl font-black text-white mt-1">{value}</div>
              </div>
            ))}
          </div>
          <AstraAICopilotPanel
            selectedPatient={selectedPatient}
            activeDept="doctor"
            onOpenOrderCenter={() => {
              setActiveView("clinical");
              setIsOrderCenterOpen(true);
            }}
          />
        </div>
      )}

      {/* TAB 2: Clinical Command & Orders (Orders Hub merged here) */}
      {activeView === "clinical" && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <ClinicalCommandCenter
            patients={patients}
            selectedPatient={selectedPatient}
            onSelectPatient={handleSelectPatient}
            labOrders={labOrders}
            radiologyReports={radiologyReports}
            prescriptions={prescriptions}
            universalOrders={universalOrders}
            onAddLabOrder={handleAddLabOrder}
            onAddPrescription={handleAddPrescription}
            onUpdatePatientDx={handleUpdatePatientDx}
            onConfirmUniversalOrder={handleConfirmUniversalOrder}
            onOpenOrderCenter={() => setIsOrderCenterOpen(true)}
            onOpenPrintModal={handleOpenPrintModal}
          />
        </div>
      )}

      {/* TAB 3: ASTRA AI Conversation — full voice + chat focus */}
      {activeView === "conversation" && (
        <div className="flex-1 min-h-0 overflow-y-auto flex justify-center">
          <div className="w-full max-w-2xl">
            <AstraAICopilotPanel selectedPatient={selectedPatient} activeDept="doctor" />
          </div>
        </div>
      )}

      {/* Orders Hub modal (closed-loop universal order tracking) */}
      <OrderCenterModal
        isOpen={isOrderCenterOpen}
        onClose={() => setIsOrderCenterOpen(false)}
        orders={universalOrders}
      />

      {/* Printable slip modal (OP slip / lab / radiology / prescription) */}
      <PrintableSlipModal
        isOpen={printModalState.isOpen}
        onClose={() => setPrintModalState((p) => ({ ...p, isOpen: false }))}
        documentType={printModalState.documentType}
        data={printModalState.data}
      />
    </div>
  );
}
