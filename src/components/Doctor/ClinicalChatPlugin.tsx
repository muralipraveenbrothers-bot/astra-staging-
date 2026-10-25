import React, { useState, useRef, useEffect } from "react";
import { AIPluginType, Patient } from "../../types";
import { parseClinicalCommand, parseClinicalCommandBundle, classifyAstraIntent, ParsedCommandDraft, ParsedCommandBundle, AstraIntent } from "../CommandCenter/commandParser";
import { ASTRA_MASTER_PROMPT } from "@/components/CommandCenter/AstraMasterPrompt";
import { CentralResolver } from "@/lib/CentralResolver";
import { ChatImageUploader, UploadedFile } from "./ChatImageUploader";
import { AdvancedImageAnnotationViewer } from "./AdvancedImageAnnotationViewer";
import { MedicalImageAnnotatorModal } from "../ImageIntel/MedicalImageAnnotatorModal";
import { speakHumanVoice, stopActiveSpeech, hospitalAudio, listenHumanSpeech, detectLanguageFromText, detectContextualSpeechTone } from "@/utils/audioAlerts";
import { useLanguage } from "@/context/LanguageContext";
import { ClinicalFormattedMessage } from "./ClinicalFormattedMessage";
import { voiceEngine, VOICE_LANGS } from "@/astra/voice/voiceEngine";
import "@/astra/voice/voice.css";
import { analyzeEcgImage, ecgSpokenSummary, EcgInterpretation } from "@/astra/agents/ecgAgent";
import { EcgResultCard } from "../../astra/components/EcgResultCard";
import { orchestrator, AstraResponse } from "../../astra/agents/orchestrator";
import { centralCommand } from "../../astra/runtime/centralCommand";
import { ApprovalCard } from "../../astra/components/ApprovalCard";
import { hermes } from "../../astra/agents/hermes";
import { paperclip } from "../../astra/agents/paperclip";
import {
  Sparkles,
  Send,
  Zap,
  Bookmark,
  Eye,
  Brain,
  FileText,
  Upload,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  BookOpen,
  Loader2,
  X,
  Bot,
  PlusCircle,
  Mic,
  MicOff,
  Cpu,
  Bolt,
  Image as ImageIcon,
  Check,
  Activity,
  ArrowRight,
  ShieldAlert,
  Globe,
  Layers,
  Search,
  Microscope,
  Languages,
  HelpCircle,
  ExternalLink,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Volume2,
  VolumeX,
  Users,
  UserCheck,
  Award,
  HeartHandshake,
  Smile,
  Flame,
  Pause,
  Play,
  RotateCcw,
  Sparkle,
  ThumbsUp,
  ThumbsDown,
  ShieldCheck,
  Info,
  ChevronRight,
  FileSpreadsheet,
} from "lucide-react";

export type AstraMode =
  | "copilot"
  | "coach"
  | "patient_psychology"
  | "attendant_psychology"
  | "roleplay"
  | "consultant"
  | "patient_facing"
  | "reasoning"
  | "diagnostic"
  | "pubmed"
  | "live_web"
  | "pathophysiology"
  | "image_intel"
  | "emergency"
  | "safety_blindspot"
  | "command_center";

interface ClinicalChatPluginProps {
  selectedPatient: Patient | null;
  allPatients?: Patient[];
  onOrderLab: (testName: string, category: "Hematology" | "Biochemistry" | "Radiology" | "Microbiology") => void;
  onAddPrescription: (med: { brandName: string; genericName: string; dose: string; frequency: string; duration: string; count: number; unitPrice: number }) => void;
  onApplyDiagnosis: (dx: string) => void;
  onConfirmUniversalOrder?: (draft: ParsedCommandDraft) => any;
  onOpenOrderCenter?: () => void;
  onClose?: () => void;
}

interface ChatMessage {
  id: string;
  sender: "doctor" | "astra_ai";
  text: string;
  pluginUsed: AIPluginType;
  modeUsed?: AstraMode;
  intent?: AstraIntent;
  timestamp: string;
  modelUsed?: string;
  orderDraft?: ParsedCommandDraft;
  orderBundle?: ParsedCommandBundle;
  evidenceLevel?: "LEVEL_A" | "LEVEL_B" | "LEVEL_C" | "LEVEL_D" | "LEVEL_E";
  pathophysiologyLayers?: {
    molecular?: string;
    cellular?: string;
    tissue?: string;
    organ?: string;
    systemic?: string;
    manifestation?: string;
  };
  anatomicalRiskMap?: {
    structure: string;
    risk: "High Risk" | "Moderate Risk" | "Safe / Uninvolved";
    examRequired: string;
  }[];
  actions?: {
    type: "order_lab" | "add_rx" | "set_dx";
    label: string;
    payload: any;
  }[];
  attachedImage?: string;
  pdfUrl?: string;
  imageAnalysis?: any;
  ecgResult?: EcgInterpretation;
  differentials?: { dx: string; probability: string; for: string; against: string }[];
  blindSpots?: { rareDx: string; excludeWith: string }[];
  redFlags?: string[];
  citations?: { source: string; detail: string }[];
  draftActions?: { id: string; kind: string; summary: string; payload: any }[];
  trace?: string[];
  logId?: string;
  feedbackGiven?: "up" | "down";
}

