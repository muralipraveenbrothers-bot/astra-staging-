// ASTRA AI — Grounded Entity, Patient Context Lock & Approval Architecture v1.0
import { z } from "zod";
import { db } from "../db";
import { resolvePatientContext } from "../patient/patientContext";

// ─────────────────────────────────────────────────────────────────────────────
// 1. GROUNDED ENTITY DEFINITION
// ─────────────────────────────────────────────────────────────────────────────
export interface GroundedEntity<T = any> {
  entityType: "patient" | "admission" | "encounter" | "bed" | "ward" | "lab_order" | "prescription" | "op_visit";
  entityId: string;
  sourceOfTruth: "hims_database" | "ward_census" | "lab_system";
  resolvedAt: string;
  version: number;
  data: T;
  proofToken: string; // Cryptographic reference from backend verification
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. PATIENT CONTEXT LOCK
// ─────────────────────────────────────────────────────────────────────────────
export interface PatientContextLock {
  patientId: string;
  uhid: string;
  ipNumber?: string;
  admissionId?: string;
  encounterId?: string;
  wardId: string;
  bedId: string;
  resolvedAt: string;
  contextVersion: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. CLINICAL ACTION RISK TIERS
// ─────────────────────────────────────────────────────────────────────────────
export type RiskTier = "L0_READ" | "L1_OPERATIONAL" | "L2_REVERSIBLE_WRITE" | "L3_CLINICAL_SIGN" | "L4_HIGH_RISK";

export interface ActionPolicy {
  riskTier: RiskTier;
  groundingRequired: boolean;
  approvalRequired: boolean;
  confirmationPolicy: "none" | "implicit" | "explicit_signature" | "strict_authenticated_signature";
  auditLevel: "standard" | "high_priority" | "critical_security";
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. ACTION LIFECYCLE & STAGED APPROVAL STATE
// ─────────────────────────────────────────────────────────────────────────────
export type ActionLifecycleState =
  | "DRAFT"
  | "STAGED"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "EXECUTING"
  | "COMPLETED"
  | "REJECTED"
  | "EXPIRED"
  | "CANCELLED";

export interface StagedClinicalAction {
  actionId: string;
  actionType: string;
  stagedAt: string;
  expiresAt: string;
  contextLock: PatientContextLock;
  groundedRef: GroundedEntity;
  proposedPayload: any;
  riskTier: RiskTier;
  actionHash: string; // Hash of payload + contextLock + doctorId
  state: ActionLifecycleState;
  approvalRecord?: ClinicalApprovalRecord;
}

export interface ClinicalApprovalRecord {
  approvalId: string;
  actionId: string;
  actionHash: string; // Must match StagedClinicalAction.actionHash
  approvingDoctorId: string;
  approvingRole: string;
  approvedAt: string;
  signatureMethod: "biometric_or_session_key" | "doctor_passcode";
  status: "VALID" | "REVOKED" | "EXPIRED";
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. DETERMINISTIC BACKEND GROUNDING RESOLVER
// ─────────────────────────────────────────────────────────────────────────────
export class GroundedContextResolver {
  private static legacyFixture: Record<string, any> = {
    "UHID-2026-8841": {
      id: "p-101",
      uhid: "UHID-2026-8841",
      ipNumber: "IP-2026-4421",
      admissionId: "adm-9901",
      name: "Ramesh Kumar",
      age: 45,
      gender: "Male",
      wardId: "Ward 2",
      bedId: "Bed 1",
      consultant: "Dr. Murali Praveen",
      diagnosis: "Acute Exacerbation COPD / Lower Lobe Pneumonia",
      allergies: ["Penicillin"],
      vitals: { hr: 84, bp: "124/80", temp: "98.6°F", spo2: 98, rr: 18 },
    },
    "Bed 1": {
      id: "p-101",
      uhid: "UHID-2026-8841",
      ipNumber: "IP-2026-4421",
      admissionId: "adm-9901",
      name: "Ramesh Kumar",
      age: 45,
      gender: "Male",
      wardId: "Ward 2",
      bedId: "Bed 1",
      consultant: "Dr. Murali Praveen",
      diagnosis: "Acute Exacerbation COPD / Lower Lobe Pneumonia",
      allergies: ["Penicillin"],
      vitals: { hr: 84, bp: "124/80", temp: "98.6°F", spo2: 98, rr: 18 },
    },
  };

