// ============================================================================
// DR. MAYIN AI â€” Unified Jarvis-Style Fullscreen Voice Copilot
// Replaces the old "ASTRA AI" amber panel with a premium holographic UI.
// Saarathi Â· Sanjeevani Â· Jarvis all route through here as Dr. Mayin.
// ============================================================================
import React, { useState, useEffect, useRef, useCallback } from "react";
import { Mic, MicOff, Send, X, Volume2, VolumeX, ChevronDown, Minimize2, Maximize2, RotateCcw } from "lucide-react";
import { navHash } from "@/lib/hashRoute";
import { dashboardFromRoute } from "@/components/Communications/useAstraVoiceTurn";
import { speakAstra, stopAstraSpeech, unlockAstraAudio } from "@/astra/voice/roundTrip/ttsFallback";
import { useLocalDictation } from "@/astra/voice/useLocalDictation";

// â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export type AstraAIState = "LISTENING" | "THINKING" | "SPEAKING" | "INTERRUPTED" | "IDLE";
interface ChatMessage { id: string; sender: "doctor" | "astra"; text: string; ts: string; }

interface AstraAICopilotProps {
  selectedPatient?: { name?: string; bedNumber?: string } | null;
  patients?: unknown[];
  activeDept?: string;
  onOpenOrderCenter?: () => void;
}

const GREETING = "Dr. Mayin here â€” your unified AI orchestrator for ASTRA Hospital OS. Saarathi, Sanjeevani, and Jarvis all work through me. Speak in English, Telugu, Hindi, Tenglish, or Hinglish.";

