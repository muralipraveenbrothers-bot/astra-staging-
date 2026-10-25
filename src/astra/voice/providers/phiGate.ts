/**
 * ASTRA SAARATHI — Cloud Privacy Gate.
 * ====================================
 * Deterministic, dependency-free PHI heuristic used BEFORE any clinical text is
 * handed to a CLOUD voice provider. Local Voicebox is never gated — it runs on
 * this machine, so the preferred path carries no disclosure risk.
 *
 * DESIGN STANCE: this gate errs toward blocking. A false positive only means
 * Saarathi speaks with the LOCAL voice (or stays text-only); a false negative
 * would mean identifiable patient data leaving the hospital. It is a policy
 * gate, not a clinical de-identifier, and it never replaces server RBAC.
 */

/** Hospital identifier shapes that identify a specific patient or record. */
const IDENTIFIER_PATTERNS: RegExp[] = [
  /\b(?:UHID|MRN|IP|OP|ADM|ENC)[\s\-:]?\d{3,}\b/i,
  /\bIP\d{4,}\b/i,
  /\bUHID[-/]?\d{2,}[-/]?\d{2,}\b/i,
  /\b\d{10,}\b/,                                   // long digit runs (phone/Aadhaar/ABHA)
  /\b(?:\+91[\s-]?)?[6-9]\d{9}\b/,                 // Indian mobile numbers
  /\b\d{2}[./-]\d{2}[./-]\d{4}\b/,                 // dates of birth / admission dates
  /\b(?:bed|ward|room|cubicle)\s*(?:no\.?|number|#)?\s*\d+/i,
];

/** Clinical context that makes a sentence patient-identifying even without an ID. */
const CLINICAL_CONTEXT = /\b(?:diagnos\w*|history|admitted|admission|prescrib\w*|dose|dosage|mg\b|tablet|capsule|injection|investigation|haemoglobin|hemoglobin|creatinine|potassium|sodium|platelet|biopsy|histopath\w*|serolog\w*|sputum|malignan\w*|carcinoma|cancer|HIV|HBsAg|tubercul\w*|pregnan\w*)\b/i;

/**
 * True when the text appears to carry identifiable patient information.
 * `patientContext` (when supplied by the caller) forces the gate shut.
 */
export function looksLikePhi(text: string, patientContext?: unknown): boolean {
  if (patientContext !== undefined && patientContext !== null) {
    if (typeof patientContext === "string" ? patientContext.trim().length > 0 : true) return true;
  }
  const value = (text ?? "").trim();
  if (!value) return false;
  if (IDENTIFIER_PATTERNS.some((re) => re.test(value))) return true;
  if (CLINICAL_CONTEXT.test(value)) return true;
  return false;
}

/** Reasons the gate refused, for the audit trail and the status HUD. */
export function phiGateReason(text: string, patientContext?: unknown): string | null {
  if (patientContext !== undefined && patientContext !== null) {
    return "patient context attached to the turn";
  }
  if (IDENTIFIER_PATTERNS.some((re) => re.test(text ?? ""))) return "patient/record identifier pattern detected";
  if (CLINICAL_CONTEXT.test(text ?? "")) return "clinical content detected";
  return null;
}