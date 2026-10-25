// ASTRA AI — round-trip language detection.
//
// REUSES the existing client detector (`detectLanguageFromText` in
// src/utils/audioAlerts.ts / the script ranges it already implements) and adds
// the Tenglish/Hinglish distinction the voice contract needs. No second
// detection engine is introduced.

import { detectLanguageFromText } from "@/utils/audioAlerts";
import { toAstraLanguage, type AstraLanguage } from "./contracts";

const TELUGU_RANGE = /[\u0C00-\u0C7F]/;
const DEVANAGARI_RANGE = /[\u0900-\u097F]/;
const LATIN_RANGE = /[a-z]/i;

/** Romanised Telugu markers (Tenglish) — deliberately conservative. */
const TENGLISH_MARKERS = [
  "cheppu", "chupinchu", "chudu", "chudandi", "cheyyi", "cheyandi", "unnaru", "unnaru",
  "kavali", "ledu", "ledhu", "enti", "emiti", "emaindi", "ekkada", "akkada", "ikkada",
  "chala", "chaala", "bagundi", "bagunna", "vachindi", "vachina", "pettu", "pettandi",
  "telugu", "ela", "enduku", "ippudu", "repu", "ninna", "manchi", "saripoyindi",
];

/** Romanised Hindi markers (Hinglish) — deliberately conservative. */
const HINGLISH_MARKERS = [
  "kya", "hai", "hain", "kaise", "kaisa", "kitna", "kitne", "batao", "bataiye", "dikhao",
  "dikhaiye", "karo", "kariye", "nahi", "nahin", "accha", "theek", "thik", "jaldi",
  "abhi", "kal", "aaj", "mera", "meri", "aap", "aapka", "bhut", "bahut", "chahiye",
];

function countMarkers(text: string, markers: string[]): number {
  const words = text.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  const set = new Set(markers);
  let hits = 0;
  for (const word of words) if (set.has(word)) hits += 1;
  return hits;
}

/**
 * Detect the language of a user turn, including the romanised mix that staff
 * actually type/speak (Tenglish / Hinglish).
 */
export function detectAstraLanguage(text: string): AstraLanguage {
  const value = text ?? "";
  if (!value.trim()) return "en";

  // Native scripts win outright.
  if (TELUGU_RANGE.test(value)) return "te";
  if (DEVANAGARI_RANGE.test(value)) return "hi";

  // Romanised input: distinguish an Indian-language mix from plain English.
  if (LATIN_RANGE.test(value)) {
    const tenglish = countMarkers(value, TENGLISH_MARKERS);
    const hinglish = countMarkers(value, HINGLISH_MARKERS);
    if (tenglish > 0 && tenglish >= hinglish) return "tenglish";
    if (hinglish > 0) return "hinglish";
  }

  // Fall back to the existing shared detector for anything else.
  try {
    return toAstraLanguage(detectLanguageFromText(value) as string | undefined);
  } catch {
    return "en";
  }
}

/** True when the language is expressed in a romanised mix rather than the script. */
export function isRomanised(language: AstraLanguage): boolean {
  return language === "tenglish" || language === "hinglish";
}
