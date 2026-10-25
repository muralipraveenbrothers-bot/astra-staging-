/**
 * ASTRA SAARATHI — voice settings (persisted).
 * ===========================================
 * `allowBrowserVoiceFallback` is FALSE by default. That single default is what
 * stops Saarathi from silently speaking in a robotic OS voice when Voicebox and
 * Gemini Live are both unavailable (repair prompt §A / §B).
 *
 * The doctor enables it deliberately:
 *   Settings → Voice → Emergency Browser Voice Fallback
 */

import { useCallback, useEffect, useState } from "react";

export const VOICE_SETTINGS_KEY = "astra.voice.settings.v1";

export interface VoiceSettings {
  /** Master switch for local Voicebox being tried first. */
  preferVoicebox: boolean;
  /** Allow Gemini Live as the secondary speaker. */
  allowGeminiLiveVoice: boolean;
  /**
   * LAST RESORT ONLY. When false, Saarathi stays text-only instead of using the
   * operating-system / browser voice.
   */
  allowBrowserVoiceFallback: boolean;
  /**
   * Cloud Privacy Gate: identifiable clinical data (PHI) must never be sent to a
   * cloud voice provider silently. Applied by the TTS/STT routers before any
   * `gemini-live` attempt.
   */
  blockPhiToCloudVoice: boolean;
  /** Local Voicebox base URL (health probes only — synthesis goes same-origin). */
  voiceboxBaseUrl: string;
  /** Retry a failed provider once before moving down the chain. */
  retryOnceBeforeFailover: boolean;
}

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  preferVoicebox: true,
  allowGeminiLiveVoice: true,
  // ABSOLUTE LAST RESORT — opt-in only.
  allowBrowserVoiceFallback: false,
  blockPhiToCloudVoice: true,
  voiceboxBaseUrl: "http://127.0.0.1:17493",
  retryOnceBeforeFailover: true,
};

export function loadVoiceSettings(): VoiceSettings {
  if (typeof localStorage === "undefined") return { ...DEFAULT_VOICE_SETTINGS };
  try {
    const raw = localStorage.getItem(VOICE_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_VOICE_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<VoiceSettings>;
    // Booleans are validated individually so a stale/garbage key can never turn
    // the browser voice on by accident.
    return {
      preferVoicebox: parsed.preferVoicebox !== false,
      allowGeminiLiveVoice: parsed.allowGeminiLiveVoice !== false,
      allowBrowserVoiceFallback: parsed.allowBrowserVoiceFallback === true,
      blockPhiToCloudVoice: parsed.blockPhiToCloudVoice !== false,
      voiceboxBaseUrl: typeof parsed.voiceboxBaseUrl === "string" && parsed.voiceboxBaseUrl.trim()
        ? parsed.voiceboxBaseUrl.trim()
        : DEFAULT_VOICE_SETTINGS.voiceboxBaseUrl,
      retryOnceBeforeFailover: parsed.retryOnceBeforeFailover !== false,
    };
  } catch {
    return { ...DEFAULT_VOICE_SETTINGS };
  }
}

export function saveVoiceSettings(next: Partial<VoiceSettings>): VoiceSettings {
  const merged = { ...loadVoiceSettings(), ...next };
  try {
    localStorage.setItem(VOICE_SETTINGS_KEY, JSON.stringify(merged));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("astra:voice-settings", { detail: merged }));
    }
  } catch {
    /* private mode — settings stay in-memory for this session */
  }
  return merged;
}

/** Non-React read for routers (always current). */
export function currentVoiceSettings(): VoiceSettings {
  return loadVoiceSettings();
}

/** React binding used by Settings and the status HUD. */
export function useVoiceSettings(): [VoiceSettings, (next: Partial<VoiceSettings>) => void] {
  const [settings, setSettings] = useState<VoiceSettings>(() => loadVoiceSettings());

  useEffect(() => {
    const onChange = () => setSettings(loadVoiceSettings());
    window.addEventListener("astra:voice-settings", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("astra:voice-settings", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const update = useCallback((next: Partial<VoiceSettings>) => {
    setSettings(saveVoiceSettings(next));
  }, []);

  return [settings, update];
}