import { describe, expect, it } from "vitest";
import { buildClinicalState } from "./caseStateBuilder";

describe("caseStateBuilder", () => {
  it("builds compact de-identified synthetic state with meds and allergies", () => {
    const out = buildClinicalState({
      patientId: "SYNTHETIC",
      patient: {
        id: "P-SYN",
        uhid: "UHID-SECRET-1",
        name: "Synthetic Name",
        phone: "+919999999999",
        address: "Hidden Street",
        age: 48,
        gender: "male",
        chiefComplaint: "Chest pain for 2 hours",
        allergies: ["Penicillin"],
        activeMeds: ["Aspirin"],
        vitals: [{ heartRate: 112, spo2: 94, bpSys: 100, bpDia: 70, tempF: 98.6 }],
      },
      orders: [{ category: "pharmacy", item: "Amoxicillin" }, { category: "laboratory", item: "Troponin", result: "pending" }],
      mitraHandoff: { chiefComplaint: "Chest pain", onset: "2 hours", language: "en", consentFlag: true },
    });
    expect(out.text).not.toContain("Synthetic Name");
    expect(out.text).not.toContain("+919999999999");
    expect(out.text).not.toContain("UHID-SECRET-1");
    expect(out.text).not.toContain("Hidden Street");
    expect(out.text.length / 4).toBeLessThanOrEqual(1024);
    expect(out.text).toContain("Penicillin");
    expect(out.text).toContain("Aspirin");
  });
});
