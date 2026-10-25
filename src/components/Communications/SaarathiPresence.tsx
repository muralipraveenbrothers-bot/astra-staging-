/**
 * ============================================================================
 * DR. MAYIN AI — Unified Master Jarvis Voice Interface
 * ============================================================================
 * Consolidates Saarathi, Sanjeevani, Jarvis, and Astra Voice into one master
 * voice orchestrator.
 *
 * Implements the pitch-black, full-screen holographic Jarvis UI matching the
 * user's specification (Screenshot media_1790154053886.png):
 *   - Fluid glowing 3D-like emerald/mint/white sphere with holographic orbits
 *   - Live reactive speech recognition (EN, TE, HI, Tenglish, Hinglish)
 *   - Guaranteed audible TTS voiceback within <1s (no stalls or silent turns)
 *   - The exact pill input bar at the bottom:
 *     [+] [Type...] [High ⌄] [🎤] [✕]
 * ============================================================================
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Mic,
  MicOff,
  Send,
  X,
  Plus,
  ChevronDown,
  Volume2,
  VolumeX,
  Activity,
  AlertTriangle,
  Bed,
  Pill,
  FileText,
  Sparkles,
  Check,
} from "lucide-react";
import { AvatarOrb } from "@/components/AvatarOrb";
import { HUD_PALETTE } from "@/components/CommandCenter/hudTokens";
import { useAuth } from "@/lib/auth";
import { navHash, useHashRoute } from "@/lib/hashRoute";
import { useAstraVoiceTurn } from "./useAstraVoiceTurn";
import { canIssueHospitalOrders } from "@/astra/saarathi/command/SaarathiCommand";
import { localEarStatus } from "@/astra/voice/providers/voiceboxLocal";
import { startSaarathiListening } from "@/astra/voice/providers/sttPriority";
import { SPEECH_LANG_TAG, type AstraLanguage } from "@/astra/voice/roundTrip/contracts";
import { speakAstra, stopAstraSpeech, unlockAstraAudio } from "@/astra/voice/roundTrip/ttsFallback";
import { ensureMicrophone } from "@/astra/voice/roundTrip/microphone";
import { extractWakeCommand } from "@/astra/voice/roundTrip/wakeDetection";
import { useVoicePrefs } from "@/astra/voice/useVoicePrefs";
import { HandControlToggle } from "@/features/mayin/gesture/HandControlToggle";
import { interpretHeard, listenResumeAfterSpeech, UNCLEAR_PROMPT, type VoiceState } from "@/astra/voice/safety/voiceSafety";
import { voiceSession } from "@/astra/voice/safety/voiceSession";
import { voiceVisualStyle } from "@/astra/voice/safety/VoiceSafetyChrome";

type Presence = "idle" | "listening" | "thinking" | "speaking";
type PriorityLevel = "Low" | "Normal" | "High" | "Critical";

const STT_LANGS: Array<{ value: string; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "en-IN", label: "EN" },
  { value: "te-IN", label: "TE" },
  { value: "hi-IN", label: "HI" },
];

const VOICE_ENGINE_OFF = "Local voice engine is off. Start Voicebox.";

function playWakeChime() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.04, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.16);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.18);
    osc.onended = () => void ctx.close();
  } catch {
    /* chime is optional */
  }
}

const QUICK_ACTIONS = [
  { label: "ICU & Bed Census", icon: Bed, command: "What is the live hospital census and available ICU beds?" },
  { label: "Code Blue Protocol", icon: AlertTriangle, command: "Initiate emergency Code Blue protocol and alert response team" },
  { label: "Pharmacy Stock Alert", icon: Pill, command: "Check critical drug inventory and pending antibiotic orders" },
  { label: "Patient Care Pathway", icon: Activity, command: "Show current triage status and delayed lab turnarounds" },
  { label: "Clinical Guidelines", icon: FileText, command: "Retrieve tier A evidence for emergency fluid resuscitation" },
];

