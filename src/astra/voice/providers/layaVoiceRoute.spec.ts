import { describe, expect, it } from "vitest";
import { isRoutineLocalUtterance, planVoiceMouth, voiceboxLanguageTag } from "./layaVoiceRoute";

describe("planVoiceMouth — Sarvam, Gemini, then Voicebox", () => {
  it("keeps a short English line on Voicebox so the cloud APIs are not called", async () => {
    const plan = await planVoiceMouth("Opening the laboratory.");
    expect(plan.language).toBe("en-IN");
    expect(plan.reason).toBe("cloud-human");
    expect(plan.mouths).toEqual(["sarvam", "gemini-live", "openai-live", "voicebox-local"]);
  });

  it("speaks short Telugu and Hindi locally in that language", async () => {
    const telugu = await planVoiceMouth("నమస్కారం డాక్టర్");
    expect(telugu.language).toBe("te-IN");
    expect(telugu.mouths[0]).toBe("sarvam");
    expect(telugu.mouths).toContain("sarvam");

    const hindi = await planVoiceMouth("नमस्ते डॉक्टर");
    expect(hindi.language).toBe("hi-IN");
    expect(hindi.reason).toBe("cloud-human");
    expect(hindi.mouths[0]).toBe("sarvam");
  });

  it("sends a long answer to Sarvam, then Gemini, then Voicebox", async () => {
    const text =
      "I will walk you through how the command board is organised this morning, " +
      "which counters are open, and how to ask for the ward list, the pharmacy counter, " +
      "or the reception desk without leaving this screen. Tell me which board you want first.";
    expect(isRoutineLocalUtterance(text)).toBe(false);
    const plan = await planVoiceMouth(text);
    expect(plan.reason).toBe("cloud-human");
    expect(plan.mouths).toEqual(["sarvam", "gemini-live", "openai-live", "voicebox-local"]);
  });

  it("keeps identifiable clinical speech on the local mouth", async () => {
    const plan = await planVoiceMouth("Give the haemoglobin report for bed 12, the value is 7.2");
    expect(plan.reason).toBe("phi-local");
    expect(plan.mouths).toEqual(["voicebox-local"]);
  });

  it("maps an explicit language hint when the text has no script", () => {
    expect(voiceboxLanguageTag("12", "te-IN")).toBe("te-IN");
    expect(voiceboxLanguageTag("12", "hi-IN")).toBe("hi-IN");
    expect(voiceboxLanguageTag("12", "en-IN")).toBe("en-IN");
  });
});
