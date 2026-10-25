/**
 * ASTRA 7D — DR. MAYIN RUNTIME INTEGRATION TESTS
 * ============================================================================
 * Proves the full pipeline end-to-end on the REAL agent bus:
 *
 *   transcript → ConversationController → MayinBrainGateway (LAYA/HERMES)
 *     → provider.speak(speech)     [voice wiring]
 *   gesture.command → MayinGestureBridge → MayinContext selection
 *     → conversation.setContext    [gesture wiring]
 *
 * A failure here means the doctor's words never reach the brain — this is the
 * seam the whole Dr. Mayin architecture depends on.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { agentBus } from "@/astra/runtime/agentBus";
import { MayinRuntime } from "./MayinRuntime";
import { MayinVoiceProviderManager } from "../voice/MayinVoiceProviderManager";
import type {
  MayinVoiceProvider,
  SpeakOptions,
  SpeechStateEvent,
  TranscriptEvent,
  VoiceStatus,
} from "../voice/voiceProvider";

class RecordingProvider implements MayinVoiceProvider {
  spoken: string[] = [];
  started = 0;
  stopped = 0;
  private transcriptHandlers = new Set<(e: TranscriptEvent) => void>();

  async start(): Promise<void> { this.started += 1; }
  async stop(): Promise<void> { this.stopped += 1; }
  async speak(text: string, _options?: SpeakOptions): Promise<void> {
    this.spoken.push(text);
  }
  async interrupt(): Promise<void> { /* no-op */ }
  getStatus(): VoiceStatus {
    return {
      provider: "voicebox",
      microphonePermission: "granted",
      microphoneActive: true,
      voiceProviderConnected: true,
      lastAudioInput: null,
      lastTranscript: null,
      lastVoiceOutput: null,
      roundTripLatency: null,
      reconnectAttempts: 0,
      language: "en-IN",
      conversationState: "idle",
    };
  }
  onTranscript(h: (e: TranscriptEvent) => void): () => void {
    this.transcriptHandlers.add(h);
    return () => { this.transcriptHandlers.delete(h); };
  }
  onSpeechState(): () => void { return () => undefined; }
}

const flush = async () => {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
};

function transcript(text: string): TranscriptEvent {
  return { text, isFinal: true, provider: "voicebox", ts: Date.now() };
}

describe("MayinRuntime — transcript → BrainGateway → speak wiring", () => {
  it("routes a directed voice command through the BrainGateway and speaks the reply", async () => {
    const provider = new RecordingProvider();
    const runtime = new MayinRuntime({
      voiceProvider: provider,
      context: { userId: "U-1", role: "DOCTOR", patientId: "P-1" },
    });

    const { started, voiceAvailable } = await runtime.start();
    expect(started).toBe(true);
    expect(voiceAvailable).toBe(true);

    runtime.handleTranscript(transcript("Mayin, open laboratory"));
    await flush();

    // LAYA resolved the dashboard registry and the gateway produced speech —
    // this assertion FAILS if the runtime never reaches getMayinBrainGateway.
    expect(provider.spoken).toHaveLength(1);
    expect(provider.spoken[0]).toBe("Opening laboratory.");
    expect(runtime.conversation.getState()).toBe("listening");

    await runtime.stop();
    expect(provider.stopped).toBe(1);
  });

  it("surfaces confirmation-required pharmacy dispatches as spoken text", async () => {
    const provider = new RecordingProvider();
    const runtime = new MayinRuntime({
      voiceProvider: provider,
      context: { userId: "U-1", role: "DOCTOR", patientId: "P-1" },
    });
    await runtime.start();

    runtime.handleTranscript(transcript("Mayin, dispatch insulin order"));
    await flush();

    expect(provider.spoken).toHaveLength(1);
    expect(provider.spoken[0].toLowerCase()).toContain("confirm");
    await runtime.stop();
  });

  it("ignores unaddressed room speech (no wake name, exchange closed)", async () => {
    const provider = new RecordingProvider();
    const runtime = new MayinRuntime({
      voiceProvider: provider,
      context: { userId: "U-1", role: "DOCTOR" },
    });
    await runtime.start();

    runtime.handleTranscript(transcript("please send that file to the ward"));
    await flush();

    expect(provider.spoken).toHaveLength(0);
    await runtime.stop();
  });
});

describe("MayinRuntime — gesture bridge wiring", () => {
  it("gesture select on the real bus moves the bridge selection pointer", async () => {
    const provider = new RecordingProvider();
    const runtime = new MayinRuntime({
      voiceProvider: provider,
      context: { userId: "U-1", role: "DOCTOR", patientId: "P-1" },
    });
    await runtime.start();

    agentBus.publish("gesture.command", { gesture: "pinch", action: "select", objectId: "Hb report" });

    expect(runtime.gestureBridge.getContext().selectedObject).toBe("Hb report");
    expect(runtime.gestureBridge.getContext().patientId).toBe("P-1");

    await runtime.stop();
  });

  it("bridge stops consuming gestures after runtime.stop()", async () => {
    const provider = new RecordingProvider();
    const runtime = new MayinRuntime({ voiceProvider: provider });
    await runtime.start();
    await runtime.stop();

    agentBus.publish("gesture.command", { gesture: "pinch", action: "select", objectId: "X" });

    expect(runtime.gestureBridge.getContext().selectedObject).toBeUndefined();
  });
});

