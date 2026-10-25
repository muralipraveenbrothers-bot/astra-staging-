/**
 * ASTRA SAARATHI — Voicebox local provider (PRIMARY ears and mouth).
 * =================================================================
 * Voicebox is Saarathi's primary speaker AND primary transcriber. It is NOT
 * Astra's brain — it only turns text into audio and audio into text.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The previous path silently fell back to a Google/browser voice while still
 * reporting the provider as "Voicebox", so the UI claimed local neural speech
 * that was never produced. Here every failure is a STRUCTURED failure carrying
 * `provider: "voicebox-local"` — nothing is relabelled, nothing is faked.
 *
 * Also implements the honest health monitor (repair prompt §K): a periodic
 * ~10 s probe while Saarathi is active, plus recovery detection, so Voicebox is
 * not permanently marked OFFLINE just because it was down at first mount.
 *
 * HISTORY: this file was corrupted by the same interleaved-edit event that hit
 * server/voice/voiceProviderRoutes.ts (function bodies swapped, TS1184). The
 * block order below (provider → speak → transcribe → health monitor) is the
 * repaired, typechecked layout.
 */

import { checkVoicebox } from "@/lib/voicebox";
import { currentVoiceSettings } from "./voiceSettings";
import type { ProviderState, ProviderStatus } from "./voiceContracts";

const PROVIDER_ID = "voicebox-local";

/** Same-origin proxy mounts for the LOCAL runtime (never a cloud URL). */
export const VOICEBOX_TRANSCRIBE_URLS = [
  "/proxy/voicebox/transcribe",
  "/api/voice/transcribe",
];

/** Spoken clip cap. The screen keeps the full answer; the mouth speaks the first breath. */
export function clipForVoice(text: string): string {
  const clean = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*_`#>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "";
  const parts = clean.split(/(?<=[.!?।॥])\s+/).filter(Boolean);
  const spoken = (parts.slice(0, 4).join(" ") || clean).trim();
  if (spoken.length <= 560) return spoken;
  const cut = spoken.slice(0, 557);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 80 ? cut.slice(0, lastSpace) : cut).trim()}.`;
}

/** Kokoro profiles that are installed and human. JARVIS is a persona, not the clinical mouth. */
export function kokoroProfileFor(language: string): { profile: string; language: string } {
  const value = (language || "en-IN").toLowerCase();
  if (value.startsWith("hi")) return { profile: "ASTRA Hindi", language: "hi" };
  if (value.startsWith("te")) return { profile: "ASTRA English", language: "en" };
  return { profile: "ASTRA English", language: "en" };
}

interface WhisperModelRow {
  model_name?: string;
  downloaded?: boolean;
  loaded?: boolean;
  downloading?: boolean;
}

/** True when a local Whisper model can transcribe. Starts the base download if none exists. */
export async function localEarStatus(): Promise<{ ready: boolean; detail: string }> {
  try {
    const res = await fetch("/proxy/voicebox/models/status", { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return { ready: false, detail: "Voicebox did not report its listening models." };
    const data = (await res.json()) as { models?: WhisperModelRow[] };
    const ears = (data.models ?? []).filter((row) => String(row.model_name ?? "").startsWith("whisper"));
    if (ears.some((row) => row.loaded || row.downloaded)) {
      const ready = ears.find((row) => row.loaded) ?? ears.find((row) => row.downloaded);
      return { ready: true, detail: ready?.model_name ?? "whisper" };
    }
    if (!ears.some((row) => row.downloading)) {
      void fetch("/proxy/voicebox/models/download", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model_name: "whisper-base" }),
      }).catch(() => undefined);
    }
    return { ready: false, detail: "The listening model is still downloading. Type a command, or wait a moment and speak again." };
  } catch {
    return { ready: false, detail: "Voicebox is not reachable, so Dr. Mayin cannot hear yet. You can still type." };
  }
}

let status: ProviderStatus = {
  id: PROVIDER_ID,
  label: "Voicebox (local)",
  role: "PRIMARY",
  state: "CHECKING",
  checkedAt: 0,
};

const listeners = new Set<(s: ProviderStatus) => void>();

export function getVoiceboxStatus(): ProviderStatus {
  return status;
}

export function subscribeVoiceboxStatus(listener: (s: ProviderStatus) => void): () => void {
  listeners.add(listener);
  listener(status);
  return () => { listeners.delete(listener); };
}

/** Internal + router-facing state transition. Never invents a state. */
export function setVoiceboxStatus(state: ProviderState, detail?: string): ProviderStatus {
  status = { ...status, state, detail, checkedAt: Date.now() };
  listeners.forEach((l) => l(status));
  return status;
}

