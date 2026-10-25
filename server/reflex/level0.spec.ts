import { describe, expect, it } from "vitest";
import { applyLevel0Answer, evaluateLevel0 } from "./level0";

describe("level0", () => {
  it("forces emergency for chest pain in English, Telugu and Hindi even if Laya said routine", () => {
    for (const text of ["chest pain since morning", "ఛాతీ నొప్పి", "सीने में दर्द"]) {
      const level0 = evaluateLevel0({ text });
      expect(applyLevel0Answer("urgency", "routine", level0)).toEqual({ answer: "emergency", source: "level0" });
    }
  });

  it("blocks a prescription when a penicillin allergy hard stop fires", () => {
    const level0 = evaluateLevel0({ medication: { drug: "Amoxicillin", dose: "500 mg", allergies: ["penicillin"], patientId: "SYNTHETIC" } });
    expect(level0.hardStops).toContain("medication-allergy");
    expect(level0.forcedAnswers.prescribe).toBe("blocked");
    expect(applyLevel0Answer("prescribe", "allow", level0).source).toBe("level0");
  });
});
