// ASTRA AI — TTS delivery chain with a guaranteed local fallback.
//
// THE BUG THIS FIXES: speech output used to be Voicebox-only. When the local
// Voicebox runtime was offline Astra was silent by design
// (src/lib/offlineSpeech.ts), and src/lib/speech.ts even set
// `canUseTts: voicebox === "online"`. Result: text appeared, nothing was heard,
// and the failure was invisible to the user.
//
// Chain now (no new paid providers, no new dependencies):
//   1. existing Voicebox  (/api/voicebox/audio-proxy — same origin, already live)
//   2. browser speechSynthesis  (operating-system voice, always available)
//   3. honest failure report    (text stays visible; the UI is told exactly why)
//
// Ordering rule enforced everywhere: TEXT FIRST, SPEECH SECOND.

import { speakControlled } from "../safety/speakControlled";
import { voiceSession } from "../safety/voiceSession";
import { SPEECH_LANG_TAG, type AstraLanguage } from "./contracts";

export type AstraTtsProvider = "voicebox" | "sarvam" | "gemini" | "browser" | "none";

export interface AstraSpeechResult {
  ok: boolean;
  provider: AstraTtsProvider;
  /** Present when ok === false — surfaced to the UI, never swallowed. */
  error?: string;
  /** true when the browser blocked playback (needs a user gesture). */
  blockedPlayback?: boolean;
  /** Policy withheld speech. The text answer stays; this is not a TTS failure. */
  withheld?: boolean;
}

export interface SpeakAstraOptions {
  text: string;
  language: AstraLanguage;
  /** Keep a reference so the UI can offer "Tap to hear Astra". */
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: string) => void;
  /** Skip the Voicebox attempt entirely (unit tests / forced browser voice). */
  preferVoicebox?: boolean;
  /** Abort playback when the voice session stops or the mic must open. */
  signal?: AbortSignal;
  /** Set by the voice session so playback is not wrapped twice. */
  ownedBySession?: boolean;
  /** Voicebox endpoint. Defaults to the existing same-origin proxy. */
  voiceboxUrl?: string;
  voiceboxTimeoutMs?: number;
}

const DEFAULT_VOICEBOX_URL = "/api/voicebox/audio-proxy";
const DEFAULT_VOICEBOX_TIMEOUT_MS = 6000;
let activeAstraAudio: HTMLAudioElement | null = null;
let stopActiveAstraAudio: (() => void) | null = null;

declare global {
  interface Window {
    /** Set by unlockAstraAudio() after a real user gesture. */
    __astraAudioUnlocked?: boolean;
  }
}

function browserSpeechAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Pick the closest installed voice for the requested tag. */
export function findBestBrowserVoice(
  langTag: string,
  voices: SpeechSynthesisVoice[]
): SpeechSynthesisVoice | undefined {
  const short = langTag.slice(0, 2).toLowerCase();
  return (
    voices.find((v) => v.lang === langTag) ??
    voices.find((v) => v.lang.toLowerCase().replace("_", "-") === langTag.toLowerCase()) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(short)) ??
    voices.find((v) => v.lang.toLowerCase().startsWith("en-in")) ??
    voices[0]
  );
}

/**
 * Unlock audio on the first real user gesture (mic tap, send, "Talk to Astra").
 * Browsers block autoplay without this; without it a perfectly generated answer
 * would still be silent.
 */
export function unlockAstraAudio(): void {
  if (typeof window === "undefined") return;
  window.__astraAudioUnlocked = true;
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctx) {
      const ctx = new Ctx();
      void ctx.resume().catch(() => undefined);
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      gain.connect(ctx.destination);
      const osc = ctx.createOscillator();
      osc.connect(gain);
      osc.start();
      osc.stop(ctx.currentTime + 0.01);
    }
  } catch {
    /* not fatal */
  }
}

export function isAstraAudioUnlocked(): boolean {
  if (typeof window === "undefined") return false;
  if (window.__astraAudioUnlocked) return true;
  try {
    return window.speechSynthesis?.speaking ?? false;
  } catch {
    return false;
  }
}


