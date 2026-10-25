/**
 * R5-08 voice safety rules. Pure functions: no microphone, no audio, no approval-gate runtime.
 * The live session in voiceSession.ts applies these rules to the existing Voicebox ear and mouth.
 */

export type VoiceState = "IDLE" | "LISTENING" | "THINKING" | "SPEAKING" | "MUTED";

export type VoiceTone = "grey" | "blue" | "amber" | "light" | "red";

export type VoiceMotion = "none" | "waveform" | "pulse" | "ring";

export const VOICE_STATE_VISUAL: Record<VoiceState, { label: string; tone: VoiceTone; motion: VoiceMotion }> = {
  IDLE: { label: "Idle", tone: "grey", motion: "none" },
  LISTENING: { label: "Listening", tone: "blue", motion: "waveform" },
  THINKING: { label: "Thinking", tone: "amber", motion: "pulse" },
  SPEAKING: { label: "Speaking", tone: "light", motion: "ring" },
  MUTED: { label: "Muted", tone: "red", motion: "none" },
};

export const DEFAULT_AGENT_NAMES = ["Mayin", "Mitra", "Astra", "Saarathi"];

export const STT_CONFIDENCE_FLOOR = 0.55;

export const UNCLEAR_PROMPT = "I didn't catch that clearly. Please say it once more... slowly.";

export const CLINICAL_ACK = "Understood. Let's go step by step.";

export const STOP_REPLY = "Okay";

export type VoiceSurface = "patient" | "attender" | "staff";

export type VoiceGestureIntent = "stop" | "pause" | "resume";

export interface ClinicalSpeechDecision {
  speak: boolean;
  pushToTalk: boolean;
  pauseIfDoctorSpeaks: boolean;
  reason: string;
}

export type HeardUtterance =
  | { kind: "empty" }
  | { kind: "stop"; command: string }
  | { kind: "unclear-once"; prompt: string }
  | { kind: "unclear-wait" }
  | { kind: "accept"; text: string };

const FILLER = new Set(["please", "pls", "now", "okay", "ok", "hey", "hi"]);
const HONORIFIC = new Set(["dr", "doctor", "mr", "mrs", "ms"]);

