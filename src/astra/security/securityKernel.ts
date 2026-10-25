import { validateActionEnvelope, type AstraActionEnvelope } from "./actionEnvelope";
import { envelopeEgressTargets, screenEnvelopePayload } from "./envelopeScreening";
import { checkEgress } from "./egressAllowList";

export type KernelDecisionKind = "ALLOW" | "DENY" | "REQUIRE_APPROVAL" | "CONFIG_REQUIRED";

export interface KernelDecision {
  kind: KernelDecisionKind;
  reasons: string[];
  checks: Array<{ gate: string; verdict: "PASS" | "FAIL" | "WARN" }>;
  credential?: { scopes: string[] };
}

const seen = new Set<string>();
const SKILLS: Record<string, { roles: string[]; patientScoped: boolean; approval: boolean; scopes: string[] }> = {
  "patient.summary.read": { roles: ["doctor", "ward", "admin"], patientScoped: true, approval: false, scopes: ["READ_PATIENT"] },
  "lab.order.create": { roles: ["doctor"], patientScoped: true, approval: false, scopes: ["READ_PATIENT", "WRITE_LAB_ORDER"] },
  "pharmacy.dispense": { roles: ["pharmacy", "pharmacist"], patientScoped: true, approval: true, scopes: ["DISPENSE_MEDICATION"] },
  "lab.result.write": { roles: ["lab", "admin"], patientScoped: true, approval: false, scopes: ["WRITE_LAB_RESULT"] },
  "evidence.search": { roles: ["doctor", "admin"], patientScoped: false, approval: false, scopes: ["EVIDENCE_SEARCH"] },
};

export function resetIdempotencyRegistry(): void {
  seen.clear();
}

export function evaluateSkillRequest(input: { envelope: AstraActionEnvelope; confirmed?: boolean }): KernelDecision {
  const checks: KernelDecision["checks"] = [];
  const reasons: string[] = [];
  const env = input.envelope;
  const valid = validateActionEnvelope(env);
  if (!valid.ok) return { kind: "DENY", reasons: valid.errors, checks: [{ gate: "ENVELOPE_VALID", verdict: "FAIL" }] };
  if (seen.has(env.idempotencyKey)) return { kind: "DENY", reasons: ["DUPLICATE_COMMAND"], checks: [{ gate: "IDEMPOTENCY", verdict: "FAIL" }] };
  const skill = SKILLS[env.skill];
  if (!skill) return { kind: "DENY", reasons: ["SKILL_UNKNOWN"], checks: [{ gate: "SKILL_KNOWN", verdict: "FAIL" }] };
  checks.push({ gate: "SKILL_KNOWN", verdict: "PASS" });
  const role = env.actor.role.toLowerCase();
  if (!skill.roles.includes(role)) return { kind: "DENY", reasons: ["RBAC_DENIED"], checks: [...checks, { gate: "RBAC", verdict: "FAIL" }] };
  if (skill.patientScoped) {
    const ctx = env.patientContext?.patientId;
    const payloadPatient = typeof env.payload.patientId === "string" ? env.payload.patientId : undefined;
    if (!ctx) return { kind: "DENY", reasons: ["GROUNDING_FAILED"], checks: [...checks, { gate: "PATIENT_GROUNDING", verdict: "FAIL" }] };
    if (payloadPatient && payloadPatient !== ctx) return { kind: "DENY", reasons: ["CROSS_PATIENT_BLOCKED"], checks: [...checks, { gate: "PATIENT_GROUNDING", verdict: "FAIL" }] };
  }
  const screening = screenEnvelopePayload(env);
  if (!screening.clean) {
    const reason = screening.findings.some((f) => f.kind === "EGRESS_ESCAPE") ? "EGRESS_DENIED" : "INJECTION_BLOCKED";
    return { kind: "DENY", reasons: [reason], checks: [...checks, { gate: "PAYLOAD_SCREENING", verdict: "FAIL" }] };
  }
  for (const target of envelopeEgressTargets(env)) {
    if (checkEgress(target).verdict !== "ALLOW") return { kind: "DENY", reasons: ["EGRESS_DENIED"], checks };
  }
  if (skill.approval && !input.confirmed) return { kind: "REQUIRE_APPROVAL", reasons: ["APPROVAL_REQUIRED"], checks: [...checks, { gate: "APPROVAL_GATE", verdict: "WARN" }] };
  seen.add(env.idempotencyKey);
  return { kind: "ALLOW", reasons, checks: [...checks, { gate: "ALLOW", verdict: "PASS" }], credential: { scopes: skill.scopes } };
}
