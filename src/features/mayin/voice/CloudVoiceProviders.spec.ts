/**
 * ASTRA 7D — CLOUD VOICE PROVIDER TESTS (Sarvam + OpenAI Live)
 * ============================================================================
 * Asserts the honesty contract: NOT configured means NOT configured, failures
 * THROW (so the manager fails over), and success requires real audio bytes.
 * All network + playback is injected — no secrets, no browser needed.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import {
  SarvamProvider,
  OpenAILiveProvider,
  browserPlayClip,
  type CloudServerTtsProvider,
  type CloudProviderDeps,
} from "./CloudVoiceProviders";
import type { SpeechStateEvent } from "./voiceProvider";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Shared behaviour — runs against BOTH providers. */
function honestyContract(
  name: string,
  make: (deps: CloudProviderDeps) => CloudServerTtsProvider,
) {
  describe(`${name} — honesty contract`, () => {
    it("reports NOT configured when the server route does not exist", async () => {
      const provider = make({ fetchImpl: async () => jsonResponse({ error: "not found" }, 404) });
      expect(await provider.probe()).toBe(false);
      expect(provider.getStatus().voiceProviderConnected).toBe(false);
      expect(provider.getDetail()).toContain("NOT configured");
    });

    it("reports NOT configured when the route exists but has no API key", async () => {
      const provider = make({ fetchImpl: async () => jsonResponse({ configured: false }) });
      expect(await provider.probe()).toBe(false);
      expect(provider.getDetail()).toContain("missing API key");
    });

    it("reports READY when the server route answers honestly", async () => {
      const provider = make({ fetchImpl: async () => jsonResponse({ configured: true }) });
      expect(await provider.probe()).toBe(true);
      expect(provider.getStatus().voiceProviderConnected).toBe(true);
    });

    it("speak() THROWS when the TTS route is missing — never a fake success", async () => {
      const events: SpeechStateEvent[] = [];
      const provider = make({ fetchImpl: async () => jsonResponse({}, 404) });
      provider.onSpeechState((e) => events.push(e));

      await expect(provider.speak("hello")).rejects.toThrow(/NOT configured/);
      expect(events.some((e) => e.state === "failed")).toBe(true);
      expect(provider.getStatus().conversationState).toBe("idle");
    });

    it("speak() resolves only with real audio bytes and emits truthful states", async () => {
      const played: Blob[] = [];
      const events: SpeechStateEvent[] = [];
      const provider = make({
        fetchImpl: async () =>
          jsonResponse({ audioBase64: Buffer.from("fake-audio").toString("base64"), mimeType: "audio/mpeg" }),
        playClip: async (blob) => { played.push(blob); },
      });
      provider.onSpeechState((e) => events.push(e));

      await provider.speak("hello", { language: "te-IN" });

      expect(played).toHaveLength(1);
      expect(played[0].size).toBeGreaterThan(0);
      expect(events.map((e) => e.state)).toEqual(["started", "ended"]);
      expect(provider.getStatus().lastVoiceOutput).not.toBeNull();
    });

    it("interrupt() during playback resolves as interruption, not failure", async () => {
      const events: SpeechStateEvent[] = [];
      const provider = make({
        fetchImpl: async () =>
          jsonResponse({ audioBase64: Buffer.from("fake-audio").toString("base64") }),
        playClip: async (_blob, signal) =>
          new Promise<void>((resolve) => {
            signal?.addEventListener("abort", () => resolve(), { once: true });
            // Never resolves on its own — only barge-in ends playback.
          }),
      });
      provider.onSpeechState((e) => events.push(e));

      const speaking = provider.speak("long response");
      await new Promise((r) => setTimeout(r, 0));
      await provider.interrupt();
      await expect(speaking).resolves.toBeUndefined();

      expect(events.map((e) => e.state)).toEqual(["started", "interrupted"]);
      expect(events.every((e) => e.provider === provider.id)).toBe(true);
    });

    it("never pretends to have a microphone — the ear stays with Whisper/browser", () => {
      const provider = make({});
      const status = provider.getStatus();
      expect(status.microphoneActive).toBe(false);
      expect(status.lastAudioInput).toBeNull();
      expect(status.lastTranscript).toBeNull();
    });
  });
}

honestyContract("SarvamProvider", (deps) => new SarvamProvider(deps));
honestyContract("OpenAILiveProvider", (deps) => new OpenAILiveProvider(deps));