describe("MayinRuntime — tiered voice default (cloud → cloud → Voicebox cascade)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("defaults to the tiered manager instead of a single provider", () => {
    const runtime = new MayinRuntime();

    expect(runtime.voice).toBeInstanceOf(MayinVoiceProviderManager);
    const status = runtime.voice.getStatus();
    // The reported id is a REAL tier id, never an invented "ACTIVE" mouth.
    expect(["openai-live", "sarvam", "voicebox"]).toContain(status.provider);
    // Nothing has been probed yet, so no tier may claim to be connected.
    expect(status.voiceProviderConnected).toBe(false);
  });

  it("disposes only the manager IT built — never a caller's provider", async () => {
    const disposeSpy = vi.spyOn(MayinVoiceProviderManager.prototype, "dispose");

    const injected = new RecordingProvider();
    const external = new MayinRuntime({ voiceProvider: injected });
    await external.stop();
    expect(injected.stopped).toBe(1);
    expect(disposeSpy).not.toHaveBeenCalled();

    const owned = new MayinRuntime();
    await owned.stop();
    expect(disposeSpy).toHaveBeenCalledTimes(1);
  });

  it("a PHI turn skips BOTH cloud tiers in the default chain", async () => {
    const runtime = new MayinRuntime();

    // Never rejects: the text answer survives any voice failure (§66).
    await runtime.speak("shift the patient in bed 12 to the ICU");

    const manager = runtime.voice as MayinVoiceProviderManager;
    const cloud = (manager.lastSpeakReport?.outcomes ?? []).filter(
      (o) => o.id === "sarvam" || o.id === "openai-live",
    );
    expect(cloud.map((o) => o.skipped)).toEqual(["phi-local-only", "phi-local-only"]);
  });

  it("a benign turn skips UNPROBED cloud tiers as disconnected, with the real reason", async () => {
    const runtime = new MayinRuntime();

    await runtime.speak("opening the laboratory");

    const manager = runtime.voice as MayinVoiceProviderManager;
    const cloud = (manager.lastSpeakReport?.outcomes ?? []).filter(
      (o) => o.id === "sarvam" || o.id === "openai-live",
    );
    // No probe ran, so they must be skipped — never attempted and never credited.
    expect(cloud.map((o) => o.skipped)).toEqual(["disconnected", "disconnected"]);
    expect(manager.lastSpeakReport?.spokenBy).not.toBe("sarvam");
    expect(manager.lastSpeakReport?.spokenBy).not.toBe("openai-live");
  });

  it("getDiagnostics reports the tier chain truthfully after a failed speak", async () => {
    const runtime = new MayinRuntime();

    const before = await runtime.getDiagnostics();
    expect(before.voiceTiers).toEqual({ lastSpokenBy: null, outcomes: [] });

    await runtime.speak("shift the patient in bed 12 to the ICU");
    const after = await runtime.getDiagnostics();
    expect(after.voiceTiers?.lastSpokenBy).toBeNull();
    expect(after.voiceTiers?.outcomes.map((o) => o.skipped)).toEqual([
      "phi-local-only",
      "phi-local-only",
      undefined,
    ]);
  });

  it("a single injected provider reports NO tier chain instead of inventing one", async () => {
    const runtime = new MayinRuntime({ voiceProvider: new RecordingProvider() });

    const diag = await runtime.getDiagnostics();
    expect(diag.voiceTiers).toBeNull();
    expect(diag.voice.provider).toBe("voicebox");
  });

  it("a directed command with the REAL default chain reaches the brain and records the outcome", async () => {
    const runtime = new MayinRuntime({
      context: { userId: "U-1", role: "DOCTOR", patientId: "P-1" },
    });
    const speech: SpeechStateEvent[] = [];
    runtime.voice.onSpeechState((e) => speech.push(e));

    // Production path: the manager starts and probes every tier for real.
    const started = await runtime.start();
    expect(started.started).toBe(true);
    expect(started.voiceAvailable).toBe(true);

    runtime.handleTranscript(transcript("Mayin, open laboratory"));
    await flush();

    // The doctor's words reached the brain AND the chain was asked to speak.
    const manager = runtime.voice as MayinVoiceProviderManager;
    expect(manager.lastSpeakReport).not.toBeNull();
    expect(manager.lastSpeakReport?.outcomes.length).toBeGreaterThan(0);

    // Nothing can actually speak in node, so no tier may be credited — and no
    // tier may claim a healthy connection just because start() resolved.
    expect(manager.lastSpeakReport?.spokenBy).toBeNull();
    expect(runtime.voice.getStatus().voiceProviderConnected).toBe(false);

    await runtime.stop();
  });
});
