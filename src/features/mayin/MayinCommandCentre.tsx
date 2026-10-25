import { useEffect, useState, useRef, useCallback } from "react";
import { Mic, MicOff, X, Send, Volume2, VolumeX, ChevronDown } from "lucide-react";
import { agentBus } from "@/astra/runtime/agentBus";
import { mayinVisualEngine } from "./core/MayinVisualStateEngine";
import type { MayinState } from "./core/MayinTypes";
import { speakAstra, stopAstraSpeech, unlockAstraAudio } from "@/astra/voice/roundTrip/ttsFallback";
import { type AstraLanguage } from "@/astra/voice/roundTrip/contracts";
import { useLocalDictation } from "@/astra/voice/useLocalDictation";

// â”€â”€ Language helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const LANG_OPTIONS: { label: string; value: AstraLanguage; bcp: string }[] = [
  { label: "Auto", value: "en",        bcp: "en-IN" },
  { label: "EN",   value: "en",        bcp: "en-IN" },
  { label: "TE",   value: "te",        bcp: "te-IN" },
  { label: "HI",   value: "hi",        bcp: "hi-IN" },
];

// â”€â”€ CSS animation keyframes injected once â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const STYLE = `
@keyframes mayin-orb-idle   { 0%,100%{transform:scale(1) translateY(0);filter:blur(0px)} 50%{transform:scale(1.07) translateY(-6px);filter:blur(1px)} }
@keyframes mayin-orb-listen { 0%,100%{transform:scale(1);opacity:.9} 50%{transform:scale(1.18);opacity:1} }
@keyframes mayin-orb-speak  { 0%{transform:scale(1) rotate(0deg)} 25%{transform:scale(1.12) rotate(3deg)} 75%{transform:scale(0.95) rotate(-3deg)} 100%{transform:scale(1) rotate(0deg)} }
@keyframes mayin-orb-think  { 0%,100%{transform:scale(1) rotate(0deg);filter:hue-rotate(0deg)} 50%{transform:scale(1.05) rotate(180deg);filter:hue-rotate(60deg)} }
@keyframes mayin-wave       { 0%,100%{transform:scaleY(.3)} 50%{transform:scaleY(1)} }
@keyframes mayin-pulse-ring { 0%{transform:scale(.8);opacity:.8} 100%{transform:scale(2.2);opacity:0} }
@keyframes mayin-slide-up   { from{transform:translateY(16px);opacity:0} to{transform:translateY(0);opacity:1} }
@keyframes mayin-glow       { 0%,100%{box-shadow:0 0 40px 8px rgba(16,185,129,.25)} 50%{box-shadow:0 0 80px 20px rgba(16,185,129,.5)} }
@keyframes mayin-scan       { 0%{background-position:0% 0%} 100%{background-position:0% 100%} }
@keyframes mayin-fade-in    { from{opacity:0} to{opacity:1} }
@keyframes float-particle   { 0%,100%{transform:translate(0,0) scale(1);opacity:.3} 50%{transform:translate(var(--dx),var(--dy)) scale(1.4);opacity:.7} }
`;

// â”€â”€ Orb colour / animation driven by state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function orbClass(state: MayinState, listening: boolean, speaking: boolean) {
  if (state === "critical") return { anim: "mayin-orb-speak .4s ease-in-out infinite", grad: "radial-gradient(ellipse at 35% 30%, #ff4444 0%, #b91c1c 55%, #450a0a 100%)" };
  if (listening)            return { anim: "mayin-orb-listen 1s ease-in-out infinite", grad: "radial-gradient(ellipse at 35% 30%, #4ade80 0%, #16a34a 55%, #052e16 100%)" };
  if (speaking)             return { anim: "mayin-orb-speak .7s ease-in-out infinite", grad: "radial-gradient(ellipse at 35% 30%, #38bdf8 0%, #0369a1 55%, #082f49 100%)" };
  if (state === "thinking") return { anim: "mayin-orb-think 2s linear infinite",       grad: "radial-gradient(ellipse at 35% 30%, #a78bfa 0%, #7c3aed 55%, #1e1b4b 100%)" };
  return                           { anim: "mayin-orb-idle 4s ease-in-out infinite",   grad: "radial-gradient(ellipse at 35% 30%, #34d399 0%, #059669 55%, #022c22 100%)" };
}

// â”€â”€ Floating particles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function Particles({ active }: { active: boolean }) {
  const count = 12;
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            width: 4 + (i % 3) * 2,
            height: 4 + (i % 3) * 2,
            borderRadius: "50%",
            background: i % 3 === 0 ? "#34d399" : i % 3 === 1 ? "#38bdf8" : "#a78bfa",
            left: `${8 + (i * 7.2) % 84}%`,
            top: `${15 + (i * 6.1) % 70}%`,
            // @ts-expect-error css var
            "--dx": `${(i % 2 === 0 ? 1 : -1) * (12 + i * 3)}px`,
            "--dy": `${(i % 3 === 0 ? -1 : 1) * (8 + i * 2)}px`,
            animation: active
              ? `float-particle ${2.5 + (i % 3) * .8}s ease-in-out ${i * .18}s infinite`
              : "none",
            opacity: active ? .5 : .15,
            transition: "opacity .4s",
          }}
        />
      ))}
    </div>
  );
}

// â”€â”€ Voice waveform bars â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function WaveBars({ active, bars = 28, color = "#34d399" }: { active: boolean; bars?: number; color?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3, height: 40 }}>
      {Array.from({ length: bars }).map((_, i) => (
        <div
          key={i}
          style={{
            width: 3,
            borderRadius: 2,
            background: color,
            height: active ? undefined : 6,
            minHeight: 6,
            maxHeight: 36,
            animation: active
              ? `mayin-wave ${.4 + (i % 5) * .12}s ease-in-out ${i * .04}s infinite alternate`
              : "none",
            opacity: active ? .85 + (i % 3) * .05 : .3,
            transition: "opacity .3s, height .3s",
          }}
        />
      ))}
    </div>
  );
}

// â”€â”€ Chat bubble â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function Bubble({ msg }: { msg: { from: "user" | "assistant"; text: string } }) {
  const isUser = msg.from === "user";
  return (
    <div
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        animation: "mayin-slide-up .3s ease-out",
        marginBottom: 10,
      }}
    >
      <div
        style={{
          maxWidth: "76%",
          padding: "10px 14px",
          borderRadius: isUser ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
          background: isUser
            ? "linear-gradient(135deg,#065f46,#047857)"
            : "linear-gradient(135deg,rgba(15,23,42,.95),rgba(30,41,59,.9))",
          border: isUser ? "none" : "1px solid rgba(52,211,153,.15)",
          color: "#f0fdf4",
          fontSize: 14,
          lineHeight: 1.55,
          boxShadow: isUser
            ? "0 2px 12px rgba(5,150,105,.35)"
            : "0 2px 12px rgba(0,0,0,.4)",
        }}
      >
        {!isUser && (
          <div style={{ fontSize: 10, color: "#34d399", fontWeight: 700, letterSpacing: ".08em", marginBottom: 4 }}>
            DR. MAYIN
          </div>
        )}
        {msg.text}
      </div>
    </div>
  );
}

// â”€â”€ Main Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function MayinCommandCentre({
  onClose,
  initialDoctorId,
}: {
  onClose: () => void;
  initialDoctorId?: string;
}) {
  const [listening, setListening]     = useState(false);
  const [speaking, setSpeaking]       = useState(false);
  const [processing, setProcessing]   = useState(false);
  const [muted, setMuted]             = useState(false);
  const [transcript, setTranscript]   = useState("");
  const [liveText, setLiveText]       = useState("");      // interim STT
  const [draft, setDraft]             = useState("");
  const [messages, setMessages]       = useState<Array<{ from: "user" | "assistant"; text: string }>>([]);
  const [agentState, setAgentState]   = useState<MayinState>("idle");
  const [langIdx, setLangIdx]         = useState(0);       // 0=Auto,1=EN,2=TE,3=HI
  const [showScroll, setShowScroll]   = useState(false);
  const [patient, setPatient]         = useState<any>(null);

  const chatEndRef   = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLInputElement>(null);
  const token        = typeof window !== "undefined" ? localStorage.getItem("astra.serverToken") : null;

  // Visual engine
  useEffect(() => {
    const d1 = mayinVisualEngine.attachToAgentBus();
    const d2 = mayinVisualEngine.subscribe(setAgentState);
    return () => { d1(); d2(); };
  }, []);

  // Hospital events
  useEffect(() => {
    const unsub = agentBus.subscribe((ev: { type: string; payload: any }) => {
      if (ev.type === "patient.registered" || ev.type === "patient.arrived") setPatient(ev.payload?.patient ?? ev.payload);
    });
    return unsub;
  }, []);

  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, liveText]);

  const currentLang = LANG_OPTIONS[langIdx] ?? LANG_OPTIONS[0];

  // â”€â”€ TTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const speakReply = useCallback(async (text: string) => {
    if (muted || !text.trim()) return;
    setSpeaking(true);
    mayinVisualEngine.publish({ type: "reasoning.completed" });
    await speakAstra({ text, language: currentLang.value, onEnd: () => setSpeaking(false) });
    setSpeaking(false);
  }, [muted, currentLang.value]);

  // â”€â”€ API turn â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const sendToMayin = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setMessages(m => [...m, { from: "user", text }]);
    setTranscript("");
    setLiveText("");
    setDraft("");
    setProcessing(true);
    mayinVisualEngine.publish({ type: "reasoning.started" });
    try {
      const res = await fetch("/api/saarathi/turn", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message: text,
          workspace: "doctor",
          source: "voice",
          patientContext: patient ? { uhid: patient.uhid } : undefined,
        }),
      });
      const data = res.ok ? await res.json() : null;
      const reply = (data?.text ?? "").trim() || "Dr. Mayin is standing by. Hospital controls are fully operational.";
      setMessages(m => [...m, { from: "assistant", text: reply }]);
      void speakReply(reply);
    } catch {
      const fallback = "Dr. Mayin is standing by. Hospital controls and local commands are fully operational.";
      setMessages(m => [...m, { from: "assistant", text: fallback }]);
      void speakReply(fallback);
    } finally {
      setProcessing(false);
    }
  }, [token, patient, speakReply]);

  const dictation = useLocalDictation({
    language: currentLang.bcp,
    onFinal: (said) => {
      setTranscript(said);
      void sendToMayin(said);
    },
    onError: (message) => {
      if (message !== "silence") {
        setMessages(m => [...m, { from: "assistant", text: `${message}. Please try again or type your message.` }]);
      }
    },
  });

  useEffect(() => {
    setListening(dictation.isRecording);
    if (dictation.liveText) setLiveText(dictation.liveText);
    if (dictation.isRecording) mayinVisualEngine.publish({ type: "voice.listening" });
  }, [dictation.isRecording, dictation.liveText]);

  const startListening = useCallback(() => {
    unlockAstraAudio();
    stopAstraSpeech();
    setSpeaking(false);
    dictation.start();
  }, [dictation]);

  const stopListening = useCallback(() => {
    dictation.stop();
    const said = transcript.trim();
    if (said) void sendToMayin(said);
  }, [dictation, transcript, sendToMayin]);

  const toggleListening = useCallback(() => {
    if (listening) stopListening();
    else startListening();
  }, [listening, startListening, stopListening]);

  // Submit typed message
  const sendTyped = useCallback(() => {
    const text = draft.trim() || transcript.trim();
    if (!text) return;
    unlockAstraAudio();
    void sendToMayin(text);
  }, [draft, transcript, sendToMayin]);

  // Keyboard shortcut: Enter
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendTyped(); }
  };

  // Derived state
  const { anim: orbAnim, grad: orbGrad } = orbClass(agentState, listening, speaking);
  const stateLabel = listening ? "Listeningâ€¦" : speaking ? "Speakingâ€¦" : processing ? "Thinkingâ€¦" : "Say Dr Mayin or tap mic";

  return (
    <>
      <style>{STYLE}</style>

      {/* â”€â”€ Fullscreen backdrop â”€â”€ */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "radial-gradient(ellipse at 50% 0%, rgba(5,46,22,.8) 0%, rgba(2,6,23,.98) 100%)",
        backdropFilter: "blur(20px)",
        display: "flex", flexDirection: "column",
        animation: "mayin-fade-in .4s ease-out",
      }}>
        <Particles active={listening || speaking} />

        {/* Scan line shimmer */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: "linear-gradient(to bottom, transparent 95%, rgba(52,211,153,.03) 100%)",
          backgroundSize: "100% 3px",
          animation: "mayin-scan 8s linear infinite",
          opacity: .4,
        }} />

        {/* â”€â”€ Top bar â”€â”€ */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 24px",
          borderBottom: "1px solid rgba(52,211,153,.12)",
          background: "rgba(2,6,23,.7)",
          backdropFilter: "blur(12px)",
          position: "relative", zIndex: 2,
        }}>
          {/* Identity */}
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {/* Small orb badge */}
            <div style={{
              width: 36, height: 36, borderRadius: "50%",
              background: orbGrad,
              boxShadow: "0 0 20px rgba(52,211,153,.5)",
              animation: "mayin-glow 3s ease-in-out infinite",
              flexShrink: 0,
            }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: ".12em", color: "#34d399" }}>
                DR. MAYIN AI
              </div>
              <div style={{ fontSize: 11, color: "rgba(148,163,184,.7)", letterSpacing: ".05em" }}>
                Unified orchestrator Â· Saarathi Â· Sanjeevani Â· Jarvis
                {patient && ` Â· ${patient.name}`}
              </div>
            </div>
          </div>

          {/* Lang + mute + close */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* Language selector */}
            {LANG_OPTIONS.slice(0, 4).map((l, i) => (
              <button
                key={l.label}
                onClick={() => setLangIdx(i)}
                style={{
                  padding: "3px 9px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                  border: "1px solid",
                  borderColor: langIdx === i ? "#34d399" : "rgba(52,211,153,.2)",
                  background: langIdx === i ? "rgba(52,211,153,.15)" : "transparent",
                  color: langIdx === i ? "#34d399" : "rgba(148,163,184,.6)",
                  cursor: "pointer", transition: "all .2s",
                }}
              >
                {l.label}
              </button>
            ))}

            {/* Mute toggle */}
            <button
              onClick={() => { setMuted(m => !m); if (!muted) stopAstraSpeech(); }}
              title={muted ? "Unmute Dr Mayin" : "Mute Dr Mayin"}
              style={{
                width: 32, height: 32, borderRadius: "50%", border: "1px solid",
                borderColor: muted ? "rgba(239,68,68,.4)" : "rgba(52,211,153,.3)",
                background: muted ? "rgba(239,68,68,.1)" : "transparent",
                color: muted ? "#f87171" : "#94a3b8",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", transition: "all .2s",
              }}
            >
              {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              style={{
                width: 32, height: 32, borderRadius: "50%",
                border: "1px solid rgba(148,163,184,.2)",
                background: "transparent",
                color: "#94a3b8", display: "flex", alignItems: "center",
                justifyContent: "center", cursor: "pointer", transition: "all .2s",
              }}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* â”€â”€ Central area â”€â”€ */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", position: "relative", minHeight: 0 }}>

          {/* Pulse ring (listening/speaking) */}
          {(listening || speaking) && (
            <>
              <div style={{
                position: "absolute", width: 180, height: 180,
                borderRadius: "50%",
                border: `2px solid ${listening ? "#34d399" : "#38bdf8"}`,
                animation: "mayin-pulse-ring 1.6s ease-out infinite",
                opacity: .6,
              }} />
              <div style={{
                position: "absolute", width: 220, height: 220,
                borderRadius: "50%",
                border: `1px solid ${listening ? "#34d399" : "#38bdf8"}`,
                animation: "mayin-pulse-ring 1.6s ease-out .4s infinite",
                opacity: .35,
              }} />
            </>
          )}

          {/* MAIN ORB */}
          <div
            onClick={() => { unlockAstraAudio(); toggleListening(); }}
            title={listening ? "Stop listening" : "Tap to speak to Dr Mayin"}
            style={{
              width: 140, height: 140, borderRadius: "50%",
              background: orbGrad,
              animation: orbAnim,
              boxShadow: listening
                ? "0 0 60px 20px rgba(52,211,153,.55), 0 0 120px 40px rgba(52,211,153,.2)"
                : speaking
                ? "0 0 60px 20px rgba(56,189,248,.55), 0 0 120px 40px rgba(56,189,248,.2)"
                : "0 0 40px 12px rgba(52,211,153,.3), 0 0 80px 30px rgba(52,211,153,.12)",
              cursor: "pointer",
              position: "relative", zIndex: 1,
              transition: "box-shadow .4s",
            }}
          >
            {/* Inner shimmer */}
            <div style={{
              position: "absolute", inset: 0, borderRadius: "50%",
              background: "radial-gradient(ellipse at 30% 25%, rgba(255,255,255,.22) 0%, transparent 60%)",
            }} />
          </div>

          {/* State label */}
          <div style={{
            marginTop: 20, fontSize: 13, fontWeight: 600,
            letterSpacing: ".1em", textTransform: "uppercase",
            color: listening ? "#34d399" : speaking ? "#38bdf8" : processing ? "#a78bfa" : "rgba(148,163,184,.6)",
            transition: "color .4s",
          }}>
            {stateLabel}
          </div>

          {/* Wave bars */}
          <div style={{ marginTop: 12 }}>
            <WaveBars
              active={listening || speaking}
              color={listening ? "#34d399" : "#38bdf8"}
              bars={32}
            />
          </div>

          {/* Live transcript ticker */}
          {(liveText || transcript) && (
            <div style={{
              marginTop: 14, maxWidth: 500, textAlign: "center",
              fontSize: 14, color: "rgba(241,245,249,.75)",
              fontStyle: liveText ? "italic" : "normal",
              animation: "mayin-slide-up .25s ease-out",
              padding: "0 24px",
              lineHeight: 1.6,
            }}>
              {liveText || transcript}
            </div>
          )}
        </div>

        {/* â”€â”€ Conversation rail â”€â”€ */}
        <div style={{
          flex: "0 0 auto", width: "100%", maxWidth: 680, margin: "0 auto",
          padding: "0 16px 0",
          maxHeight: "34vh", overflowY: "auto",
          scrollbarWidth: "thin",
          scrollbarColor: "rgba(52,211,153,.25) transparent",
          position: "relative", zIndex: 2,
        }}
          onScroll={e => {
            const el = e.currentTarget;
            setShowScroll(el.scrollHeight - el.scrollTop - el.clientHeight > 80);
          }}
        >
          {messages.length === 0 && (
            <div style={{ textAlign: "center", color: "rgba(148,163,184,.35)", fontSize: 13, padding: "20px 0" }}>
              Tap the orb or say <strong style={{ color: "rgba(52,211,153,.6)" }}>Dr Mayin</strong> to begin
            </div>
          )}
          {messages.map((m, i) => <Bubble key={i} msg={m} />)}
          <div ref={chatEndRef} />
        </div>

        {/* Scroll-to-bottom hint */}
        {showScroll && (
          <button
            onClick={() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" })}
            style={{
              position: "absolute", bottom: 88, right: "calc(50% - 340px + 16px)",
              width: 32, height: 32, borderRadius: "50%",
              background: "rgba(52,211,153,.2)", border: "1px solid rgba(52,211,153,.3)",
              color: "#34d399", display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", zIndex: 10,
            }}
          >
            <ChevronDown size={16} />
          </button>
        )}

        {/* â”€â”€ Input bar â”€â”€ */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "12px 20px 20px",
          background: "rgba(2,6,23,.85)",
          backdropFilter: "blur(16px)",
          borderTop: "1px solid rgba(52,211,153,.1)",
          position: "relative", zIndex: 2,
          maxWidth: 700, margin: "0 auto", width: "100%",
          boxSizing: "border-box",
        }}>
          {/* Mic button */}
          <button
            onClick={() => { unlockAstraAudio(); toggleListening(); }}
            style={{
              width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
              background: listening
                ? "linear-gradient(135deg,#065f46,#047857)"
                : "rgba(52,211,153,.08)",
              border: `2px solid ${listening ? "#34d399" : "rgba(52,211,153,.25)"}`,
              color: listening ? "#fff" : "#34d399",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", transition: "all .2s",
              boxShadow: listening ? "0 0 20px rgba(52,211,153,.5)" : "none",
              animation: listening ? "mayin-glow 1.5s ease-in-out infinite" : "none",
            }}
          >
            {listening ? <MicOff size={18} /> : <Mic size={18} />}
          </button>

          {/* Text input */}
          <input
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={onKey}
            placeholder="Type to Dr. Mayin or tap the micâ€¦"
            style={{
              flex: 1, height: 44, borderRadius: 12,
              background: "rgba(15,23,42,.7)",
              border: "1px solid rgba(52,211,153,.18)",
              padding: "0 14px", fontSize: 14, color: "#f0fdf4",
              outline: "none", transition: "border-color .2s",
            }}
            onFocus={e => (e.target.style.borderColor = "rgba(52,211,153,.5)")}
            onBlur={e => (e.target.style.borderColor = "rgba(52,211,153,.18)")}
          />

          {/* Send button */}
          <button
            onClick={sendTyped}
            disabled={!draft.trim() && !transcript.trim()}
            style={{
              width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
              background: (draft.trim() || transcript.trim())
                ? "linear-gradient(135deg,#065f46,#047857)"
                : "rgba(52,211,153,.06)",
              border: `2px solid ${(draft.trim() || transcript.trim()) ? "#34d399" : "rgba(52,211,153,.15)"}`,
              color: (draft.trim() || transcript.trim()) ? "#fff" : "rgba(52,211,153,.35)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: (draft.trim() || transcript.trim()) ? "pointer" : "default",
              transition: "all .2s",
            }}
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </>
  );
}

export default MayinCommandCentre;
