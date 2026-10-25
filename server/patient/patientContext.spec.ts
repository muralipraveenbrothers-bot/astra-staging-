/**
 * ASTRA AI — MANDATORY PATIENT CONTEXT SAFETY TESTS (P0.1)
 * ============================================================================
 * 13 adversarial tests against the REAL resolver abstraction
 * (server/patient/patientContext.ts) with an in-memory PatientDataSource
 * fixture modeled on the canonical fabric schema (Patient + Bed).
 *
 * EXPECTED: ambiguity/anomaly → FAIL CLOSED with a typed refusal code.
 */

import { describe, it, expect } from "vitest";
import {
  PatientDataSource,
  ResolvedPatientContext,
  PatientContextError,
  resolvePatientContext,
  issuePatientLock,
  validatePatientLock,
  requireValidLockOrThrow,
  resolveAndLock,
} from "./patientContext";
import { Bed, Patient } from "../db";

// ---------------------------------------------------------------------------
// Fixture — canonical fabric schema, no invented entities
// ---------------------------------------------------------------------------

function patient(over: Partial<Patient> = {}): Patient {
  return {
    id: "P001", uhid: "UHID-7821", name: "Rajesh Kumar", age: 55, gender: "male",
    phone: "+91 90000 11111", department: "General Medicine & Critical Care",
    admissionStatus: "inpatient", registeredAt: "2026-08-12T10:00:00Z",
    chiefComplaint: "Fever", ...over,
  };
}

function bed(over: Partial<Bed> = {}): Bed {
  return {
    id: "B01", bedNumber: "ICU-03", ward: "Intensive Care Unit", type: "icu",
    status: "vacant", ...over,
  };
}

const P001 = patient();
const P002 = patient({ id: "P002", uhid: "UHID-7822", name: "Lakshmi Devi", gender: "female", registeredAt: "2026-08-13T04:00:00Z" });
const P003 = patient({ id: "P003", uhid: "UHID-7823", name: "Suresh Reddy", admissionStatus: "outpatient", registeredAt: "2026-08-14T09:00:00Z" });
const P004 = patient({ id: "P004", uhid: "UHID-7824", name: "Meena Rao", gender: "female", registeredAt: "2026-08-13T14:00:00Z" });

function baseBeds(): Bed[] {
  return [
    bed({ id: "B-ICU03", bedNumber: "ICU-03", ward: "Intensive Care Unit", status: "occupied", patientId: "P001", patientName: "Rajesh Kumar", assignedAt: "2026-08-12T10:00:00Z" }),
    bed({ id: "B-ICU04", bedNumber: "ICU-04", ward: "Intensive Care Unit", type: "icu", status: "occupied", patientId: "P002", patientName: "Lakshmi Devi", assignedAt: "2026-08-13T04:00:00Z" }),
    bed({ id: "B-W01", bedNumber: "W-01", ward: "General Surgical Ward", type: "general", status: "vacant" }),
    bed({ id: "B-W03", bedNumber: "W-03", ward: "General Surgical Ward", type: "general", status: "occupied", patientId: "P004", patientName: "Meena Rao", assignedAt: "2026-08-13T14:00:00Z" }),
    bed({ id: "B-F03", bedNumber: "F-03", ward: "Female Medical Ward", type: "general", status: "occupied", patientId: "P002", patientName: "Lakshmi Devi", assignedAt: "2026-08-14T08:00:00Z" }),
  ];
}

function source(beds: Bed[], patients: Patient[]): PatientDataSource {
  return {
    getBeds: () => beds,
    getPatients: () => patients,
  };
}

const defaultSource = () => source(baseBeds(), [P001, P002, P003, P004]);

function expectRefused(fn: () => unknown, code: string) {
  try {
    fn();
    throw new Error(`EXPECTED refusal ${code} — but resolution SUCCEEDED (guessing detected)`);
  } catch (e) {
    expect(e).toBeInstanceOf(PatientContextError);
    expect((e as PatientContextError).code).toBe(code);
  }
}

// ---------------------------------------------------------------------------
// 1–2: happy paths
// ---------------------------------------------------------------------------

describe("patient context: real DB resolution", () => {
  it("1. bed → current active patient (ICU Bed 3 → Rajesh Kumar)", () => {
    const ctx = resolvePatientContext("ICU Bed 3", defaultSource());
    expect(ctx.patientId).toBe("P001");
    expect(ctx.patientName).toBe("Rajesh Kumar");
    expect(ctx.mrn).toBe("UHID-7821");
    expect(ctx.admissionStatus).toBe("inpatient");
    expect(ctx.resolutionSource).toBe("DATABASE");
    expect(ctx.contextVersion).toBeTruthy();
  });

  it("2. ward + bed → current admission (ambiguity resolved by ward hint)", () => {
    // "3" exists in ICU, General Surgical Ward AND Female Medical Ward
    const ctx = resolvePatientContext("General Surgical Ward bed 3", defaultSource());
    expect(ctx.bedNumber).toBe("W-03");
    expect(ctx.patientId).toBe("P004");
  });
});

