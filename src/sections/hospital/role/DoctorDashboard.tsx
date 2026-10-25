import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { Activity, Boxes, Calendar, ClipboardList, Home, Library, MessageSquare, Users } from "lucide-react";
import { voiceSession } from "@/astra/voice/safety/voiceSession";
import { useVoicePrefs } from "@/astra/voice/useVoicePrefs";
import { useGesturePrefs } from "@/features/mayin/gesture/useGesturePrefs";
import { CentralResolver } from "@/lib/CentralResolver";
import { HospitalPrintEngine } from "@/lib/printEngine";
import { navHash } from "@/lib/hashRoute";
import { useAuth } from "@/lib/auth";
import { dispatchCpoeOrder, draftOrderQuery } from "@/lib/cpoeDispatch";
import { type UploadedFile } from "../../../components/Doctor/ChatImageUploader";
import { voiceEngine } from "@/astra/voice/voiceEngine";
import { HUD_PALETTE } from "@/components/CommandCenter/hudTokens";
import { CriticalAlertBanner } from "@/components/CommandCenter/CriticalAlertBanner";
import { listUnreadResultNotifications, markResultNotificationRead } from "@/astra/clinical/results/resultsClient";
import type { TrendDirection } from "@/astra/clinical/results/resultsLoop";

import { doctorHudCss } from "./doctor/doctorHudCss";
import { usePerformanceMode } from "./doctor/hudBits";
import { HudHeader, type Kpi } from "./doctor/HudHeader";
import { PatientContextBar } from "./doctor/PatientContextBar";
import { QueuePanel } from "./doctor/QueuePanel";
import { AnatomyStage } from "./doctor/AnatomyStage";
import { OrdersPanel } from "./doctor/OrdersPanel";
import { VitalsStrip } from "./doctor/VitalsStrip";
import { CoPilotPanel, type EngineId, type ModelId } from "./doctor/CoPilotPanel";
import { HospitalPulseCard } from "./doctor/HospitalPulseCard";
import type { ChatMessage, ClinicalTab, Patient } from "./doctor/types";

const OrthoPlannerSurface = React.lazy(async () => {
  const module = await import("@/components/OrthoPlanner/OrthoPlannerDashboard");
  return { default: module.OrthoPlannerDashboard };
});
const BoneReconSurface = React.lazy(async () => {
  const module = await import("@/components/BoneRecon/BoneReconPlannerDashboard");
  return { default: module.BoneReconPlannerDashboard };
});
const DoctorEmrSurface = React.lazy(async () => {
  const module = await import("@/sections/emr/DoctorEMR");
  return { default: module.DoctorEMR };
});

const DRAFT_KEY = "astra.clinicalDrafts";

function saveLocalClinicalDraft(kind: "e-prescription" | "discharge-summary", body: Record<string, string>) {
  let prev: unknown[] = [];
  try {
    const parsed = JSON.parse(localStorage.getItem(DRAFT_KEY) || "[]");
    if (Array.isArray(parsed)) prev = parsed;
  } catch {
    prev = [];
  }
  prev.push({ kind, savedAt: new Date().toISOString(), body });
  localStorage.setItem(DRAFT_KEY, JSON.stringify(prev.slice(-40)));
  toast(
    kind === "e-prescription"
      ? "Draft saved on this computer. Not sent to pharmacy."
      : "Draft saved on this computer. Not a discharge clearance.",
  );
}

const PATIENTS: Patient[] = [
  {
    id: "P001",
    uhid: "UHID-2026-8801",
    name: "Rajesh Kumar",
    age: 48,
    gender: "Male",
    department: "OP • Internal Medicine",
    bed: "Bed-01 (OP)",
    type: "OP",
    diagnosis: "Dengue Viral Fever vs Severe CAP",
    complaints: "High grade fever for 3 days, productive cough, severe retro-orbital headache, chills",
    vitals: { bp: "130/85 mmHg", hr: 94, temp: 101.4, spo2: 97, rr: 20 },
  },
  {
    id: "P002",
    uhid: "UHID-2026-8802",
    name: "Ananya Sharma",
    age: 38,
    gender: "Female",
    department: "IP • Pulmonology / ICU",
    bed: "ICU-Bed-04",
    type: "IP",
    diagnosis: "Acute Respiratory Distress Syndrome (ARDS) / Pneumonitis",
    complaints: "Acute shortness of breath, SpO2 88%, bilateral crepitations",
    vitals: { bp: "95/60 mmHg", hr: 118, temp: 103.1, spo2: 88, rr: 30 },
  },
  {
    id: "P003",
    uhid: "UHID-2026-8803",
    name: "Vikram Reddy",
    age: 29,
    gender: "Male",
    department: "Radiology • Radiology & Imaging",
    bed: "Ward-B-02",
    type: "IP",
    diagnosis: "Closed Fracture Shaft of Right Femur",
    complaints: "RTA, severe right thigh deformity, swelling, pre-op ORIF",
    vitals: { bp: "124/80 mmHg", hr: 84, temp: 98.6, spo2: 98, rr: 18 },
  },
  {
    id: "P004",
    uhid: "UHID-2026-8804",
    name: "Sunita Reddy",
    age: 52,
    gender: "Female",
    department: "Endoscopy • Gastroenterology / Endoscopy",
    bed: "Room-302",
    type: "OP",
    diagnosis: "Cholelithiasis with Chronic Cholecystitis",
    complaints: "Post-prandial RUQ pain, dyspepsia, intermittent nausea",
    vitals: { bp: "130/85 mmHg", hr: 76, temp: 98.4, spo2: 99, rr: 16 },
  },
];

const KPIS: Kpi[] = [
  { label: "CRITICAL", value: 1, accent: HUD_PALETTE.coral },
  { label: "URGENT", value: 3, accent: HUD_PALETTE.sunflower },
  { label: "RESULTS", value: 7, accent: HUD_PALETTE.sky },
  { label: "ORDERS", value: 5, accent: HUD_PALETTE.mint },
];

const STARS = Array.from({ length: 46 }, (_, i) => ({
  top: `${(i * 37) % 100}%`,
  left: `${(i * 61) % 100}%`,
  delay: `${(i % 9) * 0.6}s`,
  scale: 0.6 + ((i * 13) % 10) / 12,
}));

