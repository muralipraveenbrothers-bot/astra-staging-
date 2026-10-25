/**
 * Voice pipeline, wired end to end and honest about every stage:
 *
 *   audio → local STT (Voicebox/Whisper) → raw transcript → Laya intent →
 *   Astra EventBus → response → local TTS (Voicebox)
 *
 * Rules carried over from Part 5:
 *  - the raw transcript is kept verbatim next to the refined text;
 *  - a side conversation gets no spoken answer and is not sent to the brain;
 *  - voice is input, never authorization;
 *  - a missing transport is reported as unavailable instead of simulated.
 */
import { randomUUID } from "node:crypto";
import { astraEventBus, type AstraEventEnvelope } from "../../events/astraEventBus";
import { recordSpan } from "./trace";
import { keepTranscripts, voiceIntent, type VoiceIntent } from "./voice";

export const VOICEBOX_DEFAULT_BASE = "http://127.0.0.1:17493";

export const VOICE_PIPELINE = [
  "audio", "local STT", "raw transcript", "Laya intent", "Astra EventBus", "response", "local TTS",
] as const;

/** Stages that never ran when a stage fails early. */
const PIPELINE_TAIL = ["Laya intent", "Astra EventBus", "response", "local TTS"] as const;

function envFlag(name: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.[name];
}

function voiceboxBase(override?: string): string {
  return (override ?? envFlag("ASTRA_VOICEBOX_URL") ?? VOICEBOX_DEFAULT_BASE).replace(/\/+$/, "");
}

/**
 * Local refinement only: whitespace, sentence case and terminal punctuation.
 * Nothing is added to the meaning and the raw transcript stays untouched.
 */
export function refineTranscript(raw: string): string {
  const cleaned = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  const capitalized = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
}

export interface VoiceboxHealth {
  provider: "voicebox";
  base: string;
  state: "READY" | "OFF";
  reachable: boolean;
  latencyMs: number;
  detail: string;
  fabricated: false;
}

async function defaultProbe(timeoutMs: number): Promise<(url: string) => Promise<boolean>> {
  return async (url: string) => {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return response.ok;
  };
}

/** Health probe for the local Voicebox on 127.0.0.1. An unreachable port is OFF, not "ready". */
export async function voiceboxHealth(
  input: { base?: string; timeoutMs?: number; probe?: (url: string) => Promise<boolean> } = {},
): Promise<VoiceboxHealth> {
  const base = voiceboxBase(input.base);
  const started = Date.now();
  const probe = input.probe ?? (await defaultProbe(input.timeoutMs ?? 1500));
  let reachable = false;
  try {
    reachable = await probe(`${base}/health`);
  } catch {
    reachable = false;
  }
  const latencyMs = Date.now() - started;
  return {
    provider: "voicebox",
    base,
    state: reachable ? "READY" : "OFF",
    reachable,
    latencyMs,
    detail: reachable
      ? `Voicebox answered /health in ${latencyMs} ms.`
      : `Voicebox did not answer ${base}/health — start the local voice service on port 17493. Nothing was simulated.`,
    fabricated: false,
  };
}

export interface VoiceTranscriptPair {
  id: string;
  correlationId: string;
  rawTranscript: string;
  refinedTranscript: string;
  rawPreserved: true;
  language: string;
  intent: VoiceIntent;
  patient_id: string | null;
  at: string;
  persistence: "stored" | "not persisted";
  reason: string;
}

const TRANSCRIPT_LIMIT = 100;
const transcripts: VoiceTranscriptPair[] = [];

export function transcriptsAllowed(): boolean {
  return envFlag("ASTRA_VOICE_TRANSCRIPT_STORE") !== "false";
}

