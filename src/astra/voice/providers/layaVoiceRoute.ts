/**
 * ASTRA — which mouth speaks this turn.
 *
 * Human order when a cloud voice is worth the call:
 *   1. Sarvam Bulbul (Indian English, Hindi, Telugu)
 *   2. Gemini native audio
 *   3. Local Voicebox
 *
 * Laya is already wired for language routing. Short operational lines in
 * English, Hindi, or Telugu stay on Voicebox so Sarvam and Gemini are not
 * called. Longer answers use the human cloud voices. Identifiable clinical
 * text never leaves the machine.
 */

import { detectLanguage } from "@/features/mayin/voice/languageRouter";
import { looksLikePhi } from "./phiGate";
import { currentVoiceSettings } from "./voiceSettings";

export type HumanMouth = "sarvam" | "gemini-live" | "openai-live" | "voicebox-local";

export type VoiceboxLanguage = "en-IN" | "hi-IN" | "te-IN";

export interface VoiceMouthPlan {
  language: VoiceboxLanguage;
  mouths: HumanMouth[];
  reason: "phi-local" | "voicebox-save-api" | "cloud-human" | "voicebox-disabled";
}

/** Operational lines at or under this length are spoken locally. */
export const LOCAL_VOICE_CHAR_BUDGET = 180;

export function voiceboxLanguageTag(text: string, hint?: string): VoiceboxLanguage {
  const detected = detectLanguage(text);
  if (detected.primaryLanguage === "te" || detected.primaryLanguage === "te-en") return "te-IN";
  if (detected.primaryLanguage === "hi" || detected.primaryLanguage === "hi-en") return "hi-IN";
  const h = (hint ?? "").toLowerCase();
  if (detected.primaryLanguage === "unknown" || detected.primaryLanguage === "en") {
    if (h.startsWith("te")) return "te-IN";
    if (h.startsWith("hi")) return "hi-IN";
  }
  return "en-IN";
}

/** A short single-breath line Voicebox can say without spending a cloud call. */
export function isRoutineLocalUtterance(text: string): boolean {
  const body = text.trim();
  if (!body || body.length > LOCAL_VOICE_CHAR_BUDGET) return false;
  if (/[\r\n]/.test(body)) return false;
  return true;
}

function cloudMouths(includeVoicebox: boolean): HumanMouth[] {
  const settings = currentVoiceSettings();
  const mouths: HumanMouth[] = ["sarvam", "gemini-live", "openai-live"];
  if (includeVoicebox && settings.preferVoicebox) mouths.push("voicebox-local");
  if (!settings.allowGeminiLiveVoice) {
    const without = mouths.filter((mouth) => mouth !== "gemini-live");
    return without;
  }
  return mouths;
}

/**
 * Decide the mouth order for one turn.
 * Laya is asked only when the script detector is unsure — a confident
 * English, Hindi, or Telugu line does not spend a Laya call either.
 */
export async function planVoiceMouth(
  text: string,
  hint?: string,
  opts: { patientContext?: unknown } = {},
): Promise<VoiceMouthPlan> {
  const settings = currentVoiceSettings();
  const language = voiceboxLanguageTag(text, hint);
  const phi = looksLikePhi(text, opts.patientContext);

  if (phi && settings.blockPhiToCloudVoice) {
    return {
      language,
      mouths: settings.preferVoicebox ? ["voicebox-local"] : [],
      reason: "phi-local",
    };
  }

  if (!settings.preferVoicebox) {
    return { language, mouths: cloudMouths(false), reason: "voicebox-disabled" };
  }

  return { language, mouths: cloudMouths(true), reason: "cloud-human" };
}