/** Real probe. `ok` requires an actual HTTP answer from the local runtime. */
export async function probeVoicebox(): Promise<ProviderStatus> {
  if (!currentVoiceSettings().preferVoicebox) {
    return setVoiceboxStatus("DISABLED", "Local Voicebox disabled in Settings → Voice");
  }
  const health = await checkVoicebox();
  if (health.ok) {
    return setVoiceboxStatus("READY", `local runtime answered in ${health.latencyMs} ms`);
  }
  return setVoiceboxStatus("OFF", "local runtime unreachable — start Voicebox on 127.0.0.1:17493");
}

export const TELUGU_VOICE_MISSING =
  "Telugu voice not installed; replying in English text + English voice";

export interface VoiceboxClipResult {
  ok: boolean;
  blob?: Blob;
  /** Structured, retryable-aware failure. Never a silent downgrade. */
  error?: string;
  /** Shown when Telugu text would otherwise be read by an English Kokoro voice. */
  notice?: string;
  /** True when a local Windows Telugu voice already spoke this clip. */
  spokenLocally?: boolean;
  retryable: boolean;
  latencyMs: number;
}

let stopLocalTelugu: (() => void) | null = null;

export function stopLocalTeluguSpeech(): void {
  stopLocalTelugu?.();
  stopLocalTelugu = null;
  try { window.speechSynthesis?.cancel(); } catch { /* no local voice */ }
}

export async function findLocalTeluguVoice(): Promise<SpeechSynthesisVoice | null> {
  if (typeof window === "undefined" || !window.speechSynthesis?.getVoices) return null;
  const synth = window.speechSynthesis;
  let voices = synth.getVoices();
  if (!voices.length) {
    await new Promise<void>((resolve) => {
      const timer = window.setTimeout(resolve, 250);
      synth.onvoiceschanged = () => {
        window.clearTimeout(timer);
        resolve();
      };
    });
    voices = synth.getVoices();
  }
  return voices.find((voice) => (voice.lang || "").toLowerCase().startsWith("te")) ?? null;
}

function speakWindowsTelugu(text: string, voice: SpeechSynthesisVoice): Promise<boolean> {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    const utter = new SpeechSynthesisUtterance(text);
    utter.voice = voice;
    utter.lang = voice.lang || "te-IN";
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      stopLocalTelugu = null;
      resolve(ok);
    };
    utter.onend = () => finish(true);
    utter.onerror = () => finish(false);
    stopLocalTelugu = () => { try { synth.cancel(); } catch { /* noop */ } finish(true); };
    synth.cancel();
    synth.speak(utter);
  });
}

