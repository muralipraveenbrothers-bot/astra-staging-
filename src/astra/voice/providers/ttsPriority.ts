/**
 * ASTRA SAARATHI — human voice router.
 * ===================================
 *   1. SARVAM BULBUL         ← human Indian voice (English, Hindi, Telugu)
 *   2. GEMINI NATIVE AUDIO   ← human cloud voice when Sarvam is down
 *   3. VOICEBOX LOCAL        ← offline mouth for the same three languages
 *   4. TEXT-ONLY HUD         ← guaranteed end state
 *
 * Short operational lines in English, Hindi, or Telugu are spoken by Voicebox
 * first. Laya's language router (already wired) confirms an ambiguous line.
 * That keeps Sarvam and Gemini for the turns that need a human cloud voice.
 * Repeated lines replay the cached clip. Browser and robotic OS voices are gone.
 */

import type { TtsAttempt, TtsProviderId, TtsResult } from "./voiceContracts";
import { currentVoiceSettings } from "./voiceSettings";
import { clipForVoice, setVoiceboxStatus, voiceboxSpeak } from "./voiceboxLocal";
import { geminiLiveSpeak } from "./geminiLiveVoice";
import { sarvamSpeak } from "./sarvamVoice";
import { openaiLiveSpeak } from "./openaiLiveVoice";
import { planVoiceMouth, type HumanMouth } from "./layaVoiceRoute";
import { peekVoiceClip, rememberVoiceClip } from "./voiceClipCache";

export const FINAL_VOICE_UNAVAILABLE_MESSAGE =
  "Saarathi's voice services are temporarily unavailable. Hospital controls remain operational and the text answer is shown on screen.";

export interface SpeakSaarathiOptions {
  text: string;
  /** BCP-47-ish tag, e.g. "te-IN". Defaults to "en-IN". */
  language?: string;
  /** Voicebox profile id, when the dashboard pins a persona voice. */
  profile?: string;
  /**
   * Override the planned mouth order. The local Voicebox tier passes
   * `["voicebox-local"]` so a cloud tier above it is not billed twice.
   */
  mouths?: HumanMouth[];
  /** Attached patient context forces the Cloud Privacy Gate shut. */
  patientContext?: unknown;
  /** Abort an in-flight synthesis (barge-in). */
  signal?: AbortSignal;
  /** Per-provider timeout in ms. */
  timeoutMs?: number;
  onStart?: (provider: TtsProviderId) => void;
  onEnd?: (provider: TtsProviderId | "text-only") => void;
  onError?: (error: string) => void;
  /** Observability hook — records which provider actually spoke. */
  onProvider?: (provider: TtsProviderId | "text-only") => void;
}

let activeAudio: HTMLAudioElement | null = null;
let activeUrl: string | null = null;

/** Providers used by the most recent turn — feeds the status HUD. */
export const lastVoiceProviders: { tts?: TtsProviderId | "text-only" } = {};

export function stopSaarathiSpeech(): void {
  if (activeAudio) {
    const audio = activeAudio;
    activeAudio = null;
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.src = "";
      audio.load();
    } catch { /* already stopped */ }
  }
  if (activeUrl) {
    try { URL.revokeObjectURL(activeUrl); } catch { /* ignore */ }
    activeUrl = null;
  }
}

export async function playSaarathiClip(blob: Blob, signal?: AbortSignal): Promise<{ ok: boolean; error?: string; blockedPlayback?: boolean }> {
  stopSaarathiSpeech();
  try {
    activeUrl = URL.createObjectURL(blob);
    const audio = new Audio(activeUrl);
    activeAudio = audio;
    if (signal?.aborted) {
      audio.src = "";
      return { ok: false, error: "stopped" };
    }
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let started = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener("abort", onAbort);
        resolve();
      };
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener("abort", onAbort);
        reject(error instanceof Error ? error : new Error("audio element failed to play the clip"));
      };
      const onAbort = () => {
        try {
          audio.pause();
          audio.currentTime = 0;
          audio.src = "";
        } catch { /* noop */ }
        finish();
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      audio.onplaying = () => { started = true; };
      audio.onended = finish;
      audio.onpause = () => {
        if (!audio.ended && (started || signal?.aborted)) finish();
      };
      audio.onerror = () => fail(new Error("audio element failed to play the clip"));
      audio.play().then(() => { started = true; }).catch((error) => fail(error));
    });
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const blocked = /not allowed|user gesture|autoplay/i.test(message);
    return { ok: false, error: message, blockedPlayback: blocked };
  } finally {
    stopSaarathiSpeech();
  }
}