/** Raw and refined text are stored as a pair, or not at all when persistence is off. */
export function recordTranscriptPair(input: {
  correlationId: string;
  rawTranscript: string;
  refinedTranscript: string;
  intent: VoiceIntent;
  language?: string;
  patientId?: string | null;
  persistenceAllowed?: boolean;
}): VoiceTranscriptPair {
  const allowed = input.persistenceAllowed ?? transcriptsAllowed();
  const patient = (input.patientId ?? "").trim();
  const pair: VoiceTranscriptPair = {
    id: `vt-${randomUUID()}`,
    correlationId: input.correlationId,
    rawTranscript: input.rawTranscript,
    refinedTranscript: input.refinedTranscript,
    rawPreserved: true,
    language: input.language ?? "auto",
    intent: input.intent,
    patient_id: patient || null,
    at: new Date().toISOString(),
    persistence: allowed ? "stored" : "not persisted",
    reason: allowed
      ? "Transcript persistence is enabled; raw and refined text are kept separately."
      : "Transcript persistence is disabled (ASTRA_VOICE_TRANSCRIPT_STORE=false); nothing was written.",
  };
  if (!allowed) return pair;
  transcripts.push(pair);
  while (transcripts.length > TRANSCRIPT_LIMIT) transcripts.shift();
  return pair;
}

export function voiceTranscripts(): VoiceTranscriptPair[] {
  return transcripts.map((pair) => ({ ...pair }));
}

export function resetVoiceTranscripts(): void {
  transcripts.length = 0;
}

export interface VoiceTurnEventInput {
  correlationId: string;
  actorId?: string;
  actorRole?: string;
  intent: VoiceIntent;
  language: string;
  rawTranscript: string;
  refinedTranscript: string;
  patientId?: string | null;
}

/**
 * The bus flight recorder is PHI-free by construction: the payload carries
 * lengths and labels, never the transcript text.
 */
export async function publishVoiceTranscriptEvent(input: VoiceTurnEventInput): Promise<AstraEventEnvelope> {
  const patientRef = (input.patientId ?? "").trim();
  return astraEventBus.publish({
    correlationId: input.correlationId,
    source: "voicebox-stt",
    target: "astra-brain",
    eventType: "astra.voice.transcript",
    actorId: input.actorId || "system",
    actorRole: input.actorRole || "system",
    privacyClass: patientRef ? "PHI" : "INTERNAL",
    riskClass: "R0",
    patientRef: patientRef || undefined,
    payload: {
      intent: input.intent,
      language: input.language,
      rawTranscriptChars: input.rawTranscript.length,
      refinedTranscriptChars: input.refinedTranscript.length,
      rawPreserved: true,
      patientScoped: Boolean(patientRef),
    },
  });
}

export async function publishVoiceResponseEvent(input: {
  correlationId: string;
  actorId?: string;
  actorRole?: string;
  intent: VoiceIntent;
  language: string;
  responseText: string;
  spoken: boolean;
  ttsProviderId?: string | null;
  patientId?: string | null;
}): Promise<AstraEventEnvelope> {
  const patientRef = (input.patientId ?? "").trim();
  return astraEventBus.publish({
    correlationId: input.correlationId,
    source: "astra-brain",
    target: "voicebox-tts",
    eventType: "astra.voice.response",
    actorId: input.actorId || "system",
    actorRole: input.actorRole || "system",
    privacyClass: patientRef ? "PHI" : "INTERNAL",
    riskClass: "R0",
    patientRef: patientRef || undefined,
    payload: {
      intent: input.intent,
      language: input.language,
      responseChars: input.responseText.length,
      spoken: input.spoken,
      ttsProviderId: input.ttsProviderId ?? null,
      silenceRule: input.intent === "NOT ADDRESSED TO ASTRA",
    },
  });
}

export interface VoiceStage {
  stage: (typeof VOICE_PIPELINE)[number];
  status: "completed" | "skipped" | "blocked";
  latencyMs: number;
  detail: string;
}

export interface VoiceTurnInput {
  textIn?: string;
  rawTranscript?: string;
  audio?: { bytes: Uint8Array; mimeType: string; language?: string } | null;
  language?: string;
  patientId?: string | null;
  actorId?: string;
  actorRole?: string;
  correlationId?: string;
  speak?: boolean;
  persistTranscripts?: boolean;
}

