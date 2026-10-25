import { describe, it, expect } from "vitest";
import type {
  MayinVoiceProvider,
  SpeakOptions,
  SpeechStateEvent,
  TranscriptEvent,
  VoiceProviderId,
  VoiceStatus,
} from "./voiceProvider";
import { MayinVoiceProviderManager } from "./MayinVoiceProviderManager";

/** Minimal fake tier with controllable failover behaviour. */
class FakeTier implements MayinVoiceProvider {
  speakCalls = 0;
  interruptCalls = 0;
  started = 0;
  stopped = 0;
  spoken: string[] = [];
  failSpeak: boolean;
  failStart = false;
  connected: boolean;
  private speechHandlers = new Set<(e: SpeechStateEvent) => void>();

  constructor(
    public id: VoiceProviderId,
    opts: { failSpeak?: boolean; connected?: boolean } = {},
  ) {
    this.failSpeak = opts.failSpeak ?? false;
    this.connected = opts.connected ?? true;
  }

  async start(): Promise<void> {
    this.started += 1;
    if (this.failStart) throw new Error(`${this.id}: start boom`);
  }
  async stop(): Promise<void> {
    this.stopped += 1;
  }
  async speak(text: string, _options?: SpeakOptions): Promise<void> {
    this.speakCalls += 1;
    if (this.failSpeak) {
      for (const h of this.speechHandlers) h({ state: "failed", provider: this.id, ts: Date.now() });
      throw new Error(`${this.id} cannot speak`);
    }
    this.spoken.push(text);
    for (const h of this.speechHandlers) h({ state: "ended", provider: this.id, ts: Date.now() });
  }
  async interrupt(): Promise<void> {
    this.interruptCalls += 1;
  }
  getStatus(): VoiceStatus {
    return {
      provider: this.id,
      microphonePermission: "granted",
      microphoneActive: true,
      voiceProviderConnected: this.connected,
      lastAudioInput: null,
      lastTranscript: null,
      lastVoiceOutput: null,
      roundTripLatency: null,
      reconnectAttempts: 0,
      language: "en-IN",
      conversationState: "idle",
    };
  }
  onTranscript(_h: (e: TranscriptEvent) => void): () => void {
    return () => undefined;
  }
  onSpeechState(h: (e: SpeechStateEvent) => void): () => void {
    this.speechHandlers.add(h);
    return () => { this.speechHandlers.delete(h); };
  }
}

