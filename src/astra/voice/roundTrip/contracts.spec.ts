/**
 * ASTRA AI — Voice round-trip contracts, wake detection and diagnostics.
 * =====================================================================
 * These are the guarantees that replace the reported failure mode
 * ("mic heard something, no reply text, no speech, no error shown").
 */
import { describe, it, expect } from "vitest";
import {
  ASTRA_VOICE_EVENTS,
  DASHBOARD_LABEL,
  newTurnId,
  speechProfileKey,
  toAstraLanguage,
  hasText,
  type AstraDashboard,
} from "./contracts";
import {
  buildWakeResponse,
  isCallingAstra,
  isHumanNameCall,
  buildAstraAcknowledgement,
} from "./wakeDetection";
import { ROLE_OVERLAYS } from "./roleOverlays";
import { collectVoiceDiagnostics, createVoiceLatencyTracker } from "./diagnostics";

const DASHBOARDS = Object.keys(ROLE_OVERLAYS) as AstraDashboard[];

describe("contracts — one id for the whole round trip", () => {
  it("generates unique, sortable turn ids", () => {
    const ids = new Set(Array.from({ length: 200 }, () => newTurnId()));
    expect(ids.size).toBe(200);
  });

  it("prefixes turn ids so logs are greppable", () => {
    expect(newTurnId()).toMatch(/^voice_turn_/);
    expect(newTurnId("text_turn")).toMatch(/^text_turn_/);
  });

  it("maps Tenglish to the Telugu voice and Hinglish to the Hindi voice", () => {
    expect(speechProfileKey("tenglish")).toBe("te");
    expect(speechProfileKey("hinglish")).toBe("hi");
    expect(speechProfileKey("en")).toBe("en");
  });

  it("normalises inbound BCP-47 tags", () => {
    expect(toAstraLanguage("te-IN")).toBe("te");
    expect(toAstraLanguage("hi-IN")).toBe("hi");
    expect(toAstraLanguage("en-IN")).toBe("en");
    expect(toAstraLanguage(undefined)).toBe("en");
  });

  it("treats blank strings as no answer", () => {
    expect(hasText("   ")).toBe(false);
    expect(hasText("ok")).toBe(true);
  });

  it("publishes the standardised event contract", () => {
    expect(ASTRA_VOICE_EVENTS.text).toBe("assistant.text");
    expect(ASTRA_VOICE_EVENTS.audio).toBe("assistant.audio");
    expect(ASTRA_VOICE_EVENTS.completed).toBe("assistant.completed");
    expect(ASTRA_VOICE_EVENTS.transcriptFinal).toBe("voice.transcript.final");
    expect(ASTRA_VOICE_EVENTS.textRendered).toBe("assistant.text.rendered");
  });

  it("labels every dashboard", () => {
    for (const dashboard of DASHBOARDS) expect(DASHBOARD_LABEL[dashboard]).toBeTruthy();
  });
});

describe("wake detection — named, not analysed", () => {
  it("recognises a bare name call", () => {
    expect(isCallingAstra("Astra")).toBe(true);
    expect(isCallingAstra("Astra?")).toBe(true);
    expect(isCallingAstra("  astra!  ")).toBe(true);
  });

  it("recognises greetings to Astra in English and Indian forms", () => {
    ["Hi Astra", "hello astra", "Hey Astra!", "Astra hi", "namaste astra", "namaskaram astra", "Saarathi", "Hey Saarathi", "Jarvis", "hi jarvis"].forEach((call) => {
      expect(isCallingAstra(call), call).toBe(true);
    });
  });

  it("does not hijack real commands that merely mention Astra", () => {
    expect(isCallingAstra("Astra, bed 4 CBC report chupinchu")).toBe(false);
    expect(isCallingAstra("bed 4 patient latest Hb entha")).toBe(false);
  });

  it("recognises a bare human address", () => {
    expect(isHumanNameCall("Doctor?")).toBe(true);
    expect(isHumanNameCall("sir")).toBe(true);
    expect(isHumanNameCall("bed 3 potassium")).toBe(false);
  });

  it("answers in the language the user used", () => {
    expect(buildAstraAcknowledgement("te")).toMatch(/[\u0C00-\u0C7F]/);
    expect(buildAstraAcknowledgement("hi")).toMatch(/[\u0900-\u097F]/);
    expect(buildAstraAcknowledgement("tenglish")).toMatch(/cheppandi|Nenu|Vinuthunnanu|ikkade|cheyyali/i);
    expect(buildAstraAcknowledgement("en")).toMatch(/here|listening|What can I do/i);
  });

  it("never treats a wake turn as a command to analyse", () => {
    const response = buildWakeResponse({
      text: "Hi Astra",
      language: "en",
      dashboard: "reception",
      address: "Doctor",
    });
    expect(response.intent).toBe("social_acknowledgement");
    expect(response.risk).toBe("normal");
    expect(response.speak).toBe(true);
    expect(response.text).not.toMatch(/typo|spelling|title/i);
  });
});

describe("diagnostics — no silent stage", () => {
  it("reports every wired stage and marks unwired ones honestly", async () => {
    const report = await collectVoiceDiagnostics({
      microphone: () => true,
      stt: () => ({ ready: true, detail: "voicebox whisper" }),
      tts: () => false,
    });
    const byKey = Object.fromEntries(report.stages.map((s) => [s.key, s]));

    expect(byKey.microphone.ready).toBe(true);
    expect(byKey.stt.detail).toBe("voicebox whisper");
    expect(byKey.tts.ready).toBe(false);
    expect(byKey.websocket.detail).toBe("not wired");
    expect(report.ok).toBe(false);
  });

  it("survives a throwing probe", async () => {
    const report = await collectVoiceDiagnostics({
      llm: () => {
        throw new Error("gateway refused");
      },
    });
    const llm = report.stages.find((s) => s.key === "llm");
    expect(llm?.ready).toBe(false);
    expect(llm?.detail).toContain("gateway refused");
  });

  it("reports readiness per stage when everything is wired", async () => {
    const report = await collectVoiceDiagnostics({
      microphone: () => true,
      stt: () => true,
      router: () => true,
      llm: () => true,
      textDelivery: () => true,
      tts: () => true,
      audioPlayback: () => true,
      websocket: () => true,
    });
    expect(report.ok).toBe(true);
    expect(report.stages).toHaveLength(8);
  });

  it("measures latency between the pipeline stages", () => {
    let clock = 0;
    const tracker = createVoiceLatencyTracker(() => (clock = clock + 10));
    tracker.mark("microphone");
    tracker.mark("stt");
    tracker.mark("router");
    tracker.mark("llm");
    tracker.mark("textDelivery");
    tracker.mark("tts");
    tracker.mark("audioPlayback");
    const latency = tracker.snapshot();
    expect(latency.firstAudio).toBeGreaterThan(0);
    expect(tracker.between("microphone", "stt")).toBe(10);
    expect(tracker.between("tts", "microphone")).toBe(0);
  });
});