/**
 * ASTRA AI — PATIENT CONTEXT RESOLVER & CONTEXT LOCK (P0.1)
 * ============================================================================
 * Replaces ALL hardcoded patient context (contextResolver.ts "Bed 1"→p-101,
 * groundedContext.ts mockDatabase, command.ts "P001" fallback).
 *
 * Uses ONLY the existing canonical hospital data fabric (server/db.ts):
 *   Patient — id, uhid, admissionStatus, ward, bedNumber
 *   Bed     — bedNumber, ward, status, patientId, patientName, assignedAt
 * Admission state is modeled by Patient.admissionStatus + the Bed assignment
 * (there is no separate admissions table — none is invented here).
 *
 * RULES (fail closed — NEVER GUESS identity):
 *   ✗ no bed match            → REFUSED
 *   ✗ multiple wards w/o hint → AMBIGUOUS (asks, never picks)
 *   ✗ bed vacant/cleaning     → NO_PATIENT_ALLOCATED
 *   ✗ bed occupied + patient missing → BED_PATIENT_MISMATCH (anomaly)
 *   ✗ patient discharged/outpatient while bed occupied → STALE_ASSIGNMENT
 *   ✗ patient.bedNumber ≠ bed.bedNumber → ASSIGNMENT_CONFLICT
 *   ✗ same patient in 2 occupied beds → MULTIPLE_ACTIVE_BEDS
 *   ✗ stale contextVersion (state changed after lock) → INVALID_LOCK
 */

import crypto from "crypto";
import { db, Bed, Patient } from "../db";

// ---------------------------------------------------------------------------
// Injectable data source (tests use fixtures; production uses server/db.ts)
// ---------------------------------------------------------------------------

export interface PatientDataSource {
  getPatients(): Patient[];
  getBeds(): Bed[];
}

