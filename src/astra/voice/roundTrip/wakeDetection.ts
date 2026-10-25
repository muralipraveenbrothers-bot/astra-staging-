// ASTRA AI — deterministic name/wake detection.
//
// Runs BEFORE semantic reasoning. "Hi Mayin" must be answered like a person
// whose name was called — not analysed for spelling or title corrections.
// Deterministic (not LLM) so it is instant, cheap and testable.
//
// DR MAYIN IDENTITY: Saarathi, Sanjeevani, Jarvis, and Astra are all unified
// facets of Dr Mayin. Any wake word routes to the single master identity.

import { newTurnId, type AstraLanguage, type AstraVoiceResponse, type AstraRisk } from "./contracts";

/**
 * Name tokens: All agent aliases unified under Dr Mayin.
 * Recognises: mayin, dr mayin, doctor mayin, saarathi, sanjeevani, astra, jarvis
 * and their Telugu/Hindi/Tenglish/Hinglish variants.
 */
const NAME_CORE =
  "mayin|mayan|mayyin|mine|maine|" +
  "sanjeevani|sanjivani|sanjeevini|" +
  "astra|asthra|" +
  "saarathi|sarathi|saarthi|sarthy|" +
  "jarvis";

/** Telugu and Hindi spellings of Saarathi, Sanjeevani, and Astra. */
const SCRIPT_NAMES =
  "\u0c36\u0c3e\u0c30\u0c25\u0c3f|\u0c38\u0c02\u0c1c\u0c40\u0c35\u0c28\u0c3f|\u0c06\u0c38\u0c4d\u0c1f\u0c4d\u0c30\u0c3e|" +
  "\u0938\u093e\u0930\u0925\u0940|\u0938\u0902\u091c\u0940\u0935\u0928\u0940|\u0906\u0938\u094d\u091f\u094d\u0930\u093e";

const NAME = `(?:(?:dr\\.?\\s+|doctor\\s+)?(?:${NAME_CORE})|${SCRIPT_NAMES})`;

export const MAYIN_WAKE_PATTERN = new RegExp(
  `\\b(?:hey\\s+)?(?:dr\\.?\\s+|doctor\\s+)?(?:${NAME_CORE})\\b|(?:${SCRIPT_NAMES})`,
  "i"
);

const WAKE_AT_START_PATTERN = new RegExp(
  `^\\s*(?:hey\\s+)?(?:dr\\.?\\s+|doctor\\s+)?(?:${NAME_CORE})\\b[\\s,.:;!?-]*|^\\s*(?:${SCRIPT_NAMES})[\\s,.:;!?-]*`,
  "i"
);

/** Ways staff call Dr Mayin — English, Telugu, Hindi, Tenglish, Hinglish. */
const CALL_PATTERNS: RegExp[] = [
  new RegExp(`^\\s*${NAME}\\s*[.!?,]?\\s*$`, "i"),
  new RegExp(`^\\s*(hi|hello|hey|hai|hii|heyy|yo|namaste|namaskaram|namaskar)\\s+${NAME}\\s*[.!?,]?\\s*$`, "i"),
  new RegExp(`^\\s*${NAME}\\s+(hi|hello|hey|hai|hii)\\s*[.!?,]?\\s*$`, "i"),
  new RegExp(`^\\s*(hey|hi|hello)\\s+${NAME}\\s*[.!?,]?\\s*(there|are you there|you there)\\s*[.!?,]?\\s*$`, "i"),
  new RegExp(`^\\s*${NAME}\\s*[.!?,]?\\s*(are you there|you there|are you listening|sun rahe ho|vinuthunnava|cheppandi)\\s*[.!?,]?\\s*$`, "i"),
];

/** A bare name call addressed to a person (e.g. "Doctor?") — human turn-taking. */
const HUMAN_NAME_CALL_PATTERNS: RegExp[] = [
  /^\s*(doctor|dr\.?|sir|madam)\s*[.!?,]?\s*$/i,
];

export function isCallingAstra(input: string): boolean {
  const text = (input ?? "").trim();
  if (!text || text.length > 80) return false;
  return CALL_PATTERNS.some((pattern) => pattern.test(text));
}

export function extractWakeCommand(input: string): { woke: boolean; command: string } {
  const text = (input ?? "").trim();
  const match = text.match(WAKE_AT_START_PATTERN);
  if (!match) return { woke: false, command: text };
  return { woke: true, command: text.slice(match[0].length).trim() };
}