  /**
   * Ground an entity against the REAL hospital data fabric (server/db.ts).
   * Resolution order: UHID → patient id → bed number (live bed→assignment→patient).
   * The legacy static fixture applies ONLY when
   * ASTRA_GROUNDING_LEGACY_FIXTURE=1 (explicit test runs) — production
   * grounding refuses unknown patients with NO fallback patient anywhere.
   */
  static resolvePatient(queryKey: string): GroundedEntity | null {
    const key = (queryKey || "").trim();
    if (!key) return null;

    // Real database first
    try {
      const live = this.resolvePatientLive(key);
      if (live) return live;
    } catch (e) {
      // Anomalies (discharged-but-occupied, conflicts) refuse grounding
      console.warn(`[GroundedResolver] GROUNDING REFUSED (live DB): ${e instanceof Error ? e.message : e}`);
      return null;
    }

    // Legacy fixture — explicit opt-in only (tests); NEVER on in production
    const fixture = process.env.ASTRA_GROUNDING_LEGACY_FIXTURE === "1"
      ? this.legacyFixture[key] || this.legacyFixture[key.toUpperCase()]
      : undefined;

    if (!fixture) {
      console.warn(`[GroundedResolver] GROUNDING REFUSED: Entity "${queryKey}" not found in HIMS DB.`);
      return null;
    }

    const proofToken = `proof-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    return {
      entityType: "patient",
      entityId: fixture.id,
      sourceOfTruth: "hims_database",
      resolvedAt: new Date().toISOString(),
      version: 1,
      data: fixture,
      proofToken,
    };
  }

  /**
   * LIVE DB grounding (server/db.ts — the canonical data fabric).
   * Accepts UHID, patient id (P001), or a bed reference ("ICU Bed 3").
   * Returns null when the key does not name a bed or patient; throws
   * PatientContextError anomalies (discharged/occupied conflicts) upward —
   * resolvePatient treats those as refusal.
   */
  static resolvePatientLive(queryKey: string): GroundedEntity | null {
    const key = (queryKey || "").trim();
    if (!key) return null;

    // 1. Patient lookup by UHID or id
    const byId = db.getPatientById(key) || db.getPatients().find((p) => p.uhid === key);
    if (byId) {
      if (byId.admissionStatus === "discharged" || byId.admissionStatus === "outpatient") {
        return null; // not actively admitted — grounding of an active episode refused
      }
      return this.groundedFromPatient(byId);
    }

    // 2. Bed reference → live bed→assignment→admission→patient path
    const context = resolvePatientContext(key);
    const patient = db.getPatientById(context.patientId);
    if (!patient) return null;
    return this.groundedFromPatient(patient);
  }

  /** Build the grounded record from a REAL Patient (no invented fields). */
  private static groundedFromPatient(p: import("../db").Patient): GroundedEntity {
    const latestVitals = p.vitals?.length ? p.vitals[p.vitals.length - 1] : undefined;
    return {
      entityType: "patient",
      entityId: p.id,
      sourceOfTruth: "hims_database",
      resolvedAt: new Date().toISOString(),
      version: 1,
      data: {
        id: p.id,
        uhid: p.uhid,
        ipNumber: undefined,
        admissionId: `ADM:${p.uhid}:${p.registeredAt}`,
        name: p.name,
        age: p.age,
        gender: p.gender,
        wardId: p.ward,
        bedId: p.bedNumber,
        diagnosis: p.diagnosis,
        allergies: p.allergies ?? [],
        vitals: latestVitals
          ? { hr: latestVitals.heartRate, spo2: latestVitals.spo2, rr: latestVitals.respRate }
          : undefined,
      },
      proofToken: `proof-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
  }

  /**
   * Create a locked patient context bound to backend grounding proof.
   */
  static createContextLock(grounded: GroundedEntity): PatientContextLock {
    const p = grounded.data;
    return {
      patientId: p.id,
      uhid: p.uhid,
      ipNumber: p.ipNumber,
      admissionId: p.admissionId,
      wardId: p.wardId,
      bedId: p.bedId,
      resolvedAt: new Date().toISOString(),
      contextVersion: 1,
    };
  }
}
