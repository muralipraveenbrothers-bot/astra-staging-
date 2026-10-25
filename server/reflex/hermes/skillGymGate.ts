import { auditLogger } from "../../../src/services/auditLogger";

export type SkillGateInput = {
  skillId: string;
  provenance?: string;
  health?: "healthy" | "degraded" | "offline";
  authorized?: boolean;
};

export type SkillGateResult = {
  enabled: boolean;
  allowed: boolean;
  reasons: string[];
  provenance: { skillId: string; source: string | null; verified: boolean };
};

function enabled(): boolean {
  return process.env.HERMES_SKILL_GYM_ENABLED?.trim().toLowerCase() === "true";
}

/**
 * Safety-first provenance/health gate for future skills. It is deliberately
 * fail-closed and records every evaluation through Astra's existing audit log.
 */
export function evaluateSkillGate(input: SkillGateInput): SkillGateResult {
  const reasons: string[] = [];
  const source = input.provenance?.trim() || null;
  if (!enabled()) reasons.push("feature_disabled");
  if (!source) reasons.push("provenance_required");
  if (input.health !== "healthy") reasons.push("live_health_required");
  if (input.authorized !== true) reasons.push("authorization_required");
  const result: SkillGateResult = {
    enabled: enabled(),
    allowed: reasons.length === 0,
    reasons,
    provenance: { skillId: input.skillId, source, verified: Boolean(source) && reasons.every((r) => r !== "provenance_required") },
  };
  auditLogger.log({
    action: "SKILL_GATE_EVALUATED",
    performedBy: "Hermes Skill Gym",
    userRole: "System Engine",
    details: JSON.stringify({ skillId: input.skillId, allowed: result.allowed, reasons }),
    sourceModule: "hermes.skill-gym",
    provenanceData: result.provenance,
  });
  return result;
}

export function skillGymStatus() {
  return { module: "skill-gym", enabled: enabled(), default: "off", safety: "fail-closed", probe: "provenance+health+authorization" };
}