export function voiceSentences(text: string, limit = 3): string[] {
  const clean = text.replace(/```[\s\S]*?```/g, " ").replace(/[*_`#>|]/g, " ").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const parts = clean.split(/(?<=[.!?।॥])\s+/).map((part) => part.trim()).filter(Boolean);
  return (parts.length ? parts : [clean]).slice(0, limit);
}

/**
 * Synthesize on the ACTUAL local runtime through the same-origin proxy.
 * A non-OK HTTP status is surfaced as `VOICEBOX_UNAVAILABLE` — never replaced by
 * a different voice behind the caller's back.
 */
/**
 * Speak on the loaded Kokoro runtime directly. This is the fast human mouth:
 * ASTRA English / ASTRA Hindi. Sarvam and Gemini are tried by the router first
 * only when those keys are actually configured.
 */
async function speakKokoro(
  text: string,
  language: string,
  opts: { profile?: string; signal?: AbortSignal; timeoutMs?: number }
): Promise<VoiceboxClipResult> {
  const t0 = Date.now();
  const chosen = kokoroProfileFor(language);
  const timeoutMs = opts.timeoutMs ?? 9000;
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), timeoutMs);
  const onOuterAbort = () => controller.abort();
  opts.signal?.addEventListener("abort", onOuterAbort, { once: true });
  try {
    const audio = await fetch("/api/voice/speak", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text,
        profile: opts.profile || chosen.profile,
        engine: "kokoro",
        language: chosen.language,
      }),
      signal: controller.signal,
    });
    if (!audio.ok) return { ok: false, error: `Voicebox audio HTTP ${audio.status}`, retryable: true, latencyMs: Date.now() - t0 };
    const blob = await audio.blob();
    if (!blob.size) return { ok: false, error: "Voicebox returned an empty clip", retryable: true, latencyMs: Date.now() - t0 };
    return { ok: true, blob, retryable: false, latencyMs: Date.now() - t0 };
  } catch (e) {
    const aborted = (e as { name?: string })?.name === "AbortError";
    return {
      ok: false,
      error: aborted ? "Voicebox request aborted" : `Voicebox unreachable: ${e instanceof Error ? e.message : String(e)}`,
      retryable: !aborted,
      latencyMs: Date.now() - t0,
    };
  } finally {
    clearTimeout(timerId);
    opts.signal?.removeEventListener("abort", onOuterAbort);
  }
}

export async function voiceboxSpeak(
  text: string,
  language: string,
  opts: { profile?: string; signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<VoiceboxClipResult> {
  const t0 = Date.now();
  const body = clipForVoice(text);
  if (!body) return { ok: false, error: "Nothing to speak", retryable: false, latencyMs: 0 };

  const requested = (language || "en-IN").toLowerCase();
  if (requested.startsWith("te")) {
    const telugu = await findLocalTeluguVoice();
    if (telugu) {
      const ok = await speakWindowsTelugu(body, telugu);
      return { ok, retryable: false, latencyMs: Date.now() - t0, spokenLocally: ok };
    }
    const english = await speakKokoro(body, "en-IN", opts);
    return { ...english, notice: TELUGU_VOICE_MISSING };
  }

  const direct = await speakKokoro(body, language, opts);
  if (direct.ok && direct.blob) return direct;

  const timeoutMs = opts.timeoutMs ?? 30000;
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), timeoutMs);
  const onOuterAbort = () => controller.abort();
  opts.signal?.addEventListener("abort", onOuterAbort, { once: true });

  try {
    const params = new URLSearchParams({ text: body, lang: language });
    if (opts.profile) params.set("profile", opts.profile);
    const res = await fetch(`/api/voicebox/audio-proxy?${params.toString()}`, {
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = res.status === 503
        ? "Voicebox runtime did not produce audio (503 VOICEBOX_UNAVAILABLE)"
        : `Voicebox synthesis HTTP ${res.status}`;
      return { ok: false, error: detail, retryable: res.status >= 500, latencyMs: Date.now() - t0 };
    }
    const blob = await res.blob();
    if (!blob || blob.size === 0) {
      return { ok: false, error: "Voicebox returned an empty clip", retryable: true, latencyMs: Date.now() - t0 };
    }
    return { ok: true, blob, retryable: false, latencyMs: Date.now() - t0 };
  } catch (e) {
    const aborted = (e as { name?: string })?.name === "AbortError";
    return {
      ok: false,
      error: aborted
        ? "Voicebox request aborted"
        : `Voicebox unreachable: ${e instanceof Error ? e.message : String(e)}`,
      retryable: true,
      latencyMs: Date.now() - t0,
    };
  } finally {
    clearTimeout(timerId);
    opts.signal?.removeEventListener("abort", onOuterAbort);
  }
}

export interface VoiceboxTranscript {
  ok: boolean;
  text: string;
  error?: string;
  latencyMs: number;
  /** 0..1 when Whisper or the server route reports one. */
  confidence?: number;
}

/**
 * Local Whisper transcription (PRIMARY ear). Tries the Astra server route first
 * (works in production builds too), then the Vite proxy mount.
 */
export async function voiceboxTranscribe(
  audio: Blob,
  opts: { language?: string; signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<VoiceboxTranscript> {
  const t0 = Date.now();
  const timeoutMs = opts.timeoutMs ?? 20_000;
  let lastError = "Voicebox transcription unavailable";

  for (const url of VOICEBOX_TRANSCRIBE_URLS) {
    const controller = new AbortController();
    const timerId = setTimeout(() => controller.abort(), timeoutMs);
    const onOuterAbort = () => controller.abort();
    opts.signal?.addEventListener("abort", onOuterAbort, { once: true });
    try {
      const fd = new FormData();
      const wav = audio.type.includes("wav");
      fd.append("file", audio, wav ? "capture.wav" : "capture.webm");
      if (opts.language) fd.append("language", opts.language);
      const res = await fetch(url, { method: "POST", body: fd, signal: controller.signal });
      if (!res.ok) {
        lastError = `Voicebox STT HTTP ${res.status} (${url})`;
        continue;
      }
      const data = (await res.json()) as { text?: string; confidence?: number };
      const text = (data.text ?? "").trim();
      if (!text) {
        lastError = "Voicebox returned an empty transcript";
        continue;
      }
      const confidence = typeof data.confidence === "number" && Number.isFinite(data.confidence) ? data.confidence : undefined;
      return { ok: true, text, latencyMs: Date.now() - t0, confidence };
    } catch (e) {
      lastError = `Voicebox STT failed (${url}): ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      clearTimeout(timerId);
      opts.signal?.removeEventListener("abort", onOuterAbort);
    }
  }

  return { ok: false, text: "", error: lastError, latencyMs: Date.now() - t0 };
}

let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Poll the runtime every `intervalMs` (default 10 s) while Saarathi is active,
 * so a runtime that comes back up is detected automatically and Voicebox returns
 * to PRIMARY without a page reload.
 */
export function startVoiceboxHealthMonitor(intervalMs = 10_000): () => void {
  void probeVoicebox();
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    if (typeof document !== "undefined" && document.hidden) return;
    void probeVoicebox();
  }, intervalMs);
  return stopVoiceboxHealthMonitor;
}

export function stopVoiceboxHealthMonitor(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
