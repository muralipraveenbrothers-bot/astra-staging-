/**
 * Clinical authority is separate from hospital operations authority.
 * A doctor confirms prescribing, diagnosis, signed treatment, investigations,
 * and other high-risk clinical actions. CEO authority stays on operations,
 * staffing, finance, department performance, resources, and workflow.
 */

const CLINICAL_ORDER = /\b(prescrib\w*|diagnos\w*|treatment|medication|medicines?|drugs?|doses?|transfus\w*|surger\w*|chemotherap\w*|thrombol\w*|intubat\w*|cbc|x-?rays?|mri|usg|ultrasound|investigat\w*|override|discharge)\b|\bct\b/i;
const OPERATIONAL_ORDER = /\b(staff\w*|roster|nurses?|budget|census|financ\w*|revenue|occupancy|resource|workflow|billing|kpi|department performance)\b/i;
const ORDER_LIKE = /\b(order|prescribe|indent|admit|discharge)\b/i;

export function isClinicalOrderText(text: string): boolean {
  return CLINICAL_ORDER.test(text ?? "");
}

export function isOperationalOrderText(text: string): boolean {
  return OPERATIONAL_ORDER.test(text ?? "");
}

/** Doctor clinical workflow authority. CEO does not inherit this from the executive role. */
export function canAuthorizeClinicalAction(role: string): boolean {
  return (role ?? "").toLowerCase() === "doctor";
}

export interface SaarathiAuthority {
  clinical: boolean;
  operational: boolean;
  safetyDenied: boolean;
  reason: string;
}

export function assessSaarathiAuthority(role: string, text: string): SaarathiAuthority {
  const clinical = isClinicalOrderText(text);
  const operational = isOperationalOrderText(text);
  const orderLike = ORDER_LIKE.test(text ?? "");
  if (clinical && !canAuthorizeClinicalAction(role)) {
    return {
      clinical,
      operational,
      safetyDenied: true,
      reason: (role ?? "").toLowerCase() === "ceo"
        ? "CEO authority does not include prescribing, diagnosis, signed treatment, or high-risk clinical actions."
        : "A doctor confirms clinical orders.",
    };
  }
  if (orderLike && !clinical && !canIssueHospitalOrders(role)) {
    return {
      clinical,
      operational,
      safetyDenied: true,
      reason: "This hospital command is limited to the doctor and CEO roles.",
    };
  }
  return { clinical, operational, safetyDenied: false, reason: clinical ? "doctor clinical authority" : "allowed" };
}

const COMMAND_ROLES = new Set(["doctor", "ceo"]);

/** Operational hospital commands. Clinical orders use canAuthorizeClinicalAction. */
export function canIssueHospitalOrders(role: string): boolean {
  return COMMAND_ROLES.has((role ?? "").toLowerCase());
}
