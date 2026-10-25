// ASTRA AI — Voice/Text round-trip contract (shared by every dashboard).
//
// ONE semantic answer drives BOTH renderings: `text` (mandatory, always
// delivered to the dashboard/chat) and `speechText` (optional, spoken when
// audio is available). TTS failure must never suppress the text answer.
//
// This module is dependency-free so it can be unit-tested in Node and reused
// by the Voice Guardian, the chat shell and the dashboard composers.

/** Languages Astra accepts and answers in. */
export type AstraLanguage = "en" | "te" | "hi" | "tenglish" | "hinglish";

/** Active workspace — the SPECIALIST context, not the authenticated role. */
export type AstraDashboard =
  | "general"
  | "reception"
  | "doctor"
  | "pharmacy"
  | "lab"
  | "radiology"
  | "billing"
  | "ward"
  | "ot";

/** Clinical risk classification that gates humour and reasoning routing. */
export type AstraRisk = "normal" | "clinical" | "high_clinical";

/**
 * Turn state machine. The UI must never silently stop: every turn ends in
 * COMPLETED or one of the explicit failure states.
 */
export type AstraTurnState =
  | "IDLE"
  | "LISTENING"
  | "TRANSCRIBING"
  | "UNDERSTANDING"
  | "ROUTING"
  | "THINKING"
  | "EXECUTING_TOOL"
  | "RESPONDING_TEXT"
  | "SYNTHESIZING_SPEECH"
  | "SPEAKING"
  | "COMPLETED";

export type AstraTurnFailure =
  | "MIC_DENIED"
  | "NO_AUDIO"
  | "STT_FAILED"
  | "ROUTER_FAILED"
  | "MODEL_FAILED"
  | "TOOL_FAILED"
  | "TEXT_DELIVERY_FAILED"
  | "TTS_FAILED"
  | "AUDIO_PLAYBACK_FAILED";

/** A concrete follow-up Astra can offer (card / button / tool call). */
export interface AstraAction {
  type: string;
  label?: string;
  payload?: Record<string, unknown>;
}

/** The single semantic response every accepted turn must produce. */
export interface AstraVoiceResponse {
  turnId: string;
  /** Mandatory. Shown in the current dashboard/chat. */
  text: string;
  /** Optional spoken rendering. Defaults to `text`. */
  speechText?: string;
  language: AstraLanguage;
  /** false only when the user disabled voice or risk policy forbids speech. */
  speak: boolean;
  dashboard: AstraDashboard;
  risk: AstraRisk;
  intent?: string;
  actions?: AstraAction[];
  requiresConfirmation?: boolean;
  /** Stage that failed, when the turn completed with a degraded rendering. */
  degraded?: AstraTurnFailure;
}

/** Standardised realtime event contract (extends the existing transport). */
export const ASTRA_VOICE_EVENTS = {
  listening: "voice.listening",
  transcriptPartial: "voice.transcript.partial",
  transcriptFinal: "voice.transcript.final",
  thinking: "assistant.thinking",
  text: "assistant.text",
  audio: "assistant.audio",
  tool: "assistant.tool",
  error: "assistant.error",
  completed: "assistant.completed",
  state: "voice.state",
  /** Frontend acknowledgements — prove the UI really rendered/played. */
  textRendered: "assistant.text.rendered",
  audioStarted: "assistant.audio.started",
  audioCompleted: "assistant.audio.completed",
} as const;

export type AstraVoiceEventName =
  (typeof ASTRA_VOICE_EVENTS)[keyof typeof ASTRA_VOICE_EVENTS];

/** BCP-47 tag used for TTS/STT. Tenglish is spoken as Telugu, Hinglish as Hindi. */
export const SPEECH_LANG_TAG: Record<AstraLanguage, string> = {
  en: "en-IN",
  te: "te-IN",
  hi: "hi-IN",
  tenglish: "te-IN",
  hinglish: "hi-IN",
};

/** Map the round-trip language to the 3 profiles Astra's voice stack knows. */
export function speechProfileKey(language: AstraLanguage): "en" | "te" | "hi" {
  if (language === "te" || language === "tenglish") return "te";
  if (language === "hi" || language === "hinglish") return "hi";
  return "en";
}

/** Human-readable label used by the status/diagnostics surfaces. */
export const DASHBOARD_LABEL: Record<AstraDashboard, string> = {
  general: "Astra General",
  reception: "Astra Reception",
  doctor: "Astra Clinical Command Centre",
  pharmacy: "Astra Pharmacy",
  lab: "Astra Laboratory",
  radiology: "Astra Radiology",
  billing: "Astra Billing",
  ward: "Astra Ward",
  ot: "Astra OT",
};

let turnCounter = 0;

/**
 * One id for the whole round trip: capture → STT → routing → LLM → tool →
 * text → TTS → playback. Sortable (time-prefixed) so logs read chronologically.
 */
export function newTurnId(prefix = "voice_turn"): string {
  turnCounter = (turnCounter + 1) % 1_000_000;
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  const seq = turnCounter.toString(36).padStart(3, "0");
  return `${prefix}_${time}${seq}${rand}`;
}

/** True when a value is a usable, non-empty answer. */
export function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Normalise any BCP-47 tag / script hint coming out of STT into AstraLanguage. */
export function toAstraLanguage(raw?: string | null): AstraLanguage {
  const value = (raw ?? "").toLowerCase();
  if (value.startsWith("te") || value.includes("telugu")) return "te";
  if (value.startsWith("hi") || value.includes("hindi")) return "hi";
  if (value.includes("tenglish")) return "tenglish";
  if (value.includes("hinglish")) return "hinglish";
  return "en";
}
