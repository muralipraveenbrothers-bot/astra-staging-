/**
 * ASTRA AI — Agent Operating Framework: Permission Ladder
 * ============================================================================
 * Constitution §17 (GREEN/AMBER/RED) + §20 (minimum privilege) enforced as a
 * deterministic classifier. Prompts are NOT security — this is structural gate.
 */

import { AutonomyLevel, PermissionClass } from "./types";

const GREEN_VERBS = [
  "read", "retrieve", "search", "analyse", "analyze", "summarise", "summarize",
  "calculate", "compare", "draft", "recommend", "prepare", "organise", "organize",
  "display", "generate", "review", "list", "get", "fetch", "query", "assess",
];

const AMBER_VERBS = [
  "order", "submit", "send", "email", "message", "communicate", "discharge",
  "admit", "refer", "prescribe", "schedule", "book", "approve", "notify",
  "document", "escalate", "repeat", "request", "collect",
];

const RED_VERBS = [
  "delete", "remove", "grant", "revoke", "sign", "pay", "transfer", "spend",
  "publish", "administer", "irreversible", "drop", "truncate", "override",
  "bypass", "mutate-schema", "grant-access",
];

/**
 * Classify a proposed action onto the constitution permission ladder.
 * @param description human/agent-written action, e.g. "Repeat ABG/lactate"
 * @param riskLevel   optional existing agent RiskLevel (INFO/REVERSIBLE/IMPORTANT/HIGH_RISK/CRITICAL)
 */
export function classifyAction(description: string, riskLevel?: string): PermissionClass {
  const d = description.toLowerCase();
  const tokens = d.split(/[^a-z0-9-]+/);

  if (RED_VERBS.some((v) => tokens.includes(v) || d.includes(v))) return "RED";
  if (AMBER_VERBS.some((v) => tokens.includes(v) || d.includes(v))) return "AMBER";
  if (GREEN_VERBS.some((v) => tokens.includes(v) || d.includes(v))) return "GREEN";

  // Risk-level backstop for agents that already carry a RiskLevel tag.
  switch (riskLevel?.toUpperCase()) {
    case "CRITICAL":
    case "HIGH_RISK":
      return "AMBER";
    default:
      return "GREEN";
  }
}

/** Map an existing RiskLevel to a ladder class (conservative). */
export function permissionFromRiskLevel(riskLevel: string | undefined): PermissionClass {
  switch (riskLevel?.toUpperCase()) {
    case "CRITICAL":
    case "HIGH_RISK":
      return "AMBER";
    case "IMPORTANT":
      return "AMBER";
    default:
      return "GREEN";
  }
}

/**
 * What may the agent do right now, given its autonomy grant?
 * Institutional (contract-level) gates always win over the grant.
 */
export function permissionForAutonomy(cls: PermissionClass, autonomy: AutonomyLevel): "allow" | "approval" | "block" {
  if (autonomy === "AUTONOMOUS") return "allow";
  // READ_ONLY and RECOMMEND_ONLY can never execute AMBER/RED.
  if (autonomy === "READ_ONLY" || autonomy === "RECOMMEND_ONLY") {
    return cls === "GREEN" ? "allow" : "block";
  }
  // APPROVAL_REQUIRED: GREEN is autonomous; AMBER is prepared-then-approved; RED is blocked.
  if (cls === "GREEN") return "allow";
  if (cls === "AMBER") return "approval";
  return "block";
}

/** Build a PreparedAction with the ladder verdict baked in. */
export function guardAction(description: string, autonomy: AutonomyLevel, riskLevel?: string) {
  const cls = classifyAction(description, riskLevel);
  const decision = permissionForAutonomy(cls, autonomy);
  return {
    description,
    permission: cls,
    prepared: true,
    executed: false,
    requiresApproval: decision === "approval",
    approvalRole: cls === "AMBER" ? "responsible-clinician" : undefined,
  };
}