describe("MayinVoiceProviderManager — tiered failover", () => {
  it("fails over to the next tier and records who actually spoke", async () => {
    const openai = new FakeTier("openai-live", { failSpeak: true });
    const sarvam = new FakeTier("sarvam");
    const manager = new MayinVoiceProviderManager({
      tiers: [
        { id: "openai-live", provider: openai, cloud: true, skipWhenDisconnected: true },
        { id: "sarvam", provider: sarvam, cloud: true, skipWhenDisconnected: true },
      ],
      isLocalOnlyTurn: () => false,
    });

    await manager.speak("hello");

    expect(openai.speakCalls).toBe(1);
    expect(sarvam.spoken).toEqual(["hello"]);
    expect(manager.lastSpeakReport?.spokenBy).toBe("sarvam");
    expect(manager.lastSpeakReport?.outcomes).toEqual([
      { id: "openai-live", error: "openai-live cannot speak" },
    ]);
  });

  it("throws when every tier fails and emits an honest failed state", async () => {
    const events: SpeechStateEvent[] = [];
    const a = new FakeTier("openai-live", { failSpeak: true });
    const b = new FakeTier("sarvam", { failSpeak: true });
    const manager = new MayinVoiceProviderManager({
      tiers: [
        { id: "openai-live", provider: a },
        { id: "sarvam", provider: b },
      ],
      isLocalOnlyTurn: () => false,
    });
    manager.onSpeechState((e) => events.push(e));

    await expect(manager.speak("hello")).rejects.toThrow(/No voice provider could speak/);
    expect(manager.lastSpeakReport?.spokenBy).toBeNull();
    expect(events.some((e) => e.state === "failed" && e.provider === "none")).toBe(true);
  });

  it("skips cloud tiers on PHI turns (local-only privacy gate)", async () => {
    const cloud = new FakeTier("openai-live");
    const local = new FakeTier("voicebox");
    const manager = new MayinVoiceProviderManager({
      tiers: [
        { id: "openai-live", provider: cloud, cloud: true },
        { id: "voicebox", provider: local },
      ],
      isLocalOnlyTurn: () => true,
    });

    await manager.speak("creatinine 2.1 for the admitted patient", {
      patientContext: { patientId: "P-1" },
    });

    expect(cloud.speakCalls).toBe(0);
    expect(local.spoken).toHaveLength(1);
    expect(manager.lastSpeakReport?.outcomes[0]).toEqual({
      id: "openai-live",
      skipped: "phi-local-only",
    });
  });

  it("default PHI detection uses the Cloud Privacy Gate heuristics", async () => {
    const cloud = new FakeTier("sarvam");
    const local = new FakeTier("voicebox");
    const manager = new MayinVoiceProviderManager({
      tiers: [
        { id: "sarvam", provider: cloud, cloud: true },
        { id: "voicebox", provider: local },
      ],
    });
    // "bed 12" is an identifier shape — PHI must not reach a cloud mouth.
    await manager.speak("give the report for bed 12");
    expect(cloud.speakCalls).toBe(0);
    expect(local.speakCalls).toBe(1);
  });

  it("skips disconnected pure-backend tiers without attempting them", async () => {
    const cloud = new FakeTier("sarvam", { connected: false });
    const local = new FakeTier("voicebox");
    const manager = new MayinVoiceProviderManager({
      tiers: [
        { id: "sarvam", provider: cloud, cloud: true, skipWhenDisconnected: true },
        { id: "voicebox", provider: local },
      ],
      isLocalOnlyTurn: () => false,
    });

    await manager.speak("hello");

    expect(cloud.speakCalls).toBe(0);
    expect(local.spoken).toHaveLength(1);
    expect(manager.lastSpeakReport?.outcomes[0]).toEqual({
      id: "sarvam",
      skipped: "disconnected",
    });
  });

  it("fans barge-in out to every tier", async () => {
    const a = new FakeTier("openai-live");
    const b = new FakeTier("voicebox");
    const manager = new MayinVoiceProviderManager({
      tiers: [
        { id: "openai-live", provider: a },
        { id: "voicebox", provider: b },
      ],
      isLocalOnlyTurn: () => false,
    });
    await manager.interrupt();
    expect(a.interruptCalls).toBe(1);
    expect(b.interruptCalls).toBe(1);
  });

  it("start/stop follow the degradation contract — one bad tier never throws", async () => {
    const bad = new FakeTier("openai-live", { failSpeak: true });
    bad.failStart = true;
    const good = new FakeTier("voicebox");
    const manager = new MayinVoiceProviderManager({
      tiers: [
        { id: "openai-live", provider: bad },
        { id: "voicebox", provider: good },
      ],
      isLocalOnlyTurn: () => false,
    });

    await expect(manager.start()).resolves.toBeUndefined();
    expect(bad.started).toBe(1);
    expect(good.started).toBe(1);
    await manager.stop();
    expect(good.stopped).toBe(1);
  });

  it("reports the tier that last spoke through getStatus()", async () => {
    const cloud = new FakeTier("sarvam", { failSpeak: true, connected: true });
    const local = new FakeTier("voicebox");
    const manager = new MayinVoiceProviderManager({
      tiers: [
        { id: "sarvam", provider: cloud, cloud: true },
        { id: "voicebox", provider: local },
      ],
      isLocalOnlyTurn: () => false,
    });

    await manager.speak("hello");
    expect(manager.getStatus().provider).toBe("voicebox");
  });
});
