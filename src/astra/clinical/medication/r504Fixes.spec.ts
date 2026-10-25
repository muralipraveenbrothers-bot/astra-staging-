import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkMedication, doseHasNumberWithoutUnit } from "./checkMedication";
import {
  _resetMedicationDraftForTest,
  flushOverrideAuditQueue,
  pendingOverrideAuditQueue,
  recordOverrideWithServerAudit,
} from "./medicationDraft";
import { applyPrefill, loadMedicationPrefill, prefillFromSnapshot } from "./patientSnapshot";
import type { MedicationDraft, MedicationFinding } from "./types";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

class MemoryStorage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(key: string) { return this.data.has(key) ? this.data.get(key)! : null; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string) { this.data.delete(key); }
  setItem(key: string, value: string) { this.data.set(key, String(value)); }
}

const context = { patientId: "UHID-R504", allergies: [] as string[], currentMedications: [] as string[] };

describe("R5-04 fix: dose with no unit", () => {
  it("raises an orange 'unit missing' finding instead of silently skipping dose checks", () => {
    const findings = checkMedication({ drug: "Paracetamol", dose: "500", frequency: "TID" }, context);
    const unit = findings.find((f) => f.ruleId === "dose.unit-missing");
    expect(unit?.severity).toBe("orange");
    expect(unit?.message).toMatch(/unit missing/i);
    expect(unit?.message).toMatch(/confirm dose/i);
  });

  it("does not flag doses that carry a unit", () => {
    for (const dose of ["500 mg", "0.5g", "250mcg", "1 tab", "5 ml", "2 puffs", "10 units"]) {
      expect(doseHasNumberWithoutUnit(dose)).toBe(false);
    }
    expect(doseHasNumberWithoutUnit("")).toBe(false);
    expect(doseHasNumberWithoutUnit("as directed")).toBe(false);
    expect(doseHasNumberWithoutUnit("650")).toBe(true);
    expect(checkMedication({ drug: "Paracetamol", dose: "500 mg", frequency: "TID" }, context).some((f) => f.ruleId === "dose.unit-missing")).toBe(false);
  });
});

describe("R5-04 fix: penicillin allergy catches plain amoxicillin", () => {
  it.each(["Amoxicillin", "amoxicillin 500 mg", "Ampicillin", "Piperacillin tazobactam", "Augmentin 625"])("flags %s for a penicillin allergy", (drug) => {
    const findings = checkMedication({ drug, dose: "500 mg", frequency: "TID" }, { ...context, allergies: ["Penicillin"] });
    expect(findings.some((f) => f.ruleId.startsWith("allergy.penicillin"))).toBe(true);
  });

  it("does not flag amoxicillin when there is no penicillin allergy", () => {
    const findings = checkMedication({ drug: "Amoxicillin", dose: "500 mg", frequency: "TID" }, { ...context, allergies: ["Sulfa"] });
    expect(findings.some((f) => f.ruleId.startsWith("allergy.penicillin"))).toBe(false);
  });
});

