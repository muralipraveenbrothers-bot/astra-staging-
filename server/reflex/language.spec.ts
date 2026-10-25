import { describe, expect, it } from "vitest";
import { detectLanguage, pickCheckpoint } from "./language";

describe("reflex language detection", () => {
  it("routes Telugu script to multilingual", () => {
    const detected = detectLanguage("నాకు జ్వరం ఉంది");
    expect(detected).toMatchObject({ lang: "te", script: "telugu" });
    expect(pickCheckpoint(detected)).toBe("multilingual");
  });

  it("routes Hindi script to multilingual", () => {
    const detected = detectLanguage("मुझे बुखार है");
    expect(detected).toMatchObject({ lang: "hi", script: "devanagari" });
    expect(pickCheckpoint(detected)).toBe("multilingual");
  });

  it("routes romanized Telugu to multilingual", () => {
    const detected = detectLanguage("naku jwaram undi");
    expect(detected).toMatchObject({ lang: "te", romanized: true });
    expect(pickCheckpoint(detected)).toBe("multilingual");
  });

  it("routes English to english", () => {
    const detected = detectLanguage("I have fever");
    expect(detected).toMatchObject({ lang: "en" });
    expect(pickCheckpoint(detected)).toBe("english");
  });
});