export function isHumanNameCall(input: string): boolean {
  const text = (input ?? "").trim();
  if (!text || text.length > 60) return false;
  return HUMAN_NAME_CALL_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Vary the acknowledgement so Dr Mayin does not sound like a repeating robot.
 * `seed` (turn counter, hash, ...) keeps the choice deterministic in tests.
 * All variants speak as Dr Mayin — the single unified identity.
 */
export function buildAstraAcknowledgement(
  language: AstraLanguage,
  opts: { address?: string; seed?: number } = {}
): string {
  const address = opts.address?.trim() || "";
  const sir = address ? `, ${address}` : "";
  const variants: Record<AstraLanguage, string[]> = {
    en: [
      `Yes${sir}? Dr. Mayin here. What can I do?`,
      `I'm here${sir}. Dr. Mayin — how can I help?`,
      `Yes${sir} — Dr. Mayin listening. Where shall we start?`,
    ],
    te: [
      `\u0c05\u0c35\u0c41\u0c28\u0c41${sir}, \u0c21\u0c3e\u0c15\u0c4d\u0c1f\u0c30\u0c4d \u0c2e\u0c2f\u0c3f\u0c28\u0c4d \u0c07\u0c15\u0c4d\u0c15\u0c21\u0c47. \u0c0f\u0c02 \u0c1a\u0c47\u0c2f\u0c3e\u0c32\u0c3f?`,
      `\u0c1a\u0c46\u0c2a\u0c4d\u0c2a\u0c02\u0c21\u0c3f${sir}, \u0c21\u0c3e\u0c15\u0c4d\u0c1f\u0c30\u0c4d \u0c2e\u0c2f\u0c3f\u0c28\u0c4d \u0c35\u0c3f\u0c02\u0c1f\u0c41\u0c28\u0c4d\u0c28\u0c3e\u0c28\u0c41.`,
      `\u0c39\u0c3e\u0c2f\u0c4d${sir}! \u0c21\u0c3e\u0c15\u0c4d\u0c1f\u0c30\u0c4d \u0c2e\u0c2f\u0c3f\u0c28\u0c4d \u0c07\u0c15\u0c4d\u0c15\u0c21\u0c47 \u0c09\u0c28\u0c4d\u0c28\u0c3e\u0c28\u0c41. \u0c0f\u0c02 \u0c15\u0c3e\u0c35\u0c3e\u0c32\u0c3f?`,
    ],
    hi: [
      `\u0939\u093e\u0901${sir}, \u0921\u0949\u0915\u094d\u091f\u0930 \u092e\u092f\u093f\u0928 \u092f\u0939\u093e\u0901 \u0939\u0948\u0902\u0964 \u0915\u094d\u092f\u093e \u0915\u0930\u0942\u0901?`,
      `\u092c\u094b\u0932\u093f\u090f${sir}, \u0921\u0949\u0915\u094d\u091f\u0930 \u092e\u092f\u093f\u0928 \u0938\u0941\u0928 \u0930\u0939\u093e \u0939\u0942\u0901\u0964`,
      `\u0939\u0947${sir}! \u092e\u0948\u0902 \u0921\u0949\u0915\u094d\u091f\u0930 \u092e\u092f\u093f\u0928 \u0939\u0942\u0901\u0964 \u0915\u094d\u092f\u093e \u091a\u093e\u0939\u093f\u090f?`,
    ],
    tenglish: [
      `Yes${sir}, Dr. Mayin ikkade. Em cheyyali?`,
      `Cheppandi${sir}, Dr. Mayin vinuthunnanu.`,
      `Hey${sir}! Dr. Mayin ikkade unnanu. Em kavali?`,
    ],
    hinglish: [
      `Haan${sir}, Dr. Mayin yahan hai. Kya karun?`,
      `Boliye${sir}, Dr. Mayin sun raha hoon.`,
      `Hey${sir}! Main Dr. Mayin hoon. Kya chahiye?`,
    ],
  };
  const list = variants[language] ?? variants.en;
  const index = Math.abs(opts.seed ?? 0) % list.length;
  return list[index];
}

/** Build the wake-turn response. Never goes to a model; risk is always normal. */
export function buildWakeResponse(input: {
  turnId?: string;
  text: string;
  language: AstraLanguage;
  dashboard: AstraVoiceResponse["dashboard"];
  address?: string;
  seed?: number;
  risk?: AstraRisk;
}): AstraVoiceResponse {
  const risk: AstraRisk = input.risk ?? "normal";
  const text = buildAstraAcknowledgement(input.language, { address: input.address, seed: input.seed });
  return {
    turnId: input.turnId ?? newTurnId(),
    text,
    speechText: text,
    language: input.language,
    speak: true,
    dashboard: input.dashboard,
    risk,
    intent: "social_acknowledgement",
  };
}
