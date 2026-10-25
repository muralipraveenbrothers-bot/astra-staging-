/**
 * ASTRA AI — Dual output controller (text first, speech second).
 * ============================================================
 * This is the contract that makes the reported failure mode impossible:
 * text is emitted BEFORE any TTS work, and a TTS/playback failure leaves the
 * text answer on screen while telling the user exactly which stage failed.
 */
import { describe, it, expect } from "vitest";
import { deliverAstraVoiceResponse, acknowledgeTurn, type AstraVoiceEmitter } from "./deliverResponse";
import { ASTRA_VOICE_EVENTS, type AstraVoiceResponse } from "./contracts";
import type { AstraSpeechResult } from "./ttsFallback";

type Recorded = Array<{ event: string; payload: Record<string, unknown> }>;

function recorder(): { emit: AstraVoiceEmitter; events: Recorded } {
  const events: Recorded = [];
  return {
    events,
    emit: (event, payload) => {
      events.push({ event, payload });
    },
  };
}

const RESPONSE: AstraVoiceResponse = {
  turnId: "voice_turn_test",
  text: "Bed 4 latest CBC vachindi. Hemoglobin 9.2, WBC 11,400.",
  language: "tenglish",
  speak: true,
  dashboard: "doctor",
  risk: "clinical",
};

const OK_SPEECH: AstraSpeechResult = { ok: true, provider: "browser" };
const FAILED_SPEECH: AstraSpeechResult = {
  ok: false,
  provider: "none",
  error: "Voicebox HTTP 503",
};

describe("dual output — text first, speech second", () => {
  it("emits assistant.text before any audio event", async () => {
    const { emit, events } = recorder();
    await deliverAstraVoiceResponse(emit, RESPONSE, { synthesize: async () => OK_SPEECH });

    const textIndex = events.findIndex((e) => e.event === ASTRA_VOICE_EVENTS.text);
    const audioIndex = events.findIndex((e) => e.event === ASTRA_VOICE_EVENTS.audio);

    expect(textIndex).toBeGreaterThanOrEqual(0);
    expect(audioIndex).toBeGreaterThan(textIndex);
    expect(events[events.length - 1].event).toBe(ASTRA_VOICE_EVENTS.completed);
  });

  it("still delivers the text when speech fails, and reports the failure", async () => {
    const { emit, events } = recorder();
    const report = await deliverAstraVoiceResponse(emit, RESPONSE, {
      synthesize: async () => FAILED_SPEECH,
    });

    expect(report.textDelivered).toBe(true);
    expect(report.audioDelivered).toBe(false);
    expect(report.failure).toBe("TTS_FAILED");
    expect(events.some((e) => e.event === ASTRA_VOICE_EVENTS.text)).toBe(true);

    const error = events.find((e) => e.event === ASTRA_VOICE_EVENTS.error);
    expect(error?.payload.recoverable).toBe(true);
    expect(error?.payload.stage).toBe("tts");
    expect(report.messages.join(" ")).toMatch(/Speech unavailable/i);
  });

  it("marks blocked playback separately so the UI can offer 'Tap to hear Astra'", async () => {
    const { emit } = recorder();
    const report = await deliverAstraVoiceResponse(emit, RESPONSE, {
      synthesize: async () => ({ ok: false, provider: "none", blockedPlayback: true }),
    });
    expect(report.failure).toBe("AUDIO_PLAYBACK_FAILED");
    expect(report.messages.join(" ")).toMatch(/tap to hear Astra/i);
  });

  it("survives a synthesiser that throws", async () => {
    const { emit } = recorder();
    const report = await deliverAstraVoiceResponse(emit, RESPONSE, {
      synthesize: () => {
        throw new Error("tts exploded");
      },
    });
    expect(report.textDelivered).toBe(true);
    expect(report.failure).toBe("TTS_FAILED");
  });

  it("withholds speech without reporting a TTS failure", async () => {
    const { emit, events } = recorder();
    const report = await deliverAstraVoiceResponse(emit, RESPONSE, {
      synthesize: async () => ({ ok: true, provider: "none", withheld: true }),
    });
    expect(report.textDelivered).toBe(true);
    expect(report.audioDelivered).toBe(false);
    expect(report.failure).toBeUndefined();
    expect(events.some((event) => event.event === ASTRA_VOICE_EVENTS.error)).toBe(false);
    expect(events.some((event) => event.event === ASTRA_VOICE_EVENTS.audio)).toBe(false);
    expect(events[events.length - 1]?.payload.withheld).toBe(true);
  });

  it("fails loudly when there is no text to deliver", async () => {
    const { emit, events } = recorder();
    const report = await deliverAstraVoiceResponse(emit, { ...RESPONSE, text: "  " });
    expect(report.textDelivered).toBe(false);
    expect(report.failure).toBe("TEXT_DELIVERY_FAILED");
    const error = events.find((e) => e.event === ASTRA_VOICE_EVENTS.error);
    expect(error?.payload.recoverable).toBe(false);
  });

  it("skips speech (but not text) when speak is false", async () => {
    const { emit, events } = recorder();
    const report = await deliverAstraVoiceResponse(emit, { ...RESPONSE, speak: false });
    expect(report.textDelivered).toBe(true);
    expect(report.audioAttempted).toBe(false);
    expect(events.some((e) => e.event === ASTRA_VOICE_EVENTS.audio)).toBe(false);
    expect(events.some((e) => e.event === ASTRA_VOICE_EVENTS.completed)).toBe(true);
  });

  it("carries the same turnId through every event of the turn", async () => {
    const { emit, events } = recorder();
    await deliverAstraVoiceResponse(emit, RESPONSE, { synthesize: async () => OK_SPEECH });
    for (const e of events) expect(e.payload.turnId).toBe(RESPONSE.turnId);
  });

  it("flags browser-voice answers as local so the UI renders the right control", async () => {
    const { emit, events } = recorder();
    await deliverAstraVoiceResponse(emit, RESPONSE, { synthesize: async () => OK_SPEECH });
    const audio = events.find((e) => e.event === ASTRA_VOICE_EVENTS.audio);
    expect(audio?.payload.local).toBe(true);
    expect(audio?.payload.provider).toBe("browser");
  });

  it("records frontend acknowledgements under the same turnId", async () => {
    const { emit, events } = recorder();
    await acknowledgeTurn(emit, RESPONSE.turnId, "textRendered");
    await acknowledgeTurn(emit, RESPONSE.turnId, "audioStarted");
    expect(events.map((e) => e.event)).toEqual([
      ASTRA_VOICE_EVENTS.textRendered,
      ASTRA_VOICE_EVENTS.audioStarted,
    ]);
    for (const e of events) expect(e.payload.turnId).toBe(RESPONSE.turnId);
  });
});