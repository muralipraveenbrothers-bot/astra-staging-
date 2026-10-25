/**
 * Local voice intent. Raw text is kept after refinement.
 * A side conversation does not get a spoken answer.
 */

export const VOICE_INTENTS = [
  "COMMAND",
  "DICTATION",
  "QUESTION",
  "CLINICAL QUESTION",
  "PATIENT COUNSELLING",
  "CASUAL CONVERSATION",
  "SYSTEM NAVIGATION",
  "STAFF MESSAGE",
  "NOT ADDRESSED TO ASTRA",
] as const;

export type VoiceIntent = (typeof VOICE_INTENTS)[number];

const MICRO = /\b(open pharmacy|show bed\s*\d+|go back|print receipt|open patient|show cbc|call reception)\b/i;

export function isMicroCommand(text: string): boolean {
  return MICRO.test(text ?? "");
}

export function voiceIntent(text: string): VoiceIntent {
  const said = (text ?? "").trim();
  if (/\bastra\b|dr\.?\s*mayin/i.test(said) && !/\bnot (talking |addressed )?to astra\b/i.test(said)) {
    if (isMicroCommand(said) || /^(open|show|go)\b/i.test(said)) return "SYSTEM NAVIGATION";
    if (/\b(pain|fever|dose|diagnosis|patient|creatinine|fracture)\b/i.test(said)) return "CLINICAL QUESTION";
    return "COMMAND";
  }
  if (/\bnot (talking |addressed )?to astra\b/i.test(said) || /^(hey |hi )?(nurse|sister|brother)\b/i.test(said)) {
    return "NOT ADDRESSED TO ASTRA";
  }
  if (isMicroCommand(said) || /^(open|show|go)\b/i.test(said)) return "SYSTEM NAVIGATION";
  if (/\b(call|message|tell)\b.+\b(reception|pharmacy|nurse|doctor)\b/i.test(said)) return "STAFF MESSAGE";
  if (/\b(dictate|note:|progress note)\b/i.test(said)) return "DICTATION";
  if (/\bcounsel\b/i.test(said)) return "PATIENT COUNSELLING";
  if (/\b(pain|fever|dose|diagnosis|patient|creatinine|fracture)\b/i.test(said)) return "CLINICAL QUESTION";
  if (/\?$/.test(said) || /^(what|why|how|when)\b/i.test(said)) return "QUESTION";
  if (/^(hello|hi|good morning)\b/i.test(said)) return "CASUAL CONVERSATION";
  return "COMMAND";
}

export function keepTranscripts(raw: string, refined: string): { rawTranscript: string; refinedTranscript: string; rawPreserved: true } {
  return { rawTranscript: raw, refinedTranscript: refined, rawPreserved: true };
}

export const VOICE_PATH = ["Microphone", "Voicebox", "Whisper", "Raw transcript", "Laya", "Astra", "Response", "Voicebox"] as const;