// ---------------------------------------------------------------------------
// 3–9: state changes & anomalies — all FAIL CLOSED
// ---------------------------------------------------------------------------

describe("patient context: state changes & anomalies (fail closed)", () => {
  it("3. transfer to another ward — old lock refused after move", () => {
    const s = defaultSource();
    const ctx = resolvePatientContext("ICU Bed 3", s);
    const lock = issuePatientLock(ctx, s);
    expect(lock.patientId).toBe("P001");
    // TRANSFER: patient moved to General Surgical Ward W-01
    const beds = baseBeds();
    beds[0] = bed({ id: "B-ICU03", bedNumber: "ICU-03", ward: "Intensive Care Unit", type: "icu", status: "vacant" });
    beds[2] = bed({ id: "B-W01", bedNumber: "W-01", ward: "General Surgical Ward", type: "general", status: "occupied", patientId: "P001", patientName: "Rajesh Kumar", assignedAt: "2026-08-15T06:00:00Z" });
    const s2 = source(beds, [P001, P002, P003, P004]);
    const v = validatePatientLock(lock, s2);
    expect(v.valid).toBe(false);
    if (!v.valid) expect(v.reason).toBe("NO_PATIENT_ALLOCATED");
  });

  it("4. discharge — occupied bed over a discharged patient refuses (stale assignment)", () => {
    const beds = baseBeds();
    beds[0].assignedAt = "2026-08-12T10:00:00Z";
    const discharged = patient({ admissionStatus: "discharged" });
    const s = source(beds, [discharged, P002, P003, P004]);
    expectRefused(() => resolvePatientContext("ICU Bed 3", s), "PATIENT_DISCHARGED");
  });

  it("5. bed reuse after discharge — previous lock invalid, NEW patient resolved", () => {
    const s = defaultSource();
    const ctx = resolvePatientContext("ICU Bed 3", s);
    const lock = issuePatientLock(ctx, s);
    // Bed reused for Lakshmi Devi (her prior F-03 allocation released)
    const beds = baseBeds();
    beds[0] = bed({ id: "B-ICU03", bedNumber: "ICU-03", ward: "Intensive Care Unit", type: "icu", status: "occupied", patientId: "P002", patientName: "Lakshmi Devi", assignedAt: "2026-08-15T07:00:00Z" });
    beds[1] = bed({ id: "B-ICU04", bedNumber: "ICU-04", ward: "Intensive Care Unit", type: "icu", status: "vacant" });
    beds[4] = bed({ id: "B-F03", bedNumber: "F-03", ward: "Female Medical Ward", type: "general", status: "vacant" });
    const s2 = source(beds, [P001, P002, P003, P004]);
    const v = validatePatientLock(lock, s2);
    expect(v.valid).toBe(false);
    if (!v.valid) expect(v.reason).toBe("ASSIGNMENT_CONFLICT");
    // New resolution is still correct
    const fresh = resolvePatientContext("ICU Bed 3", s2);
    expect(fresh.patientId).toBe("P002");
  });

  it("6. similar patient names never alter resolution — bed identity decides", () => {
    const twins = [P001, patient({ id: "P005", uhid: "UHID-7825", name: "Rajesh Kumar", registeredAt: "2026-08-14T11:00:00Z" })];
    const beds = baseBeds();
    // Same-named patient occupies a different bed
    beds[1] = bed({ id: "B-ICU04", bedNumber: "ICU-04", ward: "Intensive Care Unit", type: "icu", status: "occupied", patientId: "P005", patientName: "Rajesh Kumar", assignedAt: "2026-08-14T11:00:00Z" });
    const s = source(beds, twins);
    expect(resolvePatientContext("ICU Bed 3", s).patientId).toBe("P001");
    expect(resolvePatientContext("ICU Bed 4", s).patientId).toBe("P005");
  });

  it("7. old/outpatient admission must not win", () => {
    const beds = baseBeds();
    beds[0].assignedAt = "2026-08-12T10:00:00Z";
    // bed still points at P001 — but P001's record is now an outpatient episode
    const outpatientP001 = patient({ admissionStatus: "outpatient" });
    const s = source(beds, [outpatientP001, P002, P003, P004]);
    expectRefused(() => resolvePatientContext("ICU Bed 3", s), "PATIENT_NOT_ADMITTED");
  });

  it("8. no patient currently allocated (vacant / cleaning)", () => {
    const beds = baseBeds();
    beds[0].status = "cleaning";
    beds[0].patientId = undefined;
    const s = source(beds, [P001, P002, P003, P004]);
    expectRefused(() => resolvePatientContext("ICU Bed 3", s), "NO_PATIENT_ALLOCATED");
  });

  it("9. two active admission anomaly (patient in 2 beds) refuses", () => {
    const beds = baseBeds();
    beds[2] = bed({ id: "B-W01", bedNumber: "W-01", ward: "General Surgical Ward", type: "general", status: "occupied", patientId: "P001", patientName: "Rajesh Kumar", assignedAt: "2026-08-14T12:00:00Z" });
    const s = source(beds, [P001, P002, P003, P004]);
    expectRefused(() => resolvePatientContext("ICU Bed 3", s), "MULTIPLE_ACTIVE_BEDS");
  });
});

