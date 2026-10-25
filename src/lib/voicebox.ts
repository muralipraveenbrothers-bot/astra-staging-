// Local Voicebox client — the on-machine voice runtime (Qwen3-TTS + Whisper).
//
// All calls go through the Vite dev-server proxy mount /proxy/voicebox
// (→ http://127.0.0.1:17493) so CORS never blocks localhost-to-localhost:
//
//   GET  /health        → runtime alive?
//   POST /transcribe    → multipart audio upload, returns { text }
//   POST /speak         → { text, profile, engine } then /audio/{id} (wav)
//
// The web bundle never ships model weights — models live in the external
// Voicebox runtime. When it is down, speech output remains unavailable.

import { useCallback, useEffect, useRef, useState } from "react";

export const VOICEBOX_PROXY = "/proxy/voicebox";

export interface VoiceboxHealth {
  ok: boolean;
  latencyMs: number;
}

/** Astra voice profiles — one per language, switched automatically. */
export const VOICE_PROFILES: Record<"en" | "te" | "hi", { voice: string; ttsLang: string; sttLang: string; label: string }> = {
  en: { voice: "ASTRA English", ttsLang: "en-IN", sttLang: "en-IN", label: "Astra English" },
  hi: { voice: "ASTRA Hindi", ttsLang: "hi-IN", sttLang: "hi-IN", label: "Astra Hindi" },
  te: { voice: "ASTRA Telugu", ttsLang: "te-IN", sttLang: "te-IN", label: "Astra Telugu (Indic backend required)" },
};

/** Probe the runtime — any HTTP response counts as "online". */
export async function checkVoicebox(): Promise<VoiceboxHealth> {
  const t0 = performance.now();
  try {
    const res = await fetch(`${VOICEBOX_PROXY}/health`, { signal: AbortSignal.timeout(3500) });
    return { ok: res.ok || res.status < 500, latencyMs: Math.round(performance.now() - t0) };
  } catch {
    return { ok: false, latencyMs: Math.round(performance.now() - t0) };
  }
}

/**
 * Voicebox STT — upload a recorded audio blob, receive the transcript.
 * Throws a user-readable Error on failure.
 */
export async function voiceboxTranscribe(blob: Blob): Promise<string> {
  const fd = new FormData();
  fd.append("file", blob, "capture.webm");
  const res = await fetch(`${VOICEBOX_PROXY}/transcribe`, { method: "POST", body: fd });
  if (!res.ok) throw new Error(`Voicebox STT failed (HTTP ${res.status})`);
  const data = (await res.json()) as { text?: string };
  const text = (data.text ?? "").trim();
  // Dispatch to Astra command bus so text enters the unified pipeline
  if (typeof window !== "undefined") {
    const event = new CustomEvent("Astra:command", {
      detail: { text, source: "voicebox" }
    });
    window.dispatchEvent(event);
  }
  return text;
}

/**
 * Voicebox TTS — synthesize speech for a sentence, return an audio blob.
 * Throws a user-readable Error on failure.
 */
export async function voiceboxSpeak(text: string, voice: string): Promise<Blob> {
  const language = voice === "ASTRA Hindi" ? "hi-IN" : voice === "ASTRA English" ? "en-IN" : "te-IN";
  const res = await fetch(`/api/voicebox/audio-proxy?text=${encodeURIComponent(text)}&lang=${encodeURIComponent(language)}`);
  if (!res.ok) throw new Error(`Voicebox TTS failed (HTTP ${res.status})`);
  return res.blob();
}

export type VoiceboxStatus = "checking" | "online" | "offline";

/** Poll the runtime health — drives the "Voicebox • Connected" indicator. */
export function useVoiceboxStatus(intervalMs = 8000): { status: VoiceboxStatus; latencyMs?: number; refresh: () => void } {
  const [status, setStatus] = useState<VoiceboxStatus>("checking");
  const [latencyMs, setLatencyMs] = useState<number | undefined>();
  const stopped = useRef(false);

  const refresh = useCallback(async () => {
    const h = await checkVoicebox();
    if (stopped.current || document.hidden) return;
    setStatus(h.ok ? "online" : "offline");
    setLatencyMs(h.latencyMs);
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), intervalMs);
    return () => {
      stopped.current = true;
      clearInterval(id);
    };
  }, [refresh, intervalMs]);

  return { status, latencyMs, refresh };
}