export const ClinicalChatPlugin: React.FC<ClinicalChatPluginProps> = ({
  selectedPatient,
  allPatients = [],
  onOrderLab,
  onAddPrescription,
  onApplyDiagnosis,
  onConfirmUniversalOrder,
  onOpenOrderCenter,
  onClose,
}) => {
  const { language, detectAndSetLanguage } = useLanguage();
  const [activePlugin, setActivePlugin] = useState<AIPluginType>("decision_engine");
  const [astraMode, setAstraMode] = useState<AstraMode>("reasoning");
  const [inputQuery, setInputQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [enhanceMode, setEnhanceMode] = useState(true);

  // High Thinking Mode & Low-Latency Fast Mode
  const [thinkingMode, setThinkingMode] = useState(true);
  const [fastMode, setFastMode] = useState(false);

  // Hands-free Voice-to-Voice conversation state
  const [isVoiceToVoice, setIsVoiceToVoice] = useState(false);
  const isVoiceToVoiceRef = useRef(false);

  useEffect(() => {
    isVoiceToVoiceRef.current = isVoiceToVoice;
  }, [isVoiceToVoice]);

  // Audio Speech Synthesis state
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);

  // Two-Way Voice Engine state
  const [voiceReplyOn, setVoiceReplyOn] = useState(true);
  const [voiceLang, setVoiceLang] = useState("en-IN");
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  // ECG and Orchestrator state
  const [ecgBusy, setEcgBusy] = useState(false);
  const [expandedTraces, setExpandedTraces] = useState<Record<string, boolean>>({});
  const [expandedBlindSpots, setExpandedBlindSpots] = useState<Record<string, boolean>>({});

  // Hermes Self-Upgrade Agent state
  const [hermesStats, setHermesStats] = useState(hermes.getStats());
  const [hermesRegistry, setHermesRegistry] = useState(hermes.getRegistry());
  const [hermesProposing, setHermesProposing] = useState(false);

  // Paperclip Knowledge Base state
  const [paperclipDocs, setPaperclipDocs] = useState<string[]>([]);
  const [paperclipIngestText, setPaperclipIngestText] = useState("");
  const [paperclipDocName, setPaperclipDocName] = useState("");
  const [paperclipIngesting, setPaperclipIngesting] = useState(false);
  const [paperclipResult, setPaperclipResult] = useState("");

  useEffect(() => {
    paperclip.listDocs().then(setPaperclipDocs).catch(() => {});
  }, []);

  // Mic voice recognition handler
  const handleMic = () => {
    if (listening) {
      voiceEngine.stopListening();
      setListening(false);
      return;
    }
    if (!voiceEngine.isRecognitionSupported()) {
      alert("Speech recognition is not supported in this browser. Please use Chrome or Edge.");
      return;
    }
    voiceEngine.stopSpeaking();
    setSpeaking(false);
    setListening(true);
    const ok = voiceEngine.startListening(
      voiceLang,
      (transcript, isFinal) => {
        setInputQuery(transcript);
        if (isFinal) {
          setListening(false);
          handleSendMessage(transcript);
        }
      },
      () => setListening(false)
    );
    if (!ok) setListening(false);
  };

  // Speak assistant reply aloud
  const speakReply = (text: string) => {
    if (!voiceReplyOn || !text) return;
    setSpeaking(true);
    voiceEngine.speakReply(text, voiceLang, () => setSpeaking(false));
  };

  const handleFeedback = (msgId: string, logId: string | undefined, rating: "up" | "down") => {
    const targetId = logId || msgId;
    hermes.recordFeedback(targetId, rating);
    setChatHistory((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, feedbackGiven: rating } : m))
    );
    setHermesStats(hermes.getStats());
    hospitalAudio.playSuccessChime();
  };

  // UI Drawer Toggles
  const [activePathoMsgId, setActivePathoMsgId] = useState<string | null>(null);
  const [activeLangTab, setActiveLangTab] = useState<"EN" | "TE" | "HI">("EN");
  const [isAnnotatorOpen, setIsAnnotatorOpen] = useState(false);
  const [annotatorImage, setAnnotatorImage] = useState<string | null>(null);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);

  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    {
      id: "m1",
      sender: "astra_ai",
      intent: "PATIENT_SUMMARY",
      text: `Hello Dr. Murali. I am **Astra AI Universal Doctor Command Center & Clinical Reasoning Partner**. 
Connected Patient Context: **${selectedPatient?.name || "Rajesh Kumar"}** (UHID: ${selectedPatient?.uhid || "UHID-2026-8801"}, Bed: ${selectedPatient?.bedNumber || "Bed-01"}).

I function as your **Multidisciplinary Knowledge Engine, Clinical Reasoning Engine, PubMed Research Engine, & Closed-Loop Hospital Command Bus**.

Select a specialized reasoning mode or type/speak any clinical command or inquiry (e.g. *"Bed 1 order CBC and CRP"*, *"What is the differential?"*, *"Search PubMed for dengue guidelines"*).`,
      pluginUsed: "decision_engine",
      modeUsed: "reasoning",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      modelUsed: "gemini-3.1-pro-preview",
      evidenceLevel: "LEVEL_A",
      pathophysiologyLayers: {
        molecular: "Viral NS1 glycoprotein binding to endothelial surface heparin sulfate",
        cellular: "Endothelial cell activation & capillary leak syndrome",
        tissue: "Subvascular plasma extravasation & microvascular fragility",
        organ: "Hepatic transaminitis & splenic sequestration of platelets",
        systemic: "Systemic thrombocytopenia, hemoconcentration & febrile response",
        manifestation: "High fever, petechial rash, severe body ache, & platelet drop (<100k/uL)"
      }
    },
  ]);

  const speakMessage = (msgId: string, text: string) => {
    if (speakingMsgId === msgId) {
      stopActiveSpeech();
      setSpeakingMsgId(null);
      return;
    }

    const detectedLang = detectLanguageFromText(text) || language;
    const contextualTone = detectContextualSpeechTone(text, activePlugin);
    setSpeakingMsgId(msgId);
    speakHumanVoice(
      text,
      () => setSpeakingMsgId(msgId),
      () => {
        setSpeakingMsgId(null);
        if (isVoiceToVoiceRef.current) {
          setTimeout(() => {
            if (isVoiceToVoiceRef.current) {
              startVoiceRecording();
            }
          }, 600);
        }
      },
      () => setSpeakingMsgId(null),
      contextualTone,
      detectedLang,
      "male_voice"
    );
  };

  const toggleVoiceToVoice = () => {
    const nextVal = !isVoiceToVoice;
    setIsVoiceToVoice(nextVal);
    isVoiceToVoiceRef.current = nextVal;
    if (nextVal) {
      hospitalAudio.playSuccessChime();
      const greet = "Hands-Free Voice-to-Voice Mode active, Doctor. I am listening. Please speak naturally.";
      speakHumanVoice(
        greet,
        () => {},
        () => {
          if (isVoiceToVoiceRef.current) {
            startVoiceRecording();
          }
        },
        undefined,
        "conversational",
        language,
        "male_voice"
      );
    } else {
      stopActiveSpeech();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
      setIsRecording(false);
    }
  };

  const handleSendMessage = async (customQuery?: string, isVoiceInput = false) => {
    const textToSend = (customQuery || inputQuery).trim();
    if (!textToSend) return;

    voiceEngine.stopSpeaking();
    setSpeaking(false);

    const userMsg: ChatMessage = {
      id: "u-" + Date.now(),
      sender: "doctor",
      text: textToSend,
      pluginUsed: activePlugin,
      modeUsed: astraMode,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setChatHistory((prev) => [...prev, userMsg]);
    setInputQuery("");
    setLoading(true);

    try {
      // Execute query through Central Clinical Command brain fanning out via AgentBus
      const res = await centralCommand.run(textToSend, {
        activePatient: selectedPatient
          ? {
              name: selectedPatient.name,
              uhid: selectedPatient.uhid,
              bedNumber: selectedPatient.bedNumber,
              age: (selectedPatient as any).age,
              gender: (selectedPatient as any).gender,
              allergies: (selectedPatient as any).allergies || [],
              medications: (selectedPatient as any).activeMedications || [],
            }
          : undefined,
        doctorName: "Dr. Murali Praveen",
      });

      const assistantMsg: ChatMessage = {
        id: "a-" + Date.now(),
        sender: "astra_ai",
        text: res.answer,
        pluginUsed: activePlugin,
        modeUsed: astraMode,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        differentials: res.differentials.map((d) => ({
          dx: d.condition,
          probability: d.probability,
          for: d.rationale,
          against: "",
        })),
        blindSpots: res.blindSpots.map((bs) => ({
          rareDx: bs,
          excludeWith: "Exclusion protocol",
        })),
        redFlags: res.redFlags,
        citations: res.citations.map((c) => ({
          source: c.title,
          detail: `${c.source} (${c.plugin})`,
        })),
        draftActions: res.draftActions.map((da) => ({
          id: da.id,
          kind: da.type,
          summary: da.title,
          payload: da.payload,
        })),
        trace: res.trace.map((t) => `[${t.step}] ${t.detail}`),
        logId: res.logId,
      };

      setChatHistory((prev) => [...prev, assistantMsg]);
      speakReply(res.answer);
      hospitalAudio.playSuccessChime();
    } catch (err: any) {
      console.error("Central Command error:", err);
      const errMsg: ChatMessage = {
        id: "err-" + Date.now(),
        sender: "astra_ai",
        text: `⚠️ Astra Clinical Co-Pilot: ${err?.message || "Error communicating with specialist plugins."}`,
        pluginUsed: activePlugin,
        modeUsed: astraMode,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setChatHistory((prev) => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleSendFromUploader = async (text: string, fileOrFiles?: UploadedFile | UploadedFile[], uploadType?: string) => {
    const files: UploadedFile[] = Array.isArray(fileOrFiles) ? fileOrFiles : fileOrFiles ? [fileOrFiles] : [];
    if (uploadType === "ecg" || files.some((f) => f.type === "ecg" || f.file?.name.toLowerCase().includes("ecg"))) {
      const ecgFileItem = files.find((f) => f.type === "ecg" || f.file?.name.toLowerCase().includes("ecg"));
      if (ecgFileItem?.file) {
        setEcgBusy(true);
        const imageUrl = (ecgFileItem as any).dataUrl || ecgFileItem.preview;
        const userMsg: ChatMessage = {
          id: "u-ecg-" + Date.now(),
          sender: "doctor",
          text: text || "Analyze this 12-lead ECG",
          attachedImage: imageUrl,
          pluginUsed: activePlugin,
          modeUsed: "image_intel",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };
        setChatHistory((prev) => [...prev, userMsg]);

        try {
          const patientCtx = selectedPatient ? `Patient: ${selectedPatient.name}, UHID: ${selectedPatient.uhid}, Bed: ${selectedPatient.bedNumber}` : undefined;
          const ecgData = await analyzeEcgImage(ecgFileItem.file, patientCtx);
          const assistantMsg: ChatMessage = {
            id: "a-ecg-" + Date.now(),
            sender: "astra_ai",
            text: "12-Lead ECG systematic interpretation ready.",
            ecgResult: ecgData,
            pluginUsed: activePlugin,
            modeUsed: "image_intel",
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          };
          setChatHistory((prev) => [...prev, assistantMsg]);
          speakReply(ecgSpokenSummary(ecgData));
        } catch (err: any) {
          const errAssistantMsg: ChatMessage = {
            id: "a-ecg-err-" + Date.now(),
            sender: "astra_ai",
            text: `ECG interpretation failed: ${err?.message || "Check model configuration."}`,
            pluginUsed: activePlugin,
            modeUsed: "image_intel",
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          };
          setChatHistory((prev) => [...prev, errAssistantMsg]);
        } finally {
          setEcgBusy(false);
        }
        return;
      }
    }

    await handleSendMessage(text);
  };

  const handleApproveAction = async (action: { id: string; kind: string; summary: string; payload: any }) => {
    if (onConfirmUniversalOrder) {
      onConfirmUniversalOrder({
        actionType: action.kind.includes('lab') ? 'ORDER_LAB' : action.kind.includes('radiology') ? 'ORDER_RADIOLOGY' : 'NOTIFY_TEAM',
        department: action.kind.includes('lab') ? 'Laboratory' : action.kind.includes('radiology') ? 'Radiology' : 'Command',
        item: action.summary,
        priority: 'STAT',
        patient: selectedPatient || undefined,
      } as any);
    }

    const confMsg: ChatMessage = {
      id: "conf-" + Date.now(),
      sender: "astra_ai",
      text: `✓ DOCTOR APPROVED & EXECUTED ACTION:\n• Action: ${action.summary}\n• Authorized by: Dr. Murali Praveen\n• Destination: Hospital Universal Order Center / Clinical Dispatch Bus\n• Status: TRANSMITTED & AUDITED`,
      pluginUsed: activePlugin,
      modeUsed: astraMode,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setChatHistory((prev) => [...prev, confMsg]);
    hospitalAudio.playSuccessChime();
  };

  // Voice recording logic with real-time Speech-to-Text
  const recognitionRef = useRef<any>(null);

  const startVoiceRecording = async () => {
    // BARGE-IN SUPPORT: Cancel any ongoing speech synthesis immediately when doctor starts speaking
    stopActiveSpeech();
    setSpeakingMsgId(null);

    setIsRecording(true);
    setRecordingTime(0);

    // Try Speech Recognition first for instant response
    const rec = listenHumanSpeech(
      (spokenText) => {
        setIsRecording(false);
        if (timerRef.current) clearInterval(timerRef.current);
        if (spokenText.trim()) {
          setInputQuery(spokenText);
          handleSendMessage(spokenText, true);
        }
      },
      (err) => {
        console.warn("Speech recognition fallback to media recorder:", err);
      },
      () => {
        setIsRecording(false);
        if (timerRef.current) clearInterval(timerRef.current);
      }
    );

    if (rec) {
      recognitionRef.current = rec;
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach((track) => track.stop());
        await processAudioTranscription(audioBlob);
      };

      mediaRecorder.start();
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      setIsRecording(false);
      alert("Microphone permission denied or speech recognition not supported.");
    }
  };

  const stopVoiceRecording = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
    }
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const processAudioTranscription = async (audioBlob: Blob) => {
    setTranscribing(true);
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Audio = (reader.result as string).split(",")[1];
        const res = await fetch("/api/ai/transcribe-audio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audioBase64: base64Audio, mimeType: "audio/webm" }),
        });
        const data = await res.json();
        if (data.text) {
          setInputQuery((prev) => (prev ? `${prev} ${data.text}` : data.text));
        }
      };
      reader.readAsDataURL(audioBlob);
    } catch (err) {
      console.error("Audio Transcription failed:", err);
    } finally {
      setTranscribing(false);
    }
};

  const plugins: { id: AIPluginType; name: string; icon: any; color: string; desc: string }[] = [
    { id: "decision_engine", name: "Decision Engine", icon: Brain, color: "text-amber-400 bg-amber-500/10 border-amber-500/30", desc: "Differential Dx & Blind-Spots" },
    { id: "hermes", name: "Hermes Agent", icon: Zap, color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30", desc: "Workflow & Order Automation" },
    { id: "paperclip", name: "Paperclip Agent", icon: Bookmark, color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/30", desc: "WHO Protocols & PubMed" },
    { id: "ocr", name: "OCR & Vision", icon: Eye, color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30", desc: "Scan Bills, Slips & X-Rays" },
  ];

  const astraModesList: {
    id: AstraMode;
    label: string;
    icon: any;
    color: string;
    badge: string;
    description: string;
  }[] = [
    { id: "copilot", label: "Astra Copilot", icon: Sparkles, color: "from-cyan-500 to-emerald-600", badge: "Conversational Partner", description: "Talk naturally with Astra about cases, differential thoughts, psychology & teaching" },
    { id: "coach", label: "Communication Coach", icon: MessageSquare, color: "from-indigo-500 to-purple-600", badge: "Doctor Coaching", description: "De-escalation, empathy, 'Don't Defend — Explain' intelligence & exact response scripts" },
    { id: "patient_psychology", label: "Patient Psychology", icon: Brain, color: "from-sky-500 to-blue-600", badge: "Emotional Intel", description: "Anxiety, fear, trust levels & patient perspective analysis" },
    { id: "attendant_psychology", label: "Attendant Psychology", icon: Users, color: "from-teal-500 to-cyan-600", badge: "Family Dynamics", description: "Patient concern vs attendant concern vs clinical reality" },
    { id: "roleplay", label: "Clinical Roleplay", icon: UserCheck, color: "from-rose-500 to-amber-600", badge: "Simulated Patient", description: "Interactive patient simulation & communication scoring (/10)" },
    { id: "consultant", label: "Consultant Mentor", icon: Award, color: "from-violet-500 to-fuchsia-600", badge: "Senior Training", description: "Consultation structuring, bad news delivery, costs & boundary setting" },
    { id: "patient_facing", label: "Patient Explanation", icon: HeartHandshake, color: "from-emerald-500 to-teal-600", badge: "Layperson Terms", description: "Simple explanations, recovery timelines, warning signs & multilingual" },
    { id: "reasoning", label: "Clinical Reasoning", icon: Cpu, color: "from-blue-600 to-indigo-700", badge: "Differential Dx", description: "Likelihood ranking, must-not-miss mimics, & rule-in/out" },
    { id: "diagnostic", label: "Diagnostic Strategy", icon: Microscope, color: "from-blue-500 to-indigo-600", badge: "Test Stewardship", description: "High-yield vs redundant tests & cost-conscious pathways" },
    { id: "pubmed", label: "PubMed Literature", icon: BookOpen, color: "from-amber-500 to-orange-600", badge: "Level A-E Evidence", description: "Search PubMed, WHO guidelines, & clinical trials" },
    { id: "live_web", label: "Live Web Grounding", icon: Globe, color: "from-emerald-500 to-teal-600", badge: "Google Search", description: "Real-time web research & guideline updates" },
    { id: "pathophysiology", label: "Pathophysiology Map", icon: Layers, color: "from-purple-500 to-violet-600", badge: "Cell → Organ", description: "Cellular to systemic mechanism breakdown" },
    { id: "image_intel", label: "Image Intelligence", icon: ImageIcon, color: "from-rose-500 to-pink-600", badge: "Anatomy Overlay", description: "Multimodal scan/photo inspection & structural risk mapping" },
    { id: "emergency", label: "Emergency & Red Flags", icon: AlertTriangle, color: "from-red-600 to-rose-700", badge: "Immediate Danger", description: "Airway, breathing, circulation & sepsis deterioration signs" },
    { id: "safety_blindspot", label: "Red Team & Blind Spots", icon: ShieldAlert, color: "from-amber-600 to-yellow-600", badge: "Debiasing", description: "Anchoring bias challenge, second opinion & missing data" },
    { id: "command_center", label: "Universal Command", icon: Activity, color: "from-emerald-600 to-green-600", badge: "Closed Loop", description: "Natural language order creation & department routing" },
  ];

  const getQuickChips = (mode: AstraMode) => {
    switch (mode) {
      case "copilot":
        return [
          "Today I saw a patient with severe knee pain and her daughter was anxious",
          "Can you help me analyze this patient's presentation?",
          "Tell me something interesting about orthopaedics or internal medicine",
          "I am tired today. Let's discuss this case conversationally.",
        ];
      case "coach":
        return [
          "The patient's relative keeps arguing about the plaster slab",
          "Coach me on how to explain why surgery is not needed immediately",
          "Am I sounding defensive when answering questions about charges?",
          "Give me exact sentences to calm an anxious family",
        ];
      case "patient_psychology":
        return [
          "Analyze this patient's fear of surgery and complications",
          "Why is the patient catastrophizing their recovery timeline?",
          "Identify potential anxiety, trust, or financial fear markers",
          "How can I rebuild trust after a delayed investigation?",
        ];
      case "attendant_psychology":
        return [
          "Separate patient concern vs attendant concern vs clinical reality",
          "The uncle is demanding immediate discharge due to cost",
          "How do I handle an aggressive family member in OPD?",
          "How to counsel relatives when patient is in ICU?",
        ];
      case "roleplay":
        return [
          "Start roleplay: Anxious patient demanding antibiotics",
          "Start roleplay: Angry relative questioning hospital charges",
          "Start roleplay: Fearful surgical patient refusing investigation",
          "Stop roleplay. Break character and give my communication score /10",
        ];
      case "consultant":
        return [
          "How to structure history taking for a difficult patient",
          "How to discuss costs without sounding defensive",
          "How to break bad news about a grave diagnosis",
          "How to set boundaries with demanding attendants",
        ];
      case "patient_facing":
        return [
          "Explain this diagnosis in simple layperson terms",
          "Explain in simple Telugu (తెలుగులో వివరింపు)",
          "Explain in simple Hindi (हिंदी में समझाएं)",
          "Give a 1-minute family explanation with warning signs",
        ];
      case "reasoning":
        return [
          "What is the differential diagnosis?",
          "What rare disease can present like this?",
          "What findings rule this diagnosis in/out?",
          "What am I missing in this patient?",
        ];
      case "diagnostic":
        return [
          "What is the most cost-effective diagnostic pathway?",
          "Which investigations are redundant or unnecessary?",
          "Resource-conscious / Rural hospital options",
          "Best next discriminating test",
        ];
      case "pubmed":
        return [
          "Search PubMed for latest RCTs & evidence",
          "Compare current WHO vs IDSA guidelines",
          "Search recent case reports & rare presentations",
          "Show conflicting guideline recommendations",
        ];
      case "live_web":
        return [
          "Search web for current outbreak guidance",
          "Check latest FDA drug safety warnings",
          "Search recent clinical trial results",
          "Search updated national treatment protocols",
        ];
      case "pathophysiology":
        return [
          "Explain Cell → Organ → System pathophysiology",
          "Why is the patient tachycardic & hypotensive?",
          "What occurs at the capillary/endothelial level?",
          "Explain organ dysfunction progression over time",
        ];
      case "image_intel":
        return [
          "Analyze anatomical structures near this wound/lesion",
          "Identify radiology abnormalities & scan quality",
          "What physical examination tests are required?",
          "Structure risk checklist (Nerve, Vessel, Tendon, Bone)",
        ];
      case "emergency":
        return [
          "Check immediate danger red flags & airway status",
          "Sepsis & shock deterioration protocol",
          "First 1 hour emergency management plan",
          "Critical monitoring parameters & escalation threshold",
        ];
      case "safety_blindspot":
        return [
          "Red Team Challenge: What if diagnosis is wrong?",
          "Cognitive debiasing & anchoring check",
          "What critical missing patient data is needed?",
          "3 dangerous mimics that must not be missed",
        ];
      case "patient_psychology":
        return [
          "De-escalation strategy for anxious patient/relatives",
          "Explain condition in simple patient-friendly terms",
          "Translate management plan to Telugu (తెలుగు)",
          "Translate management plan to Hindi (हिंदी)",
        ];
      case "command_center":
        return [
          "Order CBC + Dengue NS1 Antigen STAT",
          "Prescribe Ceftriaxone 1g IV BD + Dolo 650mg",
          "Request USG Whole Abdomen & Pelvis",
          "Schedule Urgent Cardiology Consultation",
        ];
      default:
        return ["What is the differential?", "Explain pathophysiology", "Search PubMed"];
    }
  };

  return (
    <div className="flex flex-col h-full bg-white border border-[#E3E8EF] rounded-2xl shadow-elevation-2 overflow-hidden font-sans">
      {/* Drawer Header */}
      <div className="p-4 bg-white border-b border-[#E3E8EF] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#1769AA] flex items-center justify-center text-white shadow-sm">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#0B1F3A] flex items-center gap-2">
              Astra Clinical Co-Pilot <span className="text-[10px] bg-[#F1F4F7] text-[#1769AA] px-2 py-0.5 rounded-full font-semibold border border-[#E3E8EF]">Clinical AI</span>
            </h3>
            <p className="text-xs text-[#667085]">
              {selectedPatient ? `Active: ${selectedPatient.name} (${selectedPatient.uhid})` : "No patient selected"}
            </p>
          </div>
        </div>

        {/* Two-Way Voice Toolbar & Controls */}
        <div className="flex items-center gap-2">
          <div className="astra-voice-toolbar bg-[#F7F8FA] border border-[#E3E8EF] px-2 py-1 rounded-xl flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const nextVal = !voiceReplyOn;
                setVoiceReplyOn(nextVal);
                if (!nextVal) {
                  voiceEngine.stopSpeaking();
                  setSpeaking(false);
                }
              }}
              aria-pressed={voiceReplyOn}
              title={voiceReplyOn ? "Voice Reply is ON (Click to mute AI spoken replies)" : "Voice Reply is OFF (Click to enable AI spoken replies)"}
              className={`flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-lg transition-all cursor-pointer ${
                voiceReplyOn
                  ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                  : "bg-slate-200 text-slate-600 hover:bg-slate-300"
              }`}
            >
              {voiceReplyOn ? <Volume2 className="w-3.5 h-3.5 text-emerald-700" /> : <VolumeX className="w-3.5 h-3.5 text-slate-500" />}
              <span>{voiceReplyOn ? "Voice ON" : "Voice OFF"}</span>
            </button>

            <select
              value={voiceLang}
              onChange={(e) => setVoiceLang(e.target.value)}
              className="text-xs bg-white text-slate-800 border border-[#CBD5E1] rounded-lg px-2 py-1 cursor-pointer font-medium"
              title="Select Voice Language"
            >
              {VOICE_LANGS.map((vl) => (
                <option key={vl.code} value={vl.code}>
                  {vl.label}
                </option>
              ))}
            </select>
          </div>

          {speaking && (
            <button
              type="button"
              onClick={() => {
                voiceEngine.stopSpeaking();
                setSpeaking(false);
              }}
              className="astra-speaking-chip"
              title="Click to stop AI speech"
            >
              <span className="dot" />
              <span>Speaking… tap to stop</span>
            </button>
          )}

          {/* Hands-Free Voice-to-Voice Conversation Toggle */}
          <button
            onClick={toggleVoiceToVoice}
            title="Hands-Free Voice-to-Voice Conversation Mode (Talk naturally with Astra AI)"
            className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
              isVoiceToVoice
                ? "bg-rose-600 text-white border-rose-700 shadow-md animate-pulse"
                : "bg-white text-[#1769AA] border-[#E3E8EF] hover:bg-[#F1F4F7] shadow-sm"
            }`}
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>{isVoiceToVoice ? "Voice-to-Voice LIVE" : "Voice-to-Voice"}</span>
            {isVoiceToVoice && <span className="w-2 h-2 rounded-full bg-white animate-ping" />}
          </button>

          {onOpenOrderCenter && (
            <button
              onClick={onOpenOrderCenter}
              title="Open Universal Hospital Order Center"
              className="flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-[#1769AA] hover:bg-[#142B4A] text-white shadow-sm transition-all cursor-pointer"
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Order Center</span>
            </button>
          )}

          <button
            onClick={() => {
              setThinkingMode(!thinkingMode);
              if (!thinkingMode) setFastMode(false);
            }}
            title="Enable gemini-3.1-pro-preview with ThinkingLevel.HIGH for deep reasoning"
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
              thinkingMode
                ? "bg-[#1769AA] text-white border-[#142B4A] shadow-sm font-bold"
                : "bg-[#F1F4F7] text-[#667085] border-[#E3E8EF] hover:text-[#0B1F3A]"
            }`}
          >
            <Brain className="w-3.5 h-3.5 text-[#C6A15B]" />
            <span>High Thinking</span>
            {thinkingMode && <Check className="w-3 h-3 text-white" />}
          </button>

          <button
            onClick={() => {
              setFastMode(!fastMode);
              if (!fastMode) setThinkingMode(false);
            }}
            title="Enable low-latency gemini-3.1-flash-lite mode"
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
              fastMode
                ? "bg-[#1769AA] text-white border-[#142B4A] shadow-sm font-bold"
                : "bg-[#F1F4F7] text-[#667085] border-[#E3E8EF] hover:text-[#0B1F3A]"
            }`}
          >
            <Bolt className="w-3.5 h-3.5 text-[#C6A15B]" />
            <span>Fast Mode</span>
            {fastMode && <Check className="w-3 h-3 text-white" />}
          </button>

          <button
            onClick={() => setEnhanceMode(!enhanceMode)}
            title="Toggle AI image enhancement (hemorrhage suppression, contrast, sharpening) before analysis"
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
              enhanceMode
                ? "bg-amber-500 text-white border-amber-600 shadow-sm font-bold"
                : "bg-[#F1F4F7] text-[#667085] border-[#E3E8EF] hover:text-[#0B1F3A]"
            }`}
          >
            <Eye className={`w-3.5 h-3.5 ${enhanceMode ? "text-white" : "text-[#C6A15B]"}`} />
            <span>Enhance</span>
            {enhanceMode && <Check className="w-3 h-3 text-white" />}
          </button>

          {onClose && (
            <button onClick={onClose} className="text-[#667085] hover:text-[#0B1F3A] p-1 rounded-lg hover:bg-[#F1F4F7] cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Model Status Indicator */}
      <div className="px-4 py-1.5 bg-[#F7F8FA] border-b border-[#E3E8EF] flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-2 text-[#667085]">
          <Cpu className="w-3.5 h-3.5 text-[#1769AA]" />
          <span>Active Model:</span>
          <span className="font-mono text-[#1769AA] font-semibold">
            {fastMode
              ? "gemini-3.1-flash-lite (Low Latency)"
              : thinkingMode
              ? "gemini-3.1-pro-preview (Thinking HIGH)"
              : "gemini-3.5-flash (Standard)"}
          </span>
        </div>
        <span className="text-[10px] text-[#16805B] font-semibold">● WHO & PubMed Grounded</span>
      </div>

      {/* Plugin Selector Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-2 bg-[#F7F8FA] border-b border-[#E3E8EF]">
        {plugins.map((plugin) => {
          const Icon = plugin.icon;
          const isSelected = activePlugin === plugin.id;
          return (
            <button
              key={plugin.id}
              onClick={() => setActivePlugin(plugin.id)}
              className={`flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs font-medium transition-all text-left cursor-pointer ${
                isSelected
                  ? "bg-[#1769AA] text-white shadow-sm font-semibold border border-[#142B4A]"
                  : "bg-white text-[#667085] hover:text-[#0B1F3A] hover:bg-[#F1F4F7] border border-[#E3E8EF]"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <div className="truncate">
                <div className="font-bold truncate">{plugin.name}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Astra Specialized Mode Bar */}
      <div className="px-2 py-2 bg-[#F7F8FA] border-b border-[#E3E8EF] flex items-center gap-1.5 overflow-x-auto scrollbar-none">
        <span className="text-[10px] text-[#1769AA] font-bold uppercase tracking-wider px-2 shrink-0 flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-[#1769AA]" />
          Astra Modes:
        </span>
        {astraModesList.map((m) => {
          const Icon = m.icon;
          const isActive = astraMode === m.id;
          return (
            <button
              key={m.id}
              onClick={() => setAstraMode(m.id)}
              title={m.description}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                isActive
                  ? "bg-[#1769AA] text-white shadow-sm border border-[#142B4A]"
                  : "bg-white text-[#667085] hover:text-[#0B1F3A] hover:bg-[#F1F4F7] border border-[#E3E8EF]"
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? "text-white" : "text-[#667085]"}`} />
              <span>{m.label}</span>
              {isActive && (
                <span className="bg-white/20 text-[9px] px-1.5 py-0.2 rounded-full font-bold">
                  ACTIVE
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Preset Quick Triggers based on Active Astra Mode */}
      <div className="px-3 py-2 bg-[#F7F8FA] border-b border-[#E3E8EF] flex gap-2 overflow-x-auto text-[11px] scrollbar-none">
        <span className="text-[#667085] font-semibold shrink-0 self-center">Suggested Inquiries:</span>
        {getQuickChips(astraMode).map((chip, idx) => (
          <button
            key={idx}
            onClick={() => handleSendMessage(chip)}
            className="bg-white text-[#1769AA] hover:bg-[#F1F4F7] border border-[#E3E8EF] px-2.5 py-1 rounded-lg shrink-0 transition-colors cursor-pointer font-medium shadow-sm"
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Hermes Self-Upgrade Agent Tab View */}
      {activePlugin === "hermes" && (
        <div className="flex-1 p-4 overflow-y-auto space-y-4 font-sans text-xs bg-[#F7F8FA]">
          <div className="bg-white p-4 rounded-2xl border border-[#E3E8EF] shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-[#E3E8EF] pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-cyan-600 flex items-center justify-center text-white font-bold">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-[#0B1F3A] text-sm">Hermes Self-Upgrade & Learning Engine</h4>
                  <p className="text-[11px] text-[#667085]">Continuous closed-loop alignment from doctor ratings & critiques</p>
                </div>
              </div>
              <span className="bg-cyan-100 text-cyan-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-cyan-200">
                ACTIVE AGENT
              </span>
            </div>

            {/* Interaction Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="p-2.5 bg-[#F8FAFC] rounded-xl border border-[#E2E8F0]">
                <span className="text-[10px] text-[#64748B] font-bold uppercase block">Total Logged</span>
                <span className="text-base font-extrabold text-[#0F172A]">{hermesStats.interactions}</span>
              </div>
              <div className="p-2.5 bg-emerald-50/70 rounded-xl border border-emerald-200/80">
                <span className="text-[10px] text-emerald-800 font-bold uppercase block">Thumbs Up 👍</span>
                <span className="text-base font-extrabold text-emerald-700">{hermesStats.up}</span>
              </div>
              <div className="p-2.5 bg-rose-50/70 rounded-xl border border-rose-200/80">
                <span className="text-[10px] text-rose-800 font-bold uppercase block">Critiques 👎</span>
                <span className="text-base font-extrabold text-rose-700">{hermesStats.down}</span>
              </div>
              <div className="p-2.5 bg-amber-50/70 rounded-xl border border-amber-200/80">
                <span className="text-[10px] text-amber-800 font-bold uppercase block">Satisfaction</span>
                <span className="text-base font-extrabold text-amber-700">
                  {hermesStats.interactions > 0
                    ? `${Math.round((hermesStats.up / (hermesStats.up + hermesStats.down || 1)) * 100)}%`
                    : "100%"}
                </span>
              </div>
            </div>

            {/* Improvement Proposal Generator */}
            <div className="pt-2">
              <button
                type="button"
                disabled={hermesProposing}
                onClick={async () => {
                  setHermesProposing(true);
                  try {
                    const prop = await hermes.proposeImprovement();
                    setHermesRegistry(hermes.getRegistry());
                    setHermesStats(hermes.getStats());
                    alert(`✨ Hermes Prompt Proposal v${prop.newVersion} created:\n\nRationale:\n${prop.rationale}`);
                  } finally {
                    setHermesProposing(false);
                  }
                }}
                className="w-full py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50"
              >
                {hermesProposing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                <span>Generate Prompt Self-Improvement Proposal</span>
              </button>
            </div>
          </div>

          {/* Prompt Version Registry Table */}
          <div className="bg-white p-4 rounded-2xl border border-[#E3E8EF] shadow-sm space-y-3">
            <h5 className="font-bold text-[#0B1F3A] text-xs uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Prompt Version Registry & Rollback Controls
            </h5>
            <div className="divide-y divide-[#E3E8EF] border border-[#E3E8EF] rounded-xl overflow-hidden text-xs">
              {hermesRegistry.map((ver, idx) => (
                <div key={idx} className="p-3 flex items-center justify-between bg-white hover:bg-slate-50/50">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-[#0B1F3A]">v{ver.version}</span>
                      {ver.active ? (
                        <span className="bg-emerald-100 text-emerald-800 text-[9px] font-bold px-2 py-0.5 rounded-full border border-emerald-300">
                          CURRENT ACTIVE
                        </span>
                      ) : (
                        <span className="bg-slate-100 text-slate-600 text-[9px] font-bold px-2 py-0.5 rounded-full">
                          ARCHIVED
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#475467] mt-0.5">{ver.note}</p>
                    <span className="text-[10px] text-[#98A2B3] font-mono">{new Date(ver.at || Date.now()).toLocaleString()}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {!ver.active && (
                      <button
                        type="button"
                        onClick={() => {
                          hermes.rollbackTo(ver.version);
                          setHermesRegistry(hermes.getRegistry());
                          alert(`Reverted active prompt to v${ver.version}`);
                        }}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold px-2.5 py-1 rounded-lg border border-slate-300 cursor-pointer"
                      >
                        Rollback
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Paperclip Local RAG Knowledge Base Tab View */}
      {activePlugin === "paperclip" && (
        <div className="flex-1 p-4 overflow-y-auto space-y-4 font-sans text-xs bg-[#F7F8FA]">
          <div className="bg-white p-4 rounded-2xl border border-[#E3E8EF] shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-[#E3E8EF] pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold">
                  <Bookmark className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-[#0B1F3A] text-sm">Paperclip Local RAG Knowledge Store</h4>
                  <p className="text-[11px] text-[#667085]">IndexedDB vector store for hospital guidelines, WHO protocols & surgical textbooks</p>
                </div>
              </div>
              <span className="bg-indigo-100 text-indigo-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-indigo-200">
                LOCAL EMBEDDINGS
              </span>
            </div>

            {/* Ingested Documents List */}
            <div>
              <span className="text-[10px] text-[#64748B] font-bold uppercase block mb-1.5">
                Indexed Clinical Reference Documents:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {paperclipDocs.map((doc, idx) => (
                  <span
                    key={idx}
                    className="bg-[#EEF2F6] text-[#1E293B] border border-[#CBD5E1] px-2.5 py-1 rounded-lg text-xs font-mono font-medium flex items-center gap-1.5"
                  >
                    <BookOpen className="w-3 h-3 text-indigo-600" />
                    <span>{doc}</span>
                  </span>
                ))}
              </div>
            </div>

            {/* Ingest Document Form */}
            <div className="pt-2 border-t border-[#E3E8EF] space-y-2">
              <span className="text-[10px] text-[#0B1F3A] font-bold uppercase block">
                Ingest New Guideline / SOP:
              </span>
              <input
                type="text"
                placeholder="Document Name (e.g., Sepsis-3-Guidelines-2026.md)"
                value={paperclipDocName}
                onChange={(e) => setPaperclipDocName(e.target.value)}
                className="w-full px-3 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-xs"
              />
              <textarea
                rows={4}
                placeholder="Paste guideline text, antibiotic policies, surgical steps..."
                value={paperclipIngestText}
                onChange={(e) => setPaperclipIngestText(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-[#CBD5E1] rounded-lg text-xs font-sans resize-none"
              />
              <button
                type="button"
                disabled={paperclipIngesting || !paperclipDocName.trim() || !paperclipIngestText.trim()}
                onClick={async () => {
                  setPaperclipIngesting(true);
                  try {
                    const count = await paperclip.ingest(paperclipDocName.trim(), paperclipIngestText.trim());
                    const docs = await paperclip.listDocs();
                    setPaperclipDocs(docs);
                    setPaperclipDocName("");
                    setPaperclipIngestText("");
                    setPaperclipResult(`✓ Ingested "${paperclipDocName}" (${count} chunks indexed).`);
                  } catch (err: any) {
                    setPaperclipResult(`⚠️ Ingestion error: ${err?.message || "Failed"}`);
                  } finally {
                    setPaperclipIngesting(false);
                  }
                }}
                className="py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-50"
              >
                {paperclipIngesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                <span>Ingest & Index Passages</span>
              </button>
              {paperclipResult && <p className="text-[11px] font-semibold text-emerald-700">{paperclipResult}</p>}
            </div>
          </div>
        </div>
      )}

      {/* Chat Messages Body (for Decision Engine and OCR modes) */}
      {activePlugin !== "hermes" && activePlugin !== "paperclip" && (
      <div className="flex-1 p-4 overflow-y-auto space-y-4 font-sans text-xs sm:text-sm leading-relaxed">
        {/* Voice Live & Emotional Intelligence HUD */}
        {(isVoiceToVoice || ["copilot", "coach", "patient_psychology", "attendant_psychology", "roleplay", "consultant"].includes(astraMode)) && (
          <div className="p-3 bg-[#F0F4F8] border border-[#D0D9E2] rounded-2xl space-y-2.5 shadow-sm">
            {/* Live Voice Status Bar */}
            {isVoiceToVoice && (
              <div className="flex items-center justify-between bg-[#1769AA] text-white p-2.5 rounded-xl text-xs font-semibold">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-400 animate-ping" />
                  <span className="font-bold tracking-wide">VOICE LIVE FULL DUPLEX</span>
                  <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full">
                    {speakingMsgId !== null ? "Astra Speaking..." : isRecording ? "Listening to Doctor..." : loading ? "Thinking..." : "Continuous Auto-Listen (600ms)"}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {/* Soundwave bars */}
                  <div className="flex items-end gap-0.5 h-4 px-1">
                    <span className="w-1 bg-white/80 rounded-full animate-[bounce_1s_infinite_100ms] h-2" />
                    <span className="w-1 bg-white/80 rounded-full animate-[bounce_1s_infinite_300ms] h-4" />
                    <span className="w-1 bg-white/80 rounded-full animate-[bounce_1s_infinite_200ms] h-3" />
                    <span className="w-1 bg-white/80 rounded-full animate-[bounce_1s_infinite_400ms] h-1" />
                  </div>
                  <button
                    onClick={() => {
                      if (speakingMsgId) {
                        stopActiveSpeech();
                        setSpeakingMsgId(null);
                      } else {
                        toggleVoiceToVoice();
                      }
                    }}
                    className="bg-rose-600 hover:bg-rose-700 text-white px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-colors"
                  >
                    {speakingMsgId ? "Interrupt & Speak" : "Mute Voice"}
                  </button>
                </div>
              </div>
            )}

            {/* Emotional Intelligence Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
              <div className="bg-white p-2 rounded-xl border border-[#E3E8EF] flex flex-col">
                <span className="text-[#667085] text-[10px] font-bold uppercase">Patient Anxiety</span>
                <span className="text-rose-600 font-extrabold flex items-center gap-1 mt-0.5">
                  ● HIGH ANXIETY
                </span>
              </div>
              <div className="bg-white p-2 rounded-xl border border-[#E3E8EF] flex flex-col">
                <span className="text-[#667085] text-[10px] font-bold uppercase">Attendant Concern</span>
                <span className="text-amber-600 font-extrabold flex items-center gap-1 mt-0.5">
                  ● MODERATE WORRY
                </span>
              </div>
              <div className="bg-white p-2 rounded-xl border border-[#E3E8EF] flex flex-col">
                <span className="text-[#667085] text-[10px] font-bold uppercase">Conflict Risk</span>
                <span className="text-[#1769AA] font-extrabold flex items-center gap-1 mt-0.5">
                  ● LOW CONFLICT
                </span>
              </div>
              <div className="bg-white p-2 rounded-xl border border-[#E3E8EF] flex flex-col">
                <span className="text-[#667085] text-[10px] font-bold uppercase">Trust Level</span>
                <span className="text-emerald-600 font-extrabold flex items-center gap-1 mt-0.5">
                  ● HIGH TRUST
                </span>
              </div>
            </div>

            {/* Strategy Directive Card */}
            <div className="bg-white p-2.5 rounded-xl border border-[#E3E8EF] text-xs flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-[#1769AA] shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-[#0B1F3A] block">Recommended Doctor Strategy:</span>
                <span className="text-[#475467]">
                  "Don't Defend — Explain. Acknowledge the attendant's anxiety first, then state objective clinical examination & CT/X-Ray findings."
                </span>
              </div>
            </div>

            {/* Roleplay Active Banner */}
            {astraMode === "roleplay" && (
              <div className="bg-gradient-to-r from-amber-500 to-rose-500 text-white p-2.5 rounded-xl text-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-white" />
                  <span className="font-bold">CLINICAL ROLEPLAY SIMULATION ACTIVE</span>
                </div>
                <button
                  onClick={() => handleSendMessage("Stop roleplay. Break character and provide my communication score /10, empathy, clarity, defensive language analysis, and a better version script.")}
                  className="bg-white text-amber-900 hover:bg-amber-100 px-3 py-1 rounded-lg text-[10px] font-extrabold shadow-sm transition-all cursor-pointer"
                >
                  Stop & Score Communication (/10)
                </button>
              </div>
            )}
          </div>
        )}

        {chatHistory.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.sender === "doctor" ? "items-end" : "items-start"}`}
          >
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-1">
              <span>{msg.sender === "doctor" ? "Dr. Murali Praveen" : "Astra AI"}</span>
              {msg.intent && (
                <span className="bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase">
                  {msg.intent}
                </span>
              )}
              <span>•</span>
              <span className="capitalize text-cyan-400 font-mono">{msg.pluginUsed.replace("_", " ")}</span>
              {msg.modelUsed && (
                <>
                  <span>•</span>
                  <span className="text-[10px] text-purple-300 bg-purple-500/20 px-1.5 py-0.5 rounded font-mono">
                    {msg.modelUsed}
                  </span>
                </>
              )}
              <span>•</span>
              <span>{msg.timestamp}</span>

              {/* Speech Synthesis TTS Toggle for Doctor */}
              {msg.sender === "astra_ai" && (
                <button
                  onClick={() => speakMessage(msg.id, msg.text)}
                  title={speakingMsgId === msg.id ? "Stop Voice Output" : "Read Response Aloud (Voice Output)"}
                  className={`ml-1.5 p-1 rounded-md transition-colors cursor-pointer ${
                    speakingMsgId === msg.id
                      ? "bg-cyan-500 text-slate-950 animate-pulse"
                      : "text-slate-400 hover:text-cyan-300 hover:bg-slate-800"
                  }`}
                >
                  {speakingMsgId === msg.id ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>

            <div
              className={`p-3.5 rounded-2xl max-w-[90%] whitespace-pre-wrap font-sans ${
                msg.sender === "doctor"
                  ? "bg-[#1769AA] text-white rounded-br-none shadow-sm"
                  : "bg-[#F7F8FA] text-[#172033] border border-[#E3E8EF] rounded-bl-none shadow-sm"
              }`}
            >
              {/* Evidence Level Badge */}
              {msg.sender === "astra_ai" && msg.evidenceLevel && (
                <div className="mb-2 flex items-center gap-2">
                  <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded text-[10px] font-mono font-bold flex items-center gap-1">
                    <BookOpen className="w-3 h-3 text-emerald-400" />
                    {msg.evidenceLevel === "LEVEL_A" && "LEVEL A — Authoritative Guidelines (WHO / Official)"}
                    {msg.evidenceLevel === "LEVEL_B" && "LEVEL B — High-Quality Guidelines (Specialty Societies)"}
                    {msg.evidenceLevel === "LEVEL_C" && "LEVEL C — Systematic Reviews & Meta-Analyses"}
                    {msg.evidenceLevel === "LEVEL_D" && "LEVEL D — Randomized Controlled Trials"}
                    {msg.evidenceLevel === "LEVEL_E" && "LEVEL E — Case Series & Primary Reports"}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Verified 2026
                  </span>
                </div>
              )}

              {msg.sender === "astra_ai" ? (
                <ClinicalFormattedMessage
                  content={msg.text}
                  isAi={true}
                  pluginUsed={msg.pluginUsed}
                  modelUsed={msg.modelUsed}
                />
              ) : (
                  <div className="flex flex-col gap-2">
                  <div className="text-xs font-sans text-white leading-relaxed whitespace-pre-wrap">{msg.text}</div>
                  {msg.pdfUrl && (
                    <div className="flex items-center gap-2 bg-white/10 rounded-lg p-2.5 border border-white/20">
                      <FileText className="w-4 h-4 text-red-300 shrink-0" />
                      <span className="text-[11px] text-white/90">PDF Document attached</span>
                    </div>
                  )}
                  {msg.attachedImage && (
                    <img src={msg.attachedImage} alt="Uploaded attachment" className="w-32 h-32 object-cover rounded-lg border border-slate-700 shadow-sm mt-1 cursor-pointer" onClick={() => {
                      setAnnotatorImage(msg.attachedImage || "");
                      setIsAnnotatorOpen(true);
                    }}/>
                  )}
                </div>
              )}

              {/* Image Analysis Card */}
              {msg.imageAnalysis && (
                <div className="mt-3 p-3.5 bg-slate-900 rounded-xl border border-cyan-500/30 space-y-3 font-sans shadow-lg">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="font-bold text-cyan-400 text-xs flex items-center gap-1.5 uppercase tracking-wider">
                      <Sparkles className="w-4 h-4" /> Multimodal Image Intelligence
                    </span>
                    <span className={`px-2 py-1 text-[10px] font-bold rounded-full ${
                      (msg.imageAnalysis.confidence ?? 0) >= 0.7
                        ? "bg-emerald-900/30 text-emerald-400 border border-emerald-500/30"
                        : "bg-amber-900/30 text-amber-400 border border-amber-500/30"
                    }`}>
                      Confidence: {Math.round((msg.imageAnalysis.confidence ?? 0) * 100)}%
                    </span>
                  </div>

                  {/* Attached Image */}
                  {msg.attachedImage && (
                    <img
                      src={msg.attachedImage}
                      alt="Analyzed attachment"
                      className="max-h-48 rounded-lg border border-slate-700 object-cover cursor-pointer"
                      onClick={() => {
                        setAnnotatorImage(msg.attachedImage || "");
                        setIsAnnotatorOpen(true);
                      }}
                    />
                  )}

                  {/* Region & Orientation */}
                  {msg.imageAnalysis.region && (
                    <div className="bg-slate-800/50 rounded-lg p-2.5 border border-slate-700">
                      <p className="text-[10px] text-blue-400 font-bold uppercase mb-1 flex items-center gap-1">
                        <Activity className="w-3 h-3" /> Region & Orientation
                      </p>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                        <div><span className="text-slate-500">Body Part:</span> <span className="text-white font-semibold">{msg.imageAnalysis.region.bodyPart}</span></div>
                        <div><span className="text-slate-500">Side:</span> <span className="text-white font-semibold">{msg.imageAnalysis.region.side}</span></div>
                        <div className="col-span-2"><span className="text-slate-500">Area:</span> <span className="text-slate-200">{msg.imageAnalysis.region.specificArea}</span></div>
                        <div className="col-span-2"><span className="text-slate-500">Position:</span> <span className="text-slate-200">{msg.imageAnalysis.region.anatomicalPosition}</span></div>
                      </div>
                    </div>
                  )}

                  {/* Anatomical Labels — layer by layer */}
                  {msg.imageAnalysis.display?.labels && msg.imageAnalysis.display.labels.length > 0 && (
                    <div className="bg-slate-800/50 rounded-lg p-2.5 border border-slate-700">
                      <p className="text-[10px] text-emerald-400 font-bold uppercase mb-1.5 flex items-center gap-1">
                        <Layers className="w-3 h-3" /> Anatomical Labels (Superficial → Deep)
                      </p>
                      <div className="space-y-1.5">
                        {msg.imageAnalysis.display.labels.map((label: any, i: number) => (
                          <div key={i} className="flex items-start gap-2 text-xs">
                            <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
                              label.type === "nerve" ? "bg-yellow-400" :
                              label.type === "artery" ? "bg-red-400" :
                              label.type === "vein" ? "bg-blue-400" :
                              label.type === "bone" ? "bg-slate-300" :
                              label.type === "tendon" ? "bg-purple-400" :
                              label.type === "muscle" ? "bg-rose-400" :
                              "bg-slate-600"
                            }`} />
                            <div className="flex-1">
                              <span className="text-white font-medium">{label.name}</span>
                              <span className="text-slate-500 ml-1">— {label.condition}</span>
                              {label.risk && (
                                <span className="block text-amber-400 text-[10px] mt-0.5">⚠️ {label.risk}</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Injury Assessment */}
                  {msg.imageAnalysis.display?.injury && (
                    <div className="bg-slate-800/50 rounded-lg p-2.5 border border-slate-700">
                      <p className="text-[10px] text-rose-400 font-bold uppercase mb-1.5 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Injury Assessment
                      </p>
                      <div className="text-xs space-y-1 text-slate-300">
                        <p><span className="text-slate-500">Primary:</span> {msg.imageAnalysis.display.injury.primary}</p>
                        <p><span className="text-slate-500">Depth:</span> {msg.imageAnalysis.display.injury.depth}</p>
                        <p><span className="text-slate-500">Damaged:</span> {msg.imageAnalysis.display.injury.damaged}</p>
                        <p><span className="text-slate-500">At Risk:</span> <span className="text-amber-400">{msg.imageAnalysis.display.injury.atRisk}</span></p>
                      </div>
                    </div>
                  )}

                  {/* Priority Action Plan */}
                  {msg.imageAnalysis.display?.priority && msg.imageAnalysis.display.priority.length > 0 && (
                    <div className="bg-blue-900/20 rounded-lg p-2.5 border border-blue-700/30">
                      <p className="text-[10px] text-blue-400 font-bold uppercase mb-1.5 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> Priority Action Plan
                      </p>
                      <div className="space-y-1.5">
                        {msg.imageAnalysis.display.priority.map((action: any, i: number) => (
                          <div key={i} className="flex items-start gap-2 text-xs">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 ${
                              action.urgency === "immediate" ? "bg-red-600 text-white" :
                              action.urgency === "urgent" ? "bg-amber-600 text-white" :
                              action.urgency === "evaluate" ? "bg-blue-600 text-white" :
                              "bg-slate-600 text-slate-300"
                            }`}>
                              {action.urgency.toUpperCase()}
                            </span>
                            <span className="text-slate-200">{action.action}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Red Flags */}
                  {msg.imageAnalysis.redFlags && msg.imageAnalysis.redFlags.length > 0 && (
                    <div className="bg-rose-950/20 border border-rose-900/30 p-2.5 rounded-lg">
                      <h4 className="text-rose-400 text-xs font-bold flex items-center gap-1.5 mb-1">
                        <AlertCircle className="w-3.5 h-3.5" /> RED FLAGS
                      </h4>
                      <ul className="text-rose-200/90 text-xs space-y-1 list-disc list-inside">
                        {msg.imageAnalysis.redFlags.map((f: string, i: number) => <li key={i}>{f}</li>)}
                      </ul>
                    </div>
                  )}

                  {/* Enhancement Applied */}
                  {msg.imageAnalysis.enhancementApplied && msg.imageAnalysis.enhancementApplied.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {msg.imageAnalysis.enhancementApplied.map((e: string, i: number) => (
                        <span key={i} className="px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-900/50 text-[10px]">
                          ✨ {e}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* EMR Snippet */}
                  {msg.imageAnalysis.emrSnippet && (
                    <div className="bg-slate-950 rounded-lg p-2.5 border border-slate-800">
                      <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">EMR Documentation</p>
                      <p className="text-xs text-slate-400 italic">{msg.imageAnalysis.emrSnippet}</p>
                      <button
                        onClick={() => navigator.clipboard.writeText(msg.imageAnalysis.emrSnippet)}
                        className="mt-1 text-[10px] text-cyan-400 hover:text-cyan-300"
                      >
                        📋 Copy to clipboard
                      </button>
                    </div>
                  )}

                  {/* Interactive Annotation Viewer */}
                  {msg.imageAnalysis.hotspots && msg.imageAnalysis.hotspots.length > 0 && msg.attachedImage && (
                    <div className="mt-2">
                      <AdvancedImageAnnotationViewer
                        imageUrl={msg.attachedImage}
                        hotspots={msg.imageAnalysis.hotspots}
                        regionName={`${msg.imageAnalysis.region.side} ${msg.imageAnalysis.region.bodyPart}`.trim()}
                        injuryType={msg.imageAnalysis.injuryPattern.type}
                        injurySeverity={msg.imageAnalysis.injuryPattern.severity}
                        analysisSummary={msg.imageAnalysis.display.summary}
                        onExport={(blob) => {
                          console.log("Exported annotated analysis PNG:", blob.size, "bytes");
                        }}
                      />
                    </div>
                  )}

                  <div className="flex gap-2 pt-1 border-t border-slate-800">
                    <button
                      onClick={() => {
                        // Fallback to latest uploaded image if current not available
                        setAnnotatorImage(msg.attachedImage || "https://images.unsplash.com/photo-1516549655169-df83a0774514?auto=format&fit=crop&w=1200&q=80");
                        setIsAnnotatorOpen(true);
                      }}
                      className="flex-1 py-1.5 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 rounded-lg text-xs font-semibold flex justify-center items-center gap-1.5 transition-colors border border-cyan-500/20">
                      <Layers className="w-3.5 h-3.5" /> Open Annotator
                    </button>
                  </div>
                </div>
              )}

              {/* Multi-Item Order Bundle Card */}
              {msg.orderBundle && msg.orderBundle.drafts.length > 1 && (
                <div className="mt-3 p-3.5 bg-slate-950 rounded-xl border border-cyan-500/50 space-y-2 font-sans">
                  <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-2">
                    <span className="font-bold text-cyan-300 flex items-center gap-1.5">
                      <Activity className="w-4 h-4 text-cyan-400 animate-pulse" />
                      ORDER BUNDLE DRAFT ({msg.orderBundle.drafts.length} ITEMS)
                    </span>
                    <span className="bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded text-[10px] font-mono font-bold">
                      {msg.orderBundle.drafts[0].priority}
                    </span>
                  </div>

                  <div className="text-xs text-slate-300">
                    <span className="text-slate-500 block text-[10px]">PATIENT & BED:</span>
                    <strong className="text-white">{msg.orderBundle.patientName}</strong> ({msg.orderBundle.bedNumber})
                  </div>

                  <div className="space-y-1.5 pt-1">
                    {msg.orderBundle.drafts.map((d: ParsedCommandDraft, i: number) => (
                      <div key={i} className="p-2 bg-slate-900 rounded-lg text-xs font-mono text-slate-200 border border-slate-800 flex items-center justify-between">
                        <div>
                          <div className="font-bold text-white text-[11px]">{d.itemSummary}</div>
                          <div className="text-[10px] text-cyan-400">Target: {d.destinationDept}</div>
                        </div>
                        {onConfirmUniversalOrder && (
                          <button
                            onClick={() => {
                              const created = onConfirmUniversalOrder(d);
                              setChatHistory((prev) => [
                                ...prev,
                                {
                                  id: "conf-single-" + Date.now() + "-" + i,
                                  sender: "astra_ai",
                                  intent: "LAB_ORDER",
                                  text: `✓ ORDER DISPATCHED: ${created?.orderId || "Order"} (${d.itemSummary}) sent to ${d.destinationDept}.`,
                                  pluginUsed: activePlugin,
                                  timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                                }
                              ]);
                            }}
                            className="bg-emerald-600/80 hover:bg-emerald-500 text-white text-[10px] px-2 py-1 rounded font-sans font-bold transition-colors cursor-pointer"
                          >
                            Route Item
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="pt-2 flex items-center gap-2">
                    <button
                      onClick={() => {
                        if (onConfirmUniversalOrder && msg.orderBundle) {
                          const createdList = msg.orderBundle.drafts.map((d: ParsedCommandDraft) => onConfirmUniversalOrder(d));
                          setChatHistory((prev) => [
                            ...prev,
                            {
                              id: "conf-bundle-all-" + Date.now(),
                              sender: "astra_ai",
                              intent: "LAB_ORDER",
                              text: `✓ BUNDLE DISPATCHED (${createdList.length} Orders):\n` +
                                createdList.map((c: any, idx: number) => `• [${idx + 1}] Transaction ID: ${c?.orderId || "AST-2026"} | ${c?.order?.itemSummary || "Order"} -> ${c?.destinationDept || "Dept"}`).join("\n") +
                                `\n• Status: SENT (Closed-loop progress: 20%)`,
                              pluginUsed: activePlugin,
                              timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                            },
                          ]);
                        }
                      }}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded-lg text-xs flex items-center justify-center gap-1.5 shadow-md transition-colors cursor-pointer"
                    >
                      <Check className="w-4 h-4" /> CONFIRM & ROUTE ALL {msg.orderBundle.drafts.length} ORDERS
                    </button>
                  </div>
                </div>
              )}

              {/* Cell → Organ Pathophysiology Map Interactive Card */}
              {msg.sender === "astra_ai" && msg.pathophysiologyLayers && (
                <div className="mt-3 p-3 bg-slate-950 rounded-xl border border-purple-500/40 font-sans space-y-2">
                  <div
                    onClick={() => setActivePathoMsgId(activePathoMsgId === msg.id ? null : msg.id)}
                    className="flex items-center justify-between cursor-pointer text-xs font-bold text-purple-300 hover:text-purple-200 border-b border-slate-800 pb-2"
                  >
                    <span className="flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-purple-400" />
                      CELL → ORGAN PATHOPHYSIOLOGY MAP
                    </span>
                    <span className="text-[10px] bg-purple-500/20 px-2 py-0.5 rounded font-mono text-purple-200 flex items-center gap-1">
                      {activePathoMsgId === msg.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      {activePathoMsgId === msg.id ? "Hide Map" : "Expand Mechanism"}
                    </span>
                  </div>

                  {(activePathoMsgId === msg.id || true) && (
                    <div className="space-y-1.5 text-xs pt-1 font-sans">
                      <div className="flex items-start gap-2 p-1.5 bg-slate-900/90 rounded-lg border border-slate-800">
                        <span className="text-purple-400 font-bold text-[10px] shrink-0 w-20">MOLECULAR:</span>
                        <span className="text-slate-300 text-[11px]">{msg.pathophysiologyLayers.molecular}</span>
                      </div>
                      <div className="flex items-start gap-2 p-1.5 bg-slate-900/90 rounded-lg border border-slate-800">
                        <span className="text-indigo-400 font-bold text-[10px] shrink-0 w-20">CELLULAR:</span>
                        <span className="text-slate-300 text-[11px]">{msg.pathophysiologyLayers.cellular}</span>
                      </div>
                      <div className="flex items-start gap-2 p-1.5 bg-slate-900/90 rounded-lg border border-slate-800">
                        <span className="text-cyan-400 font-bold text-[10px] shrink-0 w-20">TISSUE:</span>
                        <span className="text-slate-300 text-[11px]">{msg.pathophysiologyLayers.tissue}</span>
                      </div>
                      <div className="flex items-start gap-2 p-1.5 bg-slate-900/90 rounded-lg border border-slate-800">
                        <span className="text-amber-400 font-bold text-[10px] shrink-0 w-20">ORGAN:</span>
                        <span className="text-slate-300 text-[11px]">{msg.pathophysiologyLayers.organ}</span>
                      </div>
                      <div className="flex items-start gap-2 p-1.5 bg-slate-900/90 rounded-lg border border-slate-800">
                        <span className="text-rose-400 font-bold text-[10px] shrink-0 w-20">SYSTEMIC:</span>
                        <span className="text-slate-300 text-[11px]">{msg.pathophysiologyLayers.systemic}</span>
                      </div>
                      <div className="flex items-start gap-2 p-1.5 bg-emerald-950/60 rounded-lg border border-emerald-800/60">
                        <span className="text-emerald-400 font-bold text-[10px] shrink-0 w-20">PRESENTATION:</span>
                        <span className="text-emerald-200 text-[11px] font-semibold">{msg.pathophysiologyLayers.manifestation}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Order Draft Interactive Confirmation Card */}
              {msg.orderDraft && (
                <div className="mt-3 p-3.5 bg-slate-950 rounded-xl border border-cyan-500/50 space-y-2 font-sans">
                  <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-2">
                    <span className="font-bold text-cyan-300 flex items-center gap-1.5">
                      <Activity className="w-4 h-4 text-cyan-400 animate-pulse" />
                      ORDER DRAFT FOR ROUTING
                    </span>
                    <span className="bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded text-[10px] font-mono font-bold">
                      {msg.orderDraft.priority}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-500 block text-[10px]">PATIENT & BED</span>
                      <strong className="text-white">{msg.orderDraft.patientName}</strong> ({msg.orderDraft.bedNumber})
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">TARGET DEPT</span>
                      <strong className="text-cyan-300">{msg.orderDraft.destinationDept}</strong>
                    </div>
                  </div>

                  <div className="p-2 bg-slate-900 rounded-lg text-xs font-mono text-slate-200 border border-slate-800">
                    <span className="text-slate-500 text-[10px] block">ORDER ITEM:</span>
                    <strong>{msg.orderDraft.itemSummary}</strong>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => {
                        if (onConfirmUniversalOrder && msg.orderDraft) {
                          const created = onConfirmUniversalOrder(msg.orderDraft);
                          setChatHistory((prev) => [
                            ...prev,
                            {
                              id: "conf-" + Date.now(),
                              sender: "astra_ai",
                              text: `✓ ORDER ROUTED & BROADCASTED: ${created?.orderId || "Order"} for ${msg.orderDraft?.patientName} (${msg.orderDraft?.bedNumber}) dispatched to ${msg.orderDraft?.destinationDept}. Order Center and patient timeline updated in real time.`,
                              pluginUsed: activePlugin,
                              timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                            },
                          ]);
                        }
                      }}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded-lg text-xs flex items-center justify-center gap-1.5 shadow-md transition-colors"
                    >
                      <Check className="w-4 h-4" /> CONFIRM & ROUTE ORDER
                    </button>

                    {onOpenOrderCenter && (
                      <button
                        onClick={onOpenOrderCenter}
                        className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold px-3 py-2 rounded-lg text-xs flex items-center gap-1 border border-slate-700"
                      >
                        Order Center
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* ECG Vision Result Card */}
              {msg.ecgResult && (
                <div className="mt-3">
                  <EcgResultCard data={msg.ecgResult} />
                </div>
              )}

              {/* Red Flags Alert Banner */}
              {msg.redFlags && msg.redFlags.length > 0 && !msg.ecgResult && (
                <div className="mt-3 p-3 bg-rose-950/20 border border-rose-800/40 rounded-xl">
                  <div className="flex items-center gap-1.5 text-rose-600 font-bold text-xs">
                    <AlertTriangle className="w-4 h-4 text-rose-600" />
                    <span>RED FLAGS — MUST-NOT-MISS ALERTS</span>
                  </div>
                  <ul className="mt-1.5 text-xs text-rose-800 list-disc list-inside space-y-0.5 font-medium">
                    {msg.redFlags.map((rf, idx) => (
                      <li key={idx}>{rf}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Ranked Differentials Table */}
              {msg.differentials && msg.differentials.length > 0 && (
                <div className="mt-3 bg-white border border-[#E3E8EF] rounded-xl overflow-hidden shadow-sm">
                  <div className="bg-[#F7F8FA] px-3 py-2 border-b border-[#E3E8EF] flex items-center justify-between text-xs font-bold text-[#0B1F3A]">
                    <span className="flex items-center gap-1.5">
                      <Microscope className="w-3.5 h-3.5 text-[#1769AA]" />
                      Ranked Differentials
                    </span>
                    <span className="text-[10px] text-[#667085] font-normal">Evidence-calibrated</span>
                  </div>
                  <div className="divide-y divide-[#E3E8EF] text-xs">
                    {msg.differentials.map((d, idx) => (
                      <div key={idx} className="p-2.5 flex flex-col gap-1">
                        <div className="flex items-center justify-between font-semibold">
                          <span className="text-[#0B1F3A]">{idx + 1}. {d.dx}</span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                              d.probability === "high"
                                ? "bg-rose-100 text-rose-800"
                                : d.probability === "moderate"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {d.probability}
                          </span>
                        </div>
                        {d.for && (
                          <div className="text-[11px] text-[#475467]">
                            <span className="text-emerald-700 font-semibold">Supporting:</span> {d.for}
                          </div>
                        )}
                        {d.against && (
                          <div className="text-[11px] text-[#475467]">
                            <span className="text-rose-700 font-semibold">Opposing / Rule-out:</span> {d.against}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Blind-Spot Check (Collapsible) */}
              {msg.blindSpots && msg.blindSpots.length > 0 && (
                <div className="mt-3 bg-amber-50/60 border border-amber-200/80 rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedBlindSpots((prev) => ({ ...prev, [msg.id]: !prev[msg.id] }))
                    }
                    className="w-full px-3 py-2 flex items-center justify-between text-xs font-bold text-amber-900 cursor-pointer bg-amber-100/40 hover:bg-amber-100/70 transition-colors"
                  >
                    <span className="flex items-center gap-1.5">
                      <ShieldAlert className="w-3.5 h-3.5 text-amber-700" />
                      🔍 Blind-Spot Audit ({msg.blindSpots.length} Must-Not-Miss Diagnoses)
                    </span>
                    {expandedBlindSpots[msg.id] ? (
                      <ChevronUp className="w-3.5 h-3.5 text-amber-800" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-amber-800" />
                    )}
                  </button>
                  {expandedBlindSpots[msg.id] && (
                    <div className="p-2.5 divide-y divide-amber-200/60 text-xs space-y-2">
                      {msg.blindSpots.map((b, idx) => (
                        <div key={idx} className="pt-2 first:pt-0">
                          <div className="font-bold text-amber-950">⚠️ Rare/Atypical: {b.rareDx}</div>
                          <div className="text-[11px] text-amber-900 mt-0.5">
                            <b>How to rule in/out:</b> {b.excludeWith}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Source Citations */}
              {msg.citations && msg.citations.length > 0 && (
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] text-[#667085] font-bold uppercase tracking-wider flex items-center gap-1">
                    <BookOpen className="w-3 h-3 text-[#1769AA]" /> Citations:
                  </span>
                  {msg.citations.map((c, idx) => (
                    <span
                      key={idx}
                      title={c.detail}
                      className="inline-flex items-center gap-1 bg-[#EEF4FF] text-[#1769AA] border border-[#D0E2FF] px-2 py-0.5 rounded-md text-[10px] font-mono font-medium shadow-2xs"
                    >
                      <span>{c.source}</span>
                    </span>
                  ))}
                </div>
              )}

              {/* Autonomous Draft Actions (with ApprovalCard) */}
              {msg.draftActions && msg.draftActions.length > 0 && (
                <div className="mt-3 space-y-2">
                  {msg.draftActions.map((act) => (
                    <ApprovalCard key={act.id} action={act} />
                  ))}
                </div>
              )}

              {/* Collapsible Reasoning Trace */}
              {msg.trace && msg.trace.length > 0 && (
                <div className="mt-2.5 bg-slate-50 border border-slate-200 rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedTraces((prev) => ({ ...prev, [msg.id]: !prev[msg.id] }))
                    }
                    className="w-full px-2.5 py-1.5 flex items-center justify-between text-[11px] text-slate-600 hover:text-slate-900 font-mono cursor-pointer"
                  >
                    <span className="flex items-center gap-1">
                      <Cpu className="w-3 h-3 text-[#1769AA]" />
                      How Astra reasoned ({msg.trace.length} steps)
                    </span>
                    {expandedTraces[msg.id] ? (
                      <ChevronUp className="w-3 h-3" />
                    ) : (
                      <ChevronDown className="w-3 h-3" />
                    )}
                  </button>
                  {expandedTraces[msg.id] && (
                    <div className="px-3 py-2 border-t border-slate-200 bg-white space-y-1 text-[11px] font-mono text-slate-700">
                      {msg.trace.map((t, idx) => (
                        <div key={idx} className="flex items-start gap-1.5">
                          <span className="text-slate-400">›</span>
                          <span>{t}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Feedback Loop for Hermes (Self-Upgrade Engine) */}
              {msg.sender === "astra_ai" && (
                <div className="mt-2.5 pt-2 border-t border-[#E3E8EF] flex items-center justify-between text-[10px] text-[#98A2B3]">
                  <span className="italic">AI decision support only — confirm with treating physician</span>
                  <div className="flex items-center gap-1">
                    <span className="mr-1">Helpful?</span>
                    <button
                      type="button"
                      onClick={() => handleFeedback(msg.id, msg.logId, "up")}
                      className={`p-1 rounded transition-colors cursor-pointer ${
                        msg.feedbackGiven === "up"
                          ? "bg-emerald-100 text-emerald-800"
                          : "text-[#667085] hover:text-emerald-700 hover:bg-[#F1F4F7]"
                      }`}
                      title="Thumbs up (Positive clinical feedback for Hermes learning engine)"
                    >
                      <ThumbsUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleFeedback(msg.id, msg.logId, "down")}
                      className={`p-1 rounded transition-colors cursor-pointer ${
                        msg.feedbackGiven === "down"
                          ? "bg-rose-100 text-rose-800"
                          : "text-[#667085] hover:text-rose-700 hover:bg-[#F1F4F7]"
                      }`}
                      title="Thumbs down (Report clinical critique / issue to Hermes engine)"
                    >
                      <ThumbsDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Action Buttons attached to message */}
              {msg.actions && msg.actions.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-700/80 flex flex-wrap gap-2">
                  {msg.actions.map((act, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        if (act.type === "order_lab") {
                          onOrderLab(act.payload.testName, act.payload.category);
                        } else if (act.type === "add_rx") {
                          onAddPrescription(act.payload);
                        } else if (act.type === "set_dx") {
                          onApplyDiagnosis(act.payload);
                        }
                      }}
                      className="bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-500/40 px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      {act.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-cyan-400 text-xs py-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>
              {thinkingMode
                ? "Astra AI high intellectual reasoning in progress (gemini-3.1-pro-preview)... Querying WHO & PubMed..."
                : "Astra AI clinical response generating..."}
            </span>
          </div>
        )}

        {transcribing && (
          <div className="flex items-center gap-2 text-amber-400 text-xs py-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Transcribing medical voice dictation via gemini-3.5-flash...</span>
          </div>
        )}
      </div>
        )}

      {/* Voice Controls + ChatImageUploader Input */}
      <div className="bg-white border-t border-[#E3E8EF]">
        <div className="flex items-center gap-2 px-3 pt-2.5">
          {/* Two-Way Real-time Browser Mic Button */}
          <button
            type="button"
            onClick={handleMic}
            title={listening ? "Listening to doctor voice… click to stop & send" : "Doctor Mic (Speak query / ECG / surgical request)"}
            className={`p-2 rounded-lg border flex items-center justify-center shrink-0 transition-all cursor-pointer astra-mic-btn ${
              listening
                ? "listening bg-[#A92332] text-white border-[#A92332] animate-pulse"
                : "bg-[#F1F4F7] hover:bg-[#E8EEF4] text-[#1769AA] border-[#E3E8EF]"
            }`}
          >
            {listening ? <MicOff className="w-4 h-4 text-white" /> : <Mic className="w-4 h-4 text-[#1769AA]" />}
          </button>

          {/* Hands-Free Voice-to-Voice Live Button */}
          <button
            type="button"
            onClick={toggleVoiceToVoice}
            title="Toggle Hands-Free Continuous Voice-to-Voice Conversation"
            className={`px-3 py-1.5 rounded-lg border flex items-center gap-1.5 shrink-0 transition-all text-xs font-bold cursor-pointer ${
              isVoiceToVoice
                ? "bg-rose-600 text-white border-rose-700 shadow-md animate-pulse"
                : "bg-[#F1F4F7] hover:bg-[#E8EEF4] text-[#1769AA] border-[#E3E8EF]"
            }`}
          >
            <Volume2 className="w-4 h-4" />
            <span className="hidden sm:inline">{isVoiceToVoice ? "Voice LIVE" : "Hands-Free"}</span>
          </button>

          <span className="ml-auto text-[10px] text-[#98A2B3]">
            {enhanceMode ? "AI Enhance ON" : "AI Enhance OFF"} • 12-Lead ECG / JPG / PNG / PDF
          </span>
        </div>

        <ChatImageUploader
          onSend={handleSendFromUploader}
          isLoading={loading || transcribing || ecgBusy}
          placeholder={`Ask Astra AI Co-Pilot (${thinkingMode ? "High Thinking" : activePlugin.replace("_", " ")}) or attach ECG / image...`}
          leading={
            <button
              type="button"
              onClick={handleMic}
              title={listening ? "Listening… click to stop & auto-send" : "Doctor Speech Mic"}
              className={`p-2.5 rounded-xl border flex items-center justify-center shrink-0 transition-all cursor-pointer astra-mic-btn ${
                listening
                  ? "listening bg-[#A92332] text-white border-[#A92332] animate-pulse shadow-md"
                  : "bg-white text-[#1769AA] border-[#E3E8EF] hover:bg-[#F1F4F7] shadow-sm"
              }`}
            >
              {listening ? <MicOff size={18} className="text-white" /> : <Mic size={18} className="text-[#1769AA]" />}
            </button>
          }
        />
      </div>

      {/* Multimodal Medical Image Annotator Modal */}
      <MedicalImageAnnotatorModal
        isOpen={isAnnotatorOpen}
        onClose={() => setIsAnnotatorOpen(false)}
        imageUrl={annotatorImage || undefined}
        patientName={selectedPatient?.name}
        bedNumber={selectedPatient?.bedNumber}
        onSaveToPatientChart={(derivative: any) => {
          const saveMsg: ChatMessage = {
            id: "img-save-" + Date.now(),
            sender: "astra_ai",
            text: `✓ ANNOTATED DERIVATIVE SAVED TO PATIENT RECORD\n• Patient: ${selectedPatient?.name || "Patient"} (${selectedPatient?.bedNumber || "Bed"})\n• Layers Applied: AI Contrast/Sharpness Enhancement + Anatomy Overlay (Median Nerve, Digital Artery, FDS Tendon)\n• Safety Disclaimer Attached: Physical clinical examination mandatory. Original image preserved intact.`,
            pluginUsed: activePlugin,
            modeUsed: astraMode,
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          };
          setChatHistory((prev) => [...prev, saveMsg]);
        }}
      />
    </div>
  );
};


