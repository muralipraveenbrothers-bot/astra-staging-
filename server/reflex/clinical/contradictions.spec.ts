import { describe, expect, it } from "vitest";
import { findClinicalContradictions } from "./contradictions";

describe("clinical contradictions", () => {
  it("detects denied fever with high temperature and penicillin allergy with amoxicillin", () => {
    const rows = findClinicalContradictions({
      stateText: "SYNTHETIC history denies fever. Allergies: Penicillin. Active medications: Amoxicillin.",
      patient: { uhid: "SYN", allergies: ["Penicillin"], activeMeds: ["Amoxicillin"], vitals: [{ tempF: 101.5 }] },
      orders: [],
    });
    expect(rows.some((row) => row.text.includes("no fever"))).toBe(true);
    expect(rows.some((row) => row.text.includes("Allergy conflict"))).toBe(true);
  });
});