function SideGroup({ id, title, openId, setOpenId, children }: { id: string; title: React.ReactNode; openId: string | null; setOpenId: (id: string | null) => void; children: React.ReactNode }) {
  const open = openId === id;
  return (
    <div className="dh-group">
      <button type="button" className="dh-acc" aria-expanded={open} onClick={() => setOpenId(open ? null : id)}>{title}</button>
      {open ? <div className="dh-acc-body">{children}</div> : null}
    </div>
  );
}


function Bi({ en }: { en: React.ReactNode }) {
  return (
    <span className="dh-bi">
      <span className="dh-bi-en">{en}</span>
    </span>
  );
}

type DoctorCommandSurface = "anatomy" | "ortho" | "reconstruction" | "emr";

export function DoctorDashboard({ initialSurface }: { initialSurface?: DoctorCommandSurface } = {}) {
  const { account } = useAuth();
  const [selectedPatient, setSelectedPatient] = useState<Patient>(PATIENTS[0]);
  const [activeTab, setActiveTab] = useState<ClinicalTab>("symptom");
  const [showAiCopilot, setShowAiCopilot] = useState(true);
  const { perf, setPerf, auto: perfAuto } = usePerformanceMode();

  // Astra Copilot Multi-Mode & Model Engine State
  const [activeEngine, setActiveEngine] = useState<EngineId>("Decision Engine");
  const [activeMode, setActiveMode] = useState("Astra Copilot");
  const [activeModel, setActiveModel] = useState<ModelId>("gemini-3.1-pro-preview");
  const [thinkingHigh, setThinkingHigh] = useState(true);
  const [voiceToVoiceActive, setVoiceToVoiceActive] = useState(false);
  const [voiceReplyOn, setVoiceReplyOn] = useState(() => {
    voiceEngine.setVoiceReplyEnabled(true);
    return true;
  });
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voiceTarget, setVoiceTarget] = useState<"chat" | "order">("chat");
  const [orderBox, setOrderBox] = useState("");
  const [inputMessage, setInputMessage] = useState("");

  // Video Call State
  const [videoCallActive, setVideoCallActive] = useState(false);
  const [videoCallTarget, setVideoCallTarget] = useState("");

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "msg-1",
      role: "assistant",
      tier: "Guidelines not loaded",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      text: "Hello Dr. Murali.",
      showPathMap: false,
    },
  ]);
  const [loadingAi, setLoadingAi] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const sendToClinicalRef = useRef<(text?: string, file?: UploadedFile) => Promise<void>>(async () => undefined);

  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chatMessages, loadingAi]);

  useEffect(() => {
    const onOrder = (event: Event) => {
      const text = String((event as CustomEvent<{ text?: string }>).detail?.text ?? "").trim();
      if (text) void sendToClinicalRef.current(text);
    };
    window.addEventListener("astra-saarathi-order", onOrder);
    return () => window.removeEventListener("astra-saarathi-order", onOrder);
  }, []);

  // R5-06 closed loop: unread result notifications -> queue badge + trend arrow.
  const [resultsMeta, setResultsMeta] = useState<Record<string, { unread: number; trend?: TrendDirection }>>({});
  const seenResultNotifications = useRef<Set<string>>(new Set());
  const unreadResultIdsByUhid = useRef<Record<string, string[]>>({});
  useEffect(() => {
    let cancelled = false;
    const pull = async () => {
      const unread = await listUnreadResultNotifications();
      if (cancelled) return;
      const meta: Record<string, { unread: number; trend?: TrendDirection }> = {};
      const idsByUhid: Record<string, string[]> = {};
      for (const notification of unread) {
        (idsByUhid[notification.patientUhid] ??= []).push(notification.id);
        const entry = meta[notification.patientUhid] ?? { unread: 0 };
        entry.unread += 1;
        entry.trend ??= notification.trends.find((trend) => trend.direction !== "new")?.direction ?? notification.trends[0]?.direction;
        meta[notification.patientUhid] = entry;
        if (!seenResultNotifications.current.has(notification.id)) {
          seenResultNotifications.current.add(notification.id);
          toast.info(notification.title, { description: notification.detail });
        }
      }
      unreadResultIdsByUhid.current = idsByUhid;
      setResultsMeta(meta);
    };
    void pull();
    const timer = window.setInterval(() => void pull(), 8000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  // Opening a patient from the queue/context bar marks their result notifications read.
  const selectPatient = useCallback((patient: Patient) => {
    setSelectedPatient(patient);
    const uhid = patient?.uhid;
    const ids = uhid ? unreadResultIdsByUhid.current[uhid] : undefined;
    if (!uhid || !ids?.length) return;
    unreadResultIdsByUhid.current[uhid] = [];
    void Promise.all(ids.map((id) => markResultNotificationRead(id))).then(() => {
      setResultsMeta((prev) => {
        const next = { ...prev };
        delete next[uhid];
        return next;
      });
    });
  }, []);

  const astraModesList = useMemo(() => [
    "Astra Copilot",
    "Communication Coach",
    "Patient Psychology",
    "Attendant Psychology",
    "Clinical Roleplay",
    "Consultant Mentor",
    "Patient Explanation",
    "Clinical Reasoning",
    "Diagnostic Strategy",
    "PubMed Literature",
    "Live Web Grounding",
    "Pathophysiology Map",
    "Image Intelligence",
    "Emergency & Red Flags",
    "Red Team & Blind Spots",
    "Universal Command",
  ], []);

  const suggestedInquiriesByMode = useMemo<Record<string, string[]>>(() => ({
    "Astra Copilot": [
      "ip patients list",
      "op patient list",
      "send cbp repete to bed no 2",
      "send x ray to bed no 4",
      "send usg and mri to rajesh mri ls spine",
      "billing summary today",
      "OT status now",
      "video call ICU Bed 04 nurse",
    ],
    "Communication Coach": [
      "The patient's relative keeps arguing about the plaster slab",
      "Coach me on how to explain why surgery is not needed immediately",
      "Am I sounding defensive when answering questions about charges?",
      "Give me exact sentences to calm an anxious family",
    ],
    "Patient Psychology": [
      "Assess anxiety level of Rajesh Kumar",
      "Patient is non-compliant with medication — strategy?",
      "How to handle pediatric patient's fear of injection?",
    ],
    "Attendant Psychology": [
      "Family is angry about long wait — deescalation script",
      "Attendant demanding ICU shift for stable patient — explain",
      "Relative insisting on second opinion — how to respond?",
    ],
    "Clinical Roleplay": [
      "Roleplay: Attendant demanding immediate surgical discharge",
      "Simulate breaking bad news for terminal diagnosis",
      "Practice: Angry patient questioning billing charges",
    ],
    "Consultant Mentor": [
      "Second opinion: borderline appendicitis vs mesenteric adenitis",
      "Senior review: is early discharge safe for this ARDS patient?",
      "Mentor check: am I missing any differential?",
    ],
    "Patient Explanation": [
      "Explain thrombocytopenia to patient in simple Hindi/Telugu",
      "Why do we need to repeat blood tests every 6 hours?",
      "Explain CT scan procedure to anxious elderly patient",
    ],
    "Clinical Reasoning": [
      "What is the prioritized differential diagnosis?",
      "Evaluate high fever with retro-orbital headache",
      "Calculate CURB-65 pneumonia severity score",
      "Generate 20-step diagnostic reasoning chain",
    ],
    "Diagnostic Strategy": [
      "Recommend cost-effective diagnostic workup for acute abdomen",
      "What baseline labs are missing for this patient?",
      "Optimal imaging sequence for suspected PE?",
    ],
    "PubMed Literature": [
      "Search PubMed 2026 for dengue fluid management guidelines",
      "Latest WHO guidelines on sepsis management",
      "Find RCTs on Dexamethasone in ARDS",
    ],
    "Live Web Grounding": [
      "Latest ICMR advisory on vector-borne disease outbreaks",
      "WHO Dengue classification 2024 update",
      "CDC travel advisory for Telangana region",
    ],
    "Pathophysiology Map": [
      "Map Dengue: Molecular → Cellular → Organ → Systemic",
      "Pathophysiology of ARDS from pneumonitis",
      "Capillary leak syndrome mechanism in dengue hemorrhagic fever",
    ],
    "Image Intelligence": [
      "Analyze chest X-ray for bilateral infiltrates",
      "Review ECG for ST segment changes",
      "Interpret USG findings for gallbladder calculus",
    ],
    "Emergency & Red Flags": [
      "Check ICU Bed 04 for SpO2 desaturation protocol",
      "Screen for acute pulmonary embolism and DVT",
      "Activate septic shock protocol for Bed 1",
      "STAT crash cart to ICU Bed 04",
    ],
    "Red Team & Blind Spots": [
      "What diagnosis am I anchoring on and missing?",
      "Challenge my differential — what rare disease mimics this?",
      "Am I falling for confirmation bias on dengue?",
    ],
    "Universal Command": [
      "how many ips",
      "how many ops",
      "Order STAT CBC + Platelets for Rajesh",
      "Order USG Abdomen & Pelvis for Bed 1",
      "OT status and schedule",
      "billing summary today",
      "discharge clearance status",
      "video call ward B nurse station",
    ],
  }), []);

  const handleQuickOrder = async (itemName: string, category: string) => {
    // Honest CPOE: success toast ONLY after the server confirms with a real order id.
    const result = await dispatchCpoeOrder(`Order ${itemName} for ${selectedPatient.uhid || selectedPatient.name}`, selectedPatient.uhid);
    if (result.ok) {
      toast.success(`CPOE Order Dispatched: ${itemName}`, {
        description: `Dispatched to ${category.toUpperCase()} worklist (Order ID: ${result.orderId}).`,
      });
    } else {
      toast.error(`Order not dispatched: ${itemName}`, { description: result.error });
    }
  };

  const handleConfirmDraftOrder = async (order: any) => {
    const targetDept = order.targetDept || order.destinationDept || "department";
    const built = draftOrderQuery(order);
    if (!built) {
      toast.error("Draft order not routed", { description: "Draft is missing order items or a patient. It stays as a draft." });
      return;
    }
    const result = await dispatchCpoeOrder(built.query, built.contextPatientId);
    if (!result.ok) {
      // Keep it as a draft: the draft card (and its confirm button) stays in the chat.
      toast.error("Draft order not routed - kept as draft", { description: result.error });
      return;
    }
    const orderId = result.orderId;

    toast.success(`Order Confirmed & Routed: ${orderId}`, {
      description: `Dispatched to ${targetDept} for ${order.patientName} (${order.bed || order.bedNumber || "bed n/a"}).`,
    });

    setChatMessages((prev) => [
      ...prev,
      {
        id: `conf-${Date.now()}`,
        role: "assistant",
        tier: "Empathetic Co-Pilot • Astra Clinical Reasoning",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        text: `✓ ORDER ROUTED & BROADCASTED: ${orderId} for ${order.patientName} (${order.bed || order.bedNumber || "bed n/a"}) dispatched to ${targetDept}. Order Center and patient timeline updated in real time.`,
        orderConfirmed: { orderId, ...order, targetDept },
      },
    ]);
  };

  const handleInitiateVideoCall = (bed: string, ward: string, staffName: string) => {
    setVideoCallActive(true);
    setVideoCallTarget(`${bed} — ${ward}`);
    toast.info(`No live video call — ${bed} (${ward})`, {
      description: `No feed to ${staffName}. This control does not place a call.`,
    });
    setChatMessages((prev) => [
      ...prev,
      {
        id: `vc-${Date.now()}`,
        role: "assistant",
        tier: "Video call not started",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        text: `No live video call was started for ${bed} (${ward}).\n${staffName} was not connected.\n\nThis is not a camera feed.\nYou can still draft notes or orders on this screen.\n\nClick "End Call" to dismiss this panel.`,
        videoCall: { bed, ward, staffName },
      },
    ]);
  };

  const handleSendMessage = async (textToSend?: string, file?: UploadedFile) => {
    const rawText = textToSend || inputMessage;
    if (!rawText.trim() && !file) return;
    const userText = rawText.trim();
    setInputMessage("");

    // Navigation commands are local and never leave the Doctor Command OS.
    const commandText = userText.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
    const requestedSurface: DoctorCommandSurface | null =
      /\b(anatomy|human atlas)\b/.test(commandText) ? "anatomy" :
      /\b(orthoplanner|ortho planner|3d planning)\b/.test(commandText) ? "ortho" :
      /\b(bone reconstruction|bone recon|slicer|vsp)\b/.test(commandText) ? "reconstruction" :
      /\b(doctor emr|open emr)\b/.test(commandText) ? "emr" : null;
    if (!file && requestedSurface) {
      if (requestedSurface === "anatomy") {
        setClinicalSurface(null);
        setAnatomyLarge(true);
      } else {
        setAnatomyLarge(false);
        setClinicalSurface(requestedSurface);
      }
      const surfaceLabel = requestedSurface === "anatomy" ? "3D Anatomy" : requestedSurface === "ortho" ? "ASTRA OrthoPlanner" : requestedSurface === "reconstruction" ? "Bone Reconstruction" : "Doctor EMR";
      setChatMessages((previous) => [...previous,
        { id: `user-${Date.now()}`, role: "user", text: userText, timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) },
        { id: `astra-${Date.now()}`, role: "assistant", tier: "Doctor Command OS", timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), text: `${surfaceLabel} opened in Doctor Command OS.` },
      ]);
      return;
    }

    // ─── FILE-AWARE PATH (image / pdf / document) ─────
    if (file) {
      const userMsgId = "user-" + Date.now();
      setChatMessages((prev) => [
        ...prev,
        {
          id: userMsgId,
          role: "user",
          text: userText || `📎 Uploaded: ${file.name}`,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          attachedImage: file.type === "image" ? file.preview : undefined,
          pdfUrl: file.type !== "image" ? file.preview : undefined,
        },
      ]);
      setLoadingAi(true);

      if (file.type !== "image") {
        setTimeout(() => {
          setChatMessages((prev) => [
            ...prev,
            {
              id: "ai-" + Date.now(),
              role: "assistant",
              tier: "Astra Multimodal Medical Vision",
              timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
              text: `📄 ${file.type === "pdf" ? "PDF" : "Document"} received. Text extraction / OCR is not yet enabled for this file type — please upload a JPG, PNG, or WEBP photograph for image analysis.`,
            },
          ]);
          setLoadingAi(false);
        }, 400);
        return;
      }

      try {
        const response = await CentralResolver.resolveCommand(userText, {
          selectedPatient: selectedPatient as any,
          activeMode,
          activeModel,
          chatHistory: chatMessages.slice(-8),
          imageData: file.preview,
          enhance: true,
        });
        setChatMessages((prev) => [
          ...prev,
          {
            id: response.id,
            role: "assistant",
            text: (response?.text || "").trim() || "Astra Multimodal Medical Vision completed the analysis. Please ask a follow-up question or specify the clinical action you need.",
            tier: response.tier,
            timestamp: response.timestamp,
            statusCard: response.statusCard,
            attachedImage: file.preview,
            imageAnalysis: response.statusCard?.imageAnalysis,
          },
        ]);
      } catch (error) {
        console.error("CentralResolver failed:", error);
        setChatMessages((prev) => [
          ...prev,
          {
            id: "ai-" + Date.now(),
            role: "assistant",
            tier: "Astra Multimodal Medical Vision",
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            text: "⚠️ Image analysis failed. Please ensure the image is clear and try again.",
          },
        ]);
      } finally {
        setLoadingAi(false);
      }
      return;
    }

    const userMsgId = `user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setChatMessages((prev) => [
      ...prev,
      { id: userMsgId, role: "user", text: userText, timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) },
    ]);
    setLoadingAi(true);

    const normalizedQuestion = userText.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
    const isIdentityQuestion = /^(who are you|what are you|tell me about yourself|introduce yourself)$/.test(normalizedQuestion);
    const isGreeting = /^(hi|hello|hey|good morning|good afternoon|good evening)$/.test(normalizedQuestion);
    if (isIdentityQuestion || isGreeting) {
      const reply = isIdentityQuestion
        ? "I am Astra AI, your Clinical Co-Pilot and Doctor Command Center assistant. I can help organize patient context, clinical reasoning, drafts, orders, and hospital workflows. Clinical decisions and final diagnosis remain with the treating physician."
        : `Hello Dr. Murali. I am Astra AI, your Clinical Co-Pilot. How can I help with ${selectedPatient.name}'s care or a hospital command?`;
      setChatMessages((prev) => [...prev, {
        id: `astra-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        role: "assistant",
        tier: "Astra Clinical Co-Pilot",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        text: reply,
      }]);
      setLoadingAi(false);
      return;
    }

    try {
      const response = await CentralResolver.resolveCommand(userText, {
        selectedPatient: selectedPatient as any,
        activeMode,
        activeModel,
        chatHistory: chatMessages.slice(-8),
      });

      setTimeout(() => {
        const safeResponse = {
          ...(response as any),
          text: (response?.text || "").trim() || "Astra AI completed the analysis for this request. Please ask a follow-up question or specify the exact clinical action you need.",
        };
        setChatMessages((prev) => [...prev, safeResponse]);

        if (voiceReplyOn || voiceToVoiceActive) {
          setIsSpeaking(true);
          voiceEngine.speakReply(safeResponse.text, safeResponse.detectedLanguage, () => {
            setIsSpeaking(false);
          }, ["gemini-live", "sarvam", "voicebox-local"]);
        }

        const lower = userText.toLowerCase();
        if (lower.includes("video call") || (lower.includes("video") && (lower.includes("bed") || lower.includes("ward") || lower.includes("icu") || lower.includes("nurse")))) {
          const targetBed = "ICU-Bed-04";
          const targetWard = "ICU Ward";
          const staffName = "Sr. Nurse Kavitha Devi";
          handleInitiateVideoCall(targetBed, targetWard, staffName);
        }

        setLoadingAi(false);
      }, 500);
    } catch (error) {
      console.error("CentralResolver failed:", error);
      setLoadingAi(false);
    }
  };
  sendToClinicalRef.current = handleSendMessage;

  const [isDarkTheme, setIsDarkTheme] = useState(false);
  const [clock, setClock] = useState(() => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
  const [opsOverview, setOpsOverview] = useState<{ unread?: number; alerts?: number; outstanding?: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => { try { const r = await fetch("/api/command-center/overview"); if (!r.ok) return; const body = await r.json(); if (!cancelled) setOpsOverview({ unread: body.notifications?.unread ?? 0, alerts: body.clinical?.openCriticalAlerts ?? 0, outstanding: body.billing?.outstanding ?? 0 }); } catch { /* dashboard remains usable if API is unavailable */ } };
    void load(); const timer = window.setInterval(load, 30_000); return () => { cancelled = true; window.clearInterval(timer); };
  }, []);
  useEffect(() => {
    const id = window.setInterval(() => {
      setClock(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    }, 30000);
    return () => window.clearInterval(id);
  }, []);
  const [dotsOpen, setDotsOpen] = useState(false);
  const [dotSection, setDotSection] = useState<"projects" | "request" | "sites" | "display" | null>(null);
  const [showMore, setShowMore] = useState(true);
  const [newChatNote, setNewChatNote] = useState(false);
  const [leftPanel, setLeftPanel] = useState<"chats" | "patients" | "attendance" | "pulse" | "library" | "orders" | null>("chats");
  const [anatomyLarge, setAnatomyLarge] = useState(initialSurface === "anatomy");
  const [clinicalSurface, setClinicalSurface] = useState<"ortho" | "reconstruction" | "emr" | null>(null);
  const [thinkingEffect, setThinkingEffect] = useState<"light" | "medium" | "high">("medium");
  const [continuousVoicePref, setContinuousVoicePref] = useState(false);
  const [searchHost, setSearchHost] = useState<HTMLDivElement | null>(null);
  const [menuFilter, setMenuFilter] = useState("");
  const [sideOpen, setSideOpen] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [chromeCollapsed, setChromeCollapsed] = useState(false);
  const sidebarRef = useRef<HTMLElement | null>(null);
  const [census, setCensus] = useState<"IP" | "OP" | null>(null);
  const [analysisSignal, setAnalysisSignal] = useState(0);
  const [attachRequest, setAttachRequest] = useState(0);
  const [voiceSnap, setVoiceSnap] = useState(() => voiceSession.snapshot());
  const [startCommandOn, setStartCommandOn] = useState(false);
  const { wakeWordEnabled, setWakeWordEnabled } = useVoicePrefs();
  const { gestureEnabled, setGestureEnabled } = useGesturePrefs();
  useEffect(() => voiceSession.subscribe(() => setVoiceSnap(voiceSession.snapshot())), []);

  useEffect(() => {
    if (!initialSurface || initialSurface === "anatomy") return;
    setClinicalSurface(initialSurface);
  }, [initialSurface]);

  const menuHit = (label: string) => {
    const q = menuFilter.trim().toLowerCase();
    return q === "" || label.toLowerCase().includes(q);
  };

  const handlePrintOpSlip = () =>
    HospitalPrintEngine.printOPCard({
      name: selectedPatient.name,
      uhid: selectedPatient.uhid,
      age: selectedPatient.age,
      gender: selectedPatient.gender,
      phone: "+91 98480 12345",
      department: selectedPatient.department,
      doctorName: "Dr. Murali Praveen, M.D.",
      tokenNo: "01",
    });

  return (
    <div className={`doctor-hud ${perf ? "perf" : ""} ${chromeCollapsed ? "doctor-chrome-collapsed" : ""}`} style={{ ["--hud-accent" as any]: HUD_PALETTE.sky }}>
      <style>{doctorHudCss}</style>
      <div className="dh-bg" aria-hidden="true">
        <div className="dh-bg-grid" />
        <div className="dh-bg-stars">
          {STARS.map((s, i) => (
            <span key={i} style={{ top: s.top, left: s.left, animationDelay: s.delay, transform: `scale(${s.scale})` }} />
          ))}
        </div>
      </div>

      <div className="relative z-10 mx-auto max-w-[1800px] p-3 dh-shell">
        <header className="dh-top">
          <button type="button" className="dh-drawer-btn" aria-expanded={drawerOpen} onClick={() => setDrawerOpen((v) => !v)}>Menu</button>
          <button type="button" className="dh-side-toggle" aria-pressed={sidebarCollapsed} aria-label="Toggle sidebar" onClick={() => setSidebarCollapsed((v) => !v)}><span aria-hidden="true">☰</span></button>
          <h1 className="dh-brand">Astra</h1>
          <span className="dh-account"><span className="dh-dot" aria-hidden="true" />{account?.name ? account.name : <Bi en="Not signed in" />}</span>
          <span className="dh-gold">Draft plan only. Final responsibility lies with treating physician.</span>
          <span className="dh-gate">Doctor Approval Gate Active</span>
          {opsOverview && <span className="dh-note" title="Live Command Center overview">Live ops · {opsOverview.unread ?? 0} unread · {opsOverview.alerts ?? 0} alerts</span>}
          <div className="dh-top-meta">
            <button type="button" className="dh-chrome-toggle" aria-pressed={chromeCollapsed} onClick={() => setChromeCollapsed((value) => !value)}>{chromeCollapsed ? "Show top bars" : "Hide top bars"}</button><span aria-label="Current time">{clock}</span>
            <div className="dh-menu">
              <button type="button" className="dh-btn px-2 py-1 text-xs" aria-label="More options" aria-expanded={dotsOpen} onClick={() => setDotsOpen((v) => !v)}>...</button>
              {dotsOpen && (
                <div className="dh-menu-pop">
                  <button type="button" className="dh-btn px-2 py-1 text-xs mb-1" aria-expanded={dotSection === "projects"} onClick={() => setDotSection(dotSection === "projects" ? null : "projects")}>Projects</button>
                  {dotSection === "projects" && <p className="dh-note mb-1">Projects are not listed on this screen yet. Nothing was opened.</p>}
                  <button type="button" className="dh-btn px-2 py-1 text-xs mb-1" aria-expanded={dotSection === "request"} onClick={() => setDotSection(dotSection === "request" ? null : "request")}>Request</button>
                  {dotSection === "request" && <p className="dh-note mb-1">No request panel is on this screen. Nothing was sent.</p>}
                  <button type="button" className="dh-btn px-2 py-1 text-xs mb-1" aria-expanded={dotSection === "sites"} onClick={() => setDotSection(dotSection === "sites" ? null : "sites")}>Sites</button>
                  {dotSection === "sites" && <p className="dh-note mb-1">No site list is on this screen yet.</p>}
                  <button type="button" className="dh-btn px-2 py-1 text-xs mb-1" aria-expanded={dotSection === "display"} onClick={() => setDotSection(dotSection === "display" ? null : "display")}>Display</button>
                  {dotSection === "display" && (
                    <div className="mt-1">
                      <HudHeader
                        isDarkTheme={isDarkTheme}
                        onToggleTheme={() => setIsDarkTheme(!isDarkTheme)}
                        perf={perf}
                        perfAuto={perfAuto}
                        onTogglePerf={() => setPerf(!perf)}
                        kpis={KPIS}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="dh-think-picks" role="group" aria-label="Thinking look only. Does not change the model.">
              {(["light", "medium", "high"] as const).map((level) => (
                <button key={level} type="button" className={"dh-think-pick" + (thinkingEffect === level ? " is-active" : "")} aria-pressed={thinkingEffect === level} onClick={() => setThinkingEffect(level)}>{level === "light" ? "Light" : level === "medium" ? "Medium" : "Deep"}</button>
              ))}
            </div>
          </div>
        </header>

        <CriticalAlertBanner />

        <div className="dh-body">
          <aside ref={sidebarRef} className={"dh-sidebar" + (drawerOpen ? " is-drawer-open" : "") + (sidebarCollapsed ? " is-collapsed" : "")} aria-label="Command sidebar">
            <button type="button" className="dh-sidebar-scroll dh-sidebar-scroll-up" aria-label="Scroll sidebar up" onClick={() => sidebarRef.current?.scrollBy({ top: -260, behavior: "smooth" })}>↑</button>
            <button type="button" className="dh-btn dh-side-row" onClick={() => setNewChatNote(true)}><Bi en="New chat" /></button>
            {newChatNote && <p className="dh-note">New chat is not saved on this screen. The current thread is unchanged.</p>}
            <input className="dh-side-filter" value={menuFilter} onChange={(e) => setMenuFilter(e.target.value)} placeholder="Filter this menu" aria-label="Filter sidebar labels" />
            <div className="dh-side-scroll">
              {menuHit("voice idle start pause resume stop silent wake hand") && (
              <SideGroup id="g1" title={<Bi en="Voice" />} openId={sideOpen} setOpenId={setSideOpen}>
                <button type="button" className={"dh-btn dh-side-row" + (voiceSnap.state === "IDLE" ? " is-active" : "")} aria-pressed={voiceSnap.state === "IDLE"}><Bi en="Idle" /></button>
                <p className="dh-note">Idle shows the existing voice state. It does not start the microphone.</p>
                <button type="button" className="dh-btn dh-side-row" onClick={() => voiceSession.pause()}><Bi en="Pause" /></button>
                <button type="button" className="dh-btn dh-side-row" onClick={() => voiceSession.resume()}><Bi en="Resume" /></button>
                <button type="button" className="dh-btn dh-side-row" onClick={() => voiceSession.hardStop({ reason: "button-stop", replyOkay: true })}><Bi en="Stop" /></button>
                <button type="button" className="dh-btn dh-side-row" aria-pressed={voiceSnap.silent} onClick={() => voiceSession.setSilent(!voiceSnap.silent)}><Bi en={voiceSnap.silent ? "Silent: on" : "Silent"} /></button>
                <button type="button" className="dh-btn dh-side-row" aria-pressed={startCommandOn} onClick={() => setStartCommandOn((v) => !v)}><Bi en="Start command" /></button>
                {startCommandOn && <p className="dh-note">No start-command handler is on this screen. Nothing was started.</p>}
                <button type="button" className="dh-btn dh-side-row" aria-pressed={continuousVoicePref} onClick={() => setContinuousVoicePref((v) => !v)}><Bi en={continuousVoicePref ? "Continuous voice marked on — not started" : "Continuous voice off"} /></button>
              </SideGroup>)
}
              {menuHit("ip op inpatient outpatient patient") && (
              <SideGroup id="g2" title={<Bi en={<>IP/OP patient lists {Object.values(resultsMeta).some((meta) => meta.unread > 0) ? <span aria-label="Unread result alert">🔔</span> : null}</>} />} openId={sideOpen} setOpenId={setSideOpen}>
                <button type="button" className="dh-btn dh-side-row" onClick={() => { setLeftPanel("patients"); setCensus("IP"); }}><Bi en="Inpatient list" /></button>
                <button type="button" className="dh-btn dh-side-row" onClick={() => { setLeftPanel("patients"); setCensus("OP"); }}><Bi en="Outpatient list" /></button>
              </SideGroup>)
}
              {menuHit("lab imaging") && (
              <SideGroup id="g3" title={<Bi en="Labs and imaging" />} openId={sideOpen} setOpenId={setSideOpen}>
                <button type="button" className="dh-btn dh-side-row" onClick={() => { setLeftPanel("orders"); setActiveTab("lab"); }}><Bi en="Lab and imaging workspace" /></button>
              </SideGroup>)
}
              {menuHit("ot pulse ward vitals") && (
              <SideGroup id="g4" title={<Bi en="OT and critical care" />} openId={sideOpen} setOpenId={setSideOpen}>
                <button type="button" className="dh-btn dh-side-row" onClick={() => setLeftPanel("pulse")}><Bi en="Hospital pulse" /></button>
                <button type="button" className="dh-btn dh-side-row" onClick={() => { setLeftPanel("orders"); setActiveTab("ward"); }}><Bi en="Ward telemetry" /></button>
                <button type="button" className="dh-btn dh-side-row" onClick={() => setLeftPanel("orders")}><Bi en="Vitals" /></button>
              </SideGroup>)
}
              {menuHit("emergency red flag alert") && (
              <SideGroup id="g5" title={<Bi en="Emergency and red flags" />} openId={sideOpen} setOpenId={setSideOpen}>
                <p className="dh-note">Critical alerts stay on this page. This row does not start a protocol.</p>
              </SideGroup>)
}
              {menuHit("discharge") && (
              <SideGroup id="g6" title={<Bi en="Discharge desk" />} openId={sideOpen} setOpenId={setSideOpen}>
                <button type="button" className="dh-btn dh-side-row" onClick={() => { setLeftPanel("orders"); setActiveTab("discharge"); }}><Bi en="Discharge desk — not a clearance" /></button>
              </SideGroup>)
}
              {menuHit("differential grounding") && (
              <SideGroup id="g7" title={<Bi en="Clinical reasoning" />} openId={sideOpen} setOpenId={setSideOpen}>
                <button type="button" className="dh-btn dh-side-row" onClick={() => { setShowAiCopilot(true); setAnalysisSignal((n) => n + 1); }}><Bi en="Differential diagnosis" /></button>
                <button type="button" className="dh-btn dh-side-row" onClick={() => { setActiveMode("Live Web Grounding"); toast.info("Active Mode: Live Web Grounding"); }}><Bi en="Web grounding — does not search" /></button>
              </SideGroup>)
}
              {menuHit("modes inquiries analysis attach deep 7 dimension engine") && (
              <SideGroup id="g8" title={<Bi en="Modes and inquiries" />} openId={sideOpen} setOpenId={setSideOpen}>
                <p className="dh-note">Modes only change the existing label. Inquiries only fill the box. Nothing is sent until you use the chat box.</p>
                <p className="dh-note">Empathetic Co-Pilot — label only. There is no mode switch for it.</p>
                {astraModesList.map((mode) => (
                  <button key={mode} type="button" className={"dh-btn dh-side-row" + (activeMode === mode ? " is-active" : "")} onClick={() => setActiveMode(mode)}><Bi en={<>{mode}{activeMode === mode ? " · ACTIVE" : ""}</>} /></button>
                ))}
                {["ip patients list", "op patient list", "send cbp repete to bed no 2", "send x ray to bed no 4", "send usg and mri to rajesh mri ls spine", "billing summary today", "OT status now", "video call ICU Bed 04 nurse"].map((q) => (
                  <button key={q} type="button" className="dh-btn dh-side-row" onClick={() => setOrderBox(q)}><Bi en={q} /></button>
                ))}
                <button type="button" className="dh-btn dh-side-row" onClick={() => setAttachRequest((n) => n + 1)}><Bi en="Attach documents" /></button>
                <button type="button" className="dh-btn dh-side-row" onClick={() => setActiveMode("Live Web Grounding")}><Bi en="Web Search — does not run a search" /></button>
                <button type="button" className="dh-btn dh-side-row" onClick={() => setAnalysisSignal((n) => n + 1)}><Bi en="Analysis" /></button>
                <details className="dh-fold">
                  <summary><Bi en="Deep Analysis" /></summary>
                  <p className="dh-note">Labels only. Nothing was searched or diagnosed.</p>
                  <p className="dh-note">Pathophysiology, body, investigations, medications, medication interactions, same symptom with different diseases, confused diseases.</p>
                </details>
                <details className="dh-fold">
                  <summary><Bi en="Astra Clinical Reasoning" /></summary>
                  <p className="dh-note">Existing mode label only. Nothing was diagnosed.</p>
                  <button type="button" className="dh-btn dh-side-row" onClick={() => setActiveMode("Clinical Reasoning")}><Bi en={<>Clinical Reasoning{activeMode === "Clinical Reasoning" ? " · ACTIVE" : ""}</>} /></button>
                </details>
                
                <details className="dh-fold">
                  <summary><Bi en="7-dimension / 360" /></summary>
                  <p className="dh-note">No 7-dimension or 360 view is on this screen. Nothing was opened.</p>
                </details>
                {(["Decision Engine", "Hermes Agent", "OCR & Vision"] as const).map((engine) => (
                  <button key={engine} type="button" className={"dh-btn dh-side-row" + (activeEngine === engine ? " is-active" : "")} onClick={() => setActiveEngine(engine)}><Bi en={engine} /></button>
                ))}
                <button type="button" className="dh-btn dh-side-row" onClick={() => { setVoiceToVoiceActive(true); setVoiceOpen(true); }}><Bi en="Voice Mode" /></button>
                <button type="button" className="dh-btn dh-side-row" onClick={() => { const next = !voiceReplyOn; setVoiceReplyOn(next); voiceEngine.setVoiceReplyEnabled(next); if (!next && (isSpeaking || voiceEngine.isSpeaking())) { voiceEngine.stopSpeaking(); setIsSpeaking(false); } }}><Bi en={<>Voice Reply {voiceReplyOn ? "ON" : "OFF"}</>} /></button>
                <button type="button" className="dh-btn dh-side-row" onClick={() => handleSendMessage("Universal Command")}><Bi en="Universal Command" /></button>
                <button type="button" className="dh-btn dh-side-row" onClick={() => setThinkingHigh(!thinkingHigh)}><Bi en={thinkingHigh ? "High Thinking" : "Fast Mode"} /></button>
                
              </SideGroup>)
}
              {menuHit("anatomy planning reconstruction emr attach library thread") && (
              <SideGroup id="g9" title={<Bi en="3D anatomy, planning, and EMR" />} openId={sideOpen} setOpenId={setSideOpen}>
                <button type="button" className="dh-btn dh-side-row" onClick={() => setAnatomyLarge(true)}><Bi en="3D Anatomy" /></button>
                <button type="button" className="dh-btn dh-side-row" onClick={() => setClinicalSurface("ortho")}><Bi en="ASTRA OrthoPlanner + 3D planning" /></button>
                <button type="button" className="dh-btn dh-side-row" onClick={() => setClinicalSurface("reconstruction")}><Bi en="Bone reconstruction" /></button>
                <button type="button" className="dh-btn dh-side-row" onClick={() => setClinicalSurface("emr")}><Bi en="Doctor EMR" /></button>
                <button type="button" className="dh-btn dh-side-row" onClick={() => setAttachRequest((n) => n + 1)}><Bi en="Attach image, PDF, or document" /></button>
                <button type="button" className="dh-btn dh-side-row" onClick={() => setLeftPanel(leftPanel === "library" ? null : "library")}><Bi en="Library" /></button>
                <button type="button" className="dh-btn dh-side-row" aria-expanded={showMore} onClick={() => setShowMore((v) => !v)}><Bi en="Show current thread" /></button>
              </SideGroup>)
}
              
            </div>
<div className="dh-white-stack" aria-label="Voice and staff">
                <button type="button" className="dh-white-box tint-voice" onClick={() => voiceSession.requestStart()}><Bi en="Start voice" /></button>
                <button type="button" className="dh-white-box tint-staff" onClick={() => { window.dispatchEvent(new CustomEvent("astra-staff-connect-open", { detail: { video: false } })); }}><Bi en="Staff Connect" /><span className="dh-white-sub">Not a live call. Nothing was started.</span></button>
                <button type="button" className="dh-white-box tint-wake" aria-pressed={wakeWordEnabled} onClick={() => setWakeWordEnabled(!wakeWordEnabled)}><Bi en="Wake word" /><span className="dh-white-sub">{wakeWordEnabled ? "ON" : "OFF"}</span></button>
                <button type="button" className="dh-white-box tint-hand" aria-pressed={gestureEnabled} onClick={() => setGestureEnabled(!gestureEnabled)}><Bi en="Hand control" /><span className="dh-white-sub">{gestureEnabled ? "ON" : "OFF"}</span></button>
              </div>
            <button type="button" className="dh-sidebar-scroll dh-sidebar-scroll-down" aria-label="Scroll sidebar down" onClick={() => sidebarRef.current?.scrollBy({ top: 260, behavior: "smooth" })}>↓</button>
          </aside>
          <div className="dh-main">
            {leftPanel === "patients" && (
              <div className="space-y-3">
                <PatientContextBar
                  patients={census === "OP" ? PATIENTS.filter((p) => p.type === "OP") : census === "IP" ? PATIENTS.filter((p) => p.type === "IP") : PATIENTS}
                  selectedPatient={selectedPatient}
                  onSelect={selectPatient}
                  showAiCopilot={showAiCopilot}
                  onToggleCopilot={() => setShowAiCopilot(!showAiCopilot)}
                />
                <QueuePanel patients={census === "OP" ? PATIENTS.filter((p) => p.type === "OP") : census === "IP" ? PATIENTS.filter((p) => p.type === "IP") : PATIENTS} selectedPatient={selectedPatient} onSelect={selectPatient} resultsMeta={resultsMeta} />
              </div>
            )}

            {leftPanel === "library" && (
              <div className="space-y-2">
                <details className="dh-note"><summary>Books</summary><p>Books are not on this screen yet.</p></details>
                <details className="dh-note"><summary>Skills</summary><p>Skills are not on this screen yet.</p></details>
                <details className="dh-note"><summary>Favorites</summary><p>Favorites are not on this screen yet.</p></details>
                <details className="dh-note"><summary>Plugins</summary><p>Plugin list is not on this screen. Nothing was installed.</p></details>
              </div>
            )}

            {leftPanel === "orders" && (
              <div className="space-y-3">
                <OrdersPanel
                  activeTab={activeTab}
                  onTab={setActiveTab}
                  patient={selectedPatient}
                  onQuickOrder={handleQuickOrder}
                  onSaveDraft={saveLocalClinicalDraft}
                />
                <VitalsStrip
                  patient={selectedPatient}
                  onTab={setActiveTab}
                  onQuickOrder={handleQuickOrder}
                  onSpeakOrder={() => { setVoiceTarget("order"); setVoiceOpen(true); }}
                  onPrint={handlePrintOpSlip}
                />
              </div>
            )}

            <CoPilotPanel
              selectedPatient={selectedPatient}
              isDarkTheme={isDarkTheme}
              chatMessages={chatMessages}
              setChatMessages={setChatMessages}
              loadingAi={loadingAi}
              orderBox={orderBox}
              setOrderBox={setOrderBox}
              chatScrollRef={chatScrollRef}
              activeEngine={activeEngine}
              setActiveEngine={setActiveEngine}
              activeMode={activeMode}
              setActiveMode={setActiveMode}
              activeModel={activeModel}
              setActiveModel={setActiveModel}
              thinkingHigh={thinkingHigh}
              setThinkingHigh={setThinkingHigh}
              voiceToVoiceActive={voiceToVoiceActive}
              setVoiceToVoiceActive={setVoiceToVoiceActive}
              voiceReplyOn={voiceReplyOn}
              setVoiceReplyOn={setVoiceReplyOn}
              isSpeaking={isSpeaking}
              setIsSpeaking={setIsSpeaking}
              voiceOpen={voiceOpen}
              setVoiceOpen={setVoiceOpen}
              voiceTarget={voiceTarget}
              setVoiceTarget={setVoiceTarget}
              videoCallActive={videoCallActive}
              setVideoCallActive={setVideoCallActive}
              videoCallTarget={videoCallTarget}
              setVideoCallTarget={setVideoCallTarget}
              astraModesList={astraModesList}
              suggestedInquiriesByMode={suggestedInquiriesByMode}
              handleSendMessage={handleSendMessage}
              handleConfirmDraftOrder={handleConfirmDraftOrder}
              searchHost={searchHost}
              openAnalysisSignal={analysisSignal}
              attachRequest={attachRequest}
              historyOpen={showMore}
              chatVisible={showAiCopilot || leftPanel === "chats"}
              thinkingEffect={thinkingEffect}
              setThinkingEffect={setThinkingEffect}
            />
            <div className="dh-addon-strip" aria-label="Add-ons">
              <span className="dh-addon-card">Brain</span>
              <button type="button" className="dh-addon-card" onClick={() => voiceSession.requestStart()}>Mic</button>
              <button type="button" className="dh-addon-card" onClick={() => { window.dispatchEvent(new CustomEvent("astra-staff-connect-open", { detail: { video: false } })); }}>
                People
                <span className="dh-addon-sub">Not a live call. Nothing was started.</span>
              </button>
              <button type="button" className="dh-addon-card" aria-pressed={gestureEnabled} onClick={() => setGestureEnabled(!gestureEnabled)}>Hand gesture</button>
              <button type="button" className="dh-addon-card" aria-pressed={wakeWordEnabled} onClick={() => setWakeWordEnabled(!wakeWordEnabled)}>Wake word</button>
              <button type="button" className="dh-addon-card" aria-pressed={leftPanel === "library"} onClick={() => setLeftPanel(leftPanel === "library" ? null : "library")}>Book</button>
            </div>
            <div className="dh-composer-slot">
              <div ref={setSearchHost} />
            </div>
          </div>

        </div>
      </div>

      {anatomyLarge && (
        <div className="dh-anatomy-overlay" role="dialog" aria-label="Anatomy stage">
          <button type="button" className="dh-btn px-2 py-1 text-xs mb-2" onClick={() => setAnatomyLarge(false)}>Close anatomy</button>
          <AnatomyStage
            patient={selectedPatient}
            isDarkTheme={isDarkTheme}
            onQuickOrder={handleQuickOrder}
            onNavigate={navHash}
          />
        </div>
      )}
      {clinicalSurface && (
        <div className="dh-anatomy-overlay" role="dialog" aria-label="Doctor Command clinical workspace">
          <div className="flex items-center gap-2 mb-2">
            <button type="button" className="dh-btn px-2 py-1 text-xs" onClick={() => setClinicalSurface(null)}>Close workspace</button>
            <span className="text-[10px] text-slate-300">AI orchestration runs in the background; this workspace presents results for clinician review.</span>
          </div>
          <React.Suspense fallback={<div className="p-6 text-sm text-slate-300">Opening clinical workspace…</div>}>
            {clinicalSurface === "ortho" && <OrthoPlannerSurface selectedPatient={null} patients={[]} radiologyReports={[]} universalOrders={[]} onNavigate={navHash} />}
            {clinicalSurface === "reconstruction" && <BoneReconSurface selectedPatient={null} patients={[]} radiologyReports={[]} universalOrders={[]} onNavigate={navHash} />}
            {clinicalSurface === "emr" && <DoctorEmrSurface />}
          </React.Suspense>
        </div>
      )}
    </div>
  );
}
