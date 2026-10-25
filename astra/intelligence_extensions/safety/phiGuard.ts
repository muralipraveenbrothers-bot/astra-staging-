/**
 * ASTRA AI — Intelligence Extensions: PHI Guard (Step 12)
 * ============================================================================
 * Before ANY external scientific API request, data passes through AstraPHIGuard.
 * Never auto-transmit patient identifiers to external scientific APIs.
 * Logs redaction decisions for audit.
 */
import { firstEnv } from "../_internal";

export interface PhiRedactionResult {
  originalLength: number;
  deidentified: string;
  redactedFields: string[];
  redactionLog: Array<{ field: string; action: string; at: string }>;
}

/** Patterns that indicate protected health information. */
const PHI_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "mrn", pattern: /\bMRN[:\s-]*([A-Z0-9]{4,12})\b/gi },
  { name: "ip_number", pattern: /\bIP[:\s-]*([A-Z0-9]{4,12})\b/gi },
  { name: "op_number", pattern: /\bOP[:\s-]*([A-Z0-9]{4,12})\b/gi },
  { name: "phone", pattern: /\b(\+?\d{1,2}[-.\s]?)?\d{10}\b/g },
  { name: "aadhaar", pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g },
];

/** Common Indian names are NOT auto-redacted (needed for de-identified queries), but explicit MRN/phone/aadhaar are. */
export function deidentifyForScientificQuery(input: string): PhiRedactionResult {
  const enabled = firstEnv("ASTRA_PHI_GUARD", "true") === "true";
  const redactedFields: string[] = [];
  const redactionLog: PhiRedactionResult["redactionLog"] = [];
  let out = input;

  if (enabled) {
    for (const p of PHI_PATTERNS) {
      const matches = out.match(p.pattern);
      if (matches && matches.length > 0) {
        redactedFields.push(p.name);
        out = out.replace(p.pattern, `[REDACTED_${p.name.toUpperCase()}]`);
        redactionLog.push({ field: p.name, action: "redacted", at: new Date().toISOString() });
      }
    }
  }

  return {
    originalLength: input.length,
    deidentified: out,
    redactedFields,
    redactionLog,
  };
}

/**
 * Guard check: returns true if the query is safe to send to an external API.
 * Blocks if it still contains high-risk identifiers after redaction.
 */
export function isSafeForExternalApi(text: string): boolean {
  const enabled = firstEnv("ASTRA_PHI_GUARD", "true") === "true";
  if (!enabled) return true;
  // Re-run redaction; if anything remains, it wasn't caught → still safe since already redacted.
  const after = deidentifyForScientificQuery(text);
  return after.redactedFields.length === 0 || after.deidentified === text;
}