describe("R5-04 fix: override audit goes to the server AI decision log", () => {
  const finding: MedicationFinding = { severity: "red", ruleId: "lethal.example", message: "Example red finding", dataUsed: {}, overrideAllowed: true };
  const base = { patientId: "UHID-R504", itemId: "item-1", ruleId: "lethal.example", doctorId: "doc-1", reason: "Benefit outweighs risk", drug: "Drug", dose: "10 mg", overrideAllowed: true };

  beforeEach(() => {
    vi.stubGlobal("localStorage", new MemoryStorage());
    _resetMedicationDraftForTest();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the override (who, what, reason) to /api/clinical/approval/suggestion", async () => {
    const fetcher = vi.fn(async () => json(201, { ok: true }));
    const result = await recordOverrideWithServerAudit({ ...base, finding, fetcher });
    expect(result.ok).toBe(true);
    expect(result.serverLogged).toBe(true);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/clinical/approval/suggestion");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ patientId: "UHID-R504", kind: "medication", source: "medication-safety-override" });
    expect(body.payload).toMatchObject({ type: "MEDICATION_SAFETY_OVERRIDE", ruleId: "lethal.example", doctorId: "doc-1", reason: "Benefit outweighs risk" });
    expect(pendingOverrideAuditQueue()).toHaveLength(0);
  });

  it("keeps localStorage only as an offline queue and flushes it when the server is back", async () => {
    const offline = vi.fn(async () => { throw new Error("offline"); });
    const result = await recordOverrideWithServerAudit({ ...base, finding, fetcher: offline });
    expect(result.ok).toBe(true);
    expect(result.serverLogged).toBe(false);
    expect(pendingOverrideAuditQueue()).toHaveLength(1);

    const online = vi.fn(async () => json(201, { ok: true }));
    expect(await flushOverrideAuditQueue(online)).toBe(1);
    expect(pendingOverrideAuditQueue()).toHaveLength(0);
    expect(online).toHaveBeenCalledTimes(1);
  });

  it("still refuses an override the rule does not allow, without calling the server", async () => {
    const fetcher = vi.fn(async () => json(201, { ok: true }));
    const result = await recordOverrideWithServerAudit({ ...base, overrideAllowed: false, finding, fetcher });
    expect(result.ok).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("R5-04 fix: pre-fill from the R5-02 patient snapshot", () => {
  function emptyDraft(): MedicationDraft {
    return { id: "d1", patientId: "UHID-R504", patientName: "", items: [], allergiesText: "", currentMedicationsText: "", egfrText: "", creatinineText: "", altText: "", astText: "", status: "editing" };
  }

  it("reads allergies and labs from the snapshot and completed lab results", () => {
    const prefill = prefillFromSnapshot(
      { allergies: ["Penicillin", "Sulfa"], labs: { eGFR: "42 mL/min", creatinine: 1.6 } },
      [
        { item: "LFT", result: "ALT 88 U/L; AST 71 U/L; Bilirubin 1.1", status: "completed", completedAt: "2026-09-28T10:00:00Z" },
        { item: "LFT", result: "ALT 20 U/L; AST 22 U/L", status: "completed", completedAt: "2026-09-01T10:00:00Z" },
        { item: "Serum creatinine", result: "3.9 mg/dL", status: "pending" },
      ],
    );
    expect(prefill).toEqual({ allergiesText: "Penicillin, Sulfa", egfrText: "42", creatinineText: "1.6", altText: "88", astText: "71" });
  });

  it("leaves fields empty when the snapshot has nothing (never invents values)", () => {
    expect(prefillFromSnapshot(null)).toEqual({ allergiesText: "", egfrText: "", creatinineText: "", altText: "", astText: "" });
  });

  it("fills only empty fields, so the doctor's edits are kept", () => {
    const draft = { ...emptyDraft(), egfrText: "55" };
    const next = applyPrefill(draft, { allergiesText: "Penicillin", egfrText: "42", creatinineText: "", altText: "88", astText: "" });
    expect(next.egfrText).toBe("55");
    expect(next.allergiesText).toBe("Penicillin");
    expect(next.altText).toBe("88");
    expect(applyPrefill(next, { allergiesText: "Other", egfrText: "1", creatinineText: "", altText: "1", astText: "" })).toBe(next);
  });

  it("loads the patient record and lab orders from the local server", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/hospital/patients/")) return json(200, { patient: { id: "P1", uhid: "UHID-R504", allergies: ["Penicillin"] } });
      if (url.startsWith("/api/hospital/orders")) return json(200, { orders: [{ item: "Renal function", result: "Creatinine 2.1 mg/dL, eGFR 28", status: "completed" }] });
      return json(404, {});
    });
    const prefill = await loadMedicationPrefill("UHID-R504", fetcher);
    expect(prefill).toMatchObject({ allergiesText: "Penicillin", creatinineText: "2.1", egfrText: "28" });
    const missing = await loadMedicationPrefill("UHID-NONE", vi.fn(async () => json(404, { error: "PATIENT_NOT_FOUND" })));
    expect(missing).toBeNull();
  });
});