function attemptRecord(provider: TtsProviderId, started: number, error?: string, retryable = false, blockedPlayback?: boolean): TtsAttempt {
  return {
    provider,
    ok: !error,
    spoken: !error,
    latencyMs: Date.now() - started,
    error,
    retryable,
    blockedPlayback,
  };
}

const unavailableUntil = new Map<HumanMouth, number>();
const cloudConfigCache = new Map<string, { at: number; configured: boolean }>();

async function cloudConfigured(healthUrl: string): Promise<boolean> {
  const cached = cloudConfigCache.get(healthUrl);
  if (cached && Date.now() - cached.at < 60_000) return cached.configured;
  let configured = false;
  try {
    const res = await fetch(healthUrl, { signal: AbortSignal.timeout(1200) });
    if (res.ok) {
      const body = (await res.json().catch(() => null)) as { configured?: boolean } | null;
      configured = body?.configured !== false;
    }
  } catch {
    configured = false;
  }
  cloudConfigCache.set(healthUrl, { at: Date.now(), configured });
  return configured;
}

function mouthCoolingDown(mouth: HumanMouth): boolean {
  return (unavailableUntil.get(mouth) ?? 0) > Date.now();
}

function coolDown(mouth: HumanMouth): void {
  unavailableUntil.set(mouth, Date.now() + 10 * 60 * 1000);
}

/**
 * Speak one Saarathi turn.
 * ALWAYS resolves: it never throws, and `ok === false` means the caller must keep
 * the text answer visible (the text is never suppressed by a voice failure).
 */