// ---------------------------------------------------------------------------
// 10–13: lock lifecycle — two tabs, invalidation, wrong-patient mutation
// ---------------------------------------------------------------------------

describe("patient context: lock lifecycle & adversarial", () => {
  it("10. stale contextVersion — assignment state changed after lock refuses", () => {
    const s = defaultSource();
    const { context, lock } = resolveAndLock("ICU Bed 3", s);
    expect(context.contextVersion).toBe(lock.contextVersion);
    // Identity-relevant state changed: re-assignment event on the same bed
    const beds = baseBeds();
    beds[0].assignedAt = "2026-08-14T18:30:00Z"; // bed state re-registered
    const s2 = source(beds, [P001, P002, P003, P004]);
    const v = validatePatientLock(lock, s2);
    expect(v.valid).toBe(false);
    if (!v.valid) expect(v.reason).toBe("STALE_CONTEXT_VERSION");
  });

  it("11. two browser tabs on different patients — locks coexist, each validates to its own patient", () => {
    const s = defaultSource();
    const tabA = resolveAndLock("ICU Bed 3", s); // P001
    const tabB = resolveAndLock("General Surgical Ward bed 3", s); // P004
    expect(tabA.lock.patientId).toBe("P001");
    expect(tabB.lock.patientId).toBe("P004");
    // Cross-contamination check: each tab's lock still resolves to its own patient
    const vA = validatePatientLock(tabA.lock, s);
    const vB = validatePatientLock(tabB.lock, s);
    expect(vA.valid && vA.context.patientId).toBe("P001");
    expect(vB.valid && vB.context.patientId).toBe("P004");
  });

  it("12. 'same patient' after context invalidation — refused, never guessed", () => {
    const s = defaultSource();
    const { lock } = resolveAndLock("ICU Bed 3", s);
    // Patient discharged while the episode continues ("repeat the CBC")
    const beds = baseBeds();
    beds[0].assignedAt = "2026-08-12T10:00:00Z";
    const discharged = patient({ admissionStatus: "discharged" });
    const s2 = source(beds, [discharged, P002, P003, P004]);
    expectRefused(() => requireValidLockOrThrow(lock, s2), "PATIENT_DISCHARGED");
  });

  it("13. wrong-patient clinical mutation attempt — FAILS CLOSED", () => {
    const s = defaultSource();
    const { lock } = resolveAndLock("ICU Bed 3", s); // doctor locked Rajesh Kumar
    // Meanwhile bed is reallocated to Lakshmi Devi (tab left open)
    const beds = baseBeds();
    beds[0] = bed({ id: "B-ICU03", bedNumber: "ICU-03", ward: "Intensive Care Unit", type: "icu", status: "occupied", patientId: "P002", patientName: "Lakshmi Devi", assignedAt: "2026-08-15T07:00:00Z" });
    beds[1] = bed({ id: "B-ICU04", bedNumber: "ICU-04", ward: "Intensive Care Unit", type: "icu", status: "occupied", patientId: "P004", patientName: "Meena Rao", assignedAt: "2026-08-15T07:30:00Z" });
    beds[4] = bed({ id: "B-F03", bedNumber: "F-03", ward: "Female Medical Ward", type: "general", status: "vacant" }); // P002 released F-03
    const s2 = source(beds, [P001, P002, P003, P004]);
    // A consequential mutation MUST re-validate the lock immediately before executing
    let mutationExecuted = false;
    try {
      requireValidLockOrThrow(lock, s2); // ← the mandatory pre-mutation gate
      mutationExecuted = true;
    } catch (e) {
      expect(e).toBeInstanceOf(PatientContextError);
      expect((e as PatientContextError).code).toBe("ASSIGNMENT_CONFLICT");
    }
    expect(mutationExecuted).toBe(false); // mutation NEVER executed against the wrong patient
  });
});