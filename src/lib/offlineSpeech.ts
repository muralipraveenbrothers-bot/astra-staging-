// ASTRA local voice gateway. Voicebox for English, Hindi, and Telugu.
// When Voicebox is down, Sarvam then Gemini speak. Browser voices are not used.
import { checkVoicebox, voiceboxSpeak, VOICE_PROFILES } from "./voicebox";
import { speakSaarathi } from "@/astra/voice/providers/ttsPriority";

export type VoiceTier = "voicebox" | "gemini" | "browser" | "unavailable";
export interface OfflineSpeakOptions {
  preferVoicebox?: boolean;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err: unknown) => void;
}
export interface OfflineSpeakResult { tier: VoiceTier; ok: boolean }

const STORAGE_KEY = "astra_voicebox_local_enabled_v2";
export function isOfflineVoiceEnabled(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) !== "false"; } catch { return true; }
}
export function setOfflineVoiceEnabled(value: boolean): void {
  try { localStorage.setItem(STORAGE_KEY, String(value)); } catch { /* storage unavailable */ }
}
export async function isLocalVoiceboxOnline(): Promise<boolean> {
  return (await checkVoicebox()).ok;
}
export async function detectVoiceTier(): Promise<VoiceTier> {
  if (await isLocalVoiceboxOnline()) return "voicebox";
  return "gemini";
}

let activeAudio: HTMLAudioElement | null = null;
let activeUrl: string | null = null;
export async function stopOffline(): Promise<void> {
  if (activeAudio) { activeAudio.pause(); activeAudio.currentTime = 0; }
  if (activeUrl) URL.revokeObjectURL(activeUrl);
  activeAudio = null;
  activeUrl = null;
}

function languageTag(langCode: string): string {
  const value = langCode.toLowerCase();
  if (value.startsWith("te")) return "te-IN";
  if (value.startsWith("hi")) return "hi-IN";
  return "en-IN";
}

async function cloudFallback(text: string, langCode: string, opts: OfflineSpeakOptions): Promise<OfflineSpeakResult> {
  opts.onStart?.();
  const result = await speakSaarathi({
    text,
    language: languageTag(langCode),
    mouths: ["sarvam", "gemini-live"],
  });
  opts.onEnd?.();
  if (!result.ok) {
    opts.onError?.(new Error(result.error ?? "Human voice unavailable"));
    return { tier: "unavailable", ok: false };
  }
  return { tier: result.provider === "gemini-live" ? "gemini" : "gemini", ok: true };
}

export async function speakOffline(text: string, langCode = "en", opts: OfflineSpeakOptions = {}): Promise<OfflineSpeakResult> {
  if (!isOfflineVoiceEnabled()) return { tier: "unavailable", ok: false };
  if (!(await isLocalVoiceboxOnline())) {
    return cloudFallback(text, langCode, opts);
  }
  try {
    await stopOffline();
    const primary = langCode.toLowerCase().slice(0, 2) as keyof typeof VOICE_PROFILES;
    const profile = VOICE_PROFILES[primary] || VOICE_PROFILES.en;
    const blob = await voiceboxSpeak(text, profile.voice);
    activeUrl = URL.createObjectURL(blob);
    activeAudio = new Audio(activeUrl);
    opts.onStart?.();
    await new Promise<void>((resolve, reject) => {
      if (!activeAudio) return reject(new Error("Voicebox audio unavailable"));
      activeAudio.onended = () => resolve();
      activeAudio.onerror = () => reject(new Error("Voicebox audio playback failed"));
      activeAudio.play().catch(reject);
    });
    await stopOffline();
    opts.onEnd?.();
    return { tier: "voicebox", ok: true };
  } catch (error) {
    await stopOffline();
    return cloudFallback(text, langCode, opts);
  }
}

interface AstraVoiceGlobal {
  speak: typeof speakOffline;
  stop: typeof stopOffline;
  detectTier: typeof detectVoiceTier;
  online: typeof isLocalVoiceboxOnline;
  enabled: typeof isOfflineVoiceEnabled;
}
export function registerOfflineVoicebox(): void {
  if (typeof window === "undefined") return;
  (window as unknown as { astraVoice?: AstraVoiceGlobal }).astraVoice = {
    speak: speakOffline, stop: stopOffline, detectTier: detectVoiceTier,
    online: isLocalVoiceboxOnline, enabled: isOfflineVoiceEnabled,
  };
}
if (typeof window !== "undefined") registerOfflineVoicebox();
