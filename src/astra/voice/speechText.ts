export const TEXT_UTILS_VERSION = 1;

/** Formatter-safe character-range builder (survives auto-formatting). */
export function charRange(from: number, to: number): string {
  return String.fromCharCode(from) + '-' + String.fromCharCode(to);
}

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]|\p{Extended_Pictographic}/gu;

/**
 * Strips markdown symbols, code blocks, URLs, emojis, and table fences so TTS sounds natural.
 */
export function cleanForSpeech(text: string): string {
  if (!text) return '';
  return text
    .replace(/```[\s\S]*?```/g, '') // remove code blocks
    .replace(/^\|.*\|$/gm, '') // remove markdown table rows
    .replace(/[|#*_`~>]/g, ' ') // remove formatting symbols & table delimiters
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // remove markdown links
    .replace(EMOJI_RE, '') // remove emojis
    .replace(/\s{2,}/g, ' ')
    .trim();
}