import { describe, expect, it } from "vitest";
import { compareTreatments } from "./treatmentComparison";

describe("treatment comparison", () => {
  it("puts a penicillin allergy finding on amoxicillin and does not select an option", () => {
    const [row] = compareTreatments({
      candidates: [{ option: "amoxicillin", source: "doctor", whyItFits: ["doctor entered this option"] }],
      context: { patientId: "SYNTHETIC", allergies: ["penicillin"], currentMedications: [] },
    });
    expect(row.avoidBecause.join(" ")).toMatch(/penicillin/i);
    expect(row).not.toHaveProperty("selected");
    expect(JSON.stringify(row)).not.toMatch(/probability|rank|chosen/i);
    expect(() => compareTreatments({
      candidates: [{ option: "amoxicillin", source: "laya" as never }],
      context: { patientId: "SYNTHETIC", allergies: [], currentMedications: [] },
    })).toThrow(/not allowed/);
  });
});
