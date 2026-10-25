// ASTRA AI — DUAL OUTPUT CONTROLLER.
//
// The contract that makes "no text + no speech" impossible as a silent state:
//   1. assistant.text is emitted FIRST — never after TTS.
//   2. audio is an ADDITIONAL rendering of the same semantic answer.
//   3. a TTS/playback failure emits assistant.error (recoverable) and the text
//      answer stays on screen.
//   4. the turn always ends with assistant.completed.
//
// The emitter is injected so this works over the existing transport
// (WebSocket/SignalR/SSE/bus) without introducing a second realtime stack.

import {
  ASTRA_VOICE_EVENTS,
  hasText,
  type AstraTurnFailure,
  type AstraVoiceResponse,
} from "./contracts";
import { speakAstra, type AstraSpeechResult, type SpeakAstraOptions } from "./ttsFallback";

export type AstraVoiceEmitter = (
  event: string,
  payload: Record<string, unknown>
) => void | Promise<void>;

export interface DeliveryReport {
  turnId: string;
  textDelivered: boolean;
  audioAttempted: boolean;
  audioDelivered: boolean;
  provider: string;
  failure?: AstraTurnFailure;
  /** Honest, user-facing notes (shown in the UI, never swallowed). */
  messages: string[];
}

export interface DeliverOptions {
  /** Speech is attempted only when true. Text is ALWAYS delivered. */
  speak?: boolean;
  /** Override the synthesiser (unit tests / alternate voice stacks). */
  synthesize?: (options: SpeakAstraOptions) => Promise<AstraSpeechResult>;
  onTextRendered?: (turnId: string) => void;
  onAudioStarted?: (turnId: string) => void;
  onAudioCompleted?: (turnId: string) => void;
}

/**
 * Deliver one Astra turn: text first, speech second, completion last.
 * Never throws — every failure becomes a report + an `assistant.error` event.
 */
export async function deliverAstraVoiceResponse(
  emit: AstraVoiceEmitter,
  response: AstraVoiceResponse,
  options: DeliverOptions = {}
): Promise<DeliveryReport> {
  const report: DeliveryReport = {
    turnId: response.turnId,
    textDelivered: false,
    audioAttempted: false,
    audioDelivered: false,
    provider: "none",
    messages: [],
  };

  // ---- 1. TEXT FIRST (mandatory) -----------------------------------------
  if (!hasText(response.text)) {
    report.failure = "TEXT_DELIVERY_FAILED";
    report.messages.push("Astra produced no text answer for this turn.");
    await emit(ASTRA_VOICE_EVENTS.error, {
      turnId: response.turnId,
      stage: "text",
      recoverable: false,
      message: "No text answer was produced; the turn was not answered.",
    });
    await emit(ASTRA_VOICE_EVENTS.completed, { turnId: response.turnId, degraded: report.failure });
    return report;
  }

  await emit(ASTRA_VOICE_EVENTS.text, {
    turnId: response.turnId,
    text: response.text,
    language: response.language,
    dashboard: response.dashboard,
    risk: response.risk,
    intent: response.intent,
    actions: response.actions ?? [],
    requiresConfirmation: response.requiresConfirmation ?? false,
  });
  report.textDelivered = true;
  options.onTextRendered?.(response.turnId);

  // ---- 2. SPEECH SECOND (optional) ---------------------------------------
  const shouldSpeak = options.speak !== false && response.speak !== false;
  if (!shouldSpeak) {
    await emit(ASTRA_VOICE_EVENTS.completed, { turnId: response.turnId, spoken: false });
    return report;
  }

  report.audioAttempted = true;
  await emit(ASTRA_VOICE_EVENTS.state, { turnId: response.turnId, value: "SYNTHESIZING_SPEECH" });

  const synthesize = options.synthesize ?? speakAstra;
  let speech: AstraSpeechResult;
  try {
    speech = await synthesize({
      text: response.speechText?.trim() || response.text,
      language: response.language,
    });
  } catch (e) {
    speech = { ok: false, provider: "none", error: e instanceof Error ? e.message : String(e) };
  }

  if (speech.withheld) {
    await emit(ASTRA_VOICE_EVENTS.completed, {
      turnId: response.turnId,
      spoken: false,
      withheld: true,
      provider: "none",
    });
    return report;
  }

  if (speech.ok) {
    report.audioDelivered = true;
    report.provider = speech.provider;
    await emit(ASTRA_VOICE_EVENTS.audio, {
      turnId: response.turnId,
      provider: speech.provider,
      language: response.language,
      speechText: response.speechText?.trim() || response.text,
      /** true when the frontend must speak locally (operating-system voice). */
      local: speech.provider === "browser" || speech.provider === "voicebox",
    });
    options.onAudioStarted?.(response.turnId);
    await emit(ASTRA_VOICE_EVENTS.state, { turnId: response.turnId, value: "SPEAKING" });
    options.onAudioCompleted?.(response.turnId);
    await emit(ASTRA_VOICE_EVENTS.audioCompleted, {
      turnId: response.turnId,
      provider: speech.provider,
    });
  } else {
    // TEXT REMAINS AVAILABLE — this is the whole point of the contract.
    report.failure = speech.blockedPlayback ? "AUDIO_PLAYBACK_FAILED" : "TTS_FAILED";
    report.messages.push(
      speech.blockedPlayback
        ? "Speech was blocked by the browser — tap to hear Astra. The text answer is shown above."
        : "Speech unavailable; the text response was delivered."
    );
    await emit(ASTRA_VOICE_EVENTS.error, {
      turnId: response.turnId,
      stage: speech.blockedPlayback ? "playback" : "tts",
      recoverable: true,
      blockedPlayback: speech.blockedPlayback ?? false,
      message: speech.error ?? "speech unavailable",
    });
  }

  // ---- 3. COMPLETION LAST -------------------------------------------------
  await emit(ASTRA_VOICE_EVENTS.completed, {
    turnId: response.turnId,
    spoken: report.audioDelivered,
    provider: report.provider,
    degraded: report.failure ?? null,
  });
  return report;
}

/** Frontend → backend acknowledgements that prove the UI really rendered. */
export async function acknowledgeTurn(
  emit: AstraVoiceEmitter,
  turnId: string,
  what: "textRendered" | "audioStarted" | "audioCompleted"
): Promise<void> {
  const event =
    what === "textRendered"
      ? ASTRA_VOICE_EVENTS.textRendered
      : what === "audioStarted"
        ? ASTRA_VOICE_EVENTS.audioStarted
        : ASTRA_VOICE_EVENTS.audioCompleted;
  await emit(event, { turnId, at: Date.now() });
}