/**
 * ASTRA SAARATHI — Browser / OS voice: ABSOLUTE LAST RESORT.
 * ========================================================
 * This module is deliberately hard to reach:
 *   - the TTS router only calls it when `allowBrowserVoiceFallback === true`
 *     (Settings → Voice → Emergency Browser Voice Fallback, default OFF);
 *   - the STT router only calls it when local Whisper is unreachable, and
 *     labels the transcript as FALLBACK everywhere it is reported.
 *
 * It exists so that a total voice-stack failure never leaves a clinician unable
 * to talk to Astra — but it must never be presented as Voicebox, and it must
 * never be entered into silently.
 */

import { findBestBrowserVoice, speakWithBrowser } from "@/astra/voice/roundTrip/ttsFallback";
import type { AstraLanguage } from "@/astra/voice/roundTrip/contracts";

export function browserTtsAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function browserSttAvailable(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export interface BrowserSpeakResult {
  ok: boolean;
  /** true only when the utterance actually completed. */
  spoken: boolean;
  error?: string;
  blockedPlayback?: boolean;
}

/** Speak with the operating-system voice. Never relabelled as Voicebox. */
export async function browserSpeak(text: string, language: AstraLanguage): Promise<BrowserSpeakResult> {
  if (!browserTtsAvailable()) {
    return { ok: false, spoken: false, error: "This browser exposes no speech synthesis engine" };
  }
  try {
    const result = await speakWithBrowser(text, language);
    if (result.ok) return { ok: true, spoken: true };
    return {
      ok: false,
      spoken: false,
      error: result.error ?? "Browser speech failed",
      blockedPlayback: result.blockedPlayback,
    };
  } catch (e) {
    return { ok: false, spoken: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Language tag for the fallback recogniser.
 * NEVER hard-coded to en-US (repair prompt §D): a Telugu or Hindi speaker must
 * not be silently forced into English recognition.
 */
export function fallbackLanguageTag(preferred?: string): string {
  const wanted = (preferred ?? "").trim();
  if (wanted.includes("-")) return wanted;
  if (wanted.startsWith("te")) return "te-IN";
  if (wanted.startsWith("hi")) return "hi-IN";
  if (wanted.startsWith("ta")) return "ta-IN";
  if (wanted.startsWith("kn")) return "kn-IN";
  if (wanted.startsWith("ml")) return "ml-IN";
  if (wanted.startsWith("bn")) return "bn-IN";
  if (wanted.startsWith("mr")) return "mr-IN";
  if (wanted.startsWith("en")) return "en-IN";
  // Unknown / "auto": mirror the operator's own UI language rather than assuming.
  const uiLanguage = typeof navigator !== "undefined" ? navigator.language : "";
  return uiLanguage && uiLanguage.includes("-") ? uiLanguage : "en-IN";
}

export interface BrowserListenResult {
  ok: boolean;
  text: string;
  languageHint?: string;
  error?: string;
}

/**
 * One-shot browser recognition. Used ONLY as the fallback ear, and the caller
 * must report the provider as `browser-fallback`.
 */
export function browserListenOnce(opts: {
  preferredLanguage?: string;
  timeoutMs?: number;
} = {}): { promise: Promise<BrowserListenResult>; stop: () => void } {
  let recognition: { stop: () => void; abort: () => void } | null = null;
  let settled = false;
  const langTag = fallbackLanguageTag(opts.preferredLanguage);
  const timeoutMs = opts.timeoutMs ?? 12_000;

  const promise = new Promise<BrowserListenResult>((resolve) => {
    const finish = (result: BrowserListenResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    if (typeof window === "undefined") {
      finish({ ok: false, text: "", error: "No browser environment" });
      return;
    }
    const w = window as unknown as {
      SpeechRecognition?: new () => any;
      webkitSpeechRecognition?: new () => any;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      finish({ ok: false, text: "", error: "Browser speech recognition is not supported" });
      return;
    }

    try {
      const rec = new Ctor();
      recognition = rec;
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = langTag;
      rec.onresult = (event: any) => {
        const transcript = String(event?.results?.[0]?.[0]?.transcript ?? "").trim();
        finish({ ok: transcript.length > 0, text: transcript, languageHint: langTag, error: transcript ? undefined : "No speech detected" });
      };
      rec.onerror = (event: any) => finish({ ok: false, text: "", error: String(event?.error ?? "speech recognition failed") });
      rec.onend = () => finish({ ok: false, text: "", error: "Speech recognition ended without a transcript" });
      rec.start();
    } catch (e) {
      finish({ ok: false, text: "", error: e instanceof Error ? e.message : String(e) });
    }

    setTimeout(() => {
      if (!settled) {
        try { recognition?.stop(); } catch { /* already stopped */ }
        finish({ ok: false, text: "", error: "Timed out waiting for speech" });
      }
    }, timeoutMs);
  });

  return {
    promise,
    stop: () => {
      try { recognition?.abort(); } catch { /* already stopped */ }
    },
  };
}

/** Exposed for the Settings → Voice preview list. */
export function listBrowserVoices(): Array<{ name: string; lang: string; isDefault: boolean }> {
  if (!browserTtsAvailable()) return [];
  return (window.speechSynthesis.getVoices() ?? []).map((v) => ({
    name: v.name,
    lang: v.lang,
    isDefault: v.default,
  }));
}

export { findBestBrowserVoice };
