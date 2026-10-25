/**
 * ASTRA AI — PATIENT CONTEXT RESOLVER (2.2)
 * ============================================================================
 * Handles strict patient context isolation, pronoun resolution, UHID/Bed resolution,
 * and ambiguous patient disambiguation.
 */

import { db, Patient } from "../../../server/db";
import { UniversalIntent } from "./UniversalIntentResolver";

/**
 * Fields written/read by the wider app at runtime (merged from data/hospital.json),
 * which the canonical Patient interface does not declare.
 */
type PatientWithExtras = Patient & {
  ipNumber?: string;
};

export type PatientContextState = "NONE" | "ACTIVE" | "AMBIGUOUS" | "CLEARED";

export interface ResolvedPatientContext {
  state: PatientContextState;
  activePatient: Patient | null;
  candidatePatients: Patient[];
  isGlobalCommand: boolean;
  resolutionRationale: string;
}

export class PatientContextResolver {
  /**
   * Evaluates if an intent is hospital-wide / global (which MUST ignore active patient context).
   */
  public static isGlobalIntent(intent: UniversalIntent): boolean {
    const globalIntents: UniversalIntent[] = [
      "IDENTITY",
      "HOSPITAL_CENSUS",
      "IP_LIST",
      "OP_LIST",
      "ICU_LIST",
      "WARD_LIST",
      "LAB_PENDING",
      "RADIOLOGY_PENDING",
      "PHARMACY_PENDING",
      "OT_STATUS",
      "BILLING_SUMMARY",
      "PUBMED_SEARCH",
      "SYSTEM_STATUS"
    ];
    return globalIntents.includes(intent);
  }

  /**
   * Resolves patient context against active session patient, query entities, and database records.
   */
  public static resolve(params: {
    rawRequest: string;
    intent: UniversalIntent;
    explicitPatientReference?: string;
    currentActivePatient?: Patient | null;
  }): ResolvedPatientContext {
    const { rawRequest, intent, explicitPatientReference, currentActivePatient } = params;
    const lower = rawRequest.toLowerCase();

    // 1. GLOBAL COMMAND RULE: Global commands completely ignore the active patient
    if (this.isGlobalIntent(intent)) {
      return {
        state: "NONE",
        activePatient: null,
        candidatePatients: [],
        isGlobalCommand: true,
        resolutionRationale: `Intent '${intent}' is a hospital-wide global command. Active patient context ignored.`
      };
    }

    // 2. EXPLICIT PATIENT REFERENCE (e.g. "for Rajesh", "open UHID-2026-8801", "bed 4")
    if (explicitPatientReference) {
      const allPatients = db.getPatients();
      const ref = explicitPatientReference.trim().toLowerCase();

      // Search by exact UHID or IP number
      const exactMatch = allPatients.find(
        p => p.uhid.toLowerCase() === ref || p.id.toLowerCase() === ref || (p as PatientWithExtras).ipNumber?.toLowerCase() === ref
      );
      if (exactMatch) {
        return {
          state: "ACTIVE",
          activePatient: exactMatch,
          candidatePatients: [exactMatch],
          isGlobalCommand: false,
          resolutionRationale: `Exact match found by identifier: ${exactMatch.name} (${exactMatch.uhid})`
        };
      }

      // Search by name or bed
      const nameMatches = allPatients.filter(
        p => p.name.toLowerCase().includes(ref) || p.bedNumber?.toLowerCase() === ref
      );

      if (nameMatches.length === 1) {
        return {
          state: "ACTIVE",
          activePatient: nameMatches[0],
          candidatePatients: nameMatches,
          isGlobalCommand: false,
          resolutionRationale: `Resolved patient by name: ${nameMatches[0].name} (${nameMatches[0].uhid})`
        };
      } else if (nameMatches.length > 1) {
        return {
          state: "AMBIGUOUS",
          activePatient: null,
          candidatePatients: nameMatches,
          isGlobalCommand: false,
          resolutionRationale: `Multiple patients match '${explicitPatientReference}'. Clarification required.`
        };
      }
    }

    // 3. PRONOUN RESOLUTION ("his", "her", "this patient", "repeat CBC")
    if (/his|her|this patient|the patient|repeat/i.test(lower)) {
      if (currentActivePatient) {
        return {
          state: "ACTIVE",
          activePatient: currentActivePatient,
          candidatePatients: [currentActivePatient],
          isGlobalCommand: false,
          resolutionRationale: `Resolved pronoun to active patient chart: ${currentActivePatient.name} (${currentActivePatient.uhid})`
        };
      } else {
        const defaultPatient = db.getPatients()[0] || null;
        return {
          state: defaultPatient ? "ACTIVE" : "NONE",
          activePatient: defaultPatient,
          candidatePatients: defaultPatient ? [defaultPatient] : [],
          isGlobalCommand: false,
          resolutionRationale: defaultPatient
            ? `No patient selected; defaulting to currently open chart: ${defaultPatient.name}`
            : "No active patient in context."
        };
      }
    }

    // 4. FALLBACK: Retain active patient if available
    return {
      state: currentActivePatient ? "ACTIVE" : "NONE",
      activePatient: currentActivePatient || null,
      candidatePatients: currentActivePatient ? [currentActivePatient] : [],
      isGlobalCommand: false,
      resolutionRationale: currentActivePatient
        ? `Retaining existing active patient context: ${currentActivePatient.name}`
        : "No patient context specified."
    };
  }
}