// â”€â”€ Animation styles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const STYLE = `
@keyframes dm-orb-idle   { 0%,100%{transform:translateY(0) scale(1)} 50%{transform:translateY(-8px) scale(1.06)} }
@keyframes dm-orb-listen { 0%,100%{transform:scale(1);opacity:.88} 50%{transform:scale(1.22);opacity:1} }
@keyframes dm-orb-think  { 0%{filter:hue-rotate(0deg) brightness(1)} 50%{filter:hue-rotate(60deg) brightness(1.3)} 100%{filter:hue-rotate(0deg) brightness(1)} }
@keyframes dm-orb-speak  { 0%,100%{transform:scale(1)} 33%{transform:scale(1.14) rotate(2deg)} 66%{transform:scale(0.94) rotate(-2deg)} }
@keyframes dm-pulse      { 0%{transform:scale(.8);opacity:.8} 100%{transform:scale(2.5);opacity:0} }
@keyframes dm-bar        { 0%,100%{transform:scaleY(.25)} 50%{transform:scaleY(1)} }
@keyframes dm-slide-up   { from{transform:translateY(12px);opacity:0} to{transform:translateY(0);opacity:1} }
@keyframes dm-glow-g     { 0%,100%{box-shadow:0 0 32px 8px rgba(52,211,153,.3)} 50%{box-shadow:0 0 72px 24px rgba(52,211,153,.55)} }
@keyframes dm-glow-b     { 0%,100%{box-shadow:0 0 32px 8px rgba(56,189,248,.3)} 50%{box-shadow:0 0 72px 24px rgba(56,189,248,.55)} }
@keyframes dm-scan       { 0%,100%{opacity:.06} 50%{opacity:.18} }
@keyframes dm-fade       { from{opacity:0} to{opacity:1} }
@keyframes dm-float      { 0%,100%{transform:translate(0,0) scale(1);opacity:.25} 50%{transform:translate(var(--fx),var(--fy)) scale(1.5);opacity:.6} }
@keyframes dm-ring-spin  { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
@keyframes dm-hex-glow   { 0%,100%{opacity:.3;filter:blur(1px)} 50%{opacity:.7;filter:blur(0px)} }
`;

// â”€â”€ State â†’ orb visual â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function orbStyle(state: AstraAIState) {
  if (state === "LISTENING") return {
    bg: "radial-gradient(ellipse at 38% 28%, #4ade80 0%, #16a34a 55%, #052e16 100%)",
    anim: "dm-orb-listen 1s ease-in-out infinite",
    glow: "dm-glow-g 1.4s ease-in-out infinite",
  };
  if (state === "SPEAKING") return {
    bg: "radial-gradient(ellipse at 38% 28%, #38bdf8 0%, #0369a1 55%, #082f49 100%)",
    anim: "dm-orb-speak .7s ease-in-out infinite",
    glow: "dm-glow-b .9s ease-in-out infinite",
  };
  if (state === "THINKING") return {
    bg: "radial-gradient(ellipse at 38% 28%, #c4b5fd 0%, #7c3aed 55%, #1e1b4b 100%)",
    anim: "dm-orb-think 2s linear infinite",
    glow: "dm-glow-g 2s ease-in-out infinite",
  };
  return {
    bg: "radial-gradient(ellipse at 38% 28%, #34d399 0%, #059669 55%, #022c22 100%)",
    anim: "dm-orb-idle 4s ease-in-out infinite",
    glow: "dm-glow-g 4s ease-in-out infinite",
  };
}

// â”€â”€ Wave bars â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function WaveBars({ active, color }: { active: boolean; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2.5, height: 32 }}>
      {Array.from({ length: 24 }).map((_, i) => (
        <div key={i} style={{
          width: 3, borderRadius: 2, background: color,
          animation: active ? `dm-bar ${.35 + (i % 5) * .1}s ease-in-out ${i * .035}s infinite alternate` : "none",
          height: active ? undefined : 4, minHeight: 4, maxHeight: 28,
          opacity: active ? .8 + (i % 3) * .07 : .25,
          transition: "opacity .3s",
        }} />
      ))}
    </div>
  );
}

// â”€â”€ Hex grid background â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function HexGrid() {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", opacity: .18 }}>
      <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="dm-hex" x="0" y="0" width="56" height="48" patternUnits="userSpaceOnUse">
            <polygon points="14,2 42,2 56,24 42,46 14,46 0,24" fill="none" stroke="rgba(52,211,153,.4)" strokeWidth=".7" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dm-hex)" />
      </svg>
    </div>
  );
}

// â”€â”€ Floating particles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function Particles({ active }: { active: boolean }) {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
      {Array.from({ length: 16 }).map((_, i) => (
        <div key={i} style={{
          position: "absolute",
          width: 3 + (i % 3) * 2, height: 3 + (i % 3) * 2,
          borderRadius: "50%",
          background: ["#34d399", "#38bdf8", "#a78bfa", "#fbbf24"][i % 4],
          left: `${6 + (i * 5.8) % 88}%`,
          top: `${10 + (i * 5.2) % 78}%`,
          // @ts-expect-error css vars
          "--fx": `${(i % 2 ? 1 : -1) * (10 + i * 2.5)}px`,
          "--fy": `${(i % 3 === 0 ? -1 : 1) * (8 + i * 1.8)}px`,
          animation: active ? `dm-float ${2.4 + (i % 4) * .6}s ease-in-out ${i * .15}s infinite` : "none",
          opacity: active ? .5 : .12,
          transition: "opacity .5s",
        }} />
      ))}
    </div>
  );
}

// â”€â”€ Chat bubble â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function Bubble({ msg, onSpeak }: { msg: ChatMessage; onSpeak: (text: string) => void }) {
  const isUser = msg.sender === "doctor";
  return (
    <div style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start", animation: "dm-slide-up .25s ease-out", marginBottom: 8 }}>
      <div style={{
        maxWidth: "78%",
        padding: "10px 14px",
        borderRadius: isUser ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
        background: isUser
          ? "linear-gradient(135deg,#065f46,#047857)"
          : "rgba(15,23,42,.92)",
        border: isUser ? "none" : "1px solid rgba(52,211,153,.15)",
        color: "#f0fdf4", fontSize: 13, lineHeight: 1.58,
        boxShadow: isUser ? "0 2px 10px rgba(5,150,105,.3)" : "0 2px 10px rgba(0,0,0,.4)",
      }}>
        {!isUser && (
          <div style={{ fontSize: 9, color: "#34d399", fontWeight: 800, letterSpacing: ".12em", marginBottom: 4 }}>DR. MAYIN</div>
        )}
        <div style={{ whiteSpace: "pre-wrap" }}>{msg.text}</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4, gap: 8 }}>
          <span style={{ fontSize: 9, color: "rgba(148,163,184,.45)" }}>{msg.ts}</span>
          {!isUser && (
            <button onClick={() => onSpeak(msg.text)} title="Speak this reply"
              style={{ background: "none", border: "none", color: "rgba(52,211,153,.6)", cursor: "pointer", padding: 2, display: "flex" }}>
              <Volume2 size={11} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// MAIN COMPONENT
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const AstraAICopilot: React.FC<AstraAICopilotProps> = ({ selectedPatient, activeDept = "doctor" }) => {
  const [isOpen, setIsOpen]         = useState(false);
  const [isMax, setIsMax]           = useState(false);   // fullscreen toggle
  const [aiState, setAiState]       = useState<AstraAIState>("IDLE");
  const [inputQuery, setInputQuery] = useState("");
  const [muted, setMuted]           = useState(false);
  const [lang, setLang]             = useState("en-IN");
  const [autoSendVoice, setAutoSendVoice] = useState(true);
  const [loading, setLoading]       = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    { id: "g1", sender: "astra", text: GREETING, ts: now() },
  ]);

  const handleSendRef = useRef<(text?: string, source?: "voice" | "text") => Promise<void>>(async () => undefined);
  const chatEndRef  = useRef<HTMLDivElement>(null);
  const dictation = useLocalDictation({
    language: lang,
    autoSendFinal: true,
    onFinal: (text) => {
      if (autoSendVoice) void handleSendRef.current(text, "voice");
      else setInputQuery((q) => `${q}${q ? " " : ""}${text}`);
    },
    onError: (message) => {
      if (message !== "silence") {
        setChatHistory((h) => [...h, { id: `a-${Date.now()}`, sender: "astra", text: message, ts: now() }]);
      }
    },
  });
  const isRecording = dictation.isRecording;
  const liveText = dictation.liveText;

  // auto-scroll
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatHistory, liveText]);
  useEffect(() => {
    if (dictation.isRecording) setAiState("LISTENING");
    else setAiState((state) => (state === "LISTENING" ? "IDLE" : state));
  }, [dictation.isRecording]);

  // astra-ai-launch event (from nav buttons)
  useEffect(() => {
    const open = () => setIsOpen(true);
    window.addEventListener("astra-ai-launch", open);
    return () => window.removeEventListener("astra-ai-launch", open);
  }, []);

  // â”€â”€ TTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const speak = useCallback(async (text: string) => {
    if (muted || !text.trim()) return;
    setAiState("SPEAKING");
    const langCode = lang === "en-IN" ? "en" : lang === "te-IN" ? "te" : lang === "hi-IN" ? "hi" : "en";
    await speakAstra({ text, language: langCode as any, onEnd: () => setAiState("IDLE") });
      }, [muted, lang]);

  // â”€â”€ STT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const startRecording = useCallback(() => {
    setAiState("LISTENING");
    dictation.start();
  }, [dictation]);

  const stopRecording = useCallback(() => {
    dictation.stop();
    setAiState("IDLE");
  }, [dictation]);

  const toggleMic = () => {
    if (isRecording) stopRecording();
    else startRecording();
  };

  // â”€â”€ Send message â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const addAstraMsg = (text: string) =>
    setChatHistory(h => [...h, { id: `a-${Date.now()}`, sender: "astra", text, ts: now() }]);

  const handleSend = useCallback(async (overrideText?: string, source: "voice" | "text" = "text") => {
    const text = (overrideText ?? inputQuery).trim();
    if (!text || loading) return;
    setInputQuery("");
    setChatHistory(h => [...h, { id: `u-${Date.now()}`, sender: "doctor", text, ts: now() }]);
    setLoading(true);
    setAiState("THINKING");

    let reply = "";
    // â”€â”€ Local command shortcuts â”€â”€
    const lower = text.toLowerCase();
    const dashMatch = lower.match(/\b(?:open|show|go to)\s+(reception|pharmacy|radiology|lab|ward|billing|ot|doctor)\b/);
    if (dashMatch) {
      const route = dashMatch[1];
      window.dispatchEvent(new CustomEvent("astra-route-voice-command", { detail: { route: `/${route}`, text } }));
      navHash(`/${route}`);
      reply = `Opening the ${route} dashboard now.`;
    }
    if (/\b(?:add|prepare|create).*(?:tablet|medicine|drug|pill)\b/i.test(text)) {
      window.dispatchEvent(new CustomEvent("astra-pharmacy-command", { detail: { text } }));
      reply = reply || "Medicine request sent to Pharmacy for review.";
    }

    // â”€â”€ API call â”€â”€
    if (!reply) {
      try {
        const token = localStorage.getItem("astra.serverToken");
        const workspace = dashboardFromRoute(window.location.hash.replace(/^#/, ""));
        const res = await fetch("/api/saarathi/turn", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ message: text, workspace, source }),
        });
        if (res.status === 401) {
          reply = "Your session expired. Please sign in again so Dr. Mayin can continue.";
        } else if (!res.ok) {
          reply = `Dr. Mayin couldn't reach the server (HTTP ${res.status}). Hospital controls are operational.`;
        } else {
          const data = await res.json() as { text?: string; actions?: Array<{ type: string; path?: string; args?: Record<string, unknown> }> };
          reply = (data.text ?? "").trim() || "Dr. Mayin is standing by. Hospital controls are fully operational.";
          for (const action of data.actions ?? []) {
            if (action.type === "voice.stop") stopAstraSpeech();
            if (action.type === "ui.navigate" && action.path) navHash(action.path);
            if (action.type === "hospital.command") window.dispatchEvent(new CustomEvent("astra-saarathi-order", { detail: action.args ?? { text } }));
          }
        }
      } catch {
        reply = "Dr. Mayin couldn't complete that request. Hospital controls and local commands remain operational.";
      }
    }

    addAstraMsg(reply);
    setLoading(false);
    void speak(reply);
  }, [inputQuery, loading, speak]);
  handleSendRef.current = handleSend;

  if (!isOpen) return null;

  const { bg: orbBg, anim: orbAnim, glow: orbGlow } = orbStyle(aiState);
  const active = aiState === "LISTENING" || aiState === "SPEAKING";
  const orbColor = aiState === "SPEAKING" ? "#38bdf8" : "#34d399";
  const stateLabel = aiState === "LISTENING" ? "Listeningâ€¦" : aiState === "SPEAKING" ? "Speakingâ€¦" : aiState === "THINKING" ? "Thinkingâ€¦" : "Tap orb or mic to speak";

  // Panel size: fullscreen (isMax) or compact floating (380px right-panel)
  const panelStyle: React.CSSProperties = isMax
    ? { position: "fixed", inset: 0, zIndex: 9990, borderRadius: 0 }
    : { position: "fixed", bottom: 96, right: 16, zIndex: 40, width: 400, maxHeight: "calc(100vh - 120px)", borderRadius: 24 };

  return (
    <>
      <style>{STYLE}</style>
      <div style={{
        ...panelStyle,
        display: "flex", flexDirection: "column", overflow: "hidden",
        background: "radial-gradient(ellipse at 50% 0%, rgba(5,46,22,.85) 0%, rgba(2,6,23,.98) 100%)",
        border: "1px solid rgba(52,211,153,.18)",
        backdropFilter: "blur(24px)",
        boxShadow: "0 32px 80px rgba(0,0,0,.7), 0 0 0 1px rgba(52,211,153,.08)",
        animation: "dm-fade .3s ease-out",
      }}>
        <HexGrid />
        <Particles active={active} />

        {/* â”€â”€ Top bar â”€â”€ */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px", flexShrink: 0, position: "relative", zIndex: 2,
          borderBottom: "1px solid rgba(52,211,153,.1)",
          background: "rgba(2,6,23,.6)", backdropFilter: "blur(12px)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Mini orb */}
            <div style={{ width: 30, height: 30, borderRadius: "50%", background: orbBg, flexShrink: 0, animation: `${orbGlow} 3s ease-in-out infinite`, boxShadow: "0 0 12px rgba(52,211,153,.4)" }} />
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".12em", color: "#34d399" }}>DR. MAYIN AI</div>
              <div style={{ fontSize: 9, color: "rgba(148,163,184,.55)", letterSpacing: ".05em" }}>
                Saarathi Â· Sanjeevani Â· Jarvis{selectedPatient ? ` Â· ${selectedPatient.name}` : ""}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {/* Lang */}
            {[["en-IN","EN"],["te-IN","TE"],["hi-IN","HI"]].map(([v,l]) => (
              <button key={v} onClick={() => setLang(v)}
                style={{ padding: "2px 7px", borderRadius: 5, fontSize: 10, fontWeight: 700, cursor: "pointer", transition: "all .2s",
                  border: `1px solid ${lang === v ? "#34d399" : "rgba(52,211,153,.2)"}`,
                  background: lang === v ? "rgba(52,211,153,.15)" : "transparent",
                  color: lang === v ? "#34d399" : "rgba(148,163,184,.5)" }}>
                {l}
              </button>
            ))}
            {/* Mute */}
            <button onClick={() => { setMuted(m => !m); if (!muted) stopAstraSpeech(); }}
              style={{ width: 28, height: 28, borderRadius: "50%", border: `1px solid ${muted ? "rgba(239,68,68,.4)" : "rgba(52,211,153,.2)"}`,
                background: muted ? "rgba(239,68,68,.1)" : "transparent", color: muted ? "#f87171" : "#64748b",
                display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "all .2s" }}>
              {muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
            </button>
            {/* Maximize */}
            <button onClick={() => setIsMax(m => !m)}
              style={{ width: 28, height: 28, borderRadius: "50%", border: "1px solid rgba(148,163,184,.15)",
                background: "transparent", color: "#64748b", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              {isMax ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            </button>
            {/* Clear */}
            <button onClick={() => setChatHistory([{ id: "g1", sender: "astra", text: GREETING, ts: now() }])}
              style={{ width: 28, height: 28, borderRadius: "50%", border: "1px solid rgba(148,163,184,.15)",
                background: "transparent", color: "#64748b", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
              title="Clear conversation">
              <RotateCcw size={12} />
            </button>
            {/* Close */}
            <button onClick={() => { setIsOpen(false); stopAstraSpeech(); }}
              style={{ width: 28, height: 28, borderRadius: "50%", border: "1px solid rgba(148,163,184,.15)",
                background: "transparent", color: "#64748b", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <X size={12} />
            </button>
          </div>
        </div>

        {/* â”€â”€ Central orb (only in full/max mode or when chat is short) â”€â”€ */}
        {isMax && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 32, paddingBottom: 16, position: "relative", zIndex: 2 }}>
            {/* Pulse rings */}
            {active && <>
              <div style={{ position: "absolute", width: 160, height: 160, top: "50%", left: "50%", transform: "translate(-50%,-50%)", borderRadius: "50%", border: `2px solid ${orbColor}`, animation: "dm-pulse 1.6s ease-out infinite", opacity: .6 }} />
              <div style={{ position: "absolute", width: 200, height: 200, top: "50%", left: "50%", transform: "translate(-50%,-50%)", borderRadius: "50%", border: `1px solid ${orbColor}`, animation: "dm-pulse 1.6s ease-out .4s infinite", opacity: .35 }} />
            </>}
            {/* Orb */}
            <div onClick={() => { unlockAstraAudio(); toggleMic(); }}
              style={{ width: 120, height: 120, borderRadius: "50%", background: orbBg, animation: orbAnim, cursor: "pointer",
                boxShadow: active ? `0 0 50px 16px ${orbColor}44, 0 0 100px 32px ${orbColor}18` : "0 0 32px 10px rgba(52,211,153,.25)",
                position: "relative", zIndex: 1, transition: "box-shadow .4s" }}>
              <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "radial-gradient(ellipse at 30% 28%, rgba(255,255,255,.22) 0%, transparent 60%)" }} />
            </div>
            <div style={{ marginTop: 14, fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase",
              color: aiState === "LISTENING" ? "#34d399" : aiState === "SPEAKING" ? "#38bdf8" : aiState === "THINKING" ? "#a78bfa" : "rgba(148,163,184,.45)",
              transition: "color .4s" }}>{stateLabel}</div>
            <div style={{ marginTop: 10 }}><WaveBars active={active} color={orbColor} /></div>
            {liveText && (
              <div style={{ marginTop: 10, maxWidth: 440, textAlign: "center", fontSize: 13, color: "rgba(241,245,249,.7)", fontStyle: "italic", animation: "dm-slide-up .2s ease-out", padding: "0 20px" }}>
                {liveText}
              </div>
            )}
          </div>
        )}

        {/* â”€â”€ Chat conversation â”€â”€ */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", position: "relative", zIndex: 2,
          scrollbarWidth: "thin", scrollbarColor: "rgba(52,211,153,.2) transparent" }}>
          {chatHistory.length === 0 && (
            <div style={{ textAlign: "center", color: "rgba(148,163,184,.3)", fontSize: 12, paddingTop: 20 }}>
              Tap the mic or type to begin
            </div>
          )}
          {chatHistory.map(m => <Bubble key={m.id} msg={m} onSpeak={speak} />)}
          {loading && (
            <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 8, animation: "dm-slide-up .25s ease-out" }}>
              <div style={{ padding: "10px 14px", borderRadius: "18px 18px 18px 4px", background: "rgba(15,23,42,.9)", border: "1px solid rgba(52,211,153,.12)", color: "rgba(148,163,184,.6)", fontSize: 13 }}>
                <div style={{ fontSize: 9, color: "#34d399", fontWeight: 800, letterSpacing: ".12em", marginBottom: 4 }}>DR. MAYIN</div>
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "#34d399", animation: `dm-bar .9s ease-in-out ${i * .2}s infinite`, opacity: .7 }} />
                  ))}
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* â”€â”€ Input bar â”€â”€ */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8, padding: "10px 12px 14px",
          background: "rgba(2,6,23,.75)", backdropFilter: "blur(12px)",
          borderTop: "1px solid rgba(52,211,153,.1)", position: "relative", zIndex: 2, flexShrink: 0,
        }}>
          <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "rgba(148,163,184,.7)", flexShrink: 0 }}>
            <input type="checkbox" checked={autoSendVoice} onChange={(e) => setAutoSendVoice(e.target.checked)} />
            Auto-send
          </label>
          {/* Mic */}
          <button onClick={() => { unlockAstraAudio(); toggleMic(); }}
            style={{ width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
              background: isRecording ? "linear-gradient(135deg,#065f46,#047857)" : "rgba(52,211,153,.08)",
              border: `2px solid ${isRecording ? "#34d399" : "rgba(52,211,153,.2)"}`,
              color: isRecording ? "#fff" : "#34d399",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", transition: "all .2s",
              boxShadow: isRecording ? "0 0 16px rgba(52,211,153,.45)" : "none",
              animation: isRecording ? "dm-glow-g 1.5s ease-in-out infinite" : "none" }}>
            {isRecording ? <MicOff size={15} /> : <Mic size={15} />}
          </button>

          {/* Text input */}
          <input
            value={inputQuery}
            onChange={e => setInputQuery(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
            placeholder={liveText || "Type to Dr. Mayinâ€¦"}
            style={{ flex: 1, height: 38, borderRadius: 10, background: "rgba(15,23,42,.65)",
              border: "1px solid rgba(52,211,153,.18)", padding: "0 12px", fontSize: 13, color: "#f0fdf4", outline: "none" }}
            onFocus={e => (e.target.style.borderColor = "rgba(52,211,153,.45)")}
            onBlur={e => (e.target.style.borderColor = "rgba(52,211,153,.18)")}
          />

          {/* Send */}
          <button onClick={() => void handleSend()}
            disabled={!inputQuery.trim() && !liveText.trim()}
            style={{ width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
              background: (inputQuery.trim() || liveText.trim()) ? "linear-gradient(135deg,#065f46,#047857)" : "rgba(52,211,153,.06)",
              border: `2px solid ${(inputQuery.trim() || liveText.trim()) ? "#34d399" : "rgba(52,211,153,.12)"}`,
              color: (inputQuery.trim() || liveText.trim()) ? "#fff" : "rgba(52,211,153,.3)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: (inputQuery.trim() || liveText.trim()) ? "pointer" : "default", transition: "all .2s" }}>
            <Send size={14} />
          </button>
        </div>
      </div>
    </>
  );
};

function now() { return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }

export default AstraAICopilot;