export async function speakSaarathi(options: SpeakSaarathiOptions): Promise<TtsResult> {
  const text = options.text.trim();
  const attempts: TtsAttempt[] = [];

  if (!text) {
    return { ok: false, provider: "text-only", attempts, error: "Nothing to speak", textOnly: true };
  }

  const finish = (
    ok: boolean,
    provider: TtsProviderId | "text-only",
    error?: string
  ): TtsResult => {
    lastVoiceProviders.tts = provider;
    options.onProvider?.(provider);
    if (ok) options.onEnd?.(provider);
    return { ok, provider, attempts, error, textOnly: !ok };
  };

  if (options.signal?.aborted) {
    return finish(false, "text-only", "interrupted");
  }

  const spoken = clipForVoice(text);
  const planned = options.mouths
    ? {
        language: options.language?.trim() || "en-IN",
        mouths: options.mouths,
      }
    : await planVoiceMouth(text, options.language, { patientContext: options.patientContext });
  const language = options.language?.trim() || planned.language;
  const settings = currentVoiceSettings();
  let mouths = [...planned.mouths];
  if (mouths.includes("gemini-live") && !(await cloudConfigured("/api/voice/gemini-tts/health"))) {
    mouths = mouths.filter((mouth) => mouth !== "gemini-live");
  }
  if (mouths.includes("sarvam") && !(await cloudConfigured("/api/voice/sarvam/health"))) {
    mouths = mouths.filter((mouth) => mouth !== "sarvam");
  }
  if (mouths.includes("openai-live") && !(await cloudConfigured("/api/voice/openai-live/health"))) {
    mouths = mouths.filter((mouth) => mouth !== "openai-live");
  }
  if (settings.preferVoicebox && !mouths.includes("voicebox-local")) mouths.push("voicebox-local");
  if (mouths.length === 0) mouths = ["voicebox-local"];

  if (!options.mouths) {
    for (const mouth of mouths) {
      const cached = peekVoiceClip(mouth, spoken, language);
      if (!cached) continue;
      options.onStart?.(mouth);
      const played = await playSaarathiClip(cached.blob, options.signal);
      if (played.ok) {
        attempts.push(attemptRecord(mouth, Date.now()));
        return finish(true, mouth);
      }
      break;
    }
  }

  for (const mouth of mouths) {
    if (options.signal?.aborted) break;
    if (mouthCoolingDown(mouth)) {
      attempts.push(attemptRecord(mouth, Date.now(), "skipped — this voice recently reported it is not configured", false));
      continue;
    }
    const t0 = Date.now();

    if (mouth === "sarvam") {
      const clip = await sarvamSpeak(spoken, language, { signal: options.signal, timeoutMs: options.timeoutMs ?? 8000 });
      if (clip.notConfigured) coolDown("sarvam");
      if (!clip.ok || !clip.blob) {
        attempts.push(attemptRecord("sarvam", t0, clip.error, clip.retryable));
        if (clip.blockedByPrivacyGate) continue;
        continue;
      }
      options.onStart?.("sarvam");
      const played = await playSaarathiClip(clip.blob, options.signal);
      if (played.ok) {
        rememberVoiceClip("sarvam", spoken, language, clip.blob);
        attempts.push(attemptRecord("sarvam", t0));
        return finish(true, "sarvam");
      }
      attempts.push(attemptRecord("sarvam", t0, played.error, false, played.blockedPlayback));
      continue;
    }

    if (mouth === "gemini-live") {
      if (!settings.allowGeminiLiveVoice) {
        attempts.push(attemptRecord("gemini-live", t0, "disabled in Settings → Voice", false));
        continue;
      }
      const clip = await geminiLiveSpeak(spoken, { signal: options.signal, timeoutMs: options.timeoutMs ?? 8000 });
      if (!clip.ok || !clip.blob) {
        if (/not configured|GEMINI_API_KEY/i.test(clip.error ?? "")) coolDown("gemini-live");
        attempts.push(attemptRecord("gemini-live", t0, clip.error, clip.retryable));
        if (clip.blockedByPrivacyGate) continue;
        continue;
      }
      options.onStart?.("gemini-live");
      const played = await playSaarathiClip(clip.blob, options.signal);
      if (played.ok) {
        rememberVoiceClip("gemini-live", spoken, language, clip.blob);
        attempts.push(attemptRecord("gemini-live", t0));
        return finish(true, "gemini-live");
      }
      attempts.push(attemptRecord("gemini-live", t0, played.error, false, played.blockedPlayback));
      continue;
    }

    if (mouth === "openai-live") {
      const clip = await openaiLiveSpeak(spoken, language, { signal: options.signal, timeoutMs: options.timeoutMs ?? 12000 });
      if (clip.notConfigured) coolDown("openai-live");
      if (!clip.ok || !clip.blob) {
        attempts.push(attemptRecord("openai-live", t0, clip.error, clip.retryable));
        continue;
      }
      options.onStart?.("openai-live");
      const played = await playSaarathiClip(clip.blob, options.signal);
      if (played.ok) {
        rememberVoiceClip("openai-live", spoken, language, clip.blob);
        attempts.push(attemptRecord("openai-live", t0));
        return finish(true, "openai-live");
      }
      attempts.push(attemptRecord("openai-live", t0, played.error, false, played.blockedPlayback));
      continue;
    }

    if (!settings.preferVoicebox && !options.mouths) {
      attempts.push(attemptRecord("voicebox-local", t0, "disabled in Settings → Voice", false));
      continue;
    }
    const started = Date.now();
    const clip = await voiceboxSpeak(spoken, language, {
      profile: options.profile,
      signal: options.signal,
      timeoutMs: options.timeoutMs ?? 30000,
    });
    if (!clip.ok || !clip.blob) {
      attempts.push(attemptRecord("voicebox-local", started, clip.error ?? "Voicebox produced no audio", clip.retryable));
      setVoiceboxStatus("ERROR", clip.error ?? "synthesis failed");
      continue;
    }
    setVoiceboxStatus("ACTIVE", `speaking ${language} through the local runtime`);
    options.onStart?.("voicebox-local");
    const played = await playSaarathiClip(clip.blob, options.signal);
    setVoiceboxStatus("READY", "local runtime healthy");
    if (played.ok) {
      rememberVoiceClip("voicebox-local", spoken, language, clip.blob);
      attempts.push(attemptRecord("voicebox-local", started));
      return finish(true, "voicebox-local");
    }
    attempts.push(attemptRecord("voicebox-local", started, played.error, false, played.blockedPlayback));
  }

  options.onError?.(FINAL_VOICE_UNAVAILABLE_MESSAGE);
  return finish(false, "text-only", FINAL_VOICE_UNAVAILABLE_MESSAGE);
}