export interface VoiceTurnDeps {
  stt?: (input: { bytes: Uint8Array; mimeType: string; language?: string }) => Promise<{ text: string; provider: string; language?: string }>;
  respond?: (input: { text: string; intent: VoiceIntent; correlationId: string; patientId: string | null }) => Promise<string>;
  tts?: (input: { text: string; language: string; correlationId: string }) => Promise<{ providerId: string | null; chunks: number }>;
}

export interface VoiceTurnResult {
  correlationId: string;
  stages: VoiceStage[];
  rawTranscript: string;
  refinedTranscript: string;
  rawPreserved: true;
  language: string;
  intent: VoiceIntent;
  silent: boolean;
  spoken: boolean;
  responseText: string;
  ttsProviderId: string | null;
  ttsChunks: number;
  unavailable: string | null;
  persistence: { stored: boolean; reason: string };
  authorization: { voiceIsAuthorization: false; authority: "role-based only"; note: string };
}

function pushStage(
  stages: VoiceStage[],
  correlationId: string,
  stage: VoiceStage["stage"],
  status: VoiceStage["status"],
  latencyMs: number,
  detail: string,
): VoiceStage {
  const entry: VoiceStage = { stage, status, latencyMs: Math.max(0, Math.round(latencyMs)), detail };
  stages.push(entry);
  recordSpan({
    kind: "voice",
    name: stage,
    latencyMs: entry.latencyMs,
    ok: status === "completed",
    detail: `${status}: ${detail}`,
    correlationId,
  });
  return entry;
}


/**
 * Run the whole voice turn. Every transport is injected, so the same pipeline
 * serves the live server and the synthetic tests without pretending that a
 * missing provider worked.
 */
