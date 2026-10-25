/**
 * ASTRA AI — Language detection tests (§5 / §14 / §36)
 * ====================================================
 * Server-side detection must match the client engine's behavior for Indian
 * scripts, and must never return a language Astra cannot render.
 */
import { describe, it, expect } from "vitest";
import { detectLanguage, resolveLanguage, languageForSpeech } from "./langDetector";

describe("langDetector — script detection", () => {
  it("detects Telugu script", () => {
    expect(detectLanguage("నమస్కారం. నేను ఆస్ట్రా సహాయకుడిని.").lang).toBe("te-IN");
  });
  it("detects Hindi (Devanagari) script", () => {
    expect(detectLanguage("नमस्कार। मैं एस्ट्रा सहायक हूँ।").lang).toBe("hi-IN");
  });
  it("detects Tamil script", () => {
    expect(detectLanguage("வணக்கம், நான் ஆஸ்திரா.").lang).toBe("ta-IN");
  });
  it("detects Kannada script", () => {
    expect(detectLanguage("ನಮಸ್ಕಾರ, ನಾನು ಆಸ್ಟ್ರಾ.").lang).toBe("kn-IN");
  });
  it("falls back to English for Latin script", () => {
    const r = detectLanguage("Hello. I am the Astra assistant.");
    expect(r.lang).toBe("en-IN");
    expect(r.source).toBe("fallback");
  });
  it("handles empty/undefined input safely", () => {
    expect(detectLanguage("").lang).toBe("en-IN");
    expect(detectLanguage(undefined as unknown as string).lang).toBe("en-IN");
  });
  it("routes mixed Telugu script + English to Telugu", () => {
    const r = detectLanguage("Attention please. నమస్కారం. OPD is now active.");
    expect(r.lang).toBe("te-IN");
    expect(r.source).toBe("script");
  });
  it("routes mixed Hindi script + English to Hindi", () => {
    const r = detectLanguage("Hello doctor, नमस्ते, blood pressure is high.");
    expect(r.lang).toBe("hi-IN");
    expect(r.source).toBe("script");
  });
  it("picks the dominant script in mixed Telugu + Hindi", () => {
    expect(detectLanguage("నమస్కారం नमस्ते తెలుగు మాట").lang).toBe("te-IN");
  });
});

describe("langDetector — transliteration and mixed Latin", () => {
  it("detects Telugu transliteration", () => {
    expect(detectLanguage("Namaskaram doctor, ela unnaru, BP entha undi?").lang).toBe("te-IN");
  });
  it("detects Hindi transliteration", () => {
    expect(detectLanguage("Namaste doctor, BP kya hai?").lang).toBe("hi-IN");
  });
  it("keeps English when Indic tokens are absent", () => {
    expect(detectLanguage("Please proceed according to your token number.").lang).toBe("en-IN");
  });
});

describe("langDetector — resolveLanguage", () => {
  it("explicit language always wins", () => {
    expect(resolveLanguage("hi-IN", "నమస్కారం")).toBe("hi-IN");
  });
  it("detects from text when no explicit language", () => {
    expect(resolveLanguage(undefined, "నమస్కారం. నేను ఆస్ట్రా సహాయకుడిని.")).toBe("te-IN");
    expect(resolveLanguage(undefined, "नमस्कार। मैं एस्ट्रा सहायक हूँ।")).toBe("hi-IN");
    expect(resolveLanguage(undefined, "Hello doctor")).toBe("en-IN");
  });
  it("defaults to English when nothing is available", () => {
    expect(resolveLanguage()).toBe("en-IN");
  });
});

describe("langDetector — mixed sentence routing", () => {
  it("does not send a Latin English sentence to Telugu", () => {
    expect(languageForSpeech("Please proceed according to your token number.", "te-IN")).toBe("en-IN");
  });
  it("keeps Telugu script sentences on Telugu even in an English conversation", () => {
    expect(languageForSpeech("నమస్కారం. దయచేసి వేచి ఉండండి.", "en-IN")).toBe("te-IN");
  });
  it("keeps Hindi token sentences on Hindi", () => {
    expect(languageForSpeech("Namaste doctor, BP kya hai?", "en-IN")).toBe("hi-IN");
  });
});
