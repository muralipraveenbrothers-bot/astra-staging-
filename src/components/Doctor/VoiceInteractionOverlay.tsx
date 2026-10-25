import React, { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Send, X, AlertCircle, RefreshCw, Keyboard, ShieldAlert, Volume2, VolumeX, Globe, Settings, Zap, CheckCircle2 } from "lucide-react";
import { voiceEngine, VoiceStartResult, detectLanguage, getLanguageDisplayName } from "@/astra/voice/voiceEngine";
import { startSaarathiListening } from "@/astra/voice/providers/sttPriority";
import { getActiveTTSTier, TIER_LABELS, setNeuralTTSKeys, getNeuralTTSKeys, TTSTier } from "@/astra/voice/neuralTTS";

export interface VoiceInteractionOverlayProps {
  open: boolean;
  onClose: () => void;
  onTranscript: (text: string) => void;
  patientName?: string;
  isDarkTheme?: boolean;
  /** Local Voicebox Whisper only. Does not start webkitSpeechRecognition. */
  localOnly?: boolean;
}

type VoicePhase = "idle" | "requesting-permission" | "listening" | "processing" | "done" | "error";

const QUICK_LANGS = [
  { code: "auto", label: "AUTO (Detect)" },
  { code: "en-IN", label: "EN" },
  { code: "te-IN", label: "తెలుగు" },
  { code: "hi-IN", label: "हिंदी" },
  { code: "ta-IN", label: "தமிழ்" },
];

