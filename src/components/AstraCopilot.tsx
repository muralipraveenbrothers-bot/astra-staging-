import React, { useState, useEffect, useRef } from "react";
import { Patient } from "../types";
import { useVoicebox } from "../hooks/useVoicebox";
import {
  hospitalAudio,
  listenHumanSpeech,
  detectLanguageFromText,
  detectContextualSpeechTone,
  VoiceboxProfile,
  VOICEBOX_3_PROFILES,
  SpeechEmotionMode
} from "../utils/audioAlerts";
import {
  Sparkles,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Brain,
  MessageSquare,
  Users,
  UserCheck,
  Award,
  HeartHandshake,
  X,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
  Send,
  Activity,
  ShieldAlert,
  RotateCcw,
  Pause,
  Play,
  Cpu,
  Globe,
  BookOpen,
  Microscope,
  Check,
  Copy,
  AlertTriangle,
  Sliders,
} from "lucide-react";

export type AstraCopilotState = "LISTENING" | "THINKING" | "SPEAKING" | "INTERRUPTED" | "PAUSED" | "BUFFER" | "IDLE";

export type CopilotMode =
  | "copilot"
  | "coach"
  | "patient_psychology"
  | "attendant_psychology"
  | "roleplay"
  | "consultant"
  | "patient_facing"
  | "reasoning"
  | "diagnostic";

interface ChatMessage {
  id: string;
  sender: "doctor" | "astra";
  text: string;
  timestamp: string;
  modeUsed?: CopilotMode;
}

interface AstraCopilotProps {
  selectedPatient?: Patient | null;
  patients?: Patient[];
  activeDept?: string;
  onOpenOrderCenter?: () => void;
}

