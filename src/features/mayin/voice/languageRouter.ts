/**
 * ASTRA 7D — DR. MAYIN LANGUAGE ROUTER
 * ============================================================================
 * Script/token based detection for English, Telugu, Hindi and their natural
 * hospital code-mixes (Tenglish, Hinglish). Language changes mid-conversation
 * must NEVER restart the session or drop clinical context (spec §26).
 *
 * Confidence here is a script-evidence ratio — it is NOT a clinical
 * probability and must never be presented as one.
 */

import type { LanguageState, MayinLanguage } from "../core/MayinTypes";

const TELUGU = /[\u0C00-\u0C7F]/g;
const DEVANAGARI = /[\u0900-\u097F]/g;
const LATIN = /[A-Za-z]/g;

/** Common Telugu conversational tokens written in Latin script (Tenglish). */
const TENGISH_MARKERS =
  /\b(enti|antha|chesthe|chestundi|kaani|ledu|avasaram|randi|andi|undi|ayindi|ela|ekkada|ivvu|tinnara|bagundi|chupinchu|cheppu|nenu|meeru|wellu|kavali)\b/i;

/** Common Hindi conversational tokens written in Latin script (Hinglish). */
const HINGLISH_MARKERS =
  /\b(kya|hai|hain|karo|kar|batao|bata|nahi|nahin|acha|achha|theek|thik|kyun|kyon|ab|kal|aaj|kaise|kaisa|ho|hoon|mera|tera|aap|tum|bhai|matlab|chalo|ruko|sun)\b/i;

const MARKER_LATIN_WORD = /\b[a-z]{2,}\b/g;

export function detectLanguage(text: string): LanguageState {
  const te = (text.match(TELUGU) ?? []).length;
  const hi = (text.match(DEVANAGARI) ?? []).length;
  const latin = (text.match(LATIN) ?? []).length;
  const total = te + hi + latin;

  if (total === 0) {
    return { primaryLanguage: "unknown", secondaryLanguage: null, codeSwitching: false, confidence: 0 };
  }

  const tengish = TENGISH_MARKERS.test(text);
  const hinglish = HINGLISH_MARKERS.test(text);

  const shares = { te: te / total, hi: hi / total, en: latin / total };

  // Pure script dominance with a little Latin (medical terms stay in English).
  if (te > 0 && te >= hi) {
    const primary: MayinLanguage = latin / total > 0.25 ? "te-en" : "te";
    return {
      primaryLanguage: primary,
      secondaryLanguage: latin / total > 0.25 ? "en" : null,
      codeSwitching: primary === "te-en",
      confidence: round2(Math.max(shares.te, shares.en)),
    };
  }
  if (hi > 0 && hi >= te) {
    const primary: MayinLanguage = latin / total > 0.25 ? "hi-en" : "hi";
    return {
      primaryLanguage: primary,
      secondaryLanguage: latin / total > 0.25 ? "en" : null,
      codeSwitching: primary === "hi-en",
      confidence: round2(Math.max(shares.hi, shares.en)),
    };
  }

  // Latin only — decide plain English vs Tenglish/Hinglish via markers.
  if (tengish && !hinglish) {
    return { primaryLanguage: "te-en", secondaryLanguage: "en", codeSwitching: true, confidence: 0.6 };
  }
  if (hinglish && !tengish) {
    return { primaryLanguage: "hi-en", secondaryLanguage: "en", codeSwitching: true, confidence: 0.6 };
  }
  if (hinglish && tengish) {
    return { primaryLanguage: "hi-en", secondaryLanguage: "te-en", codeSwitching: true, confidence: 0.5 };
  }

  const words = text.match(MARKER_LATIN_WORD) ?? [];
  return {
    primaryLanguage: "en",
    secondaryLanguage: null,
    codeSwitching: false,
    confidence: words.length > 0 ? 0.7 : 0.4,
  };
}

/** Merge a new observation into the running language state without resetting context. */
export function mergeLanguageState(prev: LanguageState, next: LanguageState): LanguageState {
  if (next.primaryLanguage === "unknown") return prev;
  // A confident switch wins; an ambiguous one keeps the previous primary.
  if (next.confidence < 0.5 && prev.primaryLanguage !== "unknown" && prev.primaryLanguage !== next.primaryLanguage) {
    return {
      ...prev,
      secondaryLanguage: next.primaryLanguage,
      codeSwitching: true,
      confidence: Math.max(prev.confidence, next.confidence),
    };
  }
  return {
    primaryLanguage: next.primaryLanguage,
    secondaryLanguage: prev.primaryLanguage !== next.primaryLanguage ? prev.primaryLanguage : next.secondaryLanguage,
    codeSwitching: next.codeSwitching || prev.primaryLanguage !== next.primaryLanguage,
    confidence: next.confidence,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
