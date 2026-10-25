import React, { useEffect, useState } from "react";
import { ExternalLink, RefreshCw, Volume2, VolumeX, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  detectVoiceTier,
  isOfflineVoiceEnabled,
  type VoiceTier,
} from "@/lib/offlineSpeech";

/**
 * ASTRA Avatar — interactive talking doctor/reception assistant.
 *
 * Overlay assistant. OpenAvatarChat / LiteAvatar was permanently removed.
 * Falls back to the in-app Offline Voice Box (window.astraVoice / OS voices).
 */
export interface AstraAvatarProps {
  mode?: "doctor" | "reception";
  patientName?: string;
  visible?: boolean;
  onClose?: () => void;
  serverUrl?: string;
}

const DEFAULT_URL = "http://localhost:8282/ui/index.html";

export function AstraAvatar({
  mode = "doctor",
  patientName = "",
  visible = true,
  onClose,
  serverUrl = DEFAULT_URL,
}: AstraAvatarProps) {
  const [status, setStatus] = useState<"connecting" | "ready" | "error" | "offline">("connecting");
  const [muted, setMuted] = useState(false);
  const [probeKey, setProbeKey] = useState(0);
  const [voiceTier, setVoiceTier] = useState<VoiceTier>("unavailable");
  const [offlineOn, setOfflineOn] = useState(true);

  const baseUrl = serverUrl.replace(/\/+$/, "");
  // Probe the bare origin so the health check works no matter what path the iframe points at.
  const serverOrigin = new URL(baseUrl, window.location.origin).origin;

  // Capture the offline-voice tier for the status chip.
  useEffect(() => {
    setOfflineOn(isOfflineVoiceEnabled());
    void detectVoiceTier().then((t) => setVoiceTier(t));
  }, []);

  // Probe the OpenAvatarChat / LiteAvatar server.
  useEffect(() => {
    if (!visible) return;
    let alive = true;
    setStatus("connecting");

    const timer = setTimeout(() => {
      if (alive) setStatus(isOfflineVoiceEnabled() ? "offline" : "error");
    }, 2600);

    const probe = async () => {
      try {
        if (!alive) return;
        setStatus(isOfflineVoiceEnabled() ? "offline" : "error");
      } catch {
        if (alive) setStatus(isOfflineVoiceEnabled() ? "offline" : "error");
      }
    };

    probe();
    return () => {
      alive = false;
      clearTimeout(timer as unknown as number);
    };
  }, [visible, baseUrl, probeKey]);

  const toggleMute = () => {
    setMuted((m) => {
      const next = !m;
      const frame = document.querySelector<HTMLIFrameElement>("iframe[data-astra-avatar]");
      if (next && frame?.contentWindow) {
        try {
          frame.contentWindow.postMessage({ type: "astra-mute", muted: true }, "*");
        } catch {
          /* cross-origin — ignore */
        }
      }
      return next;
    });
  };

  if (!visible) return null;

  const title = mode === "doctor" ? "Clinical Co-Pilot" : "Reception Assistant";
  const footer = mode === "doctor" ? `Discussing case: ${patientName || "Current Patient"}` : "Reception • Multilingual AI Doctor";

  return (
    <div className="fixed z-[9999] right-5 bottom-24 w-[380px] max-w-[calc(100vw-2.5rem)] h-[560px] max-h-[calc(100vh-8rem)] flex flex-col overflow-hidden rounded-2xl glass-premium shadow-2xl">
      {/* gold hairline */}
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/80 to-transparent" />

      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-amber-400/15 bg-black/20">
        <div className="flex items-center gap-2 min-w-0">
          <span className="relative inline-flex h-2 w-2">
            <span
              className={cn(
                "absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping",
                status === "error" ? "bg-rose-400" : "bg-emerald-400"
              )}
            />
            <span
              className={cn(
                "relative inline-flex h-2 w-2 rounded-full",
                status === "error" ? "bg-rose-400" : "bg-emerald-400"
              )}
            />
          </span>
          <span className="text-[11px] font-bold tracking-wide text-gold-shimmer truncate">
            ASTRA AVATAR • {title}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button aria-label="Mute" onClick={toggleMute} className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10 hover:text-white transition-colors">
            {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>
          <button aria-label="Reload avatar connection" onClick={() => setProbeKey((k) => k + 1)} className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10 hover:text-white transition-colors">
            <RefreshCw size={15} />
          </button>
          <button aria-label="Close avatar" onClick={onClose} className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Avatar stream area */}
      <div className="relative flex-1 bg-black/30 overflow-hidden">
        <iframe
          data-astra-avatar
          src={baseUrl}
          title="Astra AI Avatar"
          allow="microphone; camera; autoplay; fullscreen"
          className="absolute inset-0 w-full h-full border-0"
        />

        {status === "connecting" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 text-center px-6">
            <span className="h-8 w-8 rounded-full border-2 border-amber-400/60 border-t-transparent animate-spin" />
            <p className="text-xs text-slate-300">Connecting to LiteAvatar…</p>
          </div>
        )}

        {(status === "error" || status === "offline") && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center bg-black/70 backdrop-blur-sm">
            <span className="text-3xl">🤖</span>
            <p className="text-xs text-slate-200 leading-relaxed max-w-[280px]">
              {status === "error"
                ? "Avatar server not running."
                : "Avatar server offline — using in-app Offline Voice Box instead."}
            </p>
            <p className="text-[11px] text-slate-400 leading-relaxed max-w-[280px]">
              Start it once on your machine:{" "}
              <code className="text-amber-300">uv run src/demo.py --config chat_with_openai_compatible_bailian_cosyvoice.yaml</code>{" "}
              then the live LiteAvatar feeds here at <span className="text-amber-200">{baseUrl}</span>.
            </p>
            <div className="flex items-center gap-2 mt-1">
              <button
                onClick={() => setProbeKey((k) => k + 1)}
                className="btn-neon !px-3 !py-1.5 rounded-lg text-[11px] font-bold"
              >
                <RefreshCw size={12} className="inline mr-1" /> Retry
              </button>
              <button
                onClick={() => window.open(baseUrl, "_blank")}
                className="btn-ghost !px-3 !py-1.5 rounded-lg text-[11px] font-bold"
              >
                <ExternalLink size={12} className="inline mr-1" /> Open Server
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer: patient context */}
      <div className="flex items-center justify-between gap-2 px-3.5 py-2 border-t border-amber-400/15 bg-black/25">
        <span className="text-[11px] text-amber-100/80 truncate">{footer}</span>
      </div>

      {mode === "doctor" && offlineOn && (
        <button
          onClick={() => {
            const av = (window as unknown as { astraVoice?: { speak: (t: string) => Promise<unknown> } }).astraVoice;
            if (av) void av.speak(footer);
          }}
          className="mx-3 mb-2.5 rounded-lg border border-amber-400/30 bg-amber-400/5 px-3 py-1.5 text-[11px] font-semibold text-amber-200 hover:bg-amber-400/10 transition-colors"
        >
          <Volume2 size={12} className="inline mr-1" />
          {voiceTier === "voicebox" ? "Speak with Voicebox" : "Voicebox offline"}
        </button>
      )}
    </div>
  );
}

export default AstraAvatar;