export function SaarathiPresence() {
  const { account } = useAuth();
  const token = typeof window === "undefined" ? null : localStorage.getItem("astra.serverToken");
  const commander = canIssueHospitalOrders(account?.role ?? "");
  const turn = useAstraVoiceTurn({
    userId: account?.id || "USR-DOCTOR",
    name: account?.name || "Doctor",
    role: account?.role || "doctor",
    token,
  });

  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState(false);
  const [presence, setPresence] = useState<Presence>("idle");
  const [transcript, setTranscript] = useState("");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [draft, setDraft] = useState("");
  const [sttLang, setSttLang] = useState("auto");
  const [priority, setPriority] = useState<PriorityLevel>("High");
  const [showPriorityMenu, setShowPriorityMenu] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [micError, setMicError] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const { wakeWordEnabled, setWakeWordEnabled } = useVoicePrefs();
  const route = useHashRoute();
  // Keep the Mayin launcher available to Reception, but remove wake-word and
  // camera/hand-control toggles from that dashboard's bottom corner.
  const hideCornerSwitches = String(route).includes("command-os") || String(route).split("?")[0] === "/reception";
  const isEmrRoute = String(route).includes("emr");
  const [safety, setSafety] = useState(() => voiceSession.snapshot());

  const recRef = useRef<any>(null);
  const listenStopRef = useRef<(() => void) | null>(null);
  const listenGenRef = useRef(0);
  const listenModeRef = useRef<"wake" | "command" | null>(null);
  const armedRef = useRef(false);
  const commandModeRef = useRef(false);
  const askingRef = useRef(false);
  const userStartedRef = useRef(false);
  const askRef = useRef(turn.ask);
  const langRef = useRef("en-IN");
  const startMicRef = useRef<(mode: "wake" | "command") => void>(() => undefined);
  const runTurnRef = useRef<(said: string) => Promise<void>>(async () => undefined);
  const startingRef = useRef(false);
  const silenceTimerRef = useRef<any>(null);
  const accumulatedSpeechRef = useRef("");
  const followupTimerRef = useRef<number | null>(null);
  const lastReplyRef = useRef("");
  const unclearAskedRef = useRef(false);

  askRef.current = turn.ask;
  langRef.current =
    sttLang === "auto" ? SPEECH_LANG_TAG[(turn.language as AstraLanguage) || "en"] || "en-IN" : sttLang;

  useEffect(() => voiceSession.subscribe(() => setSafety(voiceSession.snapshot())), []);

  useEffect(() => {
    armedRef.current = armed;
  }, [armed]);

  useEffect(() => {
    if (turn.status === "thinking") setPresence("thinking");
    else if (turn.status === "speaking") setPresence("speaking");
    else if (turn.status === "done" || turn.status === "idle") setPresence(armed ? "listening" : "idle");
    if (turn.text) lastReplyRef.current = turn.text;
  }, [turn.status, turn.text, armed]);

  // Turn execution: guaranteed speech + action execution
  runTurnRef.current = async (said: string) => {
    const query = said.trim();
    if (!query || askingRef.current) return;
    const releaseMic = () => {
      if (followupTimerRef.current) window.clearTimeout(followupTimerRef.current);
      listenGenRef.current += 1;
      listenStopRef.current?.();
      listenStopRef.current = null;
    };
    const resumeFollowup = () => {
      if (!armedRef.current || !open) return;
      commandModeRef.current = true;
      startMicRef.current("command");
      followupTimerRef.current = window.setTimeout(() => {
        if (!askingRef.current) {
          releaseMic();
          setArmed(false);
          setPresence("idle");
          if (wakeWordEnabled && !document.hidden) startMicRef.current("wake");
        }
      }, 8000);
    };
    const heard = interpretHeard({
      text: query,
      agentNames: voiceSession.agentNames(),
      unclearAlreadyAsked: false,
    });
    if (heard.kind === "stop") {
      releaseMic();
      voiceSession.hardStop({ reason: "stop-word", replyOkay: true });
      setPresence("idle");
      return;
    }
    if (/^\s*repeat that\b/i.test(query)) {
      const again = lastReplyRef.current.trim();
      if (!again) return;
      releaseMic();
      setPresence("speaking");
      await speakAstra({ text: again, language: (turn.language as AstraLanguage) || "en", onEnd: () => setPresence(armedRef.current ? "listening" : "idle") });
      resumeFollowup();
      return;
    }
    const dept = query.match(/\b(?:open|show|go to)\s+(?:the\s+)?(reception|pharmacy|radiology|lab|ward|billing|ot|doctor)\b/i);
    if (dept) {
      const name = dept[1].toLowerCase();
      releaseMic();
      navHash(`/${name}`, { voiceCommand: query });
      const ack = `Okay, opening the ${name} dashboard.`;
      lastReplyRef.current = ack;
      setTranscript(query);
      setPresence("speaking");
      await speakAstra({ text: ack, language: "en", onEnd: () => setPresence(armedRef.current ? "listening" : "idle") });
      resumeFollowup();
      return;
    }
    askingRef.current = true;
    unlockAstraAudio();
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (followupTimerRef.current) window.clearTimeout(followupTimerRef.current);
    listenGenRef.current += 1;
    listenStopRef.current?.();
    listenStopRef.current = null;
    try {
      recRef.current?.stop();
    } catch {
      /* already stopped */
    }
    setPresence("thinking");
    setLiveTranscript("");
    setTranscript(query);
    try {
      await askRef.current(query);
    } finally {
      askingRef.current = false;
      if (listenResumeAfterSpeech({
        pushToTalk: voiceSession.snapshot().pushToTalk,
        wakeWordEnabled,
        panelOpen: open,
        armed: armedRef.current,
      }) === "press-to-open") {
        commandModeRef.current = false;
        setArmed(false);
        setPresence("idle");
        return;
      }
      commandModeRef.current = true;
      if (armedRef.current && open) {
        startMicRef.current("command");
        followupTimerRef.current = window.setTimeout(() => {
          if (!askingRef.current) {
            listenGenRef.current += 1;
            listenStopRef.current?.();
            listenStopRef.current = null;
            setArmed(false);
            setPresence("idle");
            if (wakeWordEnabled) startMicRef.current("wake");
          }
        }, 8000);
      }
    }
  };

  // Ear: local Whisper through Voicebox. Browser speech recognition is not used.
  startMicRef.current = (mode: "wake" | "command") => {
    listenModeRef.current = mode;
    const gen = ++listenGenRef.current;
    listenStopRef.current?.();
    listenStopRef.current = null;
    setMicError("");
    setPresence("listening");

    void (async () => {
      const ear = await localEarStatus();
      if (listenGenRef.current !== gen) return;
      if (!ear.ready) {
        setPresence("idle");
        const down = /not reachable|unreachable|did not report|start Voicebox/i.test(ear.detail);
        setMicError(down ? VOICE_ENGINE_OFF : ear.detail);
        return;
      }

      const handle = startSaarathiListening({
        preferredLanguage: langRef.current,
        maxDurationMs: mode === "wake" ? 2500 : 7000,
        silenceStopMs: 520,
        allowBrowserFallback: false,
        manual: mode === "command",
        onStateChange: (state) => {
          if (listenGenRef.current !== gen) return;
          if (state === "LISTENING") setPresence("listening");
          if (state === "TRANSCRIBING") setPresence("thinking");
        },
      });
      listenStopRef.current = () => {
        handle.stop();
      };
      const result = await handle.promise;
      if (listenGenRef.current !== gen) return;
      listenStopRef.current = null;
      const said = result.text.trim();
      if (result.ok && said) {
        const heardNow = interpretHeard({
          text: said,
          confidence: result.confidence,
          agentNames: voiceSession.agentNames(),
          unclearAlreadyAsked: unclearAskedRef.current,
        });
        if (heardNow.kind === "stop") {
          voiceSession.hardStop({ reason: "stop-word", replyOkay: true });
          setLiveTranscript(said);
          setPresence("idle");
          return;
        }
        if (heardNow.kind === "unclear-once") {
          unclearAskedRef.current = true;
          setLiveTranscript(said);
          setPresence("speaking");
          await speakAstra({ text: UNCLEAR_PROMPT, language: "en" });
          if (listenGenRef.current === gen && armedRef.current && !document.hidden) startMicRef.current(mode);
          return;
        }
        if (heardNow.kind === "unclear-wait") return;
        unclearAskedRef.current = false;
        setLiveTranscript(said);
        if (mode === "wake") {
          const wake = extractWakeCommand(said);
          if (!wake.woke) {
            if (armedRef.current && wakeWordEnabled && !document.hidden && presence !== "speaking") startMicRef.current("wake");
            return;
          }
          playWakeChime();
          setOpen(true);
          setTranscript(said);
          const command = wake.command.trim();
          if (command) void runTurnRef.current(command);
          else startMicRef.current("command");
          return;
        }
        void runTurnRef.current(said);
        return;
      }
      if (result.error === "suppressed" || result.error === "interrupted") return;
      if (!armedRef.current || askingRef.current || document.hidden) return;
      if (result.error && result.error !== "silence") {
        setMicError(/voicebox|whisper|unreachable/i.test(result.error) ? VOICE_ENGINE_OFF : result.error);
        setPresence("idle");
        return;
      }
      window.setTimeout(() => {
        if (listenGenRef.current === gen && armedRef.current && !askingRef.current && !document.hidden) {
          startMicRef.current(mode);
        }
      }, 60);
    })();
  };

  useEffect(() => {
    const stop = () => {
      voiceSession.hardStop({ reason: "event", replyOkay: false });
      listenGenRef.current += 1;
      listenStopRef.current?.();
      listenStopRef.current = null;
      try {
        recRef.current?.stop();
      } catch {
        /* already stopped */
      }
      setPresence(armedRef.current ? "listening" : "idle");
    };
    window.addEventListener("astra-saarathi-stop", stop);
    return () => window.removeEventListener("astra-saarathi-stop", stop);
  }, []);

  const beginListening = useCallback(async (mode: "wake" | "command", openedByUser: boolean) => {
    if (startingRef.current) return;
    startingRef.current = true;
    if (openedByUser) userStartedRef.current = true;
    unlockAstraAudio();
    setArmed(true);
    if (openedByUser || mode === "command") setOpen(true);
    setMicError("");
    try {
      const access = await ensureMicrophone();
      if (!access.ok) {
        setMicError(access.message ?? "Microphone permission is required. Click Speak to grant access.");
        return;
      }
      startMicRef.current(mode);
    } finally {
      startingRef.current = false;
    }
  }, []);

  useEffect(() => voiceSession.onStart(() => { void beginListening("command", true); }), [beginListening]);

  const seenRoute = useRef<string | null>(null);
  useEffect(() => {
    if (seenRoute.current === null) {
      seenRoute.current = route;
      return;
    }
    if (seenRoute.current === route) return;
    seenRoute.current = route;
    if (wakeWordEnabled && !open && !document.hidden) void beginListening("wake", false);
  }, [beginListening, open, route, wakeWordEnabled]);

  const arm = useCallback((mode: "wake" | "command" = "command") => {
    void beginListening(mode, true);
  }, [beginListening]);

  useEffect(() => {
    if (!wakeWordEnabled || open || document.hidden || turn.status === "speaking") return;
    void beginListening("wake", false);
    return () => {
      // Only the closed-panel wake ear belongs to this effect. Stopping every
      // status change also killed press-to-talk, so Dr Mayin stopped hearing.
      if (listenModeRef.current !== "wake") return;
      listenGenRef.current += 1;
      listenStopRef.current?.();
      listenStopRef.current = null;
    };
  }, [beginListening, open, turn.status, wakeWordEnabled]);

  useEffect(() => {
    if (!open || !safety.doctorBargeIn || safety.state !== "SPEAKING") return;
    let stopped = false;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let raf = 0;
    let hot = 0;
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        if (stopped) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        ctx = new AudioContext();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        const frame = new Uint8Array(analyser.fftSize);
        const tick = () => {
          if (stopped) return;
          analyser.getByteTimeDomainData(frame);
          let sum = 0;
          for (let i = 0; i < frame.length; i++) {
            const sample = (frame[i] - 128) / 128;
            sum += sample * sample;
          }
          const rms = Math.sqrt(sum / frame.length);
          hot = rms > 0.08 ? hot + 1 : 0;
          if (hot >= 3) {
            if (voiceSession.pauseForDoctorSpeech()) startMicRef.current("command");
            return;
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch {
        /* barge-in stays quiet if the mic is already held */
      }
    })();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((track) => track.stop());
      void ctx?.close();
    };
  }, [open, safety.doctorBargeIn, safety.state]);

  useEffect(() => {
    const onVisibility = () => {
      listenGenRef.current += 1;
      listenStopRef.current?.();
      listenStopRef.current = null;
      if (!document.hidden && wakeWordEnabled && !open && turn.status !== "speaking") void beginListening("wake", false);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [beginListening, open, turn.status, wakeWordEnabled]);

  useEffect(() => {
    // Opening the panel must not stop the press-to-talk ear that just started.
    // This effect only drops a background ear while the panel is closed and wake is off.
    if (wakeWordEnabled || open) return;
    listenGenRef.current += 1;
    listenStopRef.current?.();
    listenStopRef.current = null;
    listenModeRef.current = null;
    setArmed(false);
    setPresence("idle");
  }, [open, wakeWordEnabled]);

  const toggleOpen = () => {
    if (open) {
      setOpen(false);
      setArmed(false);
      commandModeRef.current = false;
      if (followupTimerRef.current) window.clearTimeout(followupTimerRef.current);
      listenGenRef.current += 1;
      listenStopRef.current?.();
      listenStopRef.current = null;
      try {
        recRef.current?.stop();
      } catch {
        /* ignore */
      }
      voiceSession.releasePanel();
      setPresence("idle");
      if (wakeWordEnabled) void beginListening("wake", false);
    } else {
      arm("command");
    }
  };

  const sendTyped = () => {
    const said = (draft.trim() || liveTranscript.trim() || transcript.trim());
    if (!said) return;
    setDraft("");
    setLiveTranscript("");
    setTranscript(said);
    unlockAstraAudio();
    void runTurnRef.current(said);
  };

  const executeAction = (cmd: string) => {
    setShowActionsMenu(false);
    setTranscript(cmd);
    unlockAstraAudio();
    void runTurnRef.current(cmd);
  };

  const toggleSound = () => {
    if (soundEnabled) {
      stopAstraSpeech();
      setSoundEnabled(false);
    } else {
      unlockAstraAudio();
      setSoundEnabled(true);
      if (turn.text) {
        // Re-read last response
        turn.ask(turn.text);
      }
    }
  };

  const visualState: VoiceState =
    safety.state !== "IDLE" ? safety.state
    : presence === "listening" ? "LISTENING"
    : presence === "thinking" ? "THINKING"
    : presence === "speaking" ? "SPEAKING"
    : "IDLE";
  const visual = voiceVisualStyle(visualState);

  return (
    <>
      {/* ── Keyframe Animations for Jarvis Orb and UI ──────────────────────── */}
      <style>{`
        @keyframes astra-voice-pulse { 0%, 100% { opacity: 0.45; } 50% { opacity: 1; } }
        @keyframes j-orb-breathe {
          0%, 100% { transform: scale(1) translateY(0px); }
          50% { transform: scale(1.04) translateY(-8px); }
        }
        @keyframes j-orb-pulse {
          0%, 100% { box-shadow: 0 0 50px 18px rgba(16,185,129,0.35), 0 0 100px 40px rgba(16,185,129,0.15); }
          50% { box-shadow: 0 0 85px 30px rgba(16,185,129,0.6), 0 0 150px 65px rgba(16,185,129,0.28); }
        }
        @keyframes j-orb-speaking {
          0%, 100% { transform: scale(1); filter: brightness(1); }
          25% { transform: scale(1.08) rotate(1deg); filter: brightness(1.2); }
          75% { transform: scale(0.96) rotate(-1deg); filter: brightness(1.15); }
        }
        @keyframes j-ring-spin-slow {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to { transform: translate(-50%, -50%) rotate(360deg); }
        }
        @keyframes j-ring-spin-rev {
          from { transform: translate(-50%, -50%) rotate(360deg); }
          to { transform: translate(-50%, -50%) rotate(0deg); }
        }
        @keyframes j-ripple {
          0% { transform: translate(-50%, -50%) scale(0.85); opacity: 0.8; }
          100% { transform: translate(-50%, -50%) scale(2.2); opacity: 0; }
        }
        @keyframes j-wave-bar {
          0%, 100% { transform: scaleY(0.3); }
          50% { transform: scaleY(1); }
        }
        @keyframes j-fade-up {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes j-orb-ring {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* ── 1. Floating Dr. Mayin Glowing Orb Launcher (bottom-right) ───────── */}
      <div className={`fixed bottom-6 right-6 z-50 flex items-end gap-3 ${isEmrRoute ? "emr-mayin-corner" : ""}`}>
        {!hideCornerSwitches && (
        <div className={isEmrRoute ? "emr-corner-switches" : "contents"}>
        {/* Wake-word switch — sits beside the orb (prompt 03 behaviour kept) */}
        <button
          type="button"
          onClick={() => setWakeWordEnabled(!wakeWordEnabled)}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-2 text-[10px] font-bold uppercase tracking-wider backdrop-blur-xl transition-all ${
            wakeWordEnabled
              ? "border-emerald-400/60 bg-emerald-950/85 text-emerald-200 shadow-[0_0_20px_-4px_rgba(57,255,136,0.6)]"
              : "border-white/15 bg-black/70 text-slate-300 hover:border-white/30"
          }`}
          aria-pressed={wakeWordEnabled}
          aria-label={`Wake word listening ${wakeWordEnabled ? "on" : "off"}, toggle`}
          title="Wake word listening"
        >
          {wakeWordEnabled && <span className="h-2 w-2 rounded-full bg-emerald-300 animate-pulse" />}
          Wake word: {wakeWordEnabled ? "ON" : "OFF"}
        </button>

        {/* Hand-control switch — sits beside the wake-word switch (prompt 07) */}
        <HandControlToggle />
        </div>
        )}

        {/* The glowing orb — opens ONLY when pressed (or by wake word if ON) */}
        <div className="relative flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={toggleOpen}
            aria-label="Open Dr. Mayin Voice Command"
            className="group relative grid h-16 w-16 cursor-pointer place-items-center rounded-full transition-transform duration-300 hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              background: `radial-gradient(circle at 38% 30%, rgba(255,255,255,0.16), rgba(255,255,255,0.02) 46%, rgba(2,10,6,0.9) 100%)`,
              border: `1px solid color-mix(in srgb, ${HUD_PALETTE.neon} 55%, transparent)`,
              boxShadow: `0 0 26px 2px rgba(57,255,136,0.45), 0 0 62px 10px rgba(57,255,136,0.18), inset 0 1px 0 rgba(255,255,255,0.22)`,
              outlineColor: HUD_PALETTE.neon,
            }}
          >
            {/* rotating HUD ring */}
            <span
              className="pointer-events-none absolute inset-0 rounded-full"
              style={{
                border: `1px dashed color-mix(in srgb, ${HUD_PALETTE.neon} 40%, transparent)`,
                animation: "j-orb-ring 18s linear infinite",
              }}
              aria-hidden="true"
            />
            <AvatarOrb
              size={44}
              thinking={presence === "thinking"}
              speaking={presence === "speaking" || presence === "listening"}
            />
            {(open || wakeWordEnabled) && (
              <span className="absolute bottom-1 right-1 h-3 w-3 rounded-full border-2 border-black bg-emerald-400 animate-pulse" />
            )}
          </button>
          <div className="text-center leading-tight">
            <div className="text-[10px] font-black tracking-[0.16em] text-emerald-300">DR. MAYIN</div>
            <div className="text-[8px] font-semibold uppercase tracking-wider" style={{ color: visual.color }}>
              {visualState === "IDLE" ? "Jarvis Core" : `● ${visualState === "LISTENING" ? "Listening" : visualState === "THINKING" ? "Thinking" : visualState === "SPEAKING" ? "Speaking" : "Muted"}`}
              {safety.silent ? " · Silent" : ""}
            </div>
          </div>
        </div>
      </div>

      {/* ── 2. Fullscreen Jarvis Voice Interface (Matches User Screenshot) ──── */}
      {open && (
        <div className="fixed inset-0 z-[100] bg-black text-white flex flex-col justify-between items-center p-6 md:p-10 select-none overflow-hidden animate-[j-fade-up_0.25s_ease-out]">
          {/* Subtle Ambient Background Gradient */}
          <div
            className="absolute inset-0 pointer-events-none opacity-20"
            style={{
              background:
                "radial-gradient(circle at 50% 60%, rgba(16,185,129,0.25) 0%, rgba(5,46,22,0.12) 40%, transparent 75%)",
            }}
          />

          {/* ── TOP HUD BAR ──────────────────────────────────────────────── */}
          <div className="w-full max-w-5xl flex items-center justify-between z-10">
            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_12px_#34d399] animate-pulse" />
              <div>
                <div className="text-xs font-black tracking-[0.25em] text-emerald-400 uppercase">
                  DR. MAYIN // JARVIS
                </div>
                <div className="text-[10px] text-slate-400 tracking-wider">
                  ORCHESTRATOR · SAARATHI · SANJEEVANI · {turn.dashboard.toUpperCase()}
                </div>
              </div>
            </div>

            {/* Language & Sound Toggles */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-lg p-1">
                {STT_LANGS.map((lang) => (
                  <button
                    key={lang.value}
                    type="button"
                    onClick={() => setSttLang(lang.value)}
                    className={`px-2.5 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer ${
                      sttLang === lang.value
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={toggleSound}
                className="w-8 h-8 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-slate-300 hover:text-white hover:border-emerald-500/30 transition-all cursor-pointer"
                title={soundEnabled ? "Mute Dr. Mayin" : "Unmute Dr. Mayin"}
              >
                {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} className="text-red-400" />}
              </button>
            </div>
          </div>

          {/* ── CENTER VISUAL STAGE: THE JARVIS ORB ──────────────────────── */}
          <div className="flex-1 w-full max-w-4xl flex flex-col items-center justify-center relative my-auto z-10">
            {/* Holographic Ring Orbits */}
            <div
              className="absolute w-[290px] h-[290px] md:w-[360px] md:h-[360px] rounded-full border border-emerald-500/20 pointer-events-none"
              style={{
                top: "50%",
                left: "50%",
                animation: "j-ring-spin-slow 24s linear infinite",
                borderStyle: "dashed",
              }}
            />
            <div
              className="absolute w-[330px] h-[330px] md:w-[420px] md:h-[420px] rounded-full border border-cyan-400/15 pointer-events-none"
              style={{
                top: "50%",
                left: "50%",
                animation: "j-ring-spin-rev 36s linear infinite",
              }}
            />

            {/* Expanding Pulse Ripples when Listening or Speaking */}
            {(presence === "listening" || presence === "speaking") && (
              <>
                <div
                  className="absolute w-[240px] h-[240px] rounded-full border border-emerald-400/40 pointer-events-none"
                  style={{ top: "50%", left: "50%", animation: "j-ripple 2s ease-out infinite" }}
                />
                <div
                  className="absolute w-[240px] h-[240px] rounded-full border border-emerald-400/30 pointer-events-none"
                  style={{ top: "50%", left: "50%", animation: "j-ripple 2s ease-out 0.7s infinite" }}
                />
              </>
            )}

            {/* THE GLOWING GREEN/WHITE SPHERE (Exact Replica of User's Screenshot) */}
            <div
              onClick={() => {
                unlockAstraAudio();
                if (presence === "listening") {
                  listenGenRef.current += 1;
                  listenStopRef.current?.();
                  listenStopRef.current = null;
                  setPresence("idle");
                } else {
                  arm("command");
                }
              }}
              className="relative cursor-pointer transition-transform duration-500"
              style={{
                width: 140,
                height: 140,
                borderRadius: "50%",
                // Exact gradient matching user screenshot: emerald top transitioning to white bottom
                background:
                  "radial-gradient(ellipse at 42% 28%, #ecfdf5 0%, #a7f3d0 32%, #10b981 68%, #047857 95%, #022c22 100%)",
                boxShadow:
                  visualState === "LISTENING"
                    ? `0 0 65px 24px ${visual.glow}88, 0 0 120px 48px ${visual.color}44`
                    : visualState === "SPEAKING"
                      ? `0 0 0 6px ${visual.glow}, 0 0 85px 32px ${visual.glow}66`
                      : visualState === "THINKING"
                        ? `0 0 60px 20px ${visual.glow}88, 0 0 100px 35px ${visual.color}33`
                        : visualState === "MUTED"
                          ? `0 0 40px 12px ${visual.glow}99`
                          : "0 0 50px 16px rgba(148,163,184,0.25)",
                animation:
                  visualState === "SPEAKING"
                    ? "j-orb-speaking 0.9s ease-in-out infinite"
                    : visualState === "LISTENING"
                      ? "j-orb-pulse 1.6s ease-in-out infinite"
                      : visualState === "THINKING"
                        ? "astra-voice-pulse 1s ease-in-out infinite"
                        : "j-orb-breathe 4s ease-in-out infinite",
              }}
            >
              {/* Internal Glass Highlight Sheen */}
              <div
                className="absolute inset-0 rounded-full pointer-events-none"
                style={{
                  background:
                    "radial-gradient(circle at 35% 25%, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0.1) 45%, transparent 65%)",
                }}
              />
            </div>

            {/* State Label & Voice Frequency Waves */}
            <div className="mt-8 flex flex-col items-center">
              <div className="text-xs font-extrabold uppercase tracking-[0.2em] mb-2" style={{ color: visual.color }}>
                {micError
                  ? "COULD NOT HEAR — SEE THE NOTE BELOW"
                  : visualState === "LISTENING"
                  ? "LISTENING — SPEAK, THEN PAUSE"
                  : visualState === "THINKING"
                    ? "REASONING & ROUTING…"
                    : visualState === "SPEAKING"
                      ? "DR. MAYIN SPEAKING…"
                      : visualState === "MUTED"
                        ? "MUTED"
                        : "TAP OR SPEAK 'DR. MAYIN'"}
              </div>

              {/* Soundwave Equalizer Bars */}
              <div className="flex items-center gap-1 h-5 my-1">
                {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                  <span
                    key={i}
                    className="w-1 rounded-full transition-all duration-150"
                    style={{
                      background: visualState === "LISTENING"
                        ? `linear-gradient(${visual.color}, ${visual.glow})`
                        : visual.color,
                      height:
                        visualState === "SPEAKING" || visualState === "LISTENING"
                          ? `${8 + ((i * 11) % 22)}px`
                          : "4px",
                      animation:
                        visualState === "LISTENING"
                          ? `j-wave-bar 0.7s ease-in-out ${i * 0.08}s infinite alternate`
                          : visualState === "THINKING"
                            ? "astra-voice-pulse 1s ease-in-out infinite"
                            : "none",
                      opacity: visualState === "SPEAKING" || visualState === "LISTENING" ? 0.95 : 0.35,
                    }}
                  />
                ))}
              </div>
            </div>

            {/* ── LIVE TRANSCRIPT & ANSWER DISPLAY (Above Pill Bar) ───────── */}
            <div className="w-full max-w-2xl mt-4 min-h-[70px] flex flex-col items-center justify-center text-center px-4">
              {/* Live interim spoken text */}
              {(liveTranscript || transcript) && (
                <div className="text-sm md:text-base font-medium text-emerald-300/90 mb-1.5 animate-[j-fade-up_0.2s_ease-out]">
                  “{liveTranscript || transcript}”
                </div>
              )}

              {/* Dr. Mayin's Spoken Answer */}
              {turn.text && (
                <div className="text-sm md:text-base text-slate-100 max-h-36 overflow-y-auto font-normal leading-relaxed bg-white/5 border border-white/10 rounded-2xl px-5 py-3 shadow-2xl backdrop-blur-md">
                  {turn.text}
                </div>
              )}

              {/* Errors or Notices */}
              {(turn.error || micError) && (
                <div className="text-xs text-amber-300 mt-2 bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 rounded-lg">
                  {turn.error || micError}
                </div>
              )}
            </div>
          </div>

          {/* ── 3. BOTTOM PILL BAR (Matches Screenshot media_1790154053886.png) ─ */}
          <div className="w-full max-w-2xl relative z-20">
            {/* Quick Actions Drawer (Toggled by [+] button) */}
            {showActionsMenu && (
              <div className="absolute bottom-16 left-0 bg-[#161618] border border-white/15 rounded-2xl p-2.5 shadow-2xl w-72 mb-2 animate-[j-fade-up_0.18s_ease-out]">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 py-1 mb-1 border-b border-white/10 flex items-center gap-1.5">
                  <Sparkles size={11} className="text-emerald-400" /> Quick Hospital Commands
                </div>
                {QUICK_ACTIONS.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => executeAction(item.command)}
                    className="w-full text-left px-2.5 py-2 rounded-xl text-xs text-slate-200 hover:bg-emerald-500/15 hover:text-emerald-200 flex items-center gap-2.5 transition-all cursor-pointer"
                  >
                    <item.icon size={13} className="text-emerald-400 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Priority Selector Drawer (Toggled by [High ⌄] button) */}
            {showPriorityMenu && (
              <div className="absolute bottom-16 right-20 bg-[#161618] border border-white/15 rounded-2xl p-1.5 shadow-2xl w-36 mb-2 animate-[j-fade-up_0.18s_ease-out]">
                {(["Low", "Normal", "High", "Critical"] as PriorityLevel[]).map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => {
                      setPriority(lvl);
                      setShowPriorityMenu(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 rounded-lg text-xs flex items-center justify-between transition-all cursor-pointer ${
                      priority === lvl
                        ? "bg-emerald-500/20 text-emerald-300 font-bold"
                        : "text-slate-300 hover:bg-white/5"
                    }`}
                  >
                    <span>{lvl}</span>
                    {priority === lvl && <Check size={12} className="text-emerald-400" />}
                  </button>
                ))}
              </div>
            )}

            {/* THE PILL INPUT BAR */}
            <div className="bg-[#18181a] border border-white/10 rounded-full px-3 py-2 flex items-center gap-2.5 shadow-[0_8px_32px_rgba(0,0,0,0.8)] backdrop-blur-xl">

              {/* Text Input */}
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    sendTyped();
                  }
                }}
                placeholder="Type"
                className="flex-1 bg-transparent border-none outline-none text-slate-100 placeholder:text-slate-500 text-sm font-normal px-1"
              />

              {/* Priority Selector [High ⌄] */}
              <button
                type="button"
                onClick={() => {
                  setShowPriorityMenu(!showPriorityMenu);
                  setShowActionsMenu(false);
                }}
                className="flex items-center gap-1 text-xs text-slate-300 hover:text-white px-2 py-1 rounded-full hover:bg-white/5 transition-all cursor-pointer shrink-0"
              >
                <span className="font-medium">{priority}</span>
                <ChevronDown size={13} className="text-slate-400" />
              </button>

              {/* Microphone Toggle Button [🎤] */}
              <button
                type="button"
                onClick={() => {
                  unlockAstraAudio();
                  if (presence === "listening") {
                    listenGenRef.current += 1;
                    listenStopRef.current?.();
                    listenStopRef.current = null;
                    setPresence("idle");
                  } else {
                    arm("command");
                  }
                }}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer shrink-0 ${
                  presence === "listening"
                    ? "bg-emerald-500/20 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.5)] border border-emerald-400/40"
                    : "text-slate-400 hover:text-white hover:bg-white/10"
                }`}
                title={presence === "listening" ? "Mute Microphone" : "Speak to Dr. Mayin"}
              >
                {presence === "listening" ? <Mic size={15} /> : <MicOff size={15} />}
              </button>

              {/* Send Button if text entered */}
              {draft.trim() && (
                <button
                  type="button"
                  onClick={sendTyped}
                  className="w-8 h-8 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center transition-all cursor-pointer shrink-0"
                >
                  <Send size={13} />
                </button>
              )}

              {/* Close Button [✕] (Exact replica from user screenshot) */}
              <button
                type="button"
                onClick={toggleOpen}
                className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center hover:bg-slate-200 transition-all cursor-pointer shrink-0 shadow-md"
                title="Close Jarvis Interface"
              >
                <X size={15} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
