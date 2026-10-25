/**
 * ASTRA AI — Server-Side Language Detection (§5 / §14)
 * ===================================================
 * Script + token-based language detection for the languages Astra voice
 * routes support. Pure TypeScript, no native deps — reuses the same
 * Unicode-script approach as the existing src/astra/voice/voiceEngine.ts
 * detectLanguage so server and client agree on detection.
 *
 * Mixed English / Hindi / Telugu is routed by dominant native script first,
 * then by transliteration token counts. Latin-only text without Indic tokens
 * is English so Telugu is never falsely sent to Kokoro.
 */

function countChars(text: string, lo: number, hi: number): number {
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c >= lo && c <= hi) n += 1;
  }
  return n;
}

function tokenHits(text: string, re: RegExp): number {
  return (text.match(re) || []).length;
}

const TE_TOKENS = /\b(namaskaram|namaskaaram|ela\s+unnaru|ela|unnaru|unaru|cheppandi|cheppu|kavali|ledu|undi|undhi|meeru|nenu|avunu|dhanyavadalu|rogiki|mandulu|andi|garu|emi|enti|unnanu|baga|chudandi|ivvandi|cheyandi)\b/giu;
const HI_TOKENS = /\b(namaste|aap|kaise|kya|hai|hain|karo|batao|mujhe|chahiye|nahi|nahin|dhanyavaad|dhanyavad|mareez|mariz|dawai|dawa|kijiye|dijiye|theek|shukriya|kripya|bataiye|pehle)\b/giu;

export type DetectResult = { lang: string; source: "script" | "token" | "fallback" };

export function detectLanguage(text: string, fallback = "en-IN"): DetectResult {
  if (!text || typeof text !== "string") return { lang: fallback, source: "fallback" };
  const clean = text.trim();
  if (!clean) return { lang: fallback, source: "fallback" };

  const teChars = countChars(clean, 0x0c00, 0x0c7f);
  const taChars = countChars(clean, 0x0b80, 0x0bff);
  const mlChars = countChars(clean, 0x0d00, 0x0d7f);
  const knChars = countChars(clean, 0x0c80, 0x0cff);
  const hiChars = countChars(clean, 0x0900, 0x097f);
  const scriptScores: Array<{ lang: string; n: number }> = [
    { lang: "te-IN", n: teChars },
    { lang: "hi-IN", n: hiChars },
    { lang: "ta-IN", n: taChars },
    { lang: "kn-IN", n: knChars },
    { lang: "ml-IN", n: mlChars },
  ].sort((a, b) => b.n - a.n);
  if (scriptScores[0].n > 0) return { lang: scriptScores[0].lang, source: "script" };

  const te = tokenHits(clean, TE_TOKENS);
  const hi = tokenHits(clean, HI_TOKENS);
  if (te > 0 && te >= hi) return { lang: "te-IN", source: "token" };
  if (hi > 0) return { lang: "hi-IN", source: "token" };

  // Latin-only / mixed English without Indic tokens → English, not the caller fallback.
  // This is what keeps Telugu from being falsely sent to Kokoro when the
  // surrounding conversation language is te-IN but the sentence is English.
  return { lang: "en-IN", source: "fallback" };
}

/** Resolve the effective language: explicit > detect > default. */
export function resolveLanguage(explicit?: string, text?: string): string {
  if (explicit && explicit.trim()) return explicit;
  if (text && text.trim()) return detectLanguage(text).lang;
  return "en-IN";
}

/**
 * Per-sentence routing language for mixed utterances.
 * Native script / Indic tokens win; otherwise English. Explicit conversation
 * language is used only when the sentence itself has no signal.
 */
export function languageForSpeech(sentence: string, overall = "en-IN"): string {
  const r = detectLanguage(sentence, overall);
  if (r.source === "script" || r.source === "token") return r.lang;
  return "en-IN";
}
