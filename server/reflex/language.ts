export type ReflexLanguage = "en" | "te" | "hi" | "mixed";
export type ReflexScript = "latin" | "telugu" | "devanagari" | "mixed";

const romanTe = /\b(naku|jwaram|noppi|undi|undhi|cheppandi|kavali|ledu|meeru|nenu)\b/i;
const romanHi = /\b(mujhe|bukhar|dard|hai|hain|batao|chahiye|nahi|aap|kya)\b/i;

function countRange(text: string, lo: number, hi: number): number {
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= lo && code <= hi) count += 1;
  }
  return count;
}

export function detectLanguage(text: string): { lang: ReflexLanguage; script: ReflexScript; romanized: boolean } {
  const clean = (text ?? "").trim();
  const te = countRange(clean, 0x0c00, 0x0c7f);
  const hi = countRange(clean, 0x0900, 0x097f);
  if (te > 0 && hi > 0) return { lang: "mixed", script: "mixed", romanized: false };
  if (te > 0) return { lang: "te", script: "telugu", romanized: false };
  if (hi > 0) return { lang: "hi", script: "devanagari", romanized: false };
  const hasTe = romanTe.test(clean);
  const hasHi = romanHi.test(clean);
  if (hasTe && hasHi) return { lang: "mixed", script: "latin", romanized: true };
  if (hasTe) return { lang: "te", script: "latin", romanized: true };
  if (hasHi) return { lang: "hi", script: "latin", romanized: true };
  return { lang: "en", script: "latin", romanized: false };
}

export function pickCheckpoint(textOrDetection: string | ReturnType<typeof detectLanguage>): "english" | "multilingual" {
  const detection = typeof textOrDetection === "string" ? detectLanguage(textOrDetection) : textOrDetection;
  return detection.lang === "en" && detection.script === "latin" && !detection.romanized ? "english" : "multilingual";
}
