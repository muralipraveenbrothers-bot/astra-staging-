/**
 * ASTRA AI — Voice TTS router tests (Phase 2 §6 / §7 / §36)
 * =========================================================
 * Validates language normalization and the truthful provider selection:
 * reachable + language-covered providers win; unreachable providers never
 * produce a fake "spoken" result; a no-provider environment returns the
 * text-only fallback signal.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { normalizeLanguage, selectTtsProvider, streamSpeech } from "./ttsRouter";
import { languageForSpeech } from "./langDetector";
import { VOICEBOX_BASE } from "../avatar/types";

let voiceboxStub: http.Server;
let voiceboxPort = 0;
let hits = 0;

beforeAll(async () => {
  voiceboxStub = http.createServer((_req, res) => {
    hits += 1;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ status: "healthy", model_loaded: false }));
  });
  await new Promise<void>((resolve) => voiceboxStub.listen(0, "127.0.0.1", resolve));
  voiceboxPort = (voiceboxStub.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => voiceboxStub.close(() => resolve()));
  vi.unstubAllEnvs();
});

describe("language normalization", () => {
  it("maps shorthand to BCP-47 Indian forms", () => {
    expect(normalizeLanguage("te")).toBe("te-IN");
    expect(normalizeLanguage("hi-IN")).toBe("hi-IN");
    expect(normalizeLanguage("en-US")).toBe("en-IN");
    expect(normalizeLanguage()).toBe("en-IN");
  });
});

describe("provider selection (truthful)", () => {
  it("uses Voicebox Kokoro only for a language it declares", async () => {
    vi.stubEnv("VOICEBOX_URL", `http://127.0.0.1:${voiceboxPort}`);
    const beforeHits = hits;
    const sel = await selectTtsProvider("hi-IN", 800);
    expect(sel?.id).toBe("voicebox");
    expect(sel?.engine).toBe("kokoro");
    expect(hits).toBeGreaterThan(beforeHits); // real probe happened
  });

  it("does not claim Telugu support without an Indic backend", async () => {
    vi.stubEnv("VOICEBOX_URL", `http://127.0.0.1:${voiceboxPort}`);
    vi.stubEnv("INDIC_TTS_ENABLED", "false");
    vi.stubEnv("LINLY_ENABLED", "false");
    expect(await selectTtsProvider("te-IN", 800)).toBeNull();
  });

  it("does not send mixed-utterance Telugu to Kokoro, while English still uses Voicebox", async () => {
    vi.stubEnv("VOICEBOX_URL", `http://127.0.0.1:${voiceboxPort}`);
    vi.stubEnv("INDIC_TTS_ENABLED", "false");
    vi.stubEnv("LINLY_ENABLED", "false");
    expect(await selectTtsProvider(languageForSpeech("నమస్కారం. దయచేసి వేచి ఉండండి.", "en-IN"), 800)).toBeNull();
    expect((await selectTtsProvider(languageForSpeech("Please proceed according to your token number.", "te-IN"), 800))?.id).toBe("voicebox");
  });

  it("never selects an unreachable provider", async () => {
    vi.stubEnv("VOICEBOX_URL", "http://127.0.0.1:9/unreachable");
    const sel = await selectTtsProvider("en-IN", 500);
    expect(sel).toBeNull();
  });

  it("returns null when no provider is configured", async () => {
    vi.stubEnv("VOICEBOX_URL", "http://127.0.0.1:9/unreachable");
    vi.stubEnv("LINLY_ENABLED", "false");
    const sel = await selectTtsProvider("hi-IN", 500);
    expect(sel).toBeNull();
  });
});

describe("streamSpeech fallback", () => {
  it("signals text-only fallback when no provider is reachable (no fake audio)", async () => {
    vi.stubEnv("VOICEBOX_URL", "http://127.0.0.1:9/unreachable");
    const notices: string[] = [];
    const spoken = await streamSpeech("Hello patient.", "en-IN", {
      signal: new AbortController().signal,
      onAudio: async () => { throw new Error("should not be called"); },
      onNotice: (n) => notices.push(n.type),
    });
    expect(spoken.spoken).toBe(false);
    expect(spoken.chunks).toBe(0);
    expect(notices).toContain("tts_unavailable");
  });

  it("stops on cancellation mid-stream", async () => {
    vi.stubEnv("VOICEBOX_URL", `http://127.0.0.1:${voiceboxPort}`);
    const ac = new AbortController();
    ac.abort();
    const spoken = await streamSpeech("Stop me. Immediately.", "en-IN", {
      signal: ac.signal,
      onAudio: async () => {},
    });
    expect(spoken.chunks).toBe(0); // cancelled before any chunk was produced
  });
});

// Keep the base constant referenced so the real Voicebox URL contract stays visible.
void VOICEBOX_BASE;

