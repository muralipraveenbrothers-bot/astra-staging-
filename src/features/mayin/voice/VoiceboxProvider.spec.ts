/**
 * ASTRA 7D — VOICEBOX PROVIDER TESTS (truthful failure, real chain)
 * ============================================================================
 * The Voicebox tier is the local mouth (English, Hindi, Telugu). It does not
 * call Sarvam or Gemini. These tests run with no local runtime and no <audio>,
 * which is the "Voicebox is down" case:
 *
 *   • speak() THROWS and emits `failed` — never a fake `ended` (§66).
 *   • barge-in resolves as `interrupted` (a successful stop is not a failure).
 *   • the provider never claims a microphone it does not have.
 */

import { describe, it, expect, afterEach } from "vitest";
import { VoiceboxProvider } from "./VoiceboxProvider";
import type { SpeechStateEvent } from "./voiceProvider";

const events: SpeechStateEvent[] = [];

function collect(provider: VoiceboxProvider): SpeechStateEvent[] {
  events.length = 0;
  provider.onSpeechState((e) => events.push(e));
  return events;
}

afterEach(() => {
  events.length = 0;
});

describe("VoiceboxProvider — honest failure", () => {
  it("speak() THROWS when no provider could speak, instead of faking 'ended'", async () => {
    const provider = new VoiceboxProvider();
    const seen = collect(provider);

    await expect(provider.speak("opening the laboratory")).rejects.toThrow(
      /voice services are temporarily unavailable|unavailable|Nothing to speak/i,
    );

    const states = seen.map((e) => e.state);
    expect(states).toContain("started");
    expect(states).toContain("failed");
    expect(states).not.toContain("ended");
    expect(states).not.toContain("interrupted");
    // The tier must not be left claiming it is mid-speech.
    expect(provider.getStatus().conversationState).toBe("idle");
  });

  it("refuses empty text without pretending to speak", async () => {
    const provider = new VoiceboxProvider();
    const seen = collect(provider);

    await expect(provider.speak("   ")).rejects.toThrow();

    expect(seen.map((e) => e.state)).not.toContain("ended");
  });

  it("barge-in resolves as interrupted — a successful stop, not a failure", async () => {
    const provider = new VoiceboxProvider();
    const seen = collect(provider);

    const speaking = provider.speak("a long ward update for every bed");
    await provider.interrupt();
    await expect(speaking).resolves.toBeUndefined();

    const states = seen.map((e) => e.state);
    expect(states).toContain("interrupted");
    expect(states).not.toContain("failed");
    expect(states).not.toContain("ended");
  });

  it("never claims a microphone it does not have", () => {
    const status = new VoiceboxProvider().getStatus();
    expect(status.microphoneActive).toBe(false);
    expect(status.lastAudioInput).toBeNull();
  });
});
