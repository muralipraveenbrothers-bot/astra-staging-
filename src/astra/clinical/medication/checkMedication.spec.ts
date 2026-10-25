import { beforeEach, describe, expect, it } from "vitest";
import {
  checkMedication,
  defaultMedicationRules,
  importMedicationRules,
  RULES_REVIEW_BANNER,
} from "./checkMedication";
import {
  _resetMedicationDraftForTest,
  confirmMedicationDraft,
  getOverrideAudit,
  MEDICATION_DRAFT_CONFIRMED_EVENT,
  recordOverride,
} from "./medicationDraft";
import { SHIELD_AUDIO, shieldCue } from "./shield";
import { audienceFields, sortMedicationSuggestions } from "./sortSuggestions";
import { clearBuyAlerts, getBuyAlerts, reviewOutOfStock } from "./stockCheck";
import type { DraftMedicationItem, MedicationDraft, MedicationFinding, RankedSuggestion, StockItem } from "./types";

const patient = "UHID-TEST-R504";

function item(patch: Partial<DraftMedicationItem> = {}): DraftMedicationItem {
  return {
    id: "item-1",
    drug: "Paracetamol",
    dose: "500 mg",
    route: "PO",
    frequency: "TID",
    duration: "3 days",
    source: "typed",
    selected: true,
    ...patch,
  };
}

function draft(items: DraftMedicationItem[]): MedicationDraft {
  return {
    id: "draft-1",
    patientId: patient,
    patientName: "Test Patient",
    items,
    allergiesText: "",
    currentMedicationsText: "",
    egfrText: "",
    creatinineText: "",
    altText: "",
    astText: "",
    status: "editing",
  };
}

function approvedLink(patientId = patient) {
  return { decisionId: "dec-r504", approved: true, patientId, kind: "medication" };
}

beforeEach(() => {
  _resetMedicationDraftForTest();
  clearBuyAlerts();
});

describe("R5-04 medication safety rules", () => {
  it("keeps the doctor and pharmacist review warning", () => {
    expect(defaultMedicationRules.banner).toBe(RULES_REVIEW_BANNER);
    expect(defaultMedicationRules.banner).toContain("REVIEW REQUIRED BY DOCTOR/PHARMACIST BEFORE CLINICAL USE");
  });

  it("flags amoxicillin-clavulanate for a penicillin allergy at the severity in the rules file", () => {
    const rule = defaultMedicationRules.allergy[0];
    const findings = checkMedication(
      { drug: "Amoxicillin-Clavulanate", dose: "625 mg", frequency: "TID" },
      { patientId: patient, allergies: ["Penicillin"], currentMedications: [] },
    );
    expect(findings.map((finding) => finding.ruleId)).toContain(rule.id);
    expect(findings.find((finding) => finding.ruleId === rule.id)?.severity).toBe(rule.severity);
    expect(findings.find((finding) => finding.ruleId === rule.id)?.suggestionOnly).toBe("erythromycin");
  });

  it("treats Augmentin as the same source example and does not add erythromycin by itself", () => {
    const findings = checkMedication(
      { drug: "Augmentin 625", dose: "625 mg", frequency: "TID" },
      { patientId: patient, allergies: ["penicillin"], currentMedications: [] },
    );
    expect(findings.some((finding) => finding.suggestionOnly === "erythromycin")).toBe(true);
    expect(findings.every((finding) => finding.dataUsed.drug === "Augmentin 625")).toBe(true);
  });

  it("flags warfarin plus aspirin as a bleeding risk", () => {
    const findings = checkMedication(
      { drug: "Aspirin 75 mg", dose: "75 mg", frequency: "OD" },
      { patientId: patient, allergies: [], currentMedications: ["Warfarin 5 mg"] },
    );
    expect(findings.some((finding) => finding.ruleId === "interaction.warfarin.aspirin" && /bleeding risk/i.test(finding.message))).toBe(true);
  });

  it("asks to monitor INR when an antibiotic is added for a warfarin patient", () => {
    const findings = checkMedication(
      { drug: "Amoxicillin-Clavulanate", dose: "625 mg", frequency: "TID" },
      { patientId: patient, allergies: [], currentMedications: ["warfarin"] },
    );
    expect(findings.some((finding) => finding.ruleId === "interaction.warfarin.antibiotic" && /monitor INR/i.test(finding.message))).toBe(true);
  });

  it("treats paracetamol 5000 mg as an orange typo check and 500 mg as no dose finding", () => {
    const high = checkMedication(
      { drug: "Paracetamol", dose: "5000 mg", frequency: "OD" },
      { patientId: patient, allergies: [], currentMedications: [] },
    );
    const usual = checkMedication(
      { drug: "Paracetamol", dose: "500 mg", frequency: "TID" },
      { patientId: patient, allergies: [], currentMedications: [] },
    );
    expect(high).toEqual([
      expect.objectContaining({
        severity: "orange",
        ruleId: "dose.paracetamol.single.example",
        message: "Did you mean a high dose, or is that a typo?",
      }),
    ]);
    expect(usual.filter((finding) => finding.ruleId.startsWith("dose."))).toEqual([]);
  });

  it("flags eGFR 25 for the seeded renal-rule drug", () => {
    const low = checkMedication(
      { drug: "renal-rule-example", dose: "10 mg", frequency: "OD" },
      { patientId: patient, allergies: [], currentMedications: [], egfr: 25 },
    );
    const steady = checkMedication(
      { drug: "renal-rule-example", dose: "10 mg", frequency: "OD" },
      { patientId: patient, allergies: [], currentMedications: [], egfr: 40 },
    );
    expect(low.some((finding) => finding.ruleId === "renal.gfr-lt-30.example" && finding.message.includes("GFR <30"))).toBe(true);
    expect(steady.some((finding) => finding.ruleId === "renal.gfr-lt-30.example")).toBe(false);
  });

  it("returns findings synchronously and does not wrap them in a promise", () => {
    const result = checkMedication(
      { drug: "Paracetamol", dose: "500 mg" },
      { patientId: patient, allergies: [], currentMedications: [] },
    );
    expect(Array.isArray(result)).toBe(true);
    expect(result).not.toBeInstanceOf(Promise);
  });

  it("imports an extra rule and refuses a file with the review warning removed", () => {
    const extended = importMedicationRules({
      renalHepatic: [{
        id: "hepatic.alt.example",
        drugNames: ["hepatic-rule-example"],
        altAbove: 80,
        severity: "orange",
        message: "Liver threshold example imported by the doctor.",
        overrideAllowed: false,
      }],
    });
    const findings = checkMedication(
      { drug: "hepatic-rule-example", dose: "10 mg" },
      { patientId: patient, allergies: [], currentMedications: [], alt: 120 },
      extended,
    );
    expect(findings.map((finding) => finding.ruleId)).toContain("hepatic.alt.example");
    expect(extended.banner).toContain(RULES_REVIEW_BANNER);
    expect(() => importMedicationRules({ banner: "cleared for use" })).toThrow(/review warning/i);
    expect(() => importMedicationRules({ allergy: [{ id: "bad", allergen: "x", drugNames: ["drugname"], severity: "critical", message: "no", overrideAllowed: false }] })).toThrow();
  });
});