export async function runVoiceTurnPipeline(input: VoiceTurnInput, deps: VoiceTurnDeps = {}): Promise<VoiceTurnResult> {
  const correlationId = (input.correlationId ?? "").trim() || randomUUID();
  const actorId = input.actorId?.trim() || "system";
  const actorRole = input.actorRole?.trim() || "system";
  const patientId = (input.patientId ?? "").trim() || null;
  const speak = input.speak !== false;
  const stages: VoiceStage[] = [];
  let language = input.language?.trim() || "auto";

  const base: VoiceTurnResult = {
    correlationId,
    stages,
    rawTranscript: "",
    refinedTranscript: "",
    rawPreserved: true,
    language,
    intent: "COMMAND",
    silent: false,
    spoken: false,
    responseText: "",
    ttsProviderId: null,
    ttsChunks: 0,
    unavailable: null,
    persistence: { stored: false, reason: "Persistence was not reached." },
    authorization: {
      voiceIsAuthorization: false,
      authority: "role-based only",
      note: "Voice is input, never authorization. Permissions come from the signed-in role.",
    },
  };

  const finish = (extra: Partial<VoiceTurnResult>): VoiceTurnResult => Object.assign(base, extra);

  const closeRest = (from: number, reason: string, unavailable: string | null): VoiceTurnResult => {
    for (const stage of PIPELINE_TAIL.slice(from)) {
      pushStage(stages, correlationId, stage, "skipped", 0, reason);
    }
    return finish({ unavailable });
  };

  let raw = "";
  if (input.audio) {
    pushStage(stages, correlationId, "audio", "completed", 0, `${input.audio.bytes.length} byte(s) at ${input.audio.mimeType}.`);
    if (!deps.stt) {
      pushStage(stages, correlationId, "local STT", "blocked", 0, "No local STT transport is wired here. Nothing was transcribed and nothing was invented.");
      closeRest(0, "Skipped: the transcript never arrived.", "VOICEBOX_STT_UNAVAILABLE");
      return base;
    }
    const started = Date.now();
    const stt = await deps.stt({ bytes: input.audio.bytes, mimeType: input.audio.mimeType, language: input.audio.language });
    raw = stt.text ?? "";
    language = stt.language ?? language;
    pushStage(stages, correlationId, "local STT", "completed", Date.now() - started, `Local ${stt.provider} returned ${raw.trim().length} char(s).`);
  } else {
    pushStage(stages, correlationId, "audio", "skipped", 0, "Text-in simulation: no microphone audio on this request.");
    pushStage(stages, correlationId, "local STT", "skipped", 0, "Skipped on the text-in path; the client already ran local Voicebox STT.");
    raw = input.rawTranscript ?? input.textIn ?? "";
  }

  const rawTranscript = raw.trim();
  if (!rawTranscript) {
    pushStage(stages, correlationId, "raw transcript", "blocked", 0, "The transcript is empty, so there is nothing to refine or answer.");
    closeRest(1, "Skipped: empty transcript.", "EMPTY_TRANSCRIPT");
    return base;
  }
  pushStage(stages, correlationId, "raw transcript", "completed", 0, `${rawTranscript.length} char(s) kept verbatim.`);

  const refinedTranscript = refineTranscript(rawTranscript);
  const intent = voiceIntent(refinedTranscript);
  pushStage(stages, correlationId, "Laya intent", "completed", 0, `Laya read ${intent} from the refined text.`);
  const kept = keepTranscripts(rawTranscript, refinedTranscript);
  const pair = recordTranscriptPair({
    correlationId,
    rawTranscript: kept.rawTranscript,
    refinedTranscript: kept.refinedTranscript,
    intent,
    language,
    patientId,
    persistenceAllowed: input.persistTranscripts,
  });
  const withText = { rawTranscript: kept.rawTranscript, refinedTranscript: kept.refinedTranscript, language, intent };
  const persistence = { stored: pair.persistence === "stored", reason: pair.reason };

  if (intent === "NOT ADDRESSED TO ASTRA") {
    pushStage(stages, correlationId, "Astra EventBus", "skipped", 0, "Side conversation: not sent to the brain.");
    pushStage(stages, correlationId, "response", "skipped", 0, "Silence rule: a side conversation gets no answer.");
    pushStage(stages, correlationId, "local TTS", "skipped", 0, "Silence rule: nothing is spoken.");
    return finish({ ...withText, silent: true, persistence });
  }


  const busStarted = Date.now();
  await publishVoiceTranscriptEvent({
    correlationId, actorId, actorRole, intent, language, rawTranscript, refinedTranscript, patientId,
  });
  pushStage(stages, correlationId, "Astra EventBus", "completed", Date.now() - busStarted, "astra.voice.transcript published with lengths, not text.");

  if (!deps.respond) {
    pushStage(stages, correlationId, "response", "blocked", 0, "No brain transport is wired here, so no reply was produced.");
    pushStage(stages, correlationId, "local TTS", "skipped", 0, "Nothing to speak.");
    return finish({ ...withText, persistence, unavailable: "NO_RESPONDER" });
  }

  const respondStarted = Date.now();
  const responseText = await deps.respond({ text: refinedTranscript, intent, correlationId, patientId });
  pushStage(stages, correlationId, "response", "completed", Date.now() - respondStarted, `${responseText.length} char(s) produced.`);

  let spoken = false;
  let ttsProviderId: string | null = null;
  let ttsChunks = 0;
  if (!speak) {
    pushStage(stages, correlationId, "local TTS", "skipped", 0, "speak=false on this request.");
  } else if (!deps.tts) {
    pushStage(stages, correlationId, "local TTS", "skipped", 0, "No local TTS transport is wired here; the reply stays on screen.");
  } else {
    const ttsStarted = Date.now();
    const tts = await deps.tts({ text: responseText, language, correlationId });
    spoken = true;
    ttsProviderId = tts.providerId;
    ttsChunks = tts.chunks;
    pushStage(stages, correlationId, "local TTS", "completed", Date.now() - ttsStarted, `Local ${tts.providerId ?? "voicebox"} returned ${tts.chunks} chunk(s).`);
  }

  await publishVoiceResponseEvent({
    correlationId, actorId, actorRole, intent, language, responseText, spoken, ttsProviderId, patientId,
  });

  return finish({ ...withText, responseText, spoken, ttsProviderId, ttsChunks, persistence });
}

