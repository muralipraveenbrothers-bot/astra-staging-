// ASTRA AI — Doctor Command Centre / Clinical Command OS v1.0
import React, { useState, useRef, useEffect } from "react";
import {
  MessageSquare, Plus, Search, Pin, Edit3, Trash2, Mic, MicOff, Send,
  User, Stethoscope, FileText, Phone, Printer, Sparkles, SlidersHorizontal, ChevronRight,
  ShieldCheck, AlertTriangle, Layers, BookOpen, Bot, CheckCircle2, RefreshCw, X, ShieldAlert,
  Sliders, Cpu, Activity, Clock, HeartPulse, Pill
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/services/apiFetch";
import { askDoctorEngine, speakDoctorLine } from "@/services/doctorEngine";
import { looksLikePhi } from "@/astra/voice/providers/phiGate";
import { skillRegistry } from "@/lib/skills/skillRegistry";
import { ReflexBrainPanel } from "@/astra/reflex/ReflexBrainPanel";
import { AgentOperationsBoard } from "@/astra/agentops/AgentOperationsBoard";
import { AstraDoctorPanel } from "@/astra/agentops/AstraDoctorPanel";
import { MorningBriefCard } from "@/astra/agentops/MorningBriefCard";
import {
  PatientSnapshotCard, DoctorOrderCard, PrintJobCard, CallCard, DoctorApprovalCard, type PatientSnapshotData
} from "./ClinicalCards";

type ReasoningMode = "fast" | "standard" | "high" | "deep_clinical";

interface ChatMessage {
  id: string;
  sender: "user" | "astra";
  text: string;
  timestamp: string;
  reasoningStatus?: string;
  cardType?: "patient_snapshot" | "doctor_order" | "print_job" | "call_panel" | "doctor_approval";
  cardData?: any;
  engine?: string;
  voice?: string;
}

interface ChatSession {
  id: string;
  title: string;
  department: string;
  patientUhid?: string;
  pinned: boolean;
  date: string;
}

export function DoctorCommandOS() {
  const [sessions, setSessions] = useState<ChatSession[]>([
    { id: "s-1", title: "Bed 1 Review & Repeat CBC", department: "Ward 2", patientUhid: "UHID-2026-8841", pinned: true, date: "Today 09:42 AM" },
    { id: "s-2", title: "Ramaraju Follow-up & OPD Note", department: "OPD", patientUhid: "UHID-2026-1042", pinned: false, date: "Today 08:30 AM" },
    { id: "s-3", title: "ICU Morning Rounds & Vitals Check", department: "ICU", pinned: false, date: "Yesterday 07:15 PM" },
  ]);

  const [activeSessionId, setActiveSessionId] = useState<string>("s-1");
  const [searchQuery, setSearchQuery] = useState("");
  const [reasoningMode, setReasoningMode] = useState<ReasoningMode>("standard");

  // Context Chips State
  const [activeWard, setActiveWard] = useState<string>("General Ward 2");
  const [activeBed, setActiveBed] = useState<string>("Bed 1");
  const [activePatient, setActivePatient] = useState<PatientSnapshotData | null>({
    id: "p-101",
    uhid: "UHID-2026-8841",
    ipNumber: "IP-2026-4421",
    name: "Ramesh Kumar",
    age: 45,
    gender: "Male",
    ward: "General Ward 2",
    bed: "Bed 1",
    consultant: "Dr. Murali Praveen",
    admissionDate: "2026-09-08T10:30:00Z",
    diagnosis: "Acute Exacerbation COPD / Lower Lobe Pneumonia",
    vitals: { hr: 84, bp: "124/80", temp: "98.6°F", spo2: 98, rr: 18 },
    allergies: ["Penicillin"],
    latestLabs: [
      { test: "Hb", value: "12.4 g/dL", status: "NORMAL" },
      { test: "WBC", value: "11,800 /mm³", status: "ELEVATED" },
      { test: "Creatinine", value: "0.9 mg/dL", status: "NORMAL" },
      { test: "Potassium", value: "4.2 mmol/L", status: "NORMAL" },
    ],
    activeMeds: ["Tab Augmentin 625mg BD", "Neb Duolin t.d.s", "Inj Hydrocortisone 100mg IV"],
    pendingOrders: ["Repeat CBC tomorrow 7 AM"],
  });

  // Chat Trajectory Messages
  const [voiceEngine, setVoiceEngine] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "m-1",
      sender: "astra",
      text: "Good morning, Doctor. I am connected to Astra AI Operating System. How can I assist you with ward rounds, orders, or dictation?",
      timestamp: "09:40 AM",
    },
    {
      id: "m-2",
      sender: "user",
      text: "Astra, show Bed 1 patient status.",
      timestamp: "09:41 AM",
    },
    {
      id: "m-3",
      sender: "astra",
      text: "Resolved Ward: General Ward 2 → Bed 1. Active admission found for Ramesh Kumar (IP-2026-4421). Rendered Patient Snapshot Card below:",
      timestamp: "09:41 AM",
      cardType: "patient_snapshot",
      cardData: {
        id: "p-101",
        uhid: "UHID-2026-8841",
        ipNumber: "IP-2026-4421",
        name: "Ramesh Kumar",
        age: 45,
        gender: "Male",
        ward: "General Ward 2",
        bed: "Bed 1",
        consultant: "Dr. Murali Praveen",
        admissionDate: "2026-09-08T10:30:00Z",
        diagnosis: "Acute Exacerbation COPD / Lower Lobe Pneumonia",
        vitals: { hr: 84, bp: "124/80", temp: "98.6°F", spo2: 98, rr: 18 },
        allergies: ["Penicillin"],
        latestLabs: [
          { test: "Hb", value: "12.4 g/dL", status: "NORMAL" },
          { test: "WBC", value: "11,800 /mm³", status: "ELEVATED" },
          { test: "Creatinine", value: "0.9 mg/dL", status: "NORMAL" },
          { test: "Potassium", value: "4.2 mmol/L", status: "NORMAL" },
        ],
        activeMeds: ["Tab Augmentin 625mg BD", "Neb Duolin t.d.s", "Inj Hydrocortisone 100mg IV"],
        pendingOrders: ["Repeat CBC tomorrow 7 AM"],
      },
    },
  ]);

  const [inputVal, setInputVal] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [dictationActive, setDictationActive] = useState(false);
  const [activeCall, setActiveCall] = useState<any>(null);

  // Clinical Dictation OPD Form State
  const [opdForm, setOpdForm] = useState({
    chiefComplaints: "35y male, fever 4 days, cough 2 days, no breathlessness",
    vitals: "Temp 101°F, HR 98 bpm, SpO2 97% RA",
    examination: "Bilateral chest coarse crepitations, abdomen soft",
    differential: "Viral Upper Respiratory Tract Infection vs Early Bronchitis",
    provisionalDx: "Acute Bronchitis",
    orders: "Tab Paracetamol 650mg t.d.s, Steam Inhalation BD",
    status: "DRAFT — REVIEW REQUIRED",
  });

  const chatEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    let live = true;
    void speakDoctorLine("Ready", false).then((voice) => {
      if (live) setVoiceEngine(voice);
    });
    return () => {
      live = false;
    };
  }, []);

  // Handle Command Submission
  const handleSend = async () => {
    if (!inputVal.trim()) return;
    const userText = inputVal.trim();
    setInputVal("");

    const userMsg: ChatMessage = {
      id: `m-${Date.now()}`,
      sender: "user",
      text: userText,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);

    // Intent Resolution Simulation
    const lower = userText.toLowerCase();

    if (lower.includes("bed 1") || lower.includes("show bed 1")) {
      const { result } = await skillRegistry.execute("ward.bed_status", { bedNumber: "Bed 1" });
      setMessages((prev) => [
        ...prev,
        {
          id: `m-${Date.now()}`,
          sender: "astra",
          text: `Resolved Ward Context: ${result.ward} → Bed ${result.resolvedBed}. Active Admission: ${result.patient.name} (${result.patient.ipNumber}).`,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          cardType: "patient_snapshot",
          cardData: result.patient,
        },
      ]);
    } else if (lower.includes("order cbc") || lower.includes("cbc")) {
      const { result } = await skillRegistry.execute("lab.order", {
        patientId: activePatient?.id || "p-101",
        tests: ["CBC", "CRP"],
        priority: "routine",
      });
      setMessages((prev) => [
        ...prev,
        {
          id: `m-${Date.now()}`,
          sender: "astra",
          text: result.message,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          cardType: "doctor_order",
          cardData: {
            orderId: result.orderId,
            tests: result.tests,
            priority: result.priority,
            patientName: activePatient?.name || "Ramesh Kumar",
            status: result.status,
            message: result.message,
          },
        },
      ]);
    } else if (lower.includes("print op") || lower.includes("print")) {
      const { result } = await skillRegistry.execute("opd.print", {
        encounterId: "ENC-2026-9912",
        patientName: activePatient?.name || "Ramesh Kumar",
      });
      setMessages((prev) => [
        ...prev,
        {
          id: `m-${Date.now()}`,
          sender: "astra",
          text: result.message,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          cardType: "print_job",
          cardData: {
            jobId: result.printJobId,
            printer: result.printer,
            status: result.status,
            timestamp: result.timestamp,
            message: result.message,
          },
        },
      ]);
    } else if (lower.includes("prescribe") || lower.includes("ceftriaxone") || lower.includes("start") || lower.includes("medication") || lower.includes("discharge")) {
      if (!activePatient?.uhid) {
        setMessages((prev) => [
          ...prev,
          {
            id: `m-${Date.now()}`,
            sender: "astra",
            text: "⚠️ No patient selected. Please select a patient before placing a clinical order.",
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          },
        ]);
        return;
      }
      try {
        const stageRes = await apiFetch("/api/clinical/action/stage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actionType: lower.includes("discharge") ? "admission.discharge" : "medication.order",
            targetQueryKey: activePatient.uhid,
            payload: {
              drugName: lower.includes("ceftriaxone") ? "Ceftriaxone" : "Paracetamol",
              doseValue: 1000,
              doseUnit: "mg",
              route: "IV",
              frequency: "BD",
              instructions: userText,
            },
            doctorId: "doc-01",
            doctorRole: "Doctor",
          }),
        }).then((r) => r.json());

        if (!stageRes.ok) {
          setMessages((prev) => [
            ...prev,
            {
              id: `m-${Date.now()}`,
              sender: "astra",
              text: `⚠️ Action Refused by Grounded Safety Engine: ${stageRes.error}`,
              timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            },
          ]);
          return;
        }

        const stagedAction = stageRes.stagedAction;
        const support = await askDoctorEngine({
          text: userText,
          patientName: activePatient.name,
          uhid: activePatient.uhid,
          diagnosis: activePatient.diagnosis,
          note: userText,
        });
        const supportVoice = await speakDoctorLine(support.text || "Order staged.", true);
        setVoiceEngine(supportVoice);
        setMessages((prev) => [
          ...prev,
          {
            id: `m-${Date.now()}`,
            sender: "astra",
            text: `Staged clinical action for ${stagedAction.groundedRef.data.name} (${stagedAction.groundedRef.data.uhid}). Authenticated doctor review & signature required.` + (support.text ? `\n\n${support.text}` : support.error ? `\n\n${support.error}` : ""),
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            engine: support.engine,
            voice: supportVoice,
            cardType: "doctor_approval",
            cardData: {
              actionId: stagedAction.actionId,
              actionHash: stagedAction.actionHash,
              actionType: stagedAction.actionType,
              patientName: stagedAction.groundedRef.data.name,
              uhid: stagedAction.groundedRef.data.uhid,
              wardBed: `${stagedAction.contextLock.wardId} / ${stagedAction.contextLock.bedId}`,
              payloadSummary: `${stagedAction.proposedPayload.drugName} ${stagedAction.proposedPayload.doseValue}${stagedAction.proposedPayload.doseUnit} ${stagedAction.proposedPayload.route} (${stagedAction.proposedPayload.frequency})`,
              riskTier: stagedAction.riskTier,
            },
          },
        ]);
      } catch (e: any) {
        console.error(e);
      }
    } else if (lower.includes("call ward") || lower.includes("call")) {
      const { result } = await skillRegistry.execute("communication.call", {
        targetDepartment: "General Ward 2",
      });
      setActiveCall(result);
      setMessages((prev) => [
        ...prev,
        {
          id: `m-${Date.now()}`,
          sender: "astra",
          text: result.message,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          cardType: "call_panel",
          cardData: result,
        },
      ]);
    } else {
      const patientish = looksLikePhi(userText);
      const answer = await askDoctorEngine({
        text: userText,
        ...(patientish
          ? { patientName: activePatient?.name, uhid: activePatient?.uhid, diagnosis: activePatient?.diagnosis, note: userText }
          : {}),
      });
      const voice = await speakDoctorLine(answer.text || "No engine answered.", answer.localOnly || patientish);
      setVoiceEngine(voice);
      setMessages((prev) => [
        ...prev,
        {
          id: `m-${Date.now()}`,
          sender: "astra",
          text: answer.ok ? answer.text : `No engine answered. ${answer.error ?? ""}`.trim(),
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          engine: answer.engine,
          voice,
        },
      ]);
    }
  };

  return (
    <div className="flex h-full w-full bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* ── A. LEFT SIDEBAR ─────────────────────────────────────────────────── */}
      <aside className="w-64 border-r border-slate-800 bg-slate-900/60 flex flex-col h-full shrink-0">
        {/* Header Logo */}
        <div className="p-3.5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-300 font-bold">
              ⚡
            </div>
            <div>
              <span className="font-bold text-xs tracking-wider text-cyan-200 block">ASTRA AI</span>
              <span className="text-[9px] text-slate-400 font-mono">Clinical Command OS</span>
            </div>
          </div>
          <span className="text-[9px] font-semibold text-cyan-200">{voiceEngine && voiceEngine !== "none" ? `Voice: ${voiceEngine}` : "Voice: idle"}</span>
        </div>

        {/* New Chat Button */}
        <div className="p-2.5">
          <button onClick={() => {
            const newId = `s-${Date.now()}`;
            setSessions(prev => [{ id: newId, title: "New Clinical Consultation", department: "OPD", pinned: false, date: "Just now" }, ...prev]);
            setActiveSessionId(newId);
          }}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-500/40 text-xs font-bold transition-all shadow-md">
            <Plus size={14} /> New Command / Chat
          </button>
        </div>

        {/* Conversation Search */}
        <div className="px-2.5 mb-2">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-2.5 text-slate-500" />
            <input type="text" placeholder="Search chats, UHID, ward..."
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-md pl-8 pr-2 py-1.5 text-[11px] text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50" />
          </div>
        </div>

        {/* Navigation Shortcuts */}
        <div className="px-2.5 py-1 text-[9px] font-bold text-slate-500 uppercase tracking-wider">Clinical Modules</div>
        <nav className="px-2 space-y-0.5 max-h-36 overflow-y-auto">
          {[
            { id: "cmd", name: "Clinical Command", icon: Activity, active: true },
            { id: "timeline", name: "Patient Timeline", icon: FileText },
            { id: "opd", name: "OPD Dictation", icon: Stethoscope },
            { id: "ward", name: "IP & Wards", icon: User },
            { id: "icu", name: "ICU Monitor", icon: HeartPulse },
            { id: "lab", name: "Laboratory", icon: Layers },
            { id: "pharmacy", name: "Pharmacy", icon: Pill },
            { id: "printing", name: "Reception Print Bus", icon: Printer },
          ].map((item) => (
            <button key={item.id}
              className={cn("w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px] font-semibold transition-all",
                item.active ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30" : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200")}>
              <item.icon size={13} className="text-cyan-400" />
              <span>{item.name}</span>
            </button>
          ))}
        </nav>

        {/* Chat History List */}
        <div className="px-2.5 pt-3 pb-1 text-[9px] font-bold text-slate-500 uppercase tracking-wider flex justify-between items-center">
          <span>Recent Conversations</span>
          <span className="font-mono text-[9px] text-cyan-400">{sessions.length}</span>
        </div>
        <div className="flex-1 overflow-y-auto px-2 space-y-1">
          {sessions.map((s) => {
            const active = activeSessionId === s.id;
            return (
              <div key={s.id} onClick={() => setActiveSessionId(s.id)}
                className={cn("group flex flex-col p-2 rounded-lg cursor-pointer transition-all border text-left",
                  active ? "bg-slate-800/90 border-cyan-500/40 text-slate-100 shadow-md" : "bg-slate-950/40 border-slate-800/60 text-slate-400 hover:bg-slate-800/40 hover:text-slate-200")}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold truncate flex-1">{s.title}</span>
                  {s.pinned && <Pin size={10} className="text-amber-400 shrink-0 ml-1" />}
                </div>
                <div className="flex items-center justify-between text-[9px] text-slate-500 mt-1">
                  <span className="px-1 bg-slate-900 rounded border border-slate-800 text-cyan-300 font-mono">{s.department}</span>
                  <span>{s.date}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Settings */}
        <div className="p-2.5 border-t border-slate-800 text-[10px] font-mono text-slate-500 flex justify-between items-center">
          <span className="flex items-center gap-1"><ShieldCheck size={12} className="text-emerald-400" /> RBAC Authorized</span>
          <span>Dr. Murali</span>
        </div>
      </aside>

      {/* ── B. MAIN CHAT / COMMAND AREA ────────────────────────────────────── */}
      <main className="flex-1 flex flex-col h-full bg-slate-950 relative min-w-0">

        {/* Top Header & Active Context Bar */}
        <header className="p-3 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Bot size={16} className="text-cyan-400" /> DOCTOR COMMAND CENTRE
            </div>
            {/* Active Context Chips */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-mono bg-cyan-950/80 text-cyan-300 border border-cyan-500/40 px-2 py-0.5 rounded-full flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                Ward: {activeWard}
              </span>
              <span className="text-[10px] font-mono bg-purple-950/80 text-purple-300 border border-purple-500/40 px-2 py-0.5 rounded-full">
                Bed: {activeBed}
              </span>
              {activePatient && (
                <span className="text-[10px] font-mono bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 px-2.5 py-0.5 rounded-full font-bold">
                  Patient: {activePatient.name} ({activePatient.ipNumber})
                </span>
              )}
            </div>
          </div>

          {/* Reasoning Mode Selector */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
            <span className="text-[9px] font-bold text-slate-500 px-1 uppercase">Reasoning:</span>
            {(["fast", "standard", "high", "deep_clinical"] as ReasoningMode[]).map((mode) => (
              <button key={mode} onClick={() => setReasoningMode(mode)}
                className={cn("px-2 py-0.5 rounded text-[9px] font-bold uppercase transition-all",
                  reasoningMode === mode
                    ? mode === "deep_clinical" ? "bg-rose-500/20 text-rose-300 border border-rose-500/50 shadow" : "bg-cyan-500/20 text-cyan-200 border border-cyan-500/40"
                    : "text-slate-400 hover:text-slate-200")}>
                {mode.replace("_", " ")}
              </button>
            ))}
          </div>
        </header>

        {/* Active Call Panel (if initiated) */}
        {activeCall && (
          <div className="p-2 bg-purple-950/40 border-b border-purple-500/40">
            <CallCard channelId={activeCall.channelId} target={activeCall.target} callType={activeCall.callType} status={activeCall.status} onHangup={() => setActiveCall(null)} />
          </div>
        )}

        {/* Main Conversation Canvas */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((m) => (
            <div key={m.id} className={cn("flex flex-col max-w-3xl", m.sender === "user" ? "ml-auto items-end" : "mr-auto items-start")}>
              <div className="flex items-center gap-1.5 text-[9px] font-mono text-slate-500 mb-1">
                <span>{m.sender === "user" ? "You (Dr. Murali)" : "Astra Clinical OS"}</span>
                <span>·</span>
                <span>{m.timestamp}</span>
              </div>
              <div className={cn("p-3.5 rounded-2xl text-xs leading-relaxed shadow-lg",
                m.sender === "user"
                  ? "bg-cyan-600 text-white rounded-tr-none font-medium"
                  : "bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none")}>
                {m.text}
                {m.sender === "astra" && (m.engine || m.voice) && (
                  <div className="mt-2 text-[10px] font-semibold text-cyan-200">
                    {m.engine ? `Engine: ${m.engine}` : ""}
                    {m.engine && m.voice ? " · " : ""}
                    {m.voice && m.voice !== "none" ? `Voice: ${m.voice}` : ""}
                  </div>
                )}
              </div>

              {/* Render Structured Cards if attached */}
              {m.cardType === "patient_snapshot" && m.cardData && (
                <div className="w-full max-w-xl">
                  <PatientSnapshotCard data={m.cardData} onAction={(action) => {
                    if (action === "order_lab") setInputVal("Order CBC and RFT for Ramesh Kumar");
                    else if (action === "call_ward") setInputVal("Call Ward 2");
                  }} />
                </div>
              )}
              {m.cardType === "doctor_order" && m.cardData && (
                <div className="w-full max-w-lg">
                  <DoctorOrderCard orderId={m.cardData.orderId} tests={m.cardData.tests} priority={m.cardData.priority} patientName={m.cardData.patientName} status={m.cardData.status} message={m.cardData.message} />
                </div>
              )}
              {m.cardType === "print_job" && m.cardData && (
                <div className="w-full max-w-lg">
                  <PrintJobCard jobId={m.cardData.jobId} printer={m.cardData.printer} status={m.cardData.status} timestamp={m.cardData.timestamp} message={m.cardData.message} />
                </div>
              )}
              {m.cardType === "doctor_approval" && m.cardData && (
                <div className="w-full max-w-xl">
                  <DoctorApprovalCard
                    actionId={m.cardData.actionId}
                    actionHash={m.cardData.actionHash}
                    actionType={m.cardData.actionType}
                    patientName={m.cardData.patientName}
                    uhid={m.cardData.uhid}
                    wardBed={m.cardData.wardBed}
                    payloadSummary={m.cardData.payloadSummary}
                    riskTier={m.cardData.riskTier}
                    onSignApprove={async (actId, hash) => {
                      try {
                        const signRes = await apiFetch("/api/clinical/approval/sign", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ actionId: actId, actionHash: hash, doctorId: "doc-01", role: "Doctor" }),
                        }).then((r) => r.json());

                        if (!signRes.ok) {
                          alert(`Approval Refused: ${signRes.error}`);
                          return;
                        }

                        const commitRes = await apiFetch("/api/clinical/action/commit", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ actionId: actId }),
                        }).then((r) => r.json());

                        if (commitRes.ok) {
                          setMessages((prev) => [
                            ...prev,
                            {
                              id: `m-${Date.now()}`,
                              sender: "astra",
                              text: `✅ Action #${actId} signed by Dr. Murali Praveen and committed to HIMS database.`,
                              timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                              cardType: "doctor_order",
                              cardData: {
                                orderId: actId,
                                tests: ["Signed Prescription / Order"],
                                priority: "APPROVED",
                                patientName: m.cardData.patientName,
                                status: "COMMITTED_TO_HIMS",
                                message: `Order #${actId} committed to HIMS source of truth DB successfully with authenticated proof token.`,
                              },
                            },
                          ]);
                        }
                      } catch (e: any) {
                        console.error(e);
                      }
                    }}
                  />
                </div>
              )}
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Clinical Dictation OPD Form (Toggleable Panel) */}
        {dictationActive && (
          <div className="m-3 p-3 bg-slate-900 border border-amber-500/40 rounded-xl space-y-2 text-xs shadow-2xl">
            <div className="flex items-center justify-between text-amber-300 font-bold border-b border-slate-800 pb-2">
              <span className="flex items-center gap-1.5"><Mic size={14} className="text-amber-400 animate-pulse" /> Clinical Dictation — OPD Form</span>
              <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded text-[9px] font-mono">{opdForm.status}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <label className="text-[10px] font-bold text-slate-400">Chief Complaints</label>
                <input type="text" value={opdForm.chiefComplaints} onChange={e => setOpdForm({ ...opdForm, chiefComplaints: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-slate-200" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400">Provisional Diagnosis</label>
                <input type="text" value={opdForm.provisionalDx} onChange={e => setOpdForm({ ...opdForm, provisionalDx: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-slate-200" />
              </div>
            </div>
            <div className="flex justify-between items-center pt-2">
              <span className="text-[10px] text-slate-500">Doctor review required before signing & printing.</span>
              <button onClick={() => {
                setOpdForm({ ...opdForm, status: "FINALIZED & SIGNED" });
                handleSend();
                setInputVal("Finalize OP slip and print at reception");
                setDictationActive(false);
              }} className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] rounded shadow transition-all">
                Approve, Finalize &amp; Print at Reception
              </button>
            </div>
          </div>
        )}

        {/* Main Composer Input Area */}
        <div className="p-3 border-t border-slate-800 bg-slate-900/60 backdrop-blur-md">
          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl p-2 focus-within:border-cyan-500/50 transition-all shadow-xl">
            <button onClick={() => setDictationActive(!dictationActive)}
              className={cn("p-2 rounded-lg transition-all", dictationActive ? "bg-amber-500/20 text-amber-300 border border-amber-500/40" : "text-slate-400 hover:text-cyan-300")}
              title="Clinical Dictation Mode">
              <Mic size={16} />
            </button>
            <input type="text" placeholder="Ask Astra or command the hospital... (e.g. 'Show Bed 1', 'Order CBC', 'Print OP slip', 'Call Ward')"
              value={inputVal} onChange={e => setInputVal(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSend()}
              className="flex-1 bg-transparent text-xs text-slate-100 placeholder-slate-500 focus:outline-none" />
            <button onClick={handleSend}
              className="p-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold transition-all shadow-md">
              <Send size={15} />
            </button>
          </div>
        </div>
      </main>
      <ReflexBrainPanel patientId={activePatient?.uhid ?? activePatient?.id} />
      <MorningBriefCard />
      <AgentOperationsBoard />
      <AstraDoctorPanel />
    </div>
  );
}
