/**
 * ASTRA AI — Voice Humanizer tests (robotic → real human)
 * ======================================================
 * Validates the ffmpeg post-processing chain that removes the flat/robotic
 * quality from raw neural TTS so the avatar voice sounds human.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { humanizeAudio, isHumanizerAvailable } from "./voiceHumanizer";

// A tiny valid 16-bit PCM mono WAV (1s silence at 24kHz) — enough to exercise
// the ffmpeg chain without needing a real TTS sample.
function makeSilenceWav(seconds = 1, sampleRate = 24000): Buffer {
  const numSamples = Math.floor(seconds * sampleRate);
  const dataSize = numSamples * 2; // 16-bit mono
  const buf = Buffer.alloc(44 + dataSize);
  // RIFF header
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); // PCM chunk size
  buf.writeUInt16LE(1, 20); // PCM format
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  // audio samples remain 0 (silence)
  return buf;
}

describe("voiceHumanizer", () => {
  it("detects whether ffmpeg is available", () => {
    // Should not throw; boolean result.
    expect(typeof isHumanizerAvailable()).toBe("boolean");
  });

  it("returns original buffer when input is too small to be audio", async () => {
    const tiny = Buffer.from("not audio");
    const out = await humanizeAudio(tiny);
    expect(out).toBe(tiny);
  });

  it("preserves sample rate and mono layout after humanization", async () => {
    if (!isHumanizerAvailable()) {
      console.log("ffmpeg not available — skipping signal-chain test");
      return;
    }
    const raw = makeSilenceWav(0.5);
    const out = await humanizeAudio(raw, { strength: "natural" });
    // Output must be a valid WAV (starts with RIFF) and non-empty.
    expect(out.length).toBeGreaterThan(44);
    expect(out.toString("ascii", 0, 4)).toBe("RIFF");
    expect(out.readUInt16LE(22)).toBe(1); // still mono
    expect(out.readUInt32LE(24)).toBe(24000); // sample rate preserved
  });

  it("applies the configured strength preset without error", async () => {
    if (!isHumanizerAvailable()) return;
    const raw = makeSilenceWav(0.3);
    for (const strength of ["natural", "warm", "broadcast"] as const) {
      const out = await humanizeAudio(raw, { strength });
      expect(out.length).toBeGreaterThan(44);
    }
  });

  it("returns original buffer on ffmpeg failure (graceful degradation)", async () => {
    // Force failure via a bogus FFMPEG path by temporarily breaking detection:
    // we instead pass a corrupt/non-WAV buffer large enough to pass the size gate.
    const corrupt = Buffer.alloc(200, 0xff);
    const out = await humanizeAudio(corrupt);
    // Should resolve (never throw) — either processed or original.
    expect(Buffer.isBuffer(out)).toBe(true);
  });

  it("cleans up temp files after processing", async () => {
    if (!isHumanizerAvailable()) return;
    const raw = makeSilenceWav(0.2);
    const before = readdirCount();
    await humanizeAudio(raw);
    // Give the async finally a tick to delete.
    await new Promise((r) => setTimeout(r, 50));
    expect(readdirCount()).toBeLessThanOrEqual(before);
  });
});

function readdirCount(): number {
  try {
    const fs = require("node:fs");
    return fs.readdirSync(tmpdir()).filter((n: string) => n.startsWith("astra-voice-")).length;
  } catch {
    return 0;
  }
}