/** STEP 1 of the chain — the existing same-origin Voicebox proxy. */
export async function synthesizeWithVoicebox(
  text: string,
  language: AstraLanguage,
  opts: { voiceboxUrl?: string; timeoutMs?: number } = {}
): Promise<{ blob: Blob | null; error?: string }> {
  if (typeof window === "undefined" || typeof fetch !== "function") {
    return { blob: null, error: "No fetch available" };
  }
  const base = opts.voiceboxUrl ?? DEFAULT_VOICEBOX_URL;
  const langTag = SPEECH_LANG_TAG[language] ?? "en-IN";
  const url = `${base}?text=${encodeURIComponent(text)}&lang=${encodeURIComponent(langTag)}`;
  // Fast 1200ms timeout — if Voicebox is not running locally, immediately fallback to browser voice!
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(opts.timeoutMs ?? 1200),
    });
    if (!res.ok) throw new Error(`Voicebox HTTP ${res.status}`);
    const blob = await res.blob();
    if (!blob || blob.size === 0) throw new Error("Voicebox returned empty audio");
    return { blob };
  } catch (e) {
    return { blob: null, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Play an audio blob, resolving when playback finishes or fails. */
export async function playAudioBlob(blob: Blob): Promise<AstraSpeechResult> {
  if (typeof Audio === "undefined") {
    return { ok: false, provider: "none", error: "Audio playback unavailable" };
  }
  const url = URL.createObjectURL(blob);
  try {
    const audio = new Audio(url);
    activeAstraAudio = audio;
    await new Promise<void>((resolve, reject) => {
      stopActiveAstraAudio = () => { audio.pause(); audio.currentTime = 0; resolve(); };
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error("audio decode failed"));
      void audio.play().catch(reject);
    });
    return { ok: true, provider: "voicebox" };
  } catch (e) {
    return {
      ok: false,
      provider: "none",
      error: e instanceof Error ? e.message : String(e),
      blockedPlayback: !isAstraAudioUnlocked(),
    };
  } finally {
    activeAstraAudio = null;
    stopActiveAstraAudio = null;
    URL.revokeObjectURL(url);
  }
}

/** Browser and robotic operating-system voices have been removed. */
export async function speakWithBrowser(
  _text: string,
  _language: AstraLanguage
): Promise<AstraSpeechResult> {
  return {
    ok: false,
    provider: "none",
    error: "Browser and robotic operating-system voices have been removed. Astra speaks with Sarvam, Gemini, or local Voicebox.",
  };
}

/**
 * Speak an Astra answer through Sarvam, then Gemini, then local Voicebox.
 * NEVER throws. Browser speech synthesis is not used.
 */
export async function speakAstra(options: SpeakAstraOptions): Promise<AstraSpeechResult> {
  if (!options.ownedBySession) {
    const result = await speakControlled(options.text, options.language, (line, signal) =>
      speakAstra({ ...options, text: line, signal, ownedBySession: true })
    );
    if (result.withheld) options.onEnd?.();
    return result;
  }
  const { text, language } = options;
  if (!text.trim()) return { ok: false, provider: "none", error: "Nothing to speak" };
  if (options.signal?.aborted) return { ok: false, provider: "none", error: "stopped" };
  const { speakSaarathi } = await import("../providers/ttsPriority");
  const tag = language === "te" || language === "tenglish" ? "te-IN"
    : language === "hi" || language === "hinglish" ? "hi-IN"
    : "en-IN";
  options.onStart?.();
  const spoken = await speakSaarathi({ text, language: tag, signal: options.signal });
  options.onEnd?.();
  if (!spoken.ok) {
    const error = spoken.error ?? "speech unavailable";
    options.onError?.(error);
    return { ok: false, provider: "none", error };
  }
  const provider: AstraTtsProvider =
    spoken.provider === "sarvam" ? "sarvam"
    : spoken.provider === "gemini-live" ? "gemini"
    : "voicebox";
  return { ok: true, provider };
}

export function stopAstraSpeech(): void {
  if (typeof window === "undefined") return;
  stopActiveAstraAudio?.();
  try {
    activeAstraAudio?.pause();
    if (activeAstraAudio) {
      activeAstraAudio.currentTime = 0;
      activeAstraAudio.src = "";
    }
  } catch { /* noop */ }
  activeAstraAudio = null;
  void import("../providers/voiceboxLocal").then((mod) => mod.stopLocalTeluguSpeech());
  void import("../providers/ttsPriority").then((mod) => mod.stopSaarathiSpeech());
}

voiceSession.bindPlaybackCancel(() => stopAstraSpeech());
voiceSession.bindSpeaker(async (text, signal) => {
  await speakAstra({ text, language: "en", signal, ownedBySession: true });
});