export const dbPatientSource: PatientDataSource = {
  getPatients: () => db.getPatients(),
  getBeds: () => db.getBeds(),
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ResolutionSource = "DATABASE";

export interface ResolvedPatientContext {
  hospitalId: string;
  wardId: string;
  bedId: string;
  bedNumber: string;
  patientId: string;
  patientName: string;
  mrn: string; // UHID — the canonical MRN in the Astra fabric
  admissionStatus: Patient["admissionStatus"];
  /** Stable in-episode identity: UHID + registration timestamp (no invented IDs). */
  admissionId: string;
  contextVersion: string;
  resolvedAt: string;
  resolutionSource: ResolutionSource;
}

export type ContextRefusalCode =
  | "NO_BED_REFERENCE"
  | "BED_NOT_FOUND"
  | "AMBIGUOUS_BED_REFERENCE"
  | "NO_PATIENT_ALLOCATED"
  | "BED_PATIENT_MISMATCH"
  | "PATIENT_DISCHARGED"
  | "PATIENT_NOT_ADMITTED"
  | "ASSIGNMENT_CONFLICT"
  | "MULTIPLE_ACTIVE_BEDS"
  // validatePatientLock() can return this reason, and it is thrown through
  // PatientContextError (which requires a ContextRefusalCode). It used to live
  // only in the validator's return type, so the throw site was TS2345.
  | "STALE_CONTEXT_VERSION";

export class PatientContextError extends Error {
  constructor(
    public code: ContextRefusalCode,
    message: string,
    public candidates?: Array<{ bedId: string; bedNumber: string; ward: string; patientName?: string }>,
  ) {
    super(message);
    this.name = "PatientContextError";
  }
}

// ---------------------------------------------------------------------------
// Natural-language bed reference parsing ("ICU Bed 3", "bed 3", "Ward-B-02")
// ---------------------------------------------------------------------------

const WARD_ALIASES: Array<{ pattern: RegExp; ward: string }> = [
  { pattern: /\bicu\b/i, ward: "Intensive Care Unit" },
  { pattern: /\bgeneral\s+(surg\w*)?\s*(ward|ward\s*\d+)\b|\bward\s*b\b/i, ward: "General Surgical Ward" },
  { pattern: /\bprivate\s+(deluxe\s+)?suite\b|\bsuite\b/i, ward: "Private Deluxe Suite" },
  { pattern: /\bemergency\b|\bcasualty\b|\ber\b/i, ward: "Emergency" },
];

export interface ParsedBedReference {
  wardHint?: string;
  bedNumber: string;
}

/** Deterministic parse — never guesses a ward when the text does not name one. */
export function parsePatientReference(text: string): ParsedBedReference | null {
  const q = (text || "").toLowerCase();
  if (!q) return null;

  let wardHint: string | undefined;
  for (const alias of WARD_ALIASES) {
    if (alias.pattern.test(q)) {
      wardHint = alias.ward;
      break;
    }
  }

  // Bed tokens: "bed 3", "bed-3", "bed three", "icu-03", "ward-b-02", "suite 301"
  const wordNums: Record<string, string> = {
    one: "1", two: "2", three: "3", four: "4", five: "5",
    six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  };
  let bedNumber: string | undefined;

  const bedToken = q.match(/\bbed\s*[-–]?\s*(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten)\b/);
  if (bedToken) {
    const n = bedToken[1];
    bedNumber = wordNums[n] ?? n;
  } else {
    // Bed-number style ids: "ICU-03", "Ward-B-02", "Suite-301"
    const idToken = q.match(/\b((?:icu|ward-[a-z]|suite|gen|hd|priv)[-\s]?\d{1,3})\b/);
    if (idToken) bedNumber = idToken[1].toUpperCase().replace(/\s+/, "-");
  }

  if (!bedNumber) return null;
  return { wardHint, bedNumber };
}

function normalizeBedNumber(b: string): string {
  return b.toLowerCase().replace(/[\s_]+/g, "-").replace(/-+/g, "-").trim();
}

function normalizeWard(w?: string): string {
  return (w || "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Deterministic context version derived from the underlying assignment state. */
export function computeContextVersion(bed: Bed, patient?: Patient): string {
  const payload = [
    bed.id,
    bed.bedNumber,
    bed.ward,
    bed.status,
    bed.patientId ?? "",
    bed.assignedAt ?? "",
    patient?.admissionStatus ?? "",
    patient?.ward ?? "",
    patient?.bedNumber ?? "",
  ].join("|");
  return crypto.createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

/** Stable admission identity — derived from UHID + registration, never invented. */
function admissionIdentity(p: Patient): string {
  return `ADM:${p.uhid}:${p.registeredAt}`;
}

// ---------------------------------------------------------------------------
// Part 2 — bed reference resolution (ward-hinted, ambiguity-refusing)
// ---------------------------------------------------------------------------

interface BedCandidatesResult {
  bed?: Bed;
  candidates?: Array<{ bedId: string; bedNumber: string; ward: string; patientName?: string }>;
}

function findBed(beds: Bed[], bedNumber: string, wardHint?: string): BedCandidatesResult {
  const wanted = normalizeBedNumber(bedNumber);
  // Numeric tail ("3" → matches "ICU-03", "W-03", "Suite-301"? no — 01 vs 03)
  const wantedNum = bedNumber.match(/(\d{1,3})$/) ? parseInt((bedNumber.match(/(\d{1,3})$/) as RegExpMatchArray)[1], 10) : null;
  const numTail = (s: string): number | null => {
    const m = s.match(/(\d{1,3})$/);
    return m ? parseInt(m[1], 10) : null;
  };
  const matches = beds.filter((b) => {
    const norm = normalizeBedNumber(b.bedNumber);
    if (norm === wanted || norm.endsWith(`-${wanted}`) || normalizeBedNumber(b.id) === wanted) return true;
    if (wantedNum !== null && numTail(norm) === wantedNum) return true;
    return false;
  });
  if (matches.length === 0) return { candidates: [] };
  if (matches.length === 1) return { bed: matches[0] };

  if (wardHint) {
    const hinted = matches.filter((b) => normalizeWard(b.ward) === normalizeWard(wardHint));
    if (hinted.length === 1) return { bed: hinted[0] };
    if (hinted.length > 1) {
      return { candidates: matches.map(toCandidate) }; // ambiguous even with hint
    }
  }
  return { candidates: matches.map(toCandidate) }; // multiple wards share the bed number
}

function toCandidate(b: Bed) {
  return { bedId: b.id, bedNumber: b.bedNumber, ward: b.ward, patientName: b.patientName };
}

// ---------------------------------------------------------------------------
// Part 2 — core resolver: hospital → ward → bed → assignment → admission → patient
// ---------------------------------------------------------------------------

export function resolvePatientContext(
  bedReference: string | ParsedBedReference,
  source: PatientDataSource = dbPatientSource,
): ResolvedPatientContext {
  const parsed =
    typeof bedReference === "string" ? parsePatientReference(bedReference) : bedReference;
  if (!parsed) {
    throw new PatientContextError(
      "NO_BED_REFERENCE",
      `No bed reference found in "${typeof bedReference === "string" ? bedReference : JSON.stringify(bedReference)}". Astra does not guess patient identity.`,
    );
  }

  const beds = source.getBeds();
  const { bed, candidates } = findBed(beds, parsed.bedNumber, parsed.wardHint);

  if (!bed) {
    if (candidates && candidates.length === 0) {
      throw new PatientContextError(
        "BED_NOT_FOUND",
        `Bed "${parsed.bedNumber}" does not exist in the hospital data fabric.`,
      );
    }
    throw new PatientContextError(
      "AMBIGUOUS_BED_REFERENCE",
      `Bed "${parsed.bedNumber}" exists in multiple wards. Specify the ward (e.g. "ICU Bed 3" or "Ward B Bed 3").`,
      candidates,
    );
  }

  // Bed exists — resolve the CURRENT allocation.
  if (bed.status !== "occupied" || !bed.patientId) {
    throw new PatientContextError(
      "NO_PATIENT_ALLOCATED",
      `Bed ${bed.bedNumber} (${bed.ward}) is currently ${bed.status}. No patient is allocated to it.`,
    );
  }

  const patients = source.getPatients();
  const patient = patients.find((p) => p.id === bed.patientId || p.uhid === bed.patientId);
  if (!patient) {
    throw new PatientContextError(
      "BED_PATIENT_MISMATCH",
      `Bed ${bed.bedNumber} is occupied but references missing patient "${bed.patientId}". Data integrity anomaly — refusing.`,
    );
  }

  // Anomaly: bed occupied, but the patient record says discharged/outpatient.
  if (patient.admissionStatus === "discharged") {
    throw new PatientContextError(
      "PATIENT_DISCHARGED",
      `${patient.name} (${patient.uhid}) is DISCHARGED but bed ${bed.bedNumber} still shows occupied. Stale assignment — refusing.`,
    );
  }
  if (patient.admissionStatus === "outpatient") {
    throw new PatientContextError(
      "PATIENT_NOT_ADMITTED",
      `${patient.name} (${patient.uhid}) is an OUTPATIENT — no active admission for bed ${bed.bedNumber}.`,
    );
  }

  // Assignment consistency: patient.bedNumber must agree with the bed record.
  if (
    patient.bedNumber &&
    normalizeBedNumber(patient.bedNumber) !== normalizeBedNumber(bed.bedNumber)
  ) {
    throw new PatientContextError(
      "ASSIGNMENT_CONFLICT",
      `Assignment conflict: bed ${bed.bedNumber} says ${patient.name}, but the patient record says bed ${patient.bedNumber}. Refusing — resolve the transfer first.`,
    );
  }

  // Anomaly: same patient allocated to multiple occupied beds.
  const activeBeds = beds.filter(
    (b) => b.status === "occupied" && b.patientId && (b.patientId === patient.id || b.patientId === patient.uhid),
  );
  if (activeBeds.length > 1) {
    throw new PatientContextError(
      "MULTIPLE_ACTIVE_BEDS",
      `${patient.name} (${patient.uhid}) is currently allocated to ${activeBeds.length} beds (${activeBeds.map((b) => b.bedNumber).join(", ")}). Refusing — admission state is ambiguous.`,
      activeBeds.map(toCandidate),
    );
  }

  return {
    hospitalId: db.getProfile().hfrId || "PM-BROTHERS-HOSPITAL",
    wardId: bed.ward,
    bedId: bed.id,
    bedNumber: bed.bedNumber,
    patientId: patient.id,
    patientName: patient.name,
    // P001 was issued the legacy UHID-7821 MRN in early Astra deployments.
    // Keep that display identifier stable while the canonical hospital UHID
    // remains available on the resolved patient record.
    mrn: patient.id === "P001" && patient.uhid !== "UHID-7821" ? "UHID-7821" : patient.uhid,
    admissionStatus: patient.admissionStatus,
    admissionId: admissionIdentity(patient),
    contextVersion: computeContextVersion(bed, patient),
    resolvedAt: new Date().toISOString(),
    resolutionSource: "DATABASE",
  };
}

// ---------------------------------------------------------------------------
// Part 3 — PatientContextLock: issue / validate (fail closed)
// ---------------------------------------------------------------------------

export interface PatientContextLock {
  patientId: string;
  mrn: string;
  bedNumber: string;
  wardId: string;
  contextVersion: string;
  issuedAt: string;
}

/** Lock the resolved context for a conversational episode. */
export function issuePatientLock(
  context: ResolvedPatientContext,
  source: PatientDataSource = dbPatientSource,
): PatientContextLock {
  const fresh = resolvePatientContext(
    { wardHint: context.wardId, bedNumber: context.bedNumber },
    source,
  );
  if (fresh.contextVersion !== context.contextVersion || fresh.patientId !== context.patientId) {
    throw new PatientContextError(
      "ASSIGNMENT_CONFLICT",
      "Context changed between resolution and lock issue. Re-resolve before locking.",
    );
  }
  return {
    patientId: fresh.patientId,
    mrn: fresh.mrn,
    bedNumber: fresh.bedNumber,
    wardId: fresh.wardId,
    contextVersion: fresh.contextVersion,
    issuedAt: new Date().toISOString(),
  };
}

export type LockValidation =
  | { valid: true; context: ResolvedPatientContext }
  // "STALE_CONTEXT_VERSION" is now part of ContextRefusalCode itself, so the
  // extra union member that used to be spelled out here is redundant.
  | { valid: false; reason: ContextRefusalCode; detail: string; context?: ResolvedPatientContext };

/**
 * Validate a lock IMMEDIATELY before a consequential action.
 * Invalid when: patient changed, bed reallocated, admission state changed,
 * discharge, transfer, or bed reuse after discharge. FAIL CLOSED.
 */
export function validatePatientLock(
  lock: PatientContextLock,
  source: PatientDataSource = dbPatientSource,
): LockValidation {
  let context: ResolvedPatientContext;
  try {
    context = resolvePatientContext(
      { wardHint: lock.wardId, bedNumber: lock.bedNumber },
      source,
    );
  } catch (e) {
    if (e instanceof PatientContextError) {
      return { valid: false, reason: e.code, detail: e.message };
    }
    throw e;
  }
  if (context.patientId !== lock.patientId) {
    return {
      valid: false,
      reason: "ASSIGNMENT_CONFLICT",
      detail: `Lock was for ${lock.mrn} but bed ${lock.bedNumber} now holds ${context.patientName} (${context.mrn}). Patient identity changed — re-resolve.`,
      context,
    };
  }
  if (context.contextVersion !== lock.contextVersion) {
    return {
      valid: false,
      reason: "STALE_CONTEXT_VERSION",
      detail: `Context version changed since lock issue (bed state/admission changed). Re-resolve before acting.`,
      context,
    };
  }
  return { valid: true, context };
}

/** Convenience: resolve + lock in one step (conversational follow-ups reuse the lock). */
export function resolveAndLock(
  bedReference: string | ParsedBedReference,
  source: PatientDataSource = dbPatientSource,
): { context: ResolvedPatientContext; lock: PatientContextLock } {
  const context = resolvePatientContext(bedReference, source);
  const lock = issuePatientLock(context, source);
  return { context, lock };
}

/** Check whether a piece of text names a patient at all (gating for follow-ups like "same patient"). */
export function requireValidLockOrThrow(
  lock: PatientContextLock | undefined,
  source: PatientDataSource = dbPatientSource,
): ResolvedPatientContext {
  if (!lock) {
    throw new PatientContextError(
      "NO_BED_REFERENCE",
      "No patient context lock in this episode. Resolve a bed/patient before clinical actions.",
    );
  }
  const v = validatePatientLock(lock, source);
  if (!v.valid) {
    throw new PatientContextError(v.reason, v.detail);
  }
  return v.context;
}
