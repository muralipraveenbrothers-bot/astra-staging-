/**
 * ASTRA AI — Personality inheritance + multilingual behaviour.
 * ==========================================================
 * One global Astra human personality, per-dashboard specialist overlays, and
 * humour that is suppressed exactly when the situation is serious.
 */
import { describe, it, expect } from "vitest";
import {
  GLOBAL_PERSONALITY,
  ROLE_OVERLAYS,
  buildVoiceSystemPrompt,
  overlaySummary,
  shouldSuppressHumour,
  spokenLengthRule,
} from "./roleOverlays";
import { detectAstraLanguage, isRomanised } from "./language";
import type { AstraDashboard } from "./contracts";

const DASHBOARDS = Object.keys(ROLE_OVERLAYS) as AstraDashboard[];

describe("personality inheritance — one Astra, many overlays", () => {
  it("carries the shared human personality into every dashboard prompt", () => {
    for (const dashboard of DASHBOARDS) {
      const prompt = buildVoiceSystemPrompt({ dashboard, language: "en", risk: "normal" });
      expect(prompt, dashboard).toContain("[ROLE]");
      expect(prompt, dashboard).toContain("[WORKSPACE OVERLAY]");
      expect(prompt, dashboard).toContain("[TASK]");
      expect(prompt, dashboard).toContain("[INSTRUCTIONS]");
      expect(prompt, dashboard).toContain("warm, lively, intelligent");
    }
  });

  it("keeps the doctor workspace clinical and the OT workspace operational", () => {
    expect(ROLE_OVERLAYS.doctor).toMatch(/CLINICAL COMMAND CENTRE/);
    expect(ROLE_OVERLAYS.ot).toMatch(/concise and operational/i);
    expect(spokenLengthRule("ot")).toMatch(/crisp/i);
  });

  it("never lets a dashboard invent patient data", () => {
    for (const dashboard of DASHBOARDS) {
      const prompt = buildVoiceSystemPrompt({ dashboard, language: "en", risk: "normal" });
      expect(prompt, dashboard).toMatch(/never fabricate/i);
    }
  });

  it("allows a longer spoken answer only when the user asks for full detail", () => {
    expect(spokenLengthRule("doctor")).toMatch(/1-3 short sentences/);
    expect(spokenLengthRule("doctor", true)).toMatch(/longer spoken explanation/);
  });

  it("suppresses humour in emergencies, bad news and conflicts", () => {
    expect(shouldSuppressHumour({ text: "patient unconscious, code blue" })).toBe(true);
    expect(shouldSuppressHumour({ text: "the patient died this morning" })).toBe(true);
    expect(shouldSuppressHumour({ text: "angry patient dispute about refund" })).toBe(true);
    expect(shouldSuppressHumour({ text: "how are you today Astra?" })).toBe(false);
  });

  it("suppresses humour whenever the risk classification is clinical", () => {
    expect(shouldSuppressHumour({ risk: "high_clinical" })).toBe(true);
    expect(shouldSuppressHumour({ risk: "clinical" })).toBe(true);
  });

  it("marks the prompt when humour is suppressed", () => {
    const prompt = buildVoiceSystemPrompt({
      dashboard: "doctor",
      language: "en",
      risk: "high_clinical",
      userText: "patient is deteriorating",
    });
    expect(prompt).toContain("HUMOUR SUPPRESSED");
  });

  it("keeps the shared personality text stable", () => {
    expect(GLOBAL_PERSONALITY).toMatch(/never fabricate/i);
    expect(GLOBAL_PERSONALITY).toMatch(/1-3 short sentences/i);
  });

  it("returns a one-line summary per overlay", () => {
    for (const dashboard of DASHBOARDS) expect(overlaySummary(dashboard).length).toBeGreaterThan(0);
  });
});

describe("language detection — Telugu, Hindi, English, Tenglish, Hinglish", () => {
  it("detects native scripts", () => {
    expect(detectAstraLanguage("బెడ్ 3 రిపోర్ట్ చూపించు")).toBe("te");
    expect(detectAstraLanguage("पोटैशियम कितना है?")).toBe("hi");
  });

  it("detects romanised mixes staff actually type", () => {
    expect(detectAstraLanguage("bed 3 report chupinchu cheppandi")).toBe("tenglish");
    expect(detectAstraLanguage("potassium kitna hai batao")).toBe("hinglish");
  });

  it("keeps plain English as English", () => {
    expect(detectAstraLanguage("Show me today's pending payments")).toBe("en");
  });

  it("handles empty input safely", () => {
    expect(detectAstraLanguage("")).toBe("en");
    expect(detectAstraLanguage(undefined as unknown as string)).toBe("en");
  });

  it("flags only the romanised mixes as romanised", () => {
    expect(isRomanised("tenglish")).toBe(true);
    expect(isRomanised("hinglish")).toBe(true);
    expect(isRomanised("te")).toBe(false);
    expect(isRomanised("en")).toBe(false);
  });
});