/**
 * ASTRA SAARATHI — Voice provider contracts.
 * ==========================================
 * ONE truthful vocabulary for every voice provider in the hospital OS.
 *
 * MANDATORY FAILOVER ORDER
 * ------------------------
 *   SPEAKING (TTS):  sarvam → gemini-live → voicebox-local → text-only
 *   Short English / Hindi / Telugu lines stay on voicebox-local (Laya language
 *   routing) so the cloud voices are not called for routine speech.
 *   LISTENING (STT): voicebox-whisper → browser-fallback
 *
 * RULES ENCODED HERE
 * ------------------
 * 1. Browser and robotic operating-system voices are not a mouth. When Sarvam,
 *    Gemini, and Voicebox cannot speak, Saarathi stays text-only.
 * 2. A provider status is never faked. "ACTIVE" requires a real synthesis or a
 *    real capture in progress; mounting a component is not evidence of anything.
 * 3. Voicebox audio is never reported as Sarvam or Gemini.
 * 4. Voice failure must never make Astra unusable — text and every deterministic
 *    hospital workflow stay available.
 */

/** Speak side. There is no browser mouth. */
export type TtsProviderId = "sarvam" | "gemini-live" | "openai-live" | "voicebox-local";

/** Listen side. Browser STT is explicitly a fallback and is labelled as such. */
export type SttProviderId = "voicebox-whisper" | "browser-fallback";

/** The reasoning side, in preference order (server-side chain owns the real fan-out). */
export type BrainProviderId = "saarathi-local" | "freellmapi" | "omniroute" | "ollama" | "gemini";

/**
 * Honest provider state. There is deliberately no generic "ON" — every value
 * must be earned: READY = reachable, ACTIVE = currently producing output.
 */
export type ProviderState =
  | "OFF"
  | "CHECKING"
  | "READY"
  | "ACTIVE"
  | "DEGRADED"
  | "DISABLED"
  | "NOT_CONFIGURED"
  | "ERROR";

export interface ProviderStatus {
  id: string;
  label: string;
  /** "PRIMARY" | "SECONDARY" | "LAST-RESORT" — the place in the failover order. */
  role: string;
  state: ProviderState;
  detail?: string;
  latencyMs?: number;
  checkedAt: number;
}

export interface VoiceProviderSnapshot {
  checkedAt: number;
  tts: {
    order: TtsProviderId[];
    sarvam: ProviderStatus;
    geminiLive: ProviderStatus;
    voicebox: ProviderStatus;
  };
  stt: {
    order: SttProviderId[];
    voicebox: ProviderStatus;
    browser: ProviderStatus;
  };
  /** Providers actually used for the most recent turn (set by the routers). */
  lastAnswerProvider?: BrainProviderId | string;
  lastTtsProvider?: TtsProviderId | "text-only";
  lastSttProvider?: SttProviderId;
}

/** One attempt at speaking. `spoken` is true ONLY when audio really played. */
export interface TtsAttempt {
  provider: TtsProviderId;
  ok: boolean;
  spoken: boolean;
  latencyMs: number;
  error?: string;
  retryable: boolean;
  /** true when the browser refused playback (autoplay / no user gesture). */
  blockedPlayback?: boolean;
}

export interface TtsResult {
  /** true when the caller heard something. */
  ok: boolean;
  /** Which provider produced the audio, or `text-only` when nothing could. */
  provider: TtsProviderId | "text-only";
  attempts: TtsAttempt[];
  error?: string;
  /** ALWAYS true when `ok === false`: the text answer stays on screen. */
  textOnly: boolean;
}

export interface SttAttempt {
  provider: SttProviderId;
  ok: boolean;
  latencyMs: number;
  error?: string;
}

export interface SttResult {
  ok: boolean;
  provider: SttProviderId;
  text: string;
  /** Language hint reported by the recogniser, when it reports one at all. */
  languageHint?: string;
  /** 0..1 when the recogniser reports one. Missing is not treated as low confidence. */
  confidence?: number;
  error?: string;
  latencyMs: number;
  attempts: SttAttempt[];
}

/** Standard structured failure — never a silent downgrade. */
export interface VoiceProviderFailure {
  ok: false;
  provider: TtsProviderId | SttProviderId;
  reason: string;
  retryable: boolean;
}

export const PROVIDER_LABEL: Record<TtsProviderId | SttProviderId, string> = {
  sarvam: "Sarvam Bulbul (cloud)",
  "gemini-live": "Gemini (cloud)",
  "openai-live": "OpenAI speech (cloud)",
  "voicebox-local": "Voicebox (local, English / Hindi / Telugu)",
  "voicebox-whisper": "Voicebox Whisper (local)",
  "browser-fallback": "Browser speech recognition (fallback)",
};

/** Human-readable state text — used by the status HUD. No invented states. */
export function stateLabel(state: ProviderState): string {
  switch (state) {
    case "OFF": return "OFF";
    case "CHECKING": return "CHECKING";
    case "READY": return "READY";
    case "ACTIVE": return "ACTIVE";
    case "DEGRADED": return "DEGRADED";
    case "DISABLED": return "DISABLED";
    case "NOT_CONFIGURED": return "NOT CONFIGURED";
    case "ERROR": return "ERROR";
    default: return "UNKNOWN";
  }
}