export function normalizeUtterance(text: string): string {
  return (text ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function stopPhrases(agentNames: readonly string[]): string[] {
  const phrases = new Set<string>([
    "stop",
    "pause",
    "silence",
    "exit",
    "cancel",
    "aapu",
    "kasepu agu",
    "mitra aapu",
    "silence mitra",
    "mitra stop",
  ]);
  for (const name of agentNames) {
    const agent = normalizeUtterance(name);
    if (!agent) continue;
    phrases.add(`${agent} stop`);
    phrases.add(`${agent} pause`);
    phrases.add(`${agent} silence`);
    phrases.add(`${agent} exit`);
    phrases.add(`${agent} aapu`);
    phrases.add(`silence ${agent}`);
  }
  return [...phrases].sort((a, b) => b.length - a.length);
}

/** Standalone stop commands only. "stop the bleeding" is clinical speech, not a stop. */
export function matchStopUtterance(text: string, agentNames: readonly string[] = DEFAULT_AGENT_NAMES): string | null {
  const norm = normalizeUtterance(text);
  if (!norm) return null;
  const names = new Set(agentNames.map((name) => normalizeUtterance(name)).filter(Boolean));
  names.add("mitra");
  const core = norm
    .split(" ")
    .filter((token) => token && !FILLER.has(token) && !HONORIFIC.has(token) && !names.has(token));
  const coreText = core.join(" ");
  for (const phrase of stopPhrases(agentNames)) {
    if (norm === phrase || coreText === phrase) return phrase;
  }
  return null;
}

export function interpretHeard(input: {
  text: string;
  confidence?: number;
  agentNames?: readonly string[];
  unclearAlreadyAsked: boolean;
}): HeardUtterance {
  const text = (input.text ?? "").trim();
  if (!text) return { kind: "empty" };
  const command = matchStopUtterance(text, input.agentNames ?? DEFAULT_AGENT_NAMES);
  if (command) return { kind: "stop", command };
  const low = typeof input.confidence === "number" && Number.isFinite(input.confidence) && input.confidence < STT_CONFIDENCE_FLOOR;
  if (low) {
    if (input.unclearAlreadyAsked) return { kind: "unclear-wait" };
    return { kind: "unclear-once", prompt: UNCLEAR_PROMPT };
  }
  return { kind: "accept", text };
}

export function splitSentences(text: string): string[] {
  const clean = (text ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*_`#>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return [];
  const parts = clean.split(/(?<=[.!?।॥])\s+/).map((part) => part.trim()).filter(Boolean);
  return parts.length ? parts : [clean];
}

/** Spoken line is at most two sentences. A long clinical answer is only the short acknowledgement. */
export function planSpokenLine(text: string, opts: { clinical?: boolean; maxSentences?: number } = {}): string {
  const max = opts.maxSentences ?? 2;
  const sentences = splitSentences(text);
  if (!sentences.length) return "";
  const long = sentences.length > max || (text ?? "").trim().length > 280;
  if (opts.clinical && long) return CLINICAL_ACK;
  if (!long) return sentences.slice(0, max).join(" ");
  if (sentences.length >= 2) return sentences.slice(0, max).join(" ");
  const cut = sentences[0].slice(0, 220);
  const space = cut.lastIndexOf(" ");
  const short = (space > 80 ? cut.slice(0, space) : cut).trim();
  return /[.!?।॥]$/.test(short) ? short : `${short}.`;
}

export function classifyVoiceSurface(route: string | undefined): VoiceSurface {
  const path = (route ?? "").split("?")[0];
  if (/\/attender(?:\/|$)/i.test(path)) return "attender";
  if (/\/(?:patient|patients|portal|kiosk|counsel|advisor)(?:\/|$)/i.test(path)) return "patient";
  return "staff";
}

/** Doctor dashboard, doctor role, staff surface. Patient routes still need a patient-message. */
export function isDoctorClinicalDashboard(input: { role: string; dashboard: string; surface: VoiceSurface }): boolean {
  return (input.role ?? "").trim().toLowerCase() === "doctor"
    && input.dashboard === "doctor"
    && input.surface === "staff";
}

/**
 * Clinical speech is allowed on the doctor dashboard (push-to-talk).
 * On every other dashboard it is spoken only when an approved patient-message grant is already known.
 * The grant comes from POST /api/clinical/approval/patient-message-guard, never from the gate module.
 */
export function evaluateClinicalSpeech(input: {
  clinical: boolean;
  role: string;
  dashboard: string;
  surface: VoiceSurface;
  patientMessageAllowed?: boolean;
}): ClinicalSpeechDecision {
  if (!input.clinical) {
    return { speak: true, pushToTalk: false, pauseIfDoctorSpeaks: false, reason: "operational" };
  }
  if (isDoctorClinicalDashboard(input)) {
    return { speak: true, pushToTalk: true, pauseIfDoctorSpeaks: true, reason: "doctor-dashboard" };
  }
  if (input.patientMessageAllowed) {
    return { speak: true, pushToTalk: false, pauseIfDoctorSpeaks: false, reason: "approved-patient-message" };
  }
  return { speak: false, pushToTalk: false, pauseIfDoctorSpeaks: false, reason: "patient-message-required" };
}

/** How listening continues after a spoken answer. Press-to-open and the wake word stay available. */
export function listenResumeAfterSpeech(input: {
  pushToTalk: boolean;
  wakeWordEnabled: boolean;
  panelOpen: boolean;
  armed: boolean;
}): "press-to-open" | "wake" | "follow-up" | "stay" {
  if (input.pushToTalk) return "press-to-open";
  if (input.panelOpen && input.armed) return "follow-up";
  if (input.wakeWordEnabled && !input.panelOpen) return "wake";
  return "stay";
}

export function approvalDecisionIdFrom(
  actions: ReadonlyArray<{ type?: string; payload?: Record<string, unknown>; args?: Record<string, unknown> }> | undefined
): string | undefined {
  for (const action of actions ?? []) {
    const bag = { ...(action.args ?? {}), ...(action.payload ?? {}) };
    for (const key of ["approvalDecisionId", "decisionId"]) {
      const value = bag[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return undefined;
}

/** Whisper may send 0..1, 0..100, or segment log-probabilities. Raw audio is not read. */
export function confidenceFromWhisperPayload(data: {
  confidence?: unknown;
  segments?: Array<{ avg_logprob?: number; no_speech_prob?: number }> | null;
} | null | undefined): number | undefined {
  if (!data) return undefined;
  if (typeof data.confidence === "number" && Number.isFinite(data.confidence)) {
    const value = data.confidence > 1 ? data.confidence / 100 : data.confidence;
    return Math.max(0, Math.min(1, value));
  }
  const segments = data.segments;
  if (!Array.isArray(segments) || segments.length === 0) return undefined;
  let sum = 0;
  let count = 0;
  for (const segment of segments) {
    if (!segment || typeof segment.avg_logprob !== "number" || !Number.isFinite(segment.avg_logprob)) continue;
    const clarity = Math.exp(Math.max(-8, Math.min(0, segment.avg_logprob)));
    const noise = typeof segment.no_speech_prob === "number" ? Math.max(0, Math.min(1, segment.no_speech_prob)) : 0;
    sum += Math.max(0, Math.min(1, clarity * (1 - noise)));
    count += 1;
  }
  return count ? sum / count : undefined;
}

/** Drops audio, samples, and transcripts. Flight-recorder payloads stay metadata. */
export function voiceFlightEvent(eventType: string, fields: Record<string, unknown>): { eventType: string; payload: Record<string, unknown> } {
  const payload: Record<string, unknown> = { audioStored: false };
  for (const [key, value] of Object.entries(fields)) {
    if (/audio|blob|wav|pcm|sample|transcript|utterance|raw/i.test(key)) continue;
    if (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      payload[key] = value;
    }
  }
  return { eventType, payload };
}

export type VoiceGestureHandler = (intent: VoiceGestureIntent) => void;

let gestureHandler: VoiceGestureHandler | null = null;

/** Hand-gesture recognition is out of scope. A future adapter registers here. */
export function registerVoiceGestureHandler(handler: VoiceGestureHandler | null): () => void {
  gestureHandler = handler;
  return () => {
    if (gestureHandler === handler) gestureHandler = null;
  };
}

export function dispatchVoiceGesture(intent: VoiceGestureIntent): boolean {
  if (!gestureHandler) return false;
  gestureHandler(intent);
  return true;
}

export interface SilenceObservation {
  route: string;
  state: VoiceState;
  atMs: number;
}

export type SilenceDetector = (observation: SilenceObservation) => "silent" | "active" | "abstain";

let silenceDetector: SilenceDetector | null = null;

/** Automatic silence detection is out of scope. Manual Silent mode does not call this. */
export function registerSilenceDetector(detector: SilenceDetector | null): () => void {
  silenceDetector = detector;
  return () => {
    if (silenceDetector === detector) silenceDetector = null;
  };
}

export function consultSilenceDetector(observation: SilenceObservation): "silent" | "active" | "abstain" {
  if (!silenceDetector) return "abstain";
  try {
    return silenceDetector(observation);
  } catch {
    return "abstain";
  }
}
