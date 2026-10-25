/**
 * Every brain request carries one privacy class.
 * PHI and high-risk clinical text stay on approved local inference paths.
 */

export const PRIVACY_CLASSES = [
  "PUBLIC",
  "INTERNAL",
  "CONFIDENTIAL",
  "PHI",
  "HIGH-RISK CLINICAL",
] as const;

export type PrivacyClass = (typeof PRIVACY_CLASSES)[number];

const HIGH_RISK = /not breathing|unconscious|cardiac arrest|code blue|severe bleeding|anaphylax|stroke|transfus|surger|chemotherap|thrombol|intubat|prescrib|critical/i;
const PHI = /\b(uhid|mrn|dob|date of birth)\b|\bbed\s*\d+\b|\b\d{10,}\b|patient name|\b(pain|fever|diagnos\w*|symptom|weakness|bleeding|radicul\w*)\b/i;
const CONFIDENTIAL = /\b(salary|payroll|revenue|profit|write[- ]?off|bank|account number)\b/i;
const INTERNAL = /\b(roster|staff|census|occupancy|workflow|billing|department)\b/i;

/** Local Astra paths. Gemini and other public clouds are not on this list. */
const LOCAL_ONLY = ["laya", "micro-astra", "ollama", "hermes-via-astra-gateway"];
const CLOUD_PROXIES = ["freellmapi", "omniroute"];

export function classifyPrivacy(text: string, hasPatientContext = false): PrivacyClass {
  const said = text ?? "";
  if (HIGH_RISK.test(said)) return "HIGH-RISK CLINICAL";
  if (hasPatientContext || PHI.test(said)) return "PHI";
  if (CONFIDENTIAL.test(said)) return "CONFIDENTIAL";
  if (INTERNAL.test(said)) return "INTERNAL";
  return "PUBLIC";
}

/** Providers the brain may call for this class. The voice gateway chain is unchanged. */
export function approvedInferencePaths(privacy: PrivacyClass): string[] {
  if (privacy === "PHI" || privacy === "HIGH-RISK CLINICAL" || privacy === "CONFIDENTIAL") {
    return [...LOCAL_ONLY];
  }
  return [...LOCAL_ONLY, ...CLOUD_PROXIES, "gemini"];
}

export function providerAllowed(privacy: PrivacyClass, providerId: string): boolean {
  return approvedInferencePaths(privacy).includes(providerId);
}