export const AstraCopilot: React.FC<AstraCopilotProps> = ({
  selectedPatient,
  patients = [],
  activeDept = "doctor",
  onOpenOrderCenter,
}) => {
  // Widget Open/Expanded & Minimized State
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);

  // Copilot Mode State
  const [mode, setMode] = useState<CopilotMode>("copilot");
  const [isCognitiveMode, setIsCognitiveMode] = useState<boolean>(true);

  // Voice & Interaction States
  const [copilotState, setCopilotState] = useState<AstraCopilotState>("IDLE");
  const [isVoiceToVoice, setIsVoiceToVoice] = useState<boolean>(false);
  const isVoiceToVoiceRef = useRef<boolean>(false);

  // Smart Resume state and 2-second buffer timer
  const [isSmartResume, setIsSmartResume] = useState<boolean>(true);
  const isSmartResumeRef = useRef<boolean>(true);
  const smartResumeTimerRef = useRef<any>(null);

  // Voicebox 3-Voice Custom Hook directly interfacing with local Voicebox REST API (http://127.0.0.1:17493)
  const [selectedVoiceProfile, setSelectedVoiceProfile] = useState<VoiceboxProfile | "auto">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("astra_voicebox_override_profile");
      if (saved && ["auto", "jarvis", "male_voice", "female_voice_1", "female_voice_2"].includes(saved)) {
        return saved as VoiceboxProfile | "auto";
      }
    }
    return "auto"; // Default to Auto to respect dashboard roles
  });
  const [isVoiceSettingsOpen, setIsVoiceSettingsOpen] = useState<boolean>(false);
  const [detectedLanguageDisplay, setDetectedLanguageDisplay] = useState<string>("English");
  const [autoSpeakEnabled, setAutoSpeakEnabled] = useState<boolean>(true);

  const handleSetVoiceProfile = (profile: VoiceboxProfile | "auto") => {
    setSelectedVoiceProfile(profile);
    if (typeof window !== "undefined") {
      localStorage.setItem("astra_voicebox_override_profile", profile);
    }
  };

  const voicebox = useVoicebox({
    department: activeDept,
    mode,
    overrideProfile: selectedVoiceProfile,
    clientId: "astra-copilot"
  });

  // Contextual Speech Prosody / Tone State
  const [activeSpeechTone, setActiveSpeechTone] = useState<SpeechEmotionMode>("conversational");

  useEffect(() => {
    isVoiceToVoiceRef.current = isVoiceToVoice;
  }, [isVoiceToVoice]);

  useEffect(() => {
    isSmartResumeRef.current = isSmartResume;
  }, [isSmartResume]);

  const [inputQuery, setInputQuery] = useState<string>("");
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [language, setLanguage] = useState<string>("en-IN");

  const recognitionRef = useRef<any>(null);

  // Conversation History
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    {
      id: "welcome-1",
      sender: "astra",
      text: "Good day. I am Astra Saarathi, the multilingual interaction layer for Astra across all hospital dashboards. I understand English, Telugu, Hindi, Tenglish and Hinglish with automatic language detection.",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      modeUsed: "copilot",
    },
  ]);

  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && !isMinimized) {
      chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatHistory, isOpen, isMinimized, copilotState]);

  // Handle Speech Interrupt / Barge-In
  const handleInterruptSpeech = () => {
    if (smartResumeTimerRef.current) {
      clearTimeout(smartResumeTimerRef.current);
    }
    voicebox.stopSpeech();
    setSpeakingMsgId(null);
    setCopilotState("INTERRUPTED");
    setTimeout(() => {
      if (isVoiceToVoiceRef.current || isSmartResumeRef.current) {
        startVoiceRecording();
      } else {
        setCopilotState("IDLE");
      }
    }, 400);
  };

  // Speak Response with Natural Prosody & Smart-Resume via Voicebox Hook
  const speakMessage = (msgId: string, text: string) => {
    if (smartResumeTimerRef.current) {
      clearTimeout(smartResumeTimerRef.current);
    }
    voicebox.stopSpeech();

    setCopilotState("SPEAKING");
    setSpeakingMsgId(msgId);

    const detectedLang = detectLanguageFromText(text) || language;
    const contextualTone = detectContextualSpeechTone(text, mode);
    const effectiveProfile = voicebox.resolveProfile(text);

    setActiveSpeechTone(contextualTone);

    const triggerSmartResume = () => {
      setSpeakingMsgId(null);
      if (smartResumeTimerRef.current) {
        clearTimeout(smartResumeTimerRef.current);
      }

      if (isSmartResumeRef.current || isVoiceToVoiceRef.current) {
        setCopilotState("BUFFER");
        smartResumeTimerRef.current = setTimeout(() => {
          if (isSmartResumeRef.current || isVoiceToVoiceRef.current) {
            setCopilotState("LISTENING");
            startVoiceRecording();
          } else {
            setCopilotState("IDLE");
          }
        }, 2000); // 2-second buffer period for seamless hands-free turn taking
      } else {
        setCopilotState("IDLE");
      }
    };

    voicebox.speak(text, {
      profile: effectiveProfile,
      language: detectedLang,
      onStart: () => {
        setCopilotState("SPEAKING");
        setSpeakingMsgId(msgId);
      },
      onEnd: triggerSmartResume,
      onError: triggerSmartResume
    });
  };

  // Start Voice Recording with VAD & Auto-Listen
  const startVoiceRecording = async () => {
    if (smartResumeTimerRef.current) {
      clearTimeout(smartResumeTimerRef.current);
    }

    // BARGE-IN: Stop active speech immediately
    voicebox.stopSpeech();
    setSpeakingMsgId(null);

    setIsRecording(true);
    setCopilotState("LISTENING");

    recognitionRef.current = listenHumanSpeech(
      (spokenText) => {
        setIsRecording(false);
        if (spokenText.trim()) {
          setInputQuery(spokenText);
          handleSendMessage(spokenText, true);
        } else {
          if (isVoiceToVoiceRef.current) {
            setTimeout(() => {
              if (isVoiceToVoiceRef.current) startVoiceRecording();
            }, 500);
          } else {
            setCopilotState("IDLE");
          }
        }
      },
      (err) => {
        console.warn("Copilot STT Notice:", err);
        setIsRecording(false);
        if (isVoiceToVoiceRef.current) {
          setTimeout(() => {
            if (isVoiceToVoiceRef.current) startVoiceRecording();
          }, 1000);
        } else {
          setCopilotState("IDLE");
        }
      }
    );
  };

  // Toggle Voice-to-Voice Full-Duplex
  const toggleVoiceToVoice = () => {
    const nextVal = !isVoiceToVoice;
    setIsVoiceToVoice(nextVal);
    isVoiceToVoiceRef.current = nextVal;

    if (nextVal) {
      hospitalAudio.playSuccessChime();
      setCopilotState("LISTENING");
      const greet = "Astra Copilot Hands-Free Voice Live active. I am listening naturally.";
      voicebox.speak(greet, {
        language,
        onStart: () => setCopilotState("SPEAKING"),
        onEnd: () => {
          if (isVoiceToVoiceRef.current) {
            setCopilotState("LISTENING");
            startVoiceRecording();
          }
        }
      });
    } else {
      voicebox.stopSpeech();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
      setIsRecording(false);
      setCopilotState("PAUSED");
      setTimeout(() => setCopilotState("IDLE"), 800);
    }
  };

  // Send Message Logic
  const handleSendMessage = async (queryText?: string, isVoiceTriggered: boolean = false) => {
    const textToSend = queryText || inputQuery;
    if (!textToSend.trim()) return;

    // BARGE-IN: stop synthesis
    voicebox.stopSpeech();
    setSpeakingMsgId(null);

    // Voice Command Mode Triggers
    let effectiveMode = mode;
    const lowerQuery = textToSend.toLowerCase().trim();

    if (lowerQuery.includes("start roleplay") || lowerQuery.includes("start clinical roleplay")) {
      effectiveMode = "roleplay";
      setMode("roleplay");
    } else if (lowerQuery.includes("stop roleplay") || lowerQuery.includes("end roleplay")) {
      effectiveMode = "roleplay";
      setMode("roleplay");
    } else if (lowerQuery.includes("analyze patient psychology") || lowerQuery.includes("patient psychology")) {
      effectiveMode = "patient_psychology";
      setMode("patient_psychology");
    } else if (lowerQuery.includes("analyze attendant") || lowerQuery.includes("attendant psychology")) {
      effectiveMode = "attendant_psychology";
      setMode("attendant_psychology");
    } else if (lowerQuery.includes("coach me") || lowerQuery.includes("communication coach")) {
      effectiveMode = "coach";
      setMode("coach");
    } else if (lowerQuery.includes("talk normally") || lowerQuery.includes("back to copilot") || lowerQuery.includes("copilot mode")) {
      effectiveMode = "copilot";
      setMode("copilot");
    } else if (lowerQuery.includes("consultant mode") || lowerQuery.includes("switch to consultant")) {
      effectiveMode = "consultant";
      setMode("consultant");
    } else if (lowerQuery.includes("explain to patient") || lowerQuery.includes("explain to the patient")) {
      effectiveMode = "patient_facing";
      setMode("patient_facing");
    } else if (lowerQuery.includes("doctor mode") || lowerQuery.includes("clinical mode")) {
      effectiveMode = "reasoning";
      setMode("reasoning");
    }

    const userMsg: ChatMessage = {
      id: "u-" + Date.now(),
      sender: "doctor",
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setChatHistory((prev) => [...prev, userMsg]);
    setInputQuery("");
    setLoading(true);
    setCopilotState("THINKING");

    try {
      const response = await fetch("/api/saarathi/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("astra.serverToken") ?? ""}` },
        body: JSON.stringify({
          message: textToSend,
          workspace: activeDept,
          source: isVoiceTriggered ? "voice" : "text",
          patientContext: selectedPatient
            ? {
                name: selectedPatient.name,
                uhid: selectedPatient.uhid,
              }
            : null,
        }),
      });

      const resData = await response.json();
      const aiText = resData.text || "I am Astra. How can I assist you?";

      if (resData.languageName) {
        setDetectedLanguageDisplay(resData.languageName);
      }
      if (resData.detectedLanguage) {
        setLanguage(resData.detectedLanguage);
      }

      const aiMsg: ChatMessage = {
        id: "ai-" + Date.now(),
        sender: "astra",
        text: aiText,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        modeUsed: effectiveMode,
      };

      setChatHistory((prev) => [...prev, aiMsg]);

      // Automatically speak reply in detected language if voice triggered, live mode, or autoSpeak
      if (isVoiceTriggered || isVoiceToVoiceRef.current || autoSpeakEnabled) {
        speakMessage(aiMsg.id, aiMsg.text);
      } else {
        setCopilotState("IDLE");
      }
    } catch (err) {
      const errText = `Sanjeevani could not complete that turn${err instanceof Error ? `: ${err.message}` : ""}. Nothing was changed. Please try again.`;
      const errId = "err-" + Date.now();
      const aiMsg: ChatMessage = {
        id: errId,
        sender: "astra",
        text: errText,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        modeUsed: effectiveMode,
      };

      setChatHistory((prev) => [...prev, aiMsg]);
      if (isVoiceTriggered || isVoiceToVoiceRef.current) {
        speakMessage(errId, errText);
      } else {
        setCopilotState("IDLE");
      }
    } finally {
      setLoading(false);
    }
  };

  const modeOptions: { id: CopilotMode; label: string; icon: any; color: string; desc: string }[] = [
    { id: "copilot", label: "Astra Copilot", icon: Sparkles, color: "from-cyan-500 to-emerald-600", desc: "Conversational Medical AI Partner" },
    { id: "coach", label: "Communication Coach", icon: MessageSquare, color: "from-indigo-500 to-purple-600", desc: "De-escalation & 'Don't Defend — Explain'" },
    { id: "patient_psychology", label: "Patient Psychology", icon: Brain, color: "from-sky-500 to-blue-600", desc: "Anxiety, Fear & Trust Markers" },
    { id: "attendant_psychology", label: "Attendant Psychology", icon: Users, color: "from-teal-500 to-cyan-600", desc: "Patient vs Attendant vs Clinical Reality" },
    { id: "roleplay", label: "Clinical Roleplay", icon: UserCheck, color: "from-rose-500 to-amber-600", desc: "Simulated Patient & Score (/10)" },
    { id: "consultant", label: "Consultant Mentor", icon: Award, color: "from-violet-500 to-fuchsia-600", desc: "Senior Mentorship & Boundary Setting" },
    { id: "patient_facing", label: "Patient Explanation", icon: HeartHandshake, color: "from-emerald-500 to-teal-600", desc: "Layperson Terms & Multilingual" },
    { id: "reasoning", label: "Clinical Reasoning", icon: Cpu, color: "from-blue-600 to-indigo-700", desc: "Differential Dx & Mimics" },
    { id: "diagnostic", label: "Diagnostic Strategy", icon: Microscope, color: "from-blue-500 to-indigo-600", desc: "Test Stewardship & Stewardship" },
  ];

  return (
    <>
      {/* Persistent Floating Widget Trigger Button (Bottom Right) */}
      {!isOpen && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2">
          <button
            onClick={() => setIsOpen(true)}
            className="group bg-gradient-to-r from-slate-900 via-[#1769AA] to-slate-900 text-white p-3 sm:px-4 sm:py-3 rounded-full shadow-2xl border border-cyan-400/50 hover:scale-105 active:scale-95 transition-all flex items-center gap-3 cursor-pointer"
            title="Open Astra Copilot Conversational Assistant"
          >
            <div className="relative flex items-center justify-center">
              <span className="absolute -inset-1 rounded-full bg-cyan-400/30 animate-ping" />
              <div className="w-8 h-8 rounded-full bg-cyan-500 flex items-center justify-center text-slate-950 font-black shadow-inner">
                <Sparkles className="w-4 h-4 text-slate-950 animate-spin-slow" />
              </div>
            </div>
            <div className="text-left hidden sm:block">
              <div className="flex items-center gap-1.5 text-[11px] font-black text-amber-300 tracking-wider uppercase">
                <span>SANJEEVANI AI</span>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              </div>
              <div className="text-[10px] text-slate-200 font-mono">Multilingual Voicebox • Live</div>
            </div>
          </button>
        </div>
      )}

      {/* Expanded Floating Astra Copilot Panel / Drawer */}
      {isOpen && (
        <div
          className={`fixed right-2 sm:right-6 bottom-2 sm:bottom-6 z-50 w-[95vw] sm:w-[440px] bg-white rounded-3xl shadow-2xl border border-[#D0D9E2] flex flex-col transition-all duration-300 overflow-hidden font-sans ${
            isMinimized ? "h-[68px]" : "h-[85vh] sm:h-[620px]"
          }`}
        >
          {/* Top Header Bar */}
          <div className="bg-gradient-to-r from-slate-900 via-[#0B1F3A] to-slate-900 text-white p-3.5 flex items-center justify-between border-b border-cyan-900/50 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-yellow-600 flex items-center justify-center shadow">
                <Sparkles className="w-4 h-4 text-slate-950 font-bold" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-extrabold text-sm text-amber-300 tracking-wide">ASTRA SAARATHI</span>
                  <span className="text-[9px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 px-2 py-0.5 rounded-full uppercase font-mono">
                    VOICEBOX
                  </span>
                  <span className="text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-400/40 px-2 py-0.5 rounded-full uppercase font-mono flex items-center gap-1">
                    <Globe className="w-2.5 h-2.5 text-amber-400" /> {detectedLanguageDisplay}
                  </span>
                </div>
                <div className="text-[10px] text-slate-300 font-mono truncate max-w-[220px]">
                  {selectedPatient ? `Pt: ${selectedPatient.name} (${selectedPatient.uhid})` : "Universal Hospital Multilingual AI"}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {/* Auto-Speak Toggle */}
              <button
                onClick={() => setAutoSpeakEnabled(!autoSpeakEnabled)}
                title={autoSpeakEnabled ? "Auto-Speak ON: Speaks reply in detected language" : "Auto-Speak OFF: Silent"}
                className={`px-2 py-1 rounded-xl border text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                  autoSpeakEnabled
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/50"
                    : "bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700"
                }`}
              >
                <Volume2 className="w-3 h-3" />
                <span className="hidden sm:inline">{autoSpeakEnabled ? "Voice" : "Mute"}</span>
              </button>

              {/* Hands-Free Voice Live Button */}
              <button
                onClick={toggleVoiceToVoice}
                title="Toggle Continuous Hands-Free Voice Conversation"
                className={`px-2.5 py-1 rounded-xl border text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  isVoiceToVoice
                    ? "bg-rose-600 text-white border-rose-500 shadow-md animate-pulse"
                    : "bg-slate-800 text-cyan-300 border-slate-700 hover:bg-slate-700"
                }`}
              >
                <Mic className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{isVoiceToVoice ? "LIVE" : "Mic"}</span>
              </button>

              <button
                onClick={() => setIsMinimized(!isMinimized)}
                className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg cursor-pointer"
                title={isMinimized ? "Expand Drawer" : "Minimize Drawer"}
              >
                {isMinimized ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg cursor-pointer"
                title="Close Astra Copilot"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {!isMinimized && (
            <>
              {/* Cognitive Mode Toggle Switch Sub-Header */}
              <div className="bg-[#0F172A] px-3.5 py-2 border-b border-slate-800 flex items-center justify-between text-xs shrink-0">
                <div className="flex items-center gap-2">
                  <div
                    onClick={() => setIsCognitiveMode(!isCognitiveMode)}
                    className={`w-9 h-5 flex items-center rounded-full p-0.5 cursor-pointer transition-colors ${
                      isCognitiveMode ? "bg-gradient-to-r from-cyan-500 to-blue-600" : "bg-slate-700"
                    }`}
                    title="Toggle Cognitive Mentor Mode (Open-ended reasoning & coaching)"
                  >
                    <div
                      className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                        isCognitiveMode ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </div>
                  <div className="flex flex-col">
                    <span className="font-extrabold text-[11px] text-white flex items-center gap-1.5">
                      <Brain className={`w-3.5 h-3.5 ${isCognitiveMode ? "text-cyan-400 animate-pulse" : "text-slate-400"}`} />
                      COGNITIVE MODE: {isCognitiveMode ? "MENTOR & COACH" : "TASK OPERATIONS"}
                    </span>
                    <span className="text-[9px] text-slate-400">
                      {isCognitiveMode
                        ? "Open-ended reasoning, roleplay & psychology"
                        : "Task-oriented order entry & clinical commands"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Active Voicebox Profile / Persona Indicator Badge */}
                  <div
                    className="text-[9px] font-mono font-bold px-2.5 py-0.5 rounded-full border transition-all flex items-center gap-1.5 bg-gradient-to-r from-cyan-950/80 to-indigo-950/80 text-cyan-200 border-cyan-500/40 shadow-sm"
                    title={`Active Voicebox Persona: ${voicebox.activeProfileMeta.name} (${voicebox.activeProfileMeta.role}). Auto-switched based on Department: ${activeDept}`}
                  >
                    <Volume2 className="w-3 h-3 text-cyan-400 animate-pulse" />
                    <span>PERSONA: <strong className="text-white font-sans">{voicebox.activeProfileMeta.name}</strong></span>
                  </div>

                  <button
                    onClick={() => setIsVoiceSettingsOpen(true)}
                    className="text-[9px] font-mono font-bold px-2.5 py-0.5 rounded-full border border-cyan-500/40 bg-cyan-950/60 hover:bg-cyan-900 text-cyan-300 transition-all flex items-center gap-1 cursor-pointer shadow-sm"
                    title="Open Voicebox Voice Profile & Override Settings"
                  >
                    <Sliders className="w-2.5 h-2.5 text-cyan-400" />
                    <span>SETTINGS</span>
                  </button>

                  {/* Voicebox Local REST API Connection Indicator */}
                  <div
                    className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full border transition-all flex items-center gap-1 ${
                      voicebox.isLocalVoiceboxConnected
                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                        : "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
                    }`}
                    title="Voicebox REST API Connection Status (http://127.0.0.1:17493)"
                  >
                    <Cpu className="w-2.5 h-2.5 text-cyan-400" />
                    <span>VOICEBOX REST: {voicebox.isLocalVoiceboxConnected ? "127.0.0.1:17493" : "STREAM PROXY"}</span>
                  </div>

                  {/* Contextual Tone Logic Indicator Badge */}
                  <div
                    className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full border transition-all flex items-center gap-1 ${
                      activeSpeechTone === "empathetic"
                        ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/40 animate-pulse"
                        : activeSpeechTone === "urgent"
                        ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                        : "bg-slate-800 text-slate-300 border-slate-700"
                    }`}
                    title="Contextual Speech Prosody: Automatically shifts to a calmer and slower rate when discussing sensitive medical concerns or patient anxiety"
                  >
                    <HeartHandshake className={`w-2.5 h-2.5 ${activeSpeechTone === "empathetic" ? "text-pink-300" : "text-cyan-400"}`} />
                    <span>PROSODY: {activeSpeechTone === "empathetic" ? "CALM & SLOW" : activeSpeechTone.toUpperCase()}</span>
                  </div>

                  <button
                    onClick={() => setIsSmartResume(!isSmartResume)}
                    className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full border transition-all cursor-pointer flex items-center gap-1 ${
                      isSmartResume
                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30"
                        : "bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700"
                    }`}
                    title="Toggle 2-second Smart Resume auto-listen buffer after AI spoken response"
                  >
                    <RotateCcw className={`w-2.5 h-2.5 ${isSmartResume ? "text-emerald-400" : "text-slate-400"}`} />
                    <span>SMART RESUME: {isSmartResume ? "ON (2s)" : "OFF"}</span>
                  </button>

                  <span
                    className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                      isCognitiveMode
                        ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
                        : "bg-slate-800 text-slate-400 border-slate-700"
                    }`}
                  >
                    {isCognitiveMode ? "ACTIVE" : "OFF"}
                  </span>
                </div>
              </div>

              {/* Animated Copilot Voice State HUD */}
              <div className="bg-slate-900 text-white px-4 py-2 border-b border-slate-800 flex items-center justify-between text-xs shrink-0">
                <div className="flex items-center gap-2">
                  {copilotState === "LISTENING" && (
                    <>
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                      <span className="font-mono font-bold text-emerald-400">LISTENING...</span>
                      <span className="text-[10px] text-slate-400">Speak naturally</span>
                    </>
                  )}

                  {copilotState === "THINKING" && (
                    <>
                      <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
                      <span className="font-mono font-bold text-cyan-300">THINKING & REASONING...</span>
                    </>
                  )}

                  {copilotState === "SPEAKING" && (
                    <>
                      <div className="flex items-end gap-0.5 h-3.5">
                        <span className="w-1 bg-cyan-400 rounded-full animate-[bounce_0.8s_infinite_100ms] h-2" />
                        <span className="w-1 bg-cyan-400 rounded-full animate-[bounce_0.8s_infinite_300ms] h-3.5" />
                        <span className="w-1 bg-cyan-400 rounded-full animate-[bounce_0.8s_infinite_200ms] h-2.5" />
                      </div>
                      <span className="font-mono font-bold text-cyan-300">ASTRA SPEAKING...</span>
                      <span className="text-[10px] text-teal-200 bg-teal-950/80 px-2 py-0.5 rounded-full border border-teal-500/40 flex items-center gap-1 font-sans">
                        <Volume2 className="w-3 h-3 text-teal-300 animate-pulse" />
                        <span>{voicebox.activeProfileMeta.name}</span>
                      </span>
                      {activeSpeechTone === "empathetic" && (
                        <span className="text-[10px] text-pink-200 bg-pink-950/80 px-2 py-0.5 rounded-full border border-pink-500/40 flex items-center gap-1 font-sans">
                          <HeartHandshake className="w-3 h-3 text-pink-300 animate-pulse" />
                          Calm & Slower Prosody
                        </span>
                      )}
                    </>
                  )}

                  {copilotState === "BUFFER" && (
                    <>
                      <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
                      <span className="font-mono font-bold text-cyan-300">SMART-RESUME (2s)...</span>
                      <span className="text-[10px] text-slate-400">Opening mic for turn-taking</span>
                    </>
                  )}

                  {copilotState === "INTERRUPTED" && (
                    <>
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                      <span className="font-mono font-bold text-amber-300">INTERRUPTED (Barge-in)</span>
                    </>
                  )}

                  {copilotState === "PAUSED" && (
                    <>
                      <Pause className="w-3.5 h-3.5 text-slate-400" />
                      <span className="font-mono font-bold text-slate-400">PAUSED</span>
                    </>
                  )}

                  {copilotState === "IDLE" && (
                    <>
                      <span className="w-2 h-2 rounded-full bg-cyan-400" />
                      <span className="font-mono font-bold text-slate-300">COPILOT READY</span>
                    </>
                  )}
                </div>

                {/* Barge-in / Interrupt / Listen Now Actions */}
                {copilotState === "SPEAKING" && (
                  <button
                    onClick={handleInterruptSpeech}
                    className="bg-rose-600/80 hover:bg-rose-600 text-white text-[10px] font-bold px-2 py-0.5 rounded border border-rose-500 cursor-pointer"
                  >
                    Interrupt & Speak
                  </button>
                )}

                {copilotState === "BUFFER" && (
                  <button
                    onClick={() => {
                      if (smartResumeTimerRef.current) clearTimeout(smartResumeTimerRef.current);
                      setCopilotState("LISTENING");
                      startVoiceRecording();
                    }}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold px-2 py-0.5 rounded border border-emerald-400 cursor-pointer flex items-center gap-1"
                  >
                    <Mic className="w-3 h-3" /> Listen Now
                  </button>
                )}
              </div>

              {/* Mode Selection Pills */}
              <div className="bg-[#F8FAFC] border-b border-[#E2E8F0] p-2 overflow-x-auto flex items-center gap-1.5 shrink-0 scrollbar-none">
                {modeOptions.map((m) => {
                  const isActive = mode === m.id;
                  const IconComp = m.icon;
                  return (
                    <button
                      key={m.id}
                      onClick={() => setMode(m.id)}
                      className={`px-2.5 py-1 rounded-xl text-[11px] font-bold whitespace-nowrap flex items-center gap-1.5 transition-all cursor-pointer ${
                        isActive
                          ? "bg-[#1769AA] text-white shadow-sm"
                          : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"
                      }`}
                      title={m.desc}
                    >
                      <IconComp className="w-3 h-3" />
                      <span>{m.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Voicebox 3-Voice Profile Selector Bar */}
              <div className="bg-slate-900 border-b border-slate-800 px-3 py-1.5 flex items-center justify-between gap-2 overflow-x-auto text-[11px] text-slate-300 shrink-0">
                <div className="flex items-center gap-1.5 shrink-0 font-mono text-[10px] text-cyan-300 font-bold">
                  <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
                  <span>VOICEBOX PROFILE:</span>
                </div>
                <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
                  <button
                    onClick={() => setSelectedVoiceProfile("jarvis")}
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border transition-all cursor-pointer flex items-center gap-1 ${
                      selectedVoiceProfile === "jarvis"
                        ? "bg-amber-500/30 text-amber-200 border-amber-400 ring-1 ring-amber-400/40"
                        : "bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700"
                    }`}
                    title="Astra human voice profile powered by Voicebox"
                  >
                    <span>🎙️ ASTRA</span>
                  </button>
                  <button
                    onClick={() => setSelectedVoiceProfile("auto")}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition-all cursor-pointer ${
                      selectedVoiceProfile === "auto"
                        ? "bg-cyan-500/30 text-cyan-200 border-cyan-400"
                        : "bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700"
                    }`}
                    title="Automatically selects voice profile based on query context"
                  >
                    AUTO
                  </button>
                  <button
                    onClick={() => setSelectedVoiceProfile("male_voice")}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition-all cursor-pointer flex items-center gap-1 ${
                      selectedVoiceProfile === "male_voice"
                        ? "bg-indigo-500/30 text-indigo-200 border-indigo-400"
                        : "bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700"
                    }`}
                    title="male_voice: Deep, clear, Doctor voice for clinical Q&A & reasoning"
                  >
                    <span>👨‍⚕️ Doctor (male)</span>
                  </button>
                  <button
                    onClick={() => setSelectedVoiceProfile("female_voice_1")}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition-all cursor-pointer flex items-center gap-1 ${
                      selectedVoiceProfile === "female_voice_1"
                        ? "bg-pink-500/30 text-pink-200 border-pink-400"
                        : "bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700"
                    }`}
                    title="female_voice_1: Warm, empathetic Counselor voice for pregnancy & patient tips"
                  >
                    <span>👩‍⚕️ Counselor (female_1)</span>
                  </button>
                  <button
                    onClick={() => setSelectedVoiceProfile("female_voice_2")}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition-all cursor-pointer flex items-center gap-1 ${
                      selectedVoiceProfile === "female_voice_2"
                        ? "bg-emerald-500/30 text-emerald-200 border-emerald-400"
                        : "bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700"
                    }`}
                    title="female_voice_2: Professional, crisp Reception voice for greetings & announcements"
                  >
                    <span>👩‍💼 Reception (female_2)</span>
                  </button>
                </div>
              </div>

              {/* Chat Body */}
              <div className="flex-1 p-3.5 overflow-y-auto space-y-3 font-sans text-xs sm:text-sm bg-[#F1F5F9]/50">
                {chatHistory.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${msg.sender === "doctor" ? "items-end" : "items-start"}`}
                  >
                    <div
                      className={`max-w-[88%] p-3 rounded-2xl shadow-sm text-xs leading-relaxed ${
                        msg.sender === "doctor"
                          ? "bg-[#1769AA] text-white rounded-br-none"
                          : "bg-white text-slate-800 border border-[#CBD5E1] rounded-bl-none"
                      }`}
                    >
                      {msg.sender === "astra" && (
                        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1 mb-1.5 text-[10px] text-slate-500 font-mono">
                          <span className="font-bold text-[#1769AA] flex items-center gap-1">
                            <Sparkles className="w-3 h-3" /> Astra Copilot ({msg.modeUsed || mode})
                          </span>
                          <button
                            onClick={() => speakMessage(msg.id, msg.text)}
                            className="hover:text-[#1769AA] p-0.5 rounded cursor-pointer"
                            title="Speak Message"
                          >
                            <Volume2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                      <div className="whitespace-pre-wrap">{msg.text}</div>
                    </div>
                    <span className="text-[9px] text-slate-400 font-mono px-1 mt-0.5">{msg.timestamp}</span>
                  </div>
                ))}

                {loading && (
                  <div className="flex items-center gap-2 p-3 bg-white rounded-2xl border border-slate-200 w-fit text-slate-600 text-xs font-mono">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-600 animate-spin" />
                    <span>Astra is analyzing clinical & communication dynamics...</span>
                  </div>
                )}

                <div ref={chatBottomRef} />
              </div>

              {/* Input Area */}
              <div className="p-3 bg-white border-t border-[#E2E8F0] flex flex-col gap-2 shrink-0">
                <div className="flex items-center gap-2">
                  <button
                    onClick={startVoiceRecording}
                    className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                      isRecording
                        ? "bg-rose-600 text-white border-rose-700 animate-pulse"
                        : "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200"
                    }`}
                    title="Speech-to-Text Input"
                  >
                    <Mic className="w-4 h-4" />
                  </button>

                  <input
                    type="text"
                    value={inputQuery}
                    onChange={(e) => setInputQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                    placeholder={
                      mode === "roleplay"
                        ? "Type or speak roleplay scenario or response..."
                        : mode === "coach"
                        ? "Describe patient interaction for coaching..."
                        : "Ask Astra anything (clinical, psychology, general)..."
                    }
                    className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1769AA]"
                  />

                  <button
                    onClick={() => handleSendMessage()}
                    disabled={!inputQuery.trim()}
                    className="p-2.5 bg-[#1769AA] hover:bg-[#0B1F3A] text-white rounded-xl disabled:opacity-40 transition-colors cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Voicebox Audio & Persona Settings Modal */}
      {isVoiceSettingsOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl flex flex-col text-slate-100">
            {/* Modal Header */}
            <div className="px-5 py-4 bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white flex items-center gap-2">
                    Voicebox Persona & Audio Override
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Configure staff voice profile overrides & REST preferences
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsVoiceSettingsOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 flex flex-col gap-4 text-xs">
              {/* Department Context Info Box */}
              <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 block">Current Active Department</span>
                  <span className="font-bold text-cyan-300 text-xs capitalize">{activeDept || "Doctor"} Department</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 block">Auto-Mapped Voice</span>
                  <span className="font-semibold text-slate-200 text-xs">{VOICEBOX_3_PROFILES[voicebox.resolveProfile()].name}</span>
                </div>
              </div>

              {/* Persona Override Options */}
              <div className="flex flex-col gap-2">
                <label className="font-semibold text-slate-300 text-xs flex items-center justify-between">
                  <span>Select Voice Profile Override:</span>
                  <span className="text-[10px] text-emerald-400 font-mono">Persisted in Local Storage</span>
                </label>

                <div className="grid grid-cols-1 gap-2">
                  {/* Option: Auto */}
                  <div
                    onClick={() => handleSetVoiceProfile("auto")}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                      selectedVoiceProfile === "auto"
                        ? "bg-cyan-950/60 border-cyan-500 text-white shadow-md ring-1 ring-cyan-500/50"
                        : "bg-slate-800/50 border-slate-700/60 text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${selectedVoiceProfile === "auto" ? "border-cyan-400 bg-cyan-500" : "border-slate-600"}`}>
                        {selectedVoiceProfile === "auto" && <Check className="w-2.5 h-2.5 text-slate-950 stroke-[3]" />}
                      </div>
                      <div>
                        <div className="font-bold text-xs flex items-center gap-1.5">
                          <span>Auto (Department-Driven Mapping)</span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-mono">DEFAULT</span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Switches dynamically: Doctor → Male Voice, Counselor → Female 1, Reception → Female 2
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Option: Male Voice */}
                  <div
                    onClick={() => handleSetVoiceProfile("male_voice")}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                      selectedVoiceProfile === "male_voice"
                        ? "bg-cyan-950/60 border-cyan-500 text-white shadow-md ring-1 ring-cyan-500/50"
                        : "bg-slate-800/50 border-slate-700/60 text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${selectedVoiceProfile === "male_voice" ? "border-cyan-400 bg-cyan-500" : "border-slate-600"}`}>
                        {selectedVoiceProfile === "male_voice" && <Check className="w-2.5 h-2.5 text-slate-950 stroke-[3]" />}
                      </div>
                      <div>
                        <div className="font-bold text-xs flex items-center gap-1.5">
                          <span>Doctor Voice (Male)</span>
                          <span className="text-[9px] text-cyan-300 font-mono font-normal">Dr. Chatterbox</span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Deep, authoritative clinical reasoning & diagnostic tone
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        voicebox.speak("Testing Male Doctor voice profile.", "male_voice");
                      }}
                      className="px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs font-semibold text-cyan-300 border border-slate-600 transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <Volume2 className="w-3 h-3 text-cyan-400" />
                      <span>Test</span>
                    </button>
                  </div>

                  {/* Option: Female Voice 1 */}
                  <div
                    onClick={() => handleSetVoiceProfile("female_voice_1")}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                      selectedVoiceProfile === "female_voice_1"
                        ? "bg-cyan-950/60 border-cyan-500 text-white shadow-md ring-1 ring-cyan-500/50"
                        : "bg-slate-800/50 border-slate-700/60 text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${selectedVoiceProfile === "female_voice_1" ? "border-cyan-400 bg-cyan-500" : "border-slate-600"}`}>
                        {selectedVoiceProfile === "female_voice_1" && <Check className="w-2.5 h-2.5 text-slate-950 stroke-[3]" />}
                      </div>
                      <div>
                        <div className="font-bold text-xs flex items-center gap-1.5">
                          <span>Counselor Voice (Female 1)</span>
                          <span className="text-[9px] text-pink-300 font-mono font-normal">Counselor Chatterbox</span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Warm, empathetic tone for psychology & maternity guidance
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        voicebox.speak("Testing Counselor female voice profile.", "female_voice_1");
                      }}
                      className="px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs font-semibold text-pink-300 border border-slate-600 transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <Volume2 className="w-3 h-3 text-pink-400" />
                      <span>Test</span>
                    </button>
                  </div>

                  {/* Option: Female Voice 2 */}
                  <div
                    onClick={() => handleSetVoiceProfile("female_voice_2")}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                      selectedVoiceProfile === "female_voice_2"
                        ? "bg-cyan-950/60 border-cyan-500 text-white shadow-md ring-1 ring-cyan-500/50"
                        : "bg-slate-800/50 border-slate-700/60 text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${selectedVoiceProfile === "female_voice_2" ? "border-cyan-400 bg-cyan-500" : "border-slate-600"}`}>
                        {selectedVoiceProfile === "female_voice_2" && <Check className="w-2.5 h-2.5 text-slate-950 stroke-[3]" />}
                      </div>
                      <div>
                        <div className="font-bold text-xs flex items-center gap-1.5">
                          <span>Receptionist Voice (Female 2)</span>
                          <span className="text-[9px] text-emerald-300 font-mono font-normal">Reception Chatterbox</span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Clear, crisp & professional frontdesk routing voice
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        voicebox.speak("Testing Receptionist female voice profile.", "female_voice_2");
                      }}
                      className="px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs font-semibold text-emerald-300 border border-slate-600 transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <Volume2 className="w-3 h-3 text-emerald-400" />
                      <span>Test</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3.5 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={() => handleSetVoiceProfile("auto")}
                className="text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                Reset to Auto
              </button>
              <button
                type="button"
                onClick={() => setIsVoiceSettingsOpen(false)}
                className="px-4 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition-colors cursor-pointer shadow-lg shadow-cyan-600/20"
              >
                Save & Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