describe("R5-04 confirm gate, shield, stock, and sort", () => {
  it("disables confirm on a red finding, then logs an allowed override with doctor id and time", () => {
    const rules = importMedicationRules({
      lethalPairs: [{
        id: "lethal.example.override",
        pair: ["example-drug-a", "example-drug-b"],
        severity: "red",
        overrideAllowed: true,
        enabled: true,
        message: "Example lethal pair blocks confirm until a doctor records a reason.",
      }],
    });
    const line = item({ drug: "example-drug-a", dose: "10 mg" });
    const findings = checkMedication(line, { patientId: patient, allergies: [], currentMedications: ["example-drug-b"] }, rules);
    const red = findings.find((finding) => finding.severity === "red");
    expect(red?.overrideAllowed).toBe(true);

    const blocked = confirmMedicationDraft({
      draft: draft([line]),
      actorId: "dr-murali",
      actorRole: "doctor",
      findingsByItemId: { [line.id]: findings },
      overrides: [],
      approval: approvedLink(),
    });
    expect(blocked.ok).toBe(false);

    const logged = recordOverride({
      itemId: line.id,
      ruleId: red!.ruleId,
      doctorId: "dr-murali",
      reason: "Consultant reviewed the pair and documented the reason.",
      drug: line.drug,
      dose: line.dose,
      overrideAllowed: true,
      at: "2026-09-28T10:15:00.000Z",
    });
    expect(logged.ok).toBe(true);
    expect(getOverrideAudit()).toEqual([
      expect.objectContaining({ doctorId: "dr-murali", at: "2026-09-28T10:15:00.000Z", ruleId: "lethal.example.override" }),
    ]);

    const allowed = confirmMedicationDraft({
      draft: draft([line]),
      actorId: "dr-murali",
      actorRole: "doctor",
      findingsByItemId: { [line.id]: findings },
      overrides: getOverrideAudit(),
      approval: approvedLink(),
      now: "2026-09-28T10:16:00.000Z",
    });
    expect(allowed.ok).toBe(true);
    if (allowed.ok) expect(allowed.event).toBe(MEDICATION_DRAFT_CONFIRMED_EVENT);
  });

  it("keeps confirm blocked when the red rule does not allow an override", () => {
    const line = item({ drug: "Paracetamol", dose: "0 mg" });
    const findings = checkMedication(line, { patientId: patient, allergies: [], currentMedications: [] });
    expect(findings.some((finding) => finding.severity === "red" && finding.overrideAllowed === false)).toBe(true);
    const denied = recordOverride({
      itemId: line.id,
      ruleId: "dose.non-positive",
      doctorId: "dr-murali",
      reason: "Still trying to override.",
      drug: line.drug,
      dose: line.dose,
      overrideAllowed: false,
    });
    expect(denied.ok).toBe(false);
    expect(getOverrideAudit()).toEqual([]);
    const blocked = confirmMedicationDraft({
      draft: draft([line]),
      actorId: "dr-murali",
      actorRole: "doctor",
      findingsByItemId: { [line.id]: findings },
      overrides: [],
      approval: approvedLink(),
    });
    expect(blocked.ok).toBe(false);
  });

  it("does not block confirm for an orange finding and withholds an unticked AI suggestion", () => {
    const typed = item({ id: "typed", drug: "Paracetamol", dose: "5000 mg" });
    const suggested = item({ id: "ai", drug: "Aspirin", dose: "75 mg", source: "ai-suggested", selected: false });
    const findings: Record<string, MedicationFinding[]> = {
      typed: checkMedication(typed, { patientId: patient, allergies: [], currentMedications: [] }),
      ai: [],
    };
    expect(findings.typed[0]?.severity).toBe("orange");
    const result = confirmMedicationDraft({
      draft: draft([typed, suggested]),
      actorId: "dr-murali",
      actorRole: "doctor",
      findingsByItemId: findings,
      overrides: [],
      approval: approvedLink(),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.draft.items.map((row) => row.id)).toEqual(["typed"]);
      expect(result.withheld.map((row) => row.id)).toEqual(["ai"]);
    }
  });

  it("refuses confirm without a medication approval or from a non-doctor", () => {
    const line = item();
    const missing = confirmMedicationDraft({
      draft: draft([line]),
      actorId: "dr-murali",
      actorRole: "doctor",
      findingsByItemId: { [line.id]: [] },
      overrides: [],
      approval: { decisionId: "dec-x", approved: false, patientId: patient, kind: "medication" },
    });
    const pharmacy = confirmMedicationDraft({
      draft: draft([line]),
      actorId: "pharmacy",
      actorRole: "pharmacy",
      findingsByItemId: { [line.id]: [] },
      overrides: [],
      approval: approvedLink(),
    });
    expect(missing.ok).toBe(false);
    expect(pharmacy.ok).toBe(false);
  });

  it("keeps an orange shield silent", () => {
    const cue = shieldCue([{
      severity: "orange",
      ruleId: "dose.paracetamol.single.example",
      message: "Did you mean a high dose, or is that a typo?",
      dataUsed: {},
      overrideAllowed: false,
    }]);
    expect(cue.tone).toBe("orange");
    expect(cue.playsAudio).toBe(false);
    expect(cue.bubbleText).toContain("typo");
    expect(SHIELD_AUDIO).toBe("off");
  });

  it("offers an unchecked same-molecule suggestion and raises one buy alert", () => {
    const inventory: StockItem[] = [
      { id: "zero", name: "Paracetamol 500", salt: "Paracetamol", stock: 0, unitPrice: 2, mrp: 5, hospitalMargin: 3 },
      { id: "dolo", name: "Dolo 650mg", salt: "Paracetamol 650mg", stock: 40, unitPrice: 1.4, mrp: 2.5, hospitalMargin: 1.1 },
    ];
    const first = reviewOutOfStock("Paracetamol 500", inventory, "2026-09-28T11:00:00.000Z");
    const second = reviewOutOfStock("Paracetamol 500", inventory, "2026-09-28T11:05:00.000Z");
    expect(first.notice?.note).toBe("out of stock");
    expect(first.notice?.blocksConfirm).toBe(false);
    expect(first.notice?.suggestion).toEqual({
      id: "dolo",
      drug: "Dolo 650mg",
      molecule: "paracetamol",
      checked: false,
      patientPrice: 1.4,
    });
    expect(first.buyAlert?.forRole).toBe("pharmacist");
    expect(getBuyAlerts()).toHaveLength(1);
    expect(second.buyAlert?.id).toBe(first.buyAlert?.id);
  });

  it("sorts the doctor view by safety, stock, and patient price, never by margin", () => {
    const rows: RankedSuggestion[] = [
      { id: "high-margin", label: "Expensive", findings: [], inStock: true, patientPrice: 100, hospitalMargin: 80 },
      { id: "low-margin", label: "Cheaper", findings: [], inStock: true, patientPrice: 10, hospitalMargin: 1 },
      { id: "orange", label: "Caution", findings: [{ severity: "orange", ruleId: "o", message: "caution", dataUsed: {}, overrideAllowed: false }], inStock: true, patientPrice: 1, hospitalMargin: 50 },
      { id: "red", label: "Blocked", findings: [{ severity: "red", ruleId: "r", message: "stop", dataUsed: {}, overrideAllowed: false }], inStock: true, patientPrice: 1, hospitalMargin: 90 },
      { id: "out", label: "Missing", findings: [], inStock: false, patientPrice: 1, hospitalMargin: 70 },
    ];
    expect(sortMedicationSuggestions(rows, "doctor").map((row) => row.id)).toEqual([
      "low-margin",
      "high-margin",
      "out",
      "orange",
      "red",
    ]);
    expect(audienceFields("doctor")).toEqual(["patientPrice"]);
    expect(audienceFields("billing")).toEqual(["patientPrice"]);
    expect(audienceFields("pharmacy")).toContain("hospitalMargin");
    expect(audienceFields("admin")).toContain("hospitalMargin");
  });
});