export const VoiceInteractionOverlay: React.FC<VoiceInteractionOverlayProps> = ({
  open,
  onClose,
  onTranscript,
  patientName,
  isDarkTheme = false,
  localOnly = false,
}) => {
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [typedFallback, setTypedFallback] = useState("");
  const [showTypedInput, setShowTypedInput] = useState(false);
  const [selectedLang, setSelectedLang] = useState<string>(() => voiceEngine.getPreferredLanguage() || "auto");
  const [detectedLang, setDetectedLang] = useState<string>("en-IN");
  const [voiceReplyEnabled, setVoiceReplyEnabled] = useState<boolean>(() => voiceEngine.isVoiceReplyEnabled());
  const [isSpeakingNow, setIsSpeakingNow] = useState(false);
  const [activeTier, setActiveTier] = useState<TTSTier>(() => getActiveTTSTier());
  const [showApiSetup, setShowApiSetup] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState({ elevenlabs: "", googleTts: "", openai: "" });
  const [apiKeySaved, setApiKeySaved] = useState(false);

  const timersRef = useRef<number[]>([]);
  const transcriptRef = useRef("");
  const finalizedRef = useRef(false);
  const localStopRef = useRef<(() => void) | null>(null);
  const runRef = useRef(0);

  const clearTimers = () => {
    timersRef.current.forEach((t) => window.clearTimeout(t));
    timersRef.current = [];
  };

  const stopListening = useCallback(() => {
    localStopRef.current?.();
    localStopRef.current = null;
    voiceEngine.stopListening();
  }, []);

  const finalize = useCallback(
    (text: string) => {
      if (finalizedRef.current) return;
      finalizedRef.current = true;
      const clean = text.trim().replace(/\s+/g, " ");
      if (!clean) return;

      transcriptRef.current = clean;
      stopListening();
      clearTimers();
      setTranscript(clean);
      setInterim("");
      setPhase("processing");

      timersRef.current.push(
        window.setTimeout(() => {
          setPhase("done");
          timersRef.current.push(
            window.setTimeout(() => {
              onTranscript(clean);
              onClose();
            }, 600)
          );
        }, 800)
      );
    },
    [onTranscript, onClose, stopListening]
  );

  const startVoicePipeline = useCallback(async (langToUse?: string) => {
    const run = ++runRef.current;
    clearTimers();
    finalizedRef.current = false;
    setTranscript("");
    setInterim("");
    transcriptRef.current = "";
    setErrorMessage("");
    setShowTypedInput(false);
    setPhase("requesting-permission");

    const effectiveLang = langToUse || selectedLang;

    // 1. Permission Pre-Flight Probe
    const preflightRes: VoiceStartResult = await voiceEngine.preflight();
    if (!preflightRes.ok) {
      setPhase("error");
      setErrorMessage(
        preflightRes.message ||
        "Microphone is blocked. Click the lock/tune icon left of the address bar → Site settings → Microphone → Allow → then Retry."
      );
      return;
    }

    setPhase("listening");

    // Spoken orders stay on local Whisper. Browser speech recognition is a cloud ear.
    if (localOnly) {
      const session = startSaarathiListening({
        preferredLanguage: effectiveLang === "auto" ? "auto" : effectiveLang,
        allowBrowserFallback: false,
        onStateChange: (st) => {
          if (st === "LISTENING") setPhase("listening");
          else if (st === "TRANSCRIBING") setPhase("processing");
        },
      });
      localStopRef.current = session.stop;
      const result = await session.promise;
      localStopRef.current = null;
      if (runRef.current !== run || finalizedRef.current) return;
      if (result.ok && result.text.trim()) {
        finalize(result.text.trim());
        return;
      }
      setPhase("error");
      setErrorMessage(
        result.error && result.error !== "silence"
          ? result.error
          : "Local Voicebox did not catch speech. Nothing was sent."
      );
      return;
    }

    // 2. Start hardened speech listening
    const ok = voiceEngine.startListening(effectiveLang === "auto" ? "en-IN" : effectiveLang, {
      onInterim: (text) => {
        setInterim(text);
        const curDetected = detectLanguage(text);
        setDetectedLang(curDetected);
      },
      onFinal: (text, detected) => {
        transcriptRef.current = (transcriptRef.current + " " + text).trim();
        setTranscript(transcriptRef.current);
        setInterim("");
        const curDetected = detected || detectLanguage(transcriptRef.current);
        setDetectedLang(curDetected);
      },
      onError: (err) => {
        if (!finalizedRef.current && transcriptRef.current.trim().length === 0) {
          setPhase("error");
          setErrorMessage(err.message);
        }
      },
      onStateChange: (st) => {
        if (st === "listening") setPhase("listening");
        else if (st === "processing") setPhase("processing");
      },
      onEnd: () => {
        if (!finalizedRef.current && transcriptRef.current.trim().length > 0) {
          finalize(transcriptRef.current);
        }
      },
    });

    if (!ok) {
      setPhase("error");
      setErrorMessage("Speech recognition is not supported in this browser. Please use Chrome/Edge or type your request below.");
    }
  }, [finalize, selectedLang, localOnly]);

  useEffect(() => {
    if (open) {
      void startVoicePipeline();
    } else {
      clearTimers();
      stopListening();
      setPhase("idle");
    }
    return () => {
      runRef.current += 1;
      clearTimers();
      stopListening();
    };
  }, [open, startVoicePipeline, stopListening]);

  // Monitor voice synthesis status
  useEffect(() => {
    const interval = setInterval(() => {
      setIsSpeakingNow(voiceEngine.isSpeaking());
    }, 200);
    return () => clearInterval(interval);
  }, []);

  const handleLangChange = (code: string) => {
    setSelectedLang(code);
    voiceEngine.setPreferredLanguage(code);
    stopListening();
    startVoicePipeline(code);
  };

  const handleToggleVoiceReply = () => {
    const next = !voiceReplyEnabled;
    setVoiceReplyEnabled(next);
    voiceEngine.setVoiceReplyEnabled(next);
  };

  const handleStopSpeech = () => {
    voiceEngine.stopSpeaking();
    setIsSpeakingNow(false);
  };

  const handleSaveApiKeys = () => {
    setNeuralTTSKeys({
      elevenlabs: apiKeyInput.elevenlabs.trim() || undefined,
      googleTts: apiKeyInput.googleTts.trim() || undefined,
      openai: apiKeyInput.openai.trim() || undefined,
    });
    setActiveTier(getActiveTTSTier());
    setApiKeySaved(true);
    setTimeout(() => setApiKeySaved(false), 2500);
    setShowApiSetup(false);
  };

  const handleOpenApiSetup = () => {
    const existing = getNeuralTTSKeys();
    setApiKeyInput({
      elevenlabs: existing.elevenlabs || "",
      googleTts: existing.googleTts || "",
      openai: existing.openai || "",
    });
    setShowApiSetup(true);
  };

  const TIER_COLORS: Record<string, string> = {
    voicebox: "text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/50 border-teal-300 dark:border-teal-800",
    natural: "text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/50 border-teal-300 dark:border-teal-800",
    elevenlabs: "text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/50 border-violet-300 dark:border-violet-800",
    google: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 border-blue-300 dark:border-blue-800",
    openai: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-800",
    freellm: "text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/50 border-cyan-300 dark:border-cyan-800",
    browser: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 border-amber-300 dark:border-amber-800",
    none: "text-slate-400 bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700",
  };

  if (!open) return null;

  const handleSendTyped = () => {
    const text = typedFallback.trim() || transcript.trim() || transcriptRef.current.trim();
    if (text) {
      finalize(text);
    }
  };

  const orbColor =
    phase === "error"
      ? "linear-gradient(135deg, #f43f5e 0%, #be123c 100%)"
      : phase === "processing"
        ? "linear-gradient(135deg, #06b6d4 0%, #0369a1 100%)"
        : "linear-gradient(135deg, #10b981 0%, #047857 100%)";

  const orbPulse =
    phase === "listening"
      ? "vorb-breathe"
      : phase === "processing"
        ? "vorb-think"
        : phase === "done"
          ? "vorb-done"
          : "vorb-error";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 font-sans">
      <style>{`
        @keyframes vorb-breathe { 0%,100% { transform: scale(1); filter: brightness(1); } 50% { transform: scale(1.07); filter: brightness(1.15); } }
        @keyframes vorb-think { 0%,100% { transform: scale(0.94) rotate(0deg); } 50% { transform: scale(1.04) rotate(4deg); } }
        @keyframes vorb-done { 0%,100% { transform: scale(1); } 50% { transform: scale(1.04); } }
        @keyframes vorb-error { 0%,100% { transform: scale(1); opacity: 1; } 50% { transform: scale(0.95); opacity: 0.85; } }
        @keyframes vorb-ring { 0% { transform: scale(0.72); opacity: 0.85; } 100% { transform: scale(1.85); opacity: 0; } }
        @keyframes vorb-ring2 { 0% { transform: scale(0.72); opacity: 0.6; } 100% { transform: scale(2.3); opacity: 0; } }
        @keyframes vorb-spin { to { transform: rotate(360deg); } }
        @keyframes vorb-wave { 0%,100% { transform: scaleY(0.35); } 50% { transform: scaleY(1); } }
        .vorb-breathe { animation: vorb-breathe 3.2s ease-in-out infinite; }
        .vorb-think { animation: vorb-think 1.4s ease-in-out infinite; }
        .vorb-done { animation: vorb-done 0.9s ease-in-out infinite; }
        .vorb-error { animation: vorb-error 1.1s ease-in-out infinite; }
        .vorb-ring { animation: vorb-ring 2.4s cubic-bezier(0.2, 0.6, 0.4, 1) infinite; }
        .vorb-ring2 { animation: vorb-ring2 2.4s cubic-bezier(0.2, 0.6, 0.4, 1) 0.7s infinite; }
        .vorb-spin { animation: vorb-spin 9s linear infinite; }
        .vorb-wavebar { animation: vorb-wave 1.1s ease-in-out infinite; }
      `}</style>

      <div
        className={`w-full max-w-md rounded-3xl border p-6 flex flex-col items-center gap-4 shadow-2xl transition-all ${isDarkTheme ? "bg-slate-900/95 border-slate-700 text-white" : "bg-white border-slate-200 text-slate-900"
          }`}
      >
        {/* Top Header */}
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${phase === "error" ? "bg-rose-400" : "bg-emerald-400"
                  }`}
              />
              <span
                className={`relative inline-flex rounded-full h-2.5 w-2.5 ${phase === "error" ? "bg-rose-500" : "bg-emerald-500"
                  }`}
              />
            </span>
            <span className={`text-xs font-black uppercase tracking-wider ${isDarkTheme ? "text-white" : "text-slate-900"}`}>
              Astra Co-Pilot • Voice Mode
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Neural TTS Tier Badge */}
            <button
              type="button"
              onClick={handleOpenApiSetup}
              title="Configure neural voice engine"
              className={`px-1.5 py-0.5 rounded-full border text-[9px] font-bold flex items-center gap-1 transition-all cursor-pointer ${TIER_COLORS[activeTier]}`}
            >
              <Zap className="w-2.5 h-2.5" />
              {TIER_LABELS[activeTier]}
            </button>

            {/* Voice Reply Toggle */}
            <button
              type="button"
              onClick={handleToggleVoiceReply}
              className={`p-1.5 rounded-lg border text-xs flex items-center gap-1 transition-all cursor-pointer ${voiceReplyEnabled
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                  : "bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-400"
                }`}
              title={voiceReplyEnabled ? "Voice replies ON" : "Voice replies OFF"}
            >
              {voiceReplyEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              <span className="text-[10px] font-bold">{voiceReplyEnabled ? "Voice ON" : "Voice OFF"}</span>
            </button>

            <button
              onClick={() => {
                clearTimers();
                stopListening();
                onClose();
              }}
              className={`p-1.5 rounded-lg border transition-all cursor-pointer ${isDarkTheme
                  ? "bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-200"
                }`}
              aria-label="Close voice mode"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Neural Voice API Key Setup Panel */}
        {showApiSetup && (
          <div className={`w-full rounded-2xl border p-4 space-y-3 ${isDarkTheme ? "bg-slate-950 border-slate-700" : "bg-slate-50 border-slate-200"
            }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-violet-600 dark:text-violet-400">
                <Settings className="w-3.5 h-3.5" />
                Neural Voice Engine
              </div>
              <button type="button" onClick={() => setShowApiSetup(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className={`text-[10px] leading-relaxed ${isDarkTheme ? "text-slate-400" : "text-slate-500"}`}>
              Natural voices are used FIRST when available. On any error, cascade falls back:
              ElevenLabs → Google Neural2 (SSML) → OpenAI TTS-HD → Basic Browser.
              Keys are stored in session memory only and cleared when you close the tab.
            </p>

            {/* ElevenLabs */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wider flex items-center gap-1">
                <Zap className="w-3 h-3" /> ElevenLabs API Key
                <span className="ml-1 text-slate-400 font-normal normal-case">— most human-like</span>
              </label>
              <input
                type="password"
                value={apiKeyInput.elevenlabs}
                onChange={e => setApiKeyInput(v => ({ ...v, elevenlabs: e.target.value }))}
                placeholder="sk-ElevenLabs..."
                className="w-full px-3 py-1.5 text-xs rounded-xl border border-violet-200 dark:border-violet-900 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:border-violet-400"
              />
              <a href="https://elevenlabs.io" target="_blank" rel="noopener noreferrer" className="text-[9px] text-violet-500 hover:underline">Get free key at elevenlabs.io</a>
            </div>

            {/* Google Cloud TTS */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider flex items-center gap-1">
                🌐 Google Cloud TTS API Key
                <span className="ml-1 text-slate-400 font-normal normal-case">— best for Telugu, Hindi, Tamil</span>
              </label>
              <input
                type="password"
                value={apiKeyInput.googleTts}
                onChange={e => setApiKeyInput(v => ({ ...v, googleTts: e.target.value }))}
                placeholder="AIza..."
                className="w-full px-3 py-1.5 text-xs rounded-xl border border-blue-200 dark:border-blue-900 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:border-blue-400"
              />
              <a href="https://console.cloud.google.com/apis/library/texttospeech.googleapis.com" target="_blank" rel="noopener noreferrer" className="text-[9px] text-blue-500 hover:underline">Enable in Google Cloud Console</a>
            </div>

            {/* OpenAI TTS */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                🤖 OpenAI API Key
                <span className="ml-1 text-slate-400 font-normal normal-case">— Onyx TTS-HD</span>
              </label>
              <input
                type="password"
                value={apiKeyInput.openai}
                onChange={e => setApiKeyInput(v => ({ ...v, openai: e.target.value }))}
                placeholder="sk-..."
                className="w-full px-3 py-1.5 text-xs rounded-xl border border-emerald-200 dark:border-emerald-900 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-400"
              />
            </div>

            <button
              type="button"
              onClick={handleSaveApiKeys}
              className="w-full py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all"
            >
              {apiKeySaved ? <><CheckCircle2 className="w-3.5 h-3.5" /> Saved!</> : <>Save & Activate Neural Voice</>}
            </button>
          </div>
        )}

        {/* Language Selection Chips */}
        <div className="flex items-center justify-center gap-1.5 flex-wrap w-full">
          <Globe className="w-3.5 h-3.5 text-slate-400 mr-0.5" />
          {QUICK_LANGS.map((ql) => (
            <button
              key={ql.code}
              type="button"
              onClick={() => handleLangChange(ql.code)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer border ${selectedLang === ql.code
                  ? "bg-cyan-600 text-white border-cyan-500 shadow-sm"
                  : isDarkTheme
                    ? "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"
                    : "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200"
                }`}
            >
              {ql.label}
            </button>
          ))}
        </div>

        {/* Speaking State Notice */}
        {isSpeakingNow && (
          <button
            type="button"
            onClick={handleStopSpeech}
            className="flex items-center gap-2 px-3 py-1 bg-cyan-100 dark:bg-cyan-950/50 border border-cyan-300 dark:border-cyan-800 rounded-full text-xs text-cyan-800 dark:text-cyan-300 animate-pulse cursor-pointer"
          >
            <span className="w-2 h-2 rounded-full bg-cyan-500 animate-ping" />
            <span>Speaking reply… tap to stop</span>
          </button>
        )}

        {/* Voice Orb */}
        <div className="relative flex items-center justify-center w-40 h-40">
          {phase === "listening" && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="rounded-full border-2 border-emerald-400/50 absolute inset-0 vorb-ring" />
              <div className="rounded-full border border-emerald-300/40 absolute inset-3 vorb-ring2" />
            </div>
          )}
          <div className="absolute inset-4 rounded-full border border-dashed border-emerald-400/40 vorb-spin" />
          <div
            className={`w-28 h-28 rounded-full flex items-center justify-center vorb-orb ${orbPulse} shadow-xl`}
            style={{
              background: orbColor,
              boxShadow:
                phase === "error"
                  ? "0 0 45px 10px rgba(244,63,94,0.45), inset 0 0 20px rgba(0,0,0,0.28)"
                  : "0 0 45px 10px rgba(34,197,94,0.4), inset 0 0 20px rgba(0,0,0,0.25)",
            }}
          >
            <Mic className="w-9 h-9 text-white drop-shadow-lg" fill="currentColor" />
          </div>
        </div>

        {/* Status Indicator & Detected Language Badge */}
        <div className="flex flex-col items-center justify-center gap-1 text-center">
          <div className="flex items-center gap-2">
            {phase === "requesting-permission" && (
              <span className="text-xs font-semibold text-cyan-600 flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Requesting mic access…
              </span>
            )}
            {phase === "listening" && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Listening to Doctor…</span>
                <div className="flex items-end gap-0.5 h-3.5">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <span
                      key={i}
                      className="vorb-wavebar w-1 rounded-full bg-emerald-500"
                      style={{ height: "100%", animationDelay: `${i * 0.15}s`, transformOrigin: "center" }}
                    />
                  ))}
                </div>
              </div>
            )}
            {phase === "processing" && (
              <span className="text-xs font-bold text-cyan-600 uppercase tracking-wider flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Astra is thinking…
              </span>
            )}
            {phase === "done" && (
              <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Captured ✓ Dispatching</span>
            )}
            {phase === "error" && (
              <span className="text-xs font-bold text-rose-600 uppercase tracking-wider flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" /> Notice / Fallback
              </span>
            )}
          </div>

          {/* Heard Language Tag */}
          {(transcript || interim) && (
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 rounded-full">
              Heard: <b>{getLanguageDisplayName(detectedLang)}</b>
            </span>
          )}
        </div>

        {/* Live Transcript or Specific Guidance */}
        <div
          className={`w-full rounded-2xl border p-3.5 min-h-[68px] text-left transition-all ${isDarkTheme ? "bg-slate-950/70 border-slate-800" : "bg-slate-50 border-slate-200"
            }`}
        >
          {phase === "error" ? (
            <div className="space-y-2">
              <div className="flex items-start gap-2 text-rose-700 dark:text-rose-400 text-xs">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <p className="leading-relaxed font-medium">{errorMessage}</p>
              </div>
              <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 text-[11px] text-amber-800 dark:text-amber-300">
                💡 <b>Quick Fix:</b> Click the lock icon 🔒 in the URL bar → set <b>Microphone</b> to <b>Allow</b> → click Retry, or type your query below.
              </div>
            </div>
          ) : transcript || interim ? (
            <p className={`text-sm leading-relaxed ${isDarkTheme ? "text-slate-100" : "text-slate-800"}`}>
              {transcript}
              {interim && <span className="opacity-60 italic text-cyan-600"> {interim}</span>}
            </p>
          ) : (
            <p className={`text-xs text-center ${isDarkTheme ? "text-slate-400" : "text-slate-500"}`}>
              Speak naturally in English, తెలుగు, or हिंदी
              {patientName ? ` for ${patientName}` : ""}
            </p>
          )}
        </div>

        {/* Type-Instead Fallback Input Box */}
        {(phase === "error" || showTypedInput) && (
          <div className="w-full space-y-2 pt-1 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-semibold">
              <Keyboard className="w-3.5 h-3.5" />
              <span>Type your request directly:</span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                autoFocus
                placeholder="e.g. Bed 1 order CBC and CRP..."
                value={typedFallback}
                onChange={(e) => setTypedFallback(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSendTyped();
                }}
                className="flex-1 px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
              />
              <button
                type="button"
                onClick={handleSendTyped}
                disabled={!typedFallback.trim()}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold flex items-center gap-1 transition-all cursor-pointer"
              >
                <Send className="w-3 h-3" /> Send
              </button>
            </div>
          </div>
        )}

        {/* Action Controls */}
        <div className="flex items-center gap-2 w-full pt-1">
          {phase === "error" ? (
            <>
              <button
                type="button"
                onClick={() => startVoicePipeline()}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Retry Voice
              </button>
              <button
                type="button"
                onClick={() => {
                  clearTimers();
                  stopListening();
                  onClose();
                }}
                className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-all cursor-pointer"
              >
                Close
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  if (phase === "listening") {
                    if (transcriptRef.current.trim()) finalize(transcriptRef.current);
                    else {
                      clearTimers();
                      stopListening();
                      setPhase("idle");
                      onClose();
                    }
                  } else {
                    onClose();
                  }
                }}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-all cursor-pointer"
              >
                {phase === "listening" ? "Stop & Cancel" : "Close"}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (transcriptRef.current.trim()) finalize(transcriptRef.current);
                  else if (transcript.trim()) finalize(transcript);
                }}
                disabled={!transcriptRef.current.trim() && !transcript.trim()}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white shadow-md transition-all cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" /> Send to Astra
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