// ---------------------------------------------------------------------------
// browserPlayClip — the real playback path (barge-in must UNBLOCK the caller).
// A fake Audio element lets node exercise the code the browser would run.
// ---------------------------------------------------------------------------

class FakeAudio {
  static last: FakeAudio | null = null;
  static autoEnd = false;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  paused = false;
  constructor(public readonly src: string) {
    FakeAudio.last = this;
  }
  play(): Promise<void> {
    if (FakeAudio.autoEnd) setTimeout(() => this.onended?.(), 0);
    return Promise.resolve();
  }
  pause(): void {
    this.paused = true;
  }
}

const globals = globalThis as unknown as { Audio?: unknown };
const urlShim = URL as unknown as {
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
};
const savedAudio = globals.Audio;
const savedCreate = urlShim.createObjectURL;
const savedRevoke = urlShim.revokeObjectURL;

function installFakeAudio(autoEnd = false): void {
  FakeAudio.autoEnd = autoEnd;
  FakeAudio.last = null;
  globals.Audio = FakeAudio;
  urlShim.createObjectURL = () => "blob:fake";
  urlShim.revokeObjectURL = () => undefined;
}

afterEach(() => {
  globals.Audio = savedAudio;
  urlShim.createObjectURL = savedCreate;
  urlShim.revokeObjectURL = savedRevoke;
  FakeAudio.autoEnd = false;
  FakeAudio.last = null;
  vi.restoreAllMocks();
});

describe("browserPlayClip — barge-in and honesty", () => {
  it("throws a structured error when no audio environment exists (never a fake success)", async () => {
    globals.Audio = undefined;
    await expect(browserPlayClip(new Blob(["clip"]))).rejects.toThrow(/unavailable/);
  });

  it("a barge-in abort during playback resolves instead of hanging", async () => {
    installFakeAudio();
    const controller = new AbortController();
    const playing = browserPlayClip(new Blob(["clip"]), controller.signal);
    controller.abort();
    await expect(playing).resolves.toBeUndefined();
    expect(FakeAudio.last?.paused).toBe(true);
  });

  it("an abort that arrives BEFORE play() unblocks the caller too", async () => {
    installFakeAudio();
    const controller = new AbortController();
    controller.abort();
    await expect(browserPlayClip(new Blob(["clip"]), controller.signal)).resolves.toBeUndefined();
  });

  it("removes its abort listener once playback ends (no listener leak)", async () => {
    installFakeAudio(true);
    const controller = new AbortController();
    const removed: string[] = [];
    const spy = vi.spyOn(controller.signal, "removeEventListener");
    spy.mockImplementation(((type: string, ...rest: unknown[]) => {
      removed.push(type);
      return (AbortSignal.prototype.removeEventListener as (...a: unknown[]) => void)
        .call(controller.signal, type, ...rest);
    }) as unknown as typeof controller.signal.removeEventListener);

    await browserPlayClip(new Blob(["clip"]), controller.signal);
    expect(removed).toContain("abort");
  });

  it("provider barge-in through the REAL playback path emits interrupted, never ended", async () => {
    installFakeAudio();
    const provider = new SarvamProvider({
      fetchImpl: async () => jsonResponse({ audioBase64: Buffer.from("clip").toString("base64") }),
    });
    const events: SpeechStateEvent[] = [];
    provider.onSpeechState((e) => events.push(e));

    const speaking = provider.speak("long response");
    await new Promise((r) => setTimeout(r, 0));
    await provider.interrupt();
    await expect(speaking).resolves.toBeUndefined();
    expect(events.map((e) => e.state)).toEqual(["started", "interrupted"]);
    expect(provider.getStatus().lastVoiceOutput).toBeNull();
  });

  it("provider playback that ends normally through the REAL path emits ended", async () => {
    installFakeAudio(true);
    const provider = new SarvamProvider({
      fetchImpl: async () => jsonResponse({ audioBase64: Buffer.from("clip").toString("base64") }),
    });
    const events: SpeechStateEvent[] = [];
    provider.onSpeechState((e) => events.push(e));

    await provider.speak("short response");
    expect(events.map((e) => e.state)).toEqual(["started", "ended"]);
    expect(provider.getStatus().lastVoiceOutput).not.toBeNull();
  });
});
