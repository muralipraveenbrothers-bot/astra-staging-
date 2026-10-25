import { describe, expect, it } from "vitest";
import { buildClinicalIngressSummary, evaluateRiskRadar } from "./clinicalIngress";

describe("clinical ingress Risk Radar", () => {
  it("RR 26 is High and names the fired rule", () => {
    const result = evaluateRiskRadar({ vitals: { bp: "120/80", respRate: 26, spo2: 98, pulse: 80 } });
    expect(result.risk).toBe("High");
    expect(result.firedRules).toContain("High: RR > 25");
  });

  it("SpO2 91 is High and names the fired rule", () => {
    const result = evaluateRiskRadar({ vitals: { bp: "120/80", respRate: 18, spo2: 91, pulse: 80 } });
    expect(result.risk).toBe("High");
    expect(result.firedRules).toContain("High: SpO2 < 92%");
  });

  it("SBP 89 is High and names the fired rule", () => {
    const result = evaluateRiskRadar({ vitals: { bp: "89/60", respRate: 18, spo2: 98, pulse: 80 } });
    expect(result.risk).toBe("High");
    expect(result.firedRules).toContain("High: SBP < 90 mmHg");
  });

  it("all normal is Low and names the low rule", () => {
    const result = evaluateRiskRadar({ vitals: { bp: "120/80", respRate: 18, spo2: 98, pulse: 80, temp: 98.6 } });
    expect(result.risk).toBe("Low");
    expect(result.firedRules).toContain("Low: no high or borderline rule fired");
  });

  it("SBP 78 shows Emergency Mode without creating orders", () => {
    const summary = buildClinicalIngressSummary({ vitals: { bp: "78/50", respRate: 18, spo2: 98, pulse: 80 } });
    expect(summary.statusBadge).toBe("Emergency Mode");
    expect(summary.emergencyReasons).toContain("SBP < 80 mmHg");
  });

  it("platelets 18,000 shows Emergency Mode", () => {
    const summary = buildClinicalIngressSummary({
      vitals: { bp: "120/80", respRate: 18, spo2: 98, pulse: 80 },
      labs: { platelets: 18000 },
    });
    expect(summary.statusBadge).toBe("Emergency Mode");
    expect(summary.emergencyReasons).toContain("Platelets < 20000/uL");
  });

  it("chest pain lists STEMI, aortic dissection and PE first", () => {
    const summary = buildClinicalIngressSummary({ chiefComplaints: "Acute chest pain for 2 hours" });
    expect(summary.redFlags.slice(0, 3).map((r) => r.name)).toEqual(["STEMI", "Aortic Dissection", "Pulmonary Embolism"]);
  });

  it("Surya scenario is Borderline with cellulitis red flags and infectious direction", () => {
    const summary = buildClinicalIngressSummary({
      name: "Surya",
      age: 65,
      gender: "Male",
      uhid: "UHID-SURYA",
      chiefComplaints: "red swollen painful right leg for 2 days",
      vitals: { pulse: 105, bp: "110/70", spo2: 97, respRate: 18, temp: 98.6 },
    });
    expect(summary.risk).toBe("Borderline");
    expect(summary.problemRepresentation).toContain("65-year-old male");
    expect(summary.redFlags.map((r) => r.name)).toEqual(expect.arrayContaining(["Necrotizing Fasciitis", "Sepsis"]));
    expect(summary.directions[0]).toEqual({ label: "Infectious/Inflammatory", percent: 85 });
  });

  it("missing vitals show not recorded markers and do not crash", () => {
    const summary = buildClinicalIngressSummary({ chiefComplaints: "stomoch pqain" });
    expect(summary.missingVitals).toEqual(expect.arrayContaining(["RR", "SpO2", "SBP", "HR"]));
    expect(summary.normalizedSymptoms).toContainEqual({ original: "stomoch pqain", normalized: "Abdominal Pain" });
  });
});
