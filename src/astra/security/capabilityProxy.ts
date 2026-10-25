import { evaluateSkillRequest, type KernelDecision } from "./securityKernel";
import type { AstraActionEnvelope } from "./actionEnvelope";

interface AuditEntry {
  correlationId: string;
  skill: string;
  decision: KernelDecision["kind"];
  mutatedHospitalState: boolean;
  at: string;
}

const trail: AuditEntry[] = [];

export function clearAuditTrail(): void {
  trail.length = 0;
}

export function auditTrail(): AuditEntry[] {
  return [...trail];
}

function record(envelope: AstraActionEnvelope, decision: KernelDecision): AuditEntry {
  const entry = {
    correlationId: envelope.correlationId,
    skill: envelope.skill,
    decision: decision.kind,
    mutatedHospitalState: decision.kind === "ALLOW" && envelope.skill !== "patient.summary.read" && envelope.skill !== "evidence.search",
    at: new Date().toISOString(),
  };
  trail.push(entry);
  return entry;
}

export function executeViaCapabilityProxy(input: {
  envelope: AstraActionEnvelope;
  confirmed?: boolean;
  executor?: (ctx: { credential: { scopes: string[] } }) => unknown;
}) {
  const decision = evaluateSkillRequest({ envelope: input.envelope, confirmed: input.confirmed });
  if (decision.kind !== "ALLOW") return { executed: false, decision, audit: record(input.envelope, decision) };
  if (!input.executor) {
    const configDecision: KernelDecision = { ...decision, kind: "CONFIG_REQUIRED", reasons: ["EXECUTOR_NOT_WIRED"] };
    return { executed: false, decision: configDecision, audit: record(input.envelope, configDecision) };
  }
  try {
    const result = input.executor({ credential: decision.credential ?? { scopes: [] } });
    return { executed: true, result, decision, audit: record(input.envelope, decision) };
  } catch (err) {
    const denied: KernelDecision = { ...decision, kind: "DENY", reasons: ["EXECUTION_FAILED", err instanceof Error ? err.message : String(err)] };
    return { executed: false, decision: denied, audit: record(input.envelope, denied) };
  }
}

export async function executeAsyncViaCapabilityProxy(input: {
  envelope: AstraActionEnvelope;
  confirmed?: boolean;
  executor?: (ctx: { credential: { scopes: string[] } }) => Promise<unknown>;
}) {
  const decision = evaluateSkillRequest({ envelope: input.envelope, confirmed: input.confirmed });
  if (decision.kind !== "ALLOW") return { executed: false, decision, audit: record(input.envelope, decision) };
  if (!input.executor) {
    const configDecision: KernelDecision = { ...decision, kind: "CONFIG_REQUIRED", reasons: ["EXECUTOR_NOT_WIRED"] };
    return { executed: false, decision: configDecision, audit: record(input.envelope, configDecision) };
  }
  try {
    const result = await input.executor({ credential: decision.credential ?? { scopes: [] } });
    return { executed: true, result, decision, audit: record(input.envelope, decision) };
  } catch (err) {
    const denied: KernelDecision = { ...decision, kind: "DENY", reasons: ["EXECUTION_FAILED", err instanceof Error ? err.message : String(err)] };
    return { executed: false, decision: denied, audit: record(input.envelope, denied) };
  }
}
