export type AuthorityLevel =
  | "AUTO_ALLOWED" | "CONFIRM_USER" | "APPROVAL_REQUIRED"
  | "DOCTOR_ONLY" | "ADMIN_ONLY" | "FORBIDDEN";

export type ToolAuthorityLevel = "L0" | "L1" | "L2" | "L3" | "L4" | "L5" | "L6" | "L7";
export type RiskBand = "low" | "medium" | "high";

const RANK: Record<RiskBand, number> = { low: 0, medium: 1, high: 2 };

const DETERMINISTIC_RISK: Record<string, RiskBand> = {
  queue_sort: "low",
  department_suggestion: "low",
  form_prefill: "low",
  notification_routing: "low",
  prescribe: "high",
  diagnose: "high",
  order: "high",
  discharge: "high",
  change_dose: "high",
  sign_report: "high",
  create_lab_order: "high",
  change_treatment: "high",
  delete_patient: "high",
  delete_audit_trail: "high",
  send_phi_to_provider: "high",
  issue_refund: "high",
  cmrf_submit: "high",
};

const CLINICAL = /^(prescribe|diagnos\w*|order|discharge|change_dose|sign_report|create_lab_order|change_treatment|alter_medication|sign_prescription)$/i;

export interface AuthorizeInput {
  action: string;
  role: string;
  dataClass?: string;
  mode?: "SHADOW" | "ASSIST" | "AUTO";
  confidence?: number;
  risk?: RiskBand;
  layaRisk?: RiskBand;
}

export interface AuthorizeResult {
  level: AuthorityLevel;
  allowed: boolean;
  reason: string;
  risk: RiskBand;
}

export function resolvedRisk(action: string, layaRisk?: RiskBand): RiskBand {
  const base = DETERMINISTIC_RISK[action] ?? "medium";
  if (!layaRisk) return base;
  return RANK[layaRisk] > RANK[base] ? layaRisk : base;
}

export function authorize(input: AuthorizeInput): AuthorizeResult {
  const action = input.action;
  const risk = resolvedRisk(action, input.layaRisk ?? input.risk);
  const deny = (level: AuthorityLevel, reason: string): AuthorizeResult => ({ level, allowed: false, reason, risk });

  if (action === "send_phi_to_provider" || /^send_phi_to_provider\b/i.test(action)) {
    return deny("FORBIDDEN", "Patient data stays on local models. Cloud proxies are forbidden.");
  }
  if (/auto[-_ ]?order|auto[-_ ]?prescrib/i.test(action)) {
    return deny("FORBIDDEN", "Automatic orders and prescriptions are forbidden.");
  }
  if (CLINICAL.test(action)) {
    return deny("DOCTOR_ONLY", "Clinical actions stay on the R5-01 doctor gate and are never automatic.");
  }
  if (/refund|waiver|cmrf_submit|cmrf_final/i.test(action)) {
    return deny("APPROVAL_REQUIRED", "Refunds, waivers and the CMRF final submit need approval.");
  }
  if (/^delete_|config\/|user_role|role_edit/i.test(action)) {
    return {
      level: "ADMIN_ONLY",
      allowed: input.role === "admin",
      reason: "Deleting records, config and role edits are admin-only.",
      risk: "high",
    };
  }
  if (action === "queue_sort" && (input.mode === "AUTO" || input.role === "system")) {
    return { level: "AUTO_ALLOWED", allowed: true, reason: "Queue sorting is reversible and internal.", risk: "low" };
  }
  return deny("CONFIRM_USER", "A human confirms this action.");
}

export function toolLevelToAuthority(
  level: ToolAuthorityLevel,
  role: string,
  _dataClass?: string,
  mode: "SHADOW" | "ASSIST" | "AUTO" = "SHADOW",
): { level: AuthorityLevel; allowed: boolean; reason: string } {
  if (level === "L7") return { level: "FORBIDDEN", allowed: false, reason: "L7 tools are never autonomous for an agent." };
  if (level === "L6") return { level: "ADMIN_ONLY", allowed: role === "admin", reason: "Admin only." };
  if (level === "L5") return { level: "DOCTOR_ONLY", allowed: false, reason: "Doctor gate (R5-01). Never automatic." };
  if (level === "L4") return { level: "APPROVAL_REQUIRED", allowed: false, reason: "Supervisor approval required." };
  if (level === "L3") return { level: "CONFIRM_USER", allowed: false, reason: "A person confirms before execution." };
  if (level === "L2") {
    if (mode === "AUTO") return { level: "AUTO_ALLOWED", allowed: true, reason: "Reversible action in AUTO mode." };
    return { level: "CONFIRM_USER", allowed: false, reason: "Reversible action still needs confirmation outside AUTO." };
  }
  const canRead = role !== "none" && role !== "";
  return { level: "AUTO_ALLOWED", allowed: canRead, reason: "Read or draft only." };
}
