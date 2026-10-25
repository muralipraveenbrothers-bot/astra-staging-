// Spoken-response crafting — the display answer and the spoken answer are
// different by design: the display keeps full detail, the voice gets a short,
// conversational, human-paced version (chunked with natural pauses).

/** Clean display text for the ear: expand symbols, drop markdown-ish bullets. */
export function polishForSpeech(text: string): string {
  return text
    .replace(/[₹]/g, " rupees ")
    .replace(/[€$£]/g, " ")
    .replace(/(\d+)%/g, "$1 percent")
    .replace(/[·•]/g, "; ")
    .replace(/[*_`#]/g, " ")
    .replace(/\bTTFT\b/gi, "time to first token")
    .replace(/[|]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Sentence segmentation — keeps short units, never emits empty parts. */
export function splitSentences(text: string): string[] {
  const clean = polishForSpeech(text);
  if (!clean) return [];
  return clean
    .split(/(?<=[.!?…;:])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function sentenceScore(s: string): number {
  const lower = s.toLowerCase();
  let score = 0;
  if (/\b(pending|awaiting|requires|denied|blocked|error|failed|not permitted)\b/.test(lower)) score += 2;
  if (/^(done|okay|ok|confirmed|sent|registered|created|updated|voided)/.test(lower)) score += 1;
  return score;
}

/**
 * Short conversational spoken version of a display response.
 * Keeps the action headline + the most decision-relevant sentence, and appends
 * a natural close when the reply came from a completed action.
 */
export function spokenFor(text: string, opts: { maxSentences?: number; actionDone?: boolean } = {}): string {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return "";
  const max = opts.maxSentences ?? 3;

  const head = sentences.slice(0, 1);
  const rest = sentences.slice(1);
  const ranked = [...rest].sort((a, b) => sentenceScore(b) - sentenceScore(a));
  const picked = head.concat(ranked.slice(0, max - 1));
  const out = picked.join(". ").replace(/\.+$/, "") + ".";

  if (opts.actionDone && sentences.length > max) {
    return `${out} ${firstWords(sentences[sentences.length - 1], 8)}`;
  }
  return out;
}

function firstWords(s: string, n: number): string {
  const words = s.split(/\s+/).filter(Boolean);
  return words.slice(0, n).join(" ") + (words.length > n ? "…" : "");
}

export interface SpeechChunk {
  text: string;
  /** ms pause to leave after this chunk before the next one */
  pauseMs: number;
}

/**
 * Group sentences into playable chunks with natural pacing:
 * short sentences pack together, longer replies breathe between chunks.
 */
export function chunkForSpeech(text: string, maxChars = 160): SpeechChunk[] {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return [];

  const chunks: SpeechChunk[] = [];
  let cur = "";
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    if (cur && (cur.length + s.length > maxChars || s.length < 24)) {
      chunks.push({ text: cur.trim(), pauseMs: s.length < 24 && i < sentences.length - 1 ? 450 : 260 });
      cur = s;
    } else {
      cur = cur ? `${cur} ${s}` : s;
    }
  }
  if (cur) chunks.push({ text: cur.trim(), pauseMs: 0 });
  return chunks;
}

/** One-line acknowledgement used to open a spoken reply — conversational, not robotic. */
export function openerFor(kind: "info" | "action" | "denied" | "confirm"): string {
  switch (kind) {
    case "action": return "Done.";
    case "denied": return "I can't do that — " ;
    case "confirm": return "One moment — ";
    default: return "Here's the update. ";
  }